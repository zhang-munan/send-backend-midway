import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { OrderInfoEntity } from '../entity/info';
import { ProductInfoEntity } from '../entity/product';
import { UserBalanceService } from './balance';
import { PluginService } from '../../plugin/service/info';
import { UserInfoEntity } from '../../user/entity/info';
import { UserWxEntity } from '../../user/entity/wx';
import { MessageInfoEntity } from '../../message/entity/info';
import { UserWxService } from '../../user/service/wx';
import { ConversationInfoService } from '../../conversation/service/info';
import {
  calculateSmsCount,
  calculateSmsFee,
} from '../../message/service/pricing';

/** 支付方式 */
export const PAY_METHOD = {
  WECHAT: 1,
  ALIPAY: 2,
  BALANCE: 3,
  MOCK: 4,
  PACKAGE_BALANCE: 5,
};

/** 订单状态 */
export const ORDER_STATUS = {
  PENDING: 0,
  PAID: 1,
  REFUNDED: 2,
  CLOSED: 3,
};

/** 退款状态 */
export const REFUND_STATUS = {
  NONE: 0,
  PENDING: 1,
  REFUNDED: 2,
  REJECTED: 3,
  PROCESSING: 4,
  FAILED: 5,
};

/**
 * 订单信息
 */
@Provide()
export class OrderInfoService extends BaseService {
  @InjectEntityModel(OrderInfoEntity)
  orderInfoEntity: Repository<OrderInfoEntity>;

  @InjectEntityModel(ProductInfoEntity)
  productInfoEntity: Repository<ProductInfoEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(UserWxEntity)
  userWxEntity: Repository<UserWxEntity>;

  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  @Inject()
  userBalanceService: UserBalanceService;

  @Inject()
  pluginService: PluginService;

  @Inject()
  userWxService: UserWxService;

  @Inject()
  conversationInfoService: ConversationInfoService;

  /**
   * 创建订单
   * @param userId 用户ID
   * @param params 订单参数
   */
  async createOrder(userId: number, params: any) {
    const {
      productId,
      quantity = 1,
      payMethod,
      clientIp,
      // 消息相关参数存入 payParams
      receiverPhone,
      content,
      isAnonymous,
      isPublic,
      sendType,
      scheduledAt,
      templateId,
      conversationId,
      senderSignature,
    } = params;

    // 获取商品信息
    let product: ProductInfoEntity;
    let payAmount: number;
    let productName: string;
    let messageQuota: number;

    if (productId) {
      product = await this.productInfoEntity.findOneBy({
        id: Equal(productId),
        status: Equal(1),
      });
      if (!product) throw new CoolCommException('商品不存在或已下架');
      payAmount = Number(product.sellPrice) * quantity;
      productName = product.name;
      messageQuota = product.messageQuota * quantity;
    } else {
      // 未指定商品时，按字数计费（每 10 字 1.99 元）
      const smsCount = calculateSmsCount(content || '');
      payAmount = calculateSmsFee(content || '');
      productName = `单条短信发送（${smsCount}条）`;
      messageQuota = 0; // 按次不累积配额
    }

    // 余额支付时校验余额充足
    if (payMethod === PAY_METHOD.BALANCE) {
      const enough = await this.userBalanceService.checkBalance(
        userId,
        payAmount
      );
      if (!enough) throw new CoolCommException('余额不足，请选择其他支付方式');
    }

    // 生成订单号：BNSC + YYYYMMDD + 五位数字
    const orderNo = await this.generateOrderNo();

    // 消息参数存入 payParams
    const messageParams = {
      receiverPhone,
      content,
      isAnonymous: isAnonymous !== undefined ? isAnonymous : 1,
      isPublic: isPublic === 1 || isPublic === true ? 1 : 0,
      sendType: sendType || 1,
      scheduledAt: scheduledAt || null,
      templateId: templateId || null,
      conversationId: conversationId || null,
      senderSignature: senderSignature || null,
      messageQuota,
    };

    const order = this.orderInfoEntity.create({
      userId,
      orderNo,
      productId: productId || null,
      productName,
      quantity,
      originalPrice: product ? Number(product.originalPrice) : payAmount,
      discountAmount: 0,
      payAmount,
      payMethod: payMethod || null,
      status: ORDER_STATUS.PENDING,
      payParams: messageParams,
      clientIp: clientIp || null,
    });

    await this.orderInfoEntity.save(order);
    return order;
  }

  /**
   * 发起支付
   * @param userId 用户ID
   * @param orderId 订单ID
   * @param payMethod 支付方式
   * @param ctx 请求上下文（获取 openid 等）
   */
  async pay(
    userId: number,
    orderId: number,
    payMethod: number,
    ctx?: any,
    params: any = {}
  ) {
    const order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new CoolCommException('订单状态不可支付');
    }

    if (payMethod === PAY_METHOD.WECHAT) {
      await this.orderInfoEntity.update(order.id, { payMethod });
      return this.payByWechat(order, userId, ctx, params);
    } else if (payMethod === PAY_METHOD.BALANCE) {
      await this.orderInfoEntity.update(order.id, { payMethod });
      return this.payByBalance(order, userId);
    } else if (payMethod === PAY_METHOD.MOCK) {
      if (!this.isDevMode()) {
        throw new CoolCommException('模拟支付仅开发模式可用');
      }
      await this.orderInfoEntity.update(order.id, { payMethod });
      return this.payByMock(order);
    } else {
      throw new CoolCommException('暂不支持该支付方式');
    }
  }

  private isDevMode() {
    return [process.env.NODE_ENV, process.env.MIDWAY_SERVER_ENV].some(env =>
      ['local', 'development'].includes(env || '')
    );
  }

  /**
   * 生成格式为 BNSCYYYYMMDDXXXXX 的订单编号。
   * 五位随机数字在当天范围内重试，避免与已有订单重复。
   */
  private async generateOrderNo(): Promise<string> {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');

    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = crypto.randomInt(0, 100000).toString().padStart(5, '0');
      const orderNo = `BNSC${date}${suffix}`;
      const existing = await this.orderInfoEntity.findOneBy({
        orderNo: Equal(orderNo),
      });
      if (!existing) return orderNo;
    }

    throw new CoolCommException('订单编号生成失败，请重试');
  }

  /**
   * 使用套餐消息配额发送，并同步生成一笔已支付的套餐余额订单。
   */
  async sendByPackageBalance(userId: number, params: any) {
    const quotaToDeduct = 1;
    const balance = await this.userBalanceService.getBalance(userId);
    if (balance.messageQuota < quotaToDeduct) {
      throw new CoolCommException(
        `消息条数不足（剩余 ${balance.messageQuota} 条），请先购买套餐`
      );
    }

    const orderNo = await this.generateOrderNo();
    const order = await this.orderInfoEntity.save(
      this.orderInfoEntity.create({
        userId,
        orderNo,
        productId: null,
        productName: '短信发送（套餐余额抵扣）',
        quantity: 1,
        originalPrice: 0,
        discountAmount: 0,
        payAmount: 0,
        payMethod: PAY_METHOD.PACKAGE_BALANCE,
        status: ORDER_STATUS.PAID,
        payTime: new Date(),
        tradeNo: `PACKAGE_BALANCE_${orderNo}`,
        payParams: {
          ...params,
          messageQuota: 0,
          smsCount: quotaToDeduct,
          feeAmount: 0,
        },
        clientIp: params.clientIp || null,
      })
    );

    await this.userBalanceService.deductQuota(userId, quotaToDeduct);
    await this.createMessageAfterPaid(order);

    return order;
  }

  /**
   * 微信支付
   */
  private async payByWechat(
    order: OrderInfoEntity,
    userId: number,
    ctx?: any,
    params: any = {}
  ) {
    // 获取微信支付插件
    let plugin: any;
    try {
      plugin = await this.pluginService.getInstance('pay-wx');
    } catch (e) {
      throw new CoolCommException(
        '微信支付插件未配置，请到插件市场安装 pay-wx 插件'
      );
    }

    const config = await plugin.getConfig();
    const wxpay = await plugin.getInstance();
    const tradeType = this.normalizeWechatTradeType(params.tradeType);
    const clientIp =
      order.clientIp || ctx?.request?.ip || ctx?.ip || '127.0.0.1';
    // 微信支付金额单位为分，订单金额已按分存储。
    const total = Number(order.payAmount);
    const baseParams = {
      appid: config.appid,
      mchid: config.mchid,
      description: order.productName,
      out_trade_no: order.orderNo,
      notify_url: config.notify_url,
      amount: {
        total,
        currency: 'CNY',
      },
    };

    if (tradeType === 'APP') {
      const result = await wxpay.transactions_app({
        ...baseParams,
      });
      const appPayParams = this.unwrapWechatPayResult(result);
      const normalizedAppPayParams = {
        appid: appPayParams.appid || appPayParams.appId || config.appid,
        partnerid:
          appPayParams.partnerid || appPayParams.partnerId || config.mchid,
        prepayid: appPayParams.prepayid || appPayParams.prepayId,
        package: appPayParams.package || 'Sign=WXPay',
        noncestr: appPayParams.noncestr || appPayParams.nonceStr,
        timestamp: String(
          appPayParams.timestamp || appPayParams.timeStamp || ''
        ),
        sign: appPayParams.sign || appPayParams.paySign,
      };
      if (
        normalizedAppPayParams.partnerid &&
        normalizedAppPayParams.prepayid &&
        normalizedAppPayParams.noncestr &&
        normalizedAppPayParams.timestamp &&
        normalizedAppPayParams.sign
      ) {
        return {
          orderId: order.id,
          orderNo: order.orderNo,
          payAmount: order.payAmount,
          tradeType,
          orderInfo: normalizedAppPayParams,
        };
      }
      const prepayId = appPayParams.prepay_id;
      if (!prepayId) {
        throw new CoolCommException('微信APP预支付返回参数不完整');
      }
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        payAmount: order.payAmount,
        tradeType,
        ...(await this.createWechatAppPayParams(config, plugin, prepayId)),
      };
    }

    if (tradeType === 'H5') {
      const result = await wxpay.transactions_h5({
        ...baseParams,
        scene_info: {
          payer_client_ip: clientIp,
          h5_info: {
            type: params.h5Type || 'Wap',
          },
        },
      });
      const h5PayParams = this.unwrapWechatPayResult(result);
      const h5Url = h5PayParams.h5_url || h5PayParams.h5Url;
      if (!h5Url) {
        throw new CoolCommException('微信H5预支付返回参数不完整');
      }
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        payAmount: order.payAmount,
        tradeType,
        h5Url,
        mwebUrl: h5Url,
      };
    }

    const openid = await this.getWechatJsapiOpenid(userId, params.code);

    // 发起 JSAPI 预支付
    const result = await wxpay.transactions_jsapi({
      ...baseParams,
      payer: { openid },
    });

    // wechatpay-node-v3 的 transactions_jsapi 已返回完整且已签名的调起参数。
    // 不能把它再次当成 { prepay_id } 拼接，否则会生成 prepay_id=undefined，
    // 微信客户端会误报“调用支付 JSAPI 缺少参数：total_fee”。
    const jsapiPayParams = this.unwrapWechatPayResult(result);
    if (this.isValidWechatJsapiParams(jsapiPayParams)) {
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        payAmount: order.payAmount,
        tradeType,
        timeStamp: String(jsapiPayParams.timeStamp),
        nonceStr: jsapiPayParams.nonceStr,
        package: jsapiPayParams.package,
        signType: jsapiPayParams.signType || 'RSA',
        paySign: jsapiPayParams.paySign,
      };
    }

    // 兼容仅返回 prepay_id 的旧版 SDK。
    const prepayId = jsapiPayParams.prepay_id;
    if (!prepayId) {
      throw new CoolCommException('微信JSAPI预支付返回参数不完整');
    }
    const packageStr = `prepay_id=${prepayId}`;
    const payParams = await this.createWechatPaySign(
      config,
      plugin,
      packageStr
    );

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      payAmount: order.payAmount,
      tradeType,
      ...payParams,
      package: packageStr,
    };
  }

  private unwrapWechatPayResult(result: any) {
    if (!result || typeof result !== 'object') return {};
    return result.data || result.body || result;
  }

  private isValidWechatJsapiParams(params: any) {
    return Boolean(
      params?.timeStamp &&
        params?.nonceStr &&
        params?.paySign &&
        typeof params?.package === 'string' &&
        /^prepay_id=.+/.test(params.package) &&
        !params.package.includes('undefined') &&
        !params.package.includes('null')
    );
  }

  private normalizeWechatTradeType(tradeType?: string) {
    const value = (tradeType || 'JSAPI').toString().toUpperCase();
    if (['JSAPI', 'APP', 'H5'].includes(value)) {
      return value;
    }
    throw new CoolCommException('不支持的微信支付类型');
  }

  private async getWechatJsapiOpenid(userId: number, code?: string) {
    let userInfo = await this.userInfoEntity.findOneBy({
      id: Equal(userId),
    });
    if (!userInfo) {
      throw new CoolCommException('用户不存在');
    }

    let userWx = userInfo.unionid
      ? await this.userWxEntity.findOne({
          where: { unionid: Equal(userInfo.unionid), type: Equal(0) },
          order: { createTime: 'DESC' },
        })
      : null;
    if (!userWx && userInfo.unionid) {
      userWx = await this.userWxEntity.findOne({
        where: { openid: Equal(userInfo.unionid), type: Equal(0) },
        order: { createTime: 'DESC' },
      });
    }
    if (userWx?.openid) {
      return userWx.openid;
    }

    if (!code) {
      throw new CoolCommException('未获取到微信openid，无法发起支付');
    }

    const session = await this.userWxService.miniSession(code);
    if (session.errcode || !session.openid) {
      throw new CoolCommException('获取微信openid失败，请重新发起支付');
    }
    const unionid = session.unionid || userInfo.unionid || session.openid;
    if (!userInfo.unionid || userInfo.unionid === userInfo.phone) {
      await this.userInfoEntity.update(userId, { unionid, loginType: 0 });
    }
    await this.userWxEntity.save({
      openid: session.openid,
      unionid,
      type: 0,
    });
    return session.openid;
  }

  private async createWechatAppPayParams(
    config: any,
    plugin: any,
    prepayId: string
  ) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const packageStr = 'Sign=WXPay';
    const signStr = `${config.appid}\n${timeStamp}\n${nonceStr}\n${prepayId}\n`;
    const paySign = await this.signWechatString(config, plugin, signStr);
    return {
      appid: config.appid,
      partnerid: config.mchid,
      prepayid: prepayId,
      package: packageStr,
      noncestr: nonceStr,
      timestamp: timeStamp,
      sign: paySign,
      orderInfo: {
        appid: config.appid,
        partnerid: config.mchid,
        prepayid: prepayId,
        package: packageStr,
        noncestr: nonceStr,
        timestamp: timeStamp,
        sign: paySign,
      },
    };
  }

  private async createWechatPaySign(
    config: any,
    plugin: any,
    packageStr: string
  ) {
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const signStr = `${config.appid}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
    const paySign = await this.signWechatString(config, plugin, signStr);
    return {
      timeStamp,
      nonceStr,
      signType: 'RSA',
      paySign,
    };
  }

  private async signWechatString(config: any, plugin: any, signStr: string) {
    const privateKey = await this.getWechatPrivateKey(config, plugin);
    return crypto
      .createSign('RSA-SHA256')
      .update(signStr)
      .sign(privateKey, 'base64');
  }

  private async getWechatPrivateKey(config: any, plugin: any) {
    if (config.privateKey?.includes?.('BEGIN')) {
      return config.privateKey;
    }
    if (plugin.getBuffer && config.privateKey) {
      return (await plugin.getBuffer(config.privateKey)).toString();
    }
    return config.privateKey;
  }

  /**
   * 余额支付（同步到账）
   */
  private async payByBalance(order: OrderInfoEntity, userId: number) {
    const enough = await this.userBalanceService.checkBalance(
      userId,
      Number(order.payAmount)
    );
    if (!enough) throw new CoolCommException('余额不足');

    await this.userBalanceService.deductBalance(
      userId,
      Number(order.payAmount)
    );

    await this.orderInfoEntity.update(order.id, {
      status: ORDER_STATUS.PAID,
      payTime: new Date(),
      tradeNo: `BALANCE_${order.orderNo}`,
    });

    // 余额支付成功后直接创建消息记录
    await this.createMessageAfterPaid(order);

    return { orderId: order.id, orderNo: order.orderNo, paid: true };
  }

  /**
   * 模拟支付（仅开发模式，同步完成）
   */
  private async payByMock(order: OrderInfoEntity) {
    await this.orderInfoEntity.update(order.id, {
      status: ORDER_STATUS.PAID,
      payTime: new Date(),
      tradeNo: `MOCK_${order.orderNo}`,
    });

    await this.createMessageAfterPaid(order);

    return { orderId: order.id, orderNo: order.orderNo, paid: true };
  }

  /**
   * 微信支付异步通知回调
   * @param ctx Midway 请求上下文
   */
  async wxpayNotify(ctx: any) {
    let plugin: any;
    try {
      plugin = await this.pluginService.getInstance('pay-wx');
    } catch (e) {
      ctx.status = 500;
      return { code: 'FAIL', message: '插件未配置' };
    }

    // 验证微信回调签名
    const notifyData = await plugin.signVerify(ctx);
    if (!notifyData) {
      ctx.status = 400;
      return { code: 'FAIL', message: '签名验证失败' };
    }

    const { out_trade_no, trade_state, transaction_id, success_time } =
      notifyData;

    if (trade_state !== 'SUCCESS') {
      // 非成功状态直接返回 200，无需处理
      return { code: 'SUCCESS', message: '处理成功' };
    }

    const order = await this.orderInfoEntity.findOneBy({
      orderNo: Equal(out_trade_no),
    });
    if (!order) {
      return { code: 'SUCCESS', message: '订单不存在' };
    }

    // 幂等处理：非待支付订单直接返回
    if (order.status !== ORDER_STATUS.PENDING) {
      return { code: 'SUCCESS', message: '已处理' };
    }

    if (!this.isMatchingWechatPayment(order, notifyData)) {
      ctx.status = 400;
      return { code: 'FAIL', message: '订单信息校验失败' };
    }

    await this.markOrderPaid(
      order,
      transaction_id,
      this.parseWechatSuccessTime(success_time)
    );

    return { code: 'SUCCESS', message: '处理成功' };
  }

  /**
   * 主动查询微信订单状态，补偿因回调延迟或丢失造成的本地待支付订单。
   */
  private async reconcileWechatOrder(order: OrderInfoEntity) {
    if (
      order.status !== ORDER_STATUS.PENDING ||
      order.payMethod !== PAY_METHOD.WECHAT
    ) {
      return false;
    }

    try {
      const plugin: any = await this.pluginService.getInstance('pay-wx');
      const wxpay = await plugin.getInstance();
      const result = await wxpay.query({ out_trade_no: order.orderNo });
      const trade = this.unwrapWechatPayResult(result);

      if (
        trade?.trade_state !== 'SUCCESS' ||
        !this.isMatchingWechatPayment(order, trade)
      ) {
        return false;
      }

      return await this.markOrderPaid(
        order,
        trade.transaction_id,
        this.parseWechatSuccessTime(trade.success_time)
      );
    } catch (e) {
      // 查单失败不影响用户查询本地订单，下次轮询继续补偿。
      return false;
    }
  }

  private isMatchingWechatPayment(order: OrderInfoEntity, trade: any) {
    if (!trade?.transaction_id || trade.out_trade_no !== order.orderNo) {
      return false;
    }

    const total = trade.amount?.total;
    return total !== undefined && Number(total) === Number(order.payAmount);
  }

  private parseWechatSuccessTime(successTime?: string) {
    if (!successTime) return new Date();
    const value = new Date(successTime);
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  /**
   * 用状态条件更新保证支付回调与主动查单并发时只入账一次。
   */
  private async markOrderPaid(
    order: OrderInfoEntity,
    tradeNo: string,
    payTime = new Date()
  ) {
    const result = await this.orderInfoEntity.update(
      { id: order.id, status: ORDER_STATUS.PENDING },
      {
        status: ORDER_STATUS.PAID,
        payTime,
        tradeNo,
      }
    );
    if (!result.affected) return false;

    try {
      await this.createMessageAfterPaid(order);
    } catch (error) {
      // 入账失败时恢复待支付，让微信重试回调或前端下次查单继续补偿。
      await this.orderInfoEntity.update(
        {
          id: order.id,
          status: ORDER_STATUS.PAID,
          tradeNo,
        },
        {
          status: ORDER_STATUS.PENDING,
          payTime: null,
          tradeNo: null,
        }
      );
      throw error;
    }

    order.status = ORDER_STATUS.PAID;
    order.payTime = payTime;
    order.tradeNo = tradeNo;
    return true;
  }

  /**
   * 支付成功后处理：增加配额 + 创建消息记录
   */
  private async createMessageAfterPaid(order: OrderInfoEntity) {
    const payParams = this.normalizePayParams(order.payParams);
    const messageQuota: number = payParams.messageQuota || 0;

    // 增加用户消息配额（购买套餐时 messageQuota > 0）
    if (messageQuota > 0) {
      await this.userBalanceService.addQuota(order.userId, messageQuota);
    }

    // 如果有消息内容，创建消息记录（按次支付模式）
    if (payParams.receiverPhone && payParams.content) {
      const receiverPhone: string = payParams.receiverPhone;
      const content: string = payParams.content;
      const contentLength = content.length;
      const smsCount = Number(payParams.smsCount ?? calculateSmsCount(content));
      const receiverPhoneMask =
        receiverPhone.substring(0, 3) + '****' + receiverPhone.substring(7);
      const receiverPhoneHash = crypto
        .createHash('sha256')
        .update(receiverPhone)
        .digest('hex');

      const message = this.messageInfoEntity.create({
        userId: order.userId,
        templateId: payParams.templateId || null,
        conversationId: payParams.conversationId || null,
        receiverPhone,
        receiverPhoneMask,
        receiverPhoneHash,
        content,
        contentLength,
        smsCount,
        isAnonymous:
          payParams.isAnonymous !== undefined ? payParams.isAnonymous : 1,
        isPublic:
          payParams.isPublic === 1 || payParams.isPublic === true ? 1 : 0,
        senderSignature: payParams.senderSignature || null,
        sendType: payParams.sendType || 1,
        scheduledAt: payParams.scheduledAt || null,
        status: 1, // 审核通过
        auditStatus: 1,
        auditedAt: new Date(),
        feeAmount: Number(payParams.feeAmount ?? order.payAmount),
        payType: this.getMessagePayType(order.payMethod),
        retryCount: 0,
        isFreeRetry: 0,
      });
      const savedMessage = await this.messageInfoEntity.save(message);
      await this.createConversationTimeline(
        savedMessage,
        receiverPhoneHash,
        receiverPhoneMask
      );
    }
  }

  private normalizePayParams(payParams: any) {
    if (!payParams) return {};
    if (typeof payParams === 'string') {
      try {
        return JSON.parse(payParams);
      } catch (e) {
        return {};
      }
    }
    return payParams;
  }

  private getMessagePayType(payMethod?: number) {
    if (payMethod === PAY_METHOD.PACKAGE_BALANCE) return 1;
    if (payMethod === PAY_METHOD.BALANCE) return 2;
    if (payMethod === PAY_METHOD.MOCK) return 4;
    return 3;
  }

  private async createConversationTimeline(
    message: MessageInfoEntity,
    receiverPhoneHash: string,
    receiverPhoneMask: string
  ) {
    const conversation = message.conversationId
      ? { id: message.conversationId }
      : await this.conversationInfoService.getOrCreate(
          message.userId,
          receiverPhoneHash,
          receiverPhoneMask
        );

    if (!message.conversationId) {
      message.conversationId = conversation.id;
      await this.messageInfoEntity.update(message.id, {
        conversationId: conversation.id,
      });
    }

    await this.conversationInfoService.addTimelineItem(conversation.id, {
      messageId: message.id,
      direction: 1,
      contentPreview: message.content.slice(0, 100),
      feeAmount: message.feeAmount,
      smsCount: message.smsCount,
      payType: message.payType,
    });
    await this.conversationInfoService.updateLastMsg(
      conversation.id,
      message.content.slice(0, 100),
      0
    );
  }

  /**
   * 查询订单状态
   */
  async queryStatus(userId: number, orderId: number) {
    let order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    const reconciled = await this.reconcileWechatOrder(order);
    if (reconciled) {
      order = await this.orderInfoEntity.findOneBy({
        id: Equal(orderId),
        userId: Equal(userId),
      });
    }
    return order;
  }

  /**
   * 订单详情
   */
  async orderDetail(userId: number, orderId: number) {
    let order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    const reconciled = await this.reconcileWechatRefund(order);
    if (reconciled) {
      order = await this.orderInfoEntity.findOneBy({
        id: Equal(orderId),
        userId: Equal(userId),
      });
    }
    return order;
  }

  /**
   * 用户提交全额退款申请。
   */
  async applyRefund(userId: number, orderId: number, reason: string) {
    const refundReason = (reason || '').trim();
    if (refundReason.length < 5 || refundReason.length > 200) {
      throw new CoolCommException('退款原因需填写5-200个字');
    }

    const order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    if (order.status !== ORDER_STATUS.PAID || Number(order.payAmount) <= 0) {
      throw new CoolCommException('当前订单不可申请退款');
    }
    if (
      ![REFUND_STATUS.NONE, REFUND_STATUS.REJECTED].includes(
        Number(order.refundStatus || 0)
      )
    ) {
      throw new CoolCommException('该订单已有退款申请，请勿重复提交');
    }

    const result = await this.orderInfoEntity
      .createQueryBuilder()
      .update(OrderInfoEntity)
      .set({
        refundStatus: REFUND_STATUS.PENDING,
        refundReason,
        refundApplyTime: new Date(),
        refundAuditTime: null,
        refundAuditUserId: null,
        refundRejectReason: null,
      })
      .where('id = :id AND userId = :userId AND status = :status', {
        id: orderId,
        userId,
        status: ORDER_STATUS.PAID,
      })
      .andWhere('refundStatus IN (:...statuses)', {
        statuses: [REFUND_STATUS.NONE, REFUND_STATUS.REJECTED],
      })
      .execute();
    if (!result.affected) {
      throw new CoolCommException('订单状态已变化，请刷新后重试');
    }
    return this.orderDetail(userId, orderId);
  }

  /**
   * 后台审批退款。拒绝直接结束；通过后按原支付渠道退款。
   */
  async auditRefund(
    orderId: number,
    approved: boolean,
    remark: string,
    adminUserId: number
  ) {
    const order = await this.orderInfoEntity.findOneBy({ id: Equal(orderId) });
    if (!order) throw new CoolCommException('订单不存在');
    if (order.refundStatus !== REFUND_STATUS.PENDING) {
      throw new CoolCommException('该退款申请已处理，请刷新后重试');
    }

    if (!approved) {
      const rejectReason = (remark || '').trim();
      if (!rejectReason) throw new CoolCommException('请填写拒绝原因');
      const result = await this.orderInfoEntity.update(
        { id: orderId, refundStatus: REFUND_STATUS.PENDING },
        {
          refundStatus: REFUND_STATUS.REJECTED,
          refundAuditTime: new Date(),
          refundAuditUserId: adminUserId,
          refundRejectReason: rejectReason.slice(0, 200),
        }
      );
      if (!result.affected) {
        throw new CoolCommException('该退款申请已被其他管理员处理');
      }
      return;
    }

    await this.ensureRefundBusinessCanSettle(order);
    const refundNo = order.refundNo || `RF${order.orderNo}`;
    const claimed = await this.orderInfoEntity.update(
      { id: orderId, refundStatus: REFUND_STATUS.PENDING },
      {
        refundStatus: REFUND_STATUS.PROCESSING,
        refundAuditTime: new Date(),
        refundAuditUserId: adminUserId,
        refundRejectReason: null,
        refundNo,
      }
    );
    if (!claimed.affected) {
      throw new CoolCommException('该退款申请已被其他管理员处理');
    }

    try {
      if (order.payMethod === PAY_METHOD.WECHAT) {
        const result = await this.refundByWechat(order, refundNo);
        const refund = this.unwrapWechatPayResult(result);
        if (refund?.status === 'SUCCESS') {
          await this.finishRefund(orderId);
        }
      } else if (
        [PAY_METHOD.BALANCE, PAY_METHOD.MOCK].includes(order.payMethod)
      ) {
        await this.finishRefund(orderId);
      } else {
        throw new CoolCommException('该支付方式暂不支持自动退款');
      }
    } catch (error) {
      await this.orderInfoEntity.update(
        { id: orderId, refundStatus: REFUND_STATUS.PROCESSING },
        {
          refundStatus: REFUND_STATUS.FAILED,
          refundRejectReason: this.getRefundErrorMessage(error),
        }
      );
      throw error;
    }
  }

  /** 同步微信退款状态，供处理中的退款人工刷新。 */
  async syncRefund(orderId: number) {
    const order = await this.orderInfoEntity.findOneBy({ id: Equal(orderId) });
    if (!order) throw new CoolCommException('订单不存在');
    if (
      order.payMethod !== PAY_METHOD.WECHAT ||
      ![REFUND_STATUS.PROCESSING, REFUND_STATUS.FAILED].includes(
        order.refundStatus
      ) ||
      !order.refundNo
    ) {
      throw new CoolCommException('当前订单无需同步退款状态');
    }
    const wxpay = await this.getWechatPayInstance();
    const result = await wxpay.find_refunds(order.refundNo);
    const refund = this.unwrapWechatPayResult(result);
    if (refund?.status === 'SUCCESS') {
      await this.finishRefund(orderId);
    } else if (['CLOSED', 'ABNORMAL'].includes(refund?.status)) {
      await this.orderInfoEntity.update(orderId, {
        refundStatus: REFUND_STATUS.FAILED,
        refundRejectReason:
          refund.status === 'CLOSED' ? '退款已关闭' : '微信退款异常',
      });
    } else {
      await this.orderInfoEntity.update(orderId, {
        refundStatus: REFUND_STATUS.PROCESSING,
        refundRejectReason: null,
      });
    }
    return this.orderInfoEntity.findOneBy({ id: Equal(orderId) });
  }

  /**
   * 用户查询订单时主动补查微信退款。
   * 退款通常是异步完成的，补查可避免通知延迟或丢失后本地状态永久停在“处理中”。
   */
  private async reconcileWechatRefund(order: OrderInfoEntity) {
    if (
      order.payMethod !== PAY_METHOD.WECHAT ||
      order.refundStatus !== REFUND_STATUS.PROCESSING ||
      !order.refundNo
    ) {
      return false;
    }

    try {
      await this.syncRefund(order.id);
      return true;
    } catch (e) {
      // 补查失败不影响用户查询本地订单，下次刷新继续尝试。
      return false;
    }
  }

  /** 使用相同商户退款单号幂等重试失败的微信退款。 */
  async retryRefund(orderId: number) {
    const order = await this.orderInfoEntity.findOneBy({ id: Equal(orderId) });
    if (
      !order ||
      order.payMethod !== PAY_METHOD.WECHAT ||
      order.refundStatus !== REFUND_STATUS.FAILED ||
      !order.refundNo
    ) {
      throw new CoolCommException('当前订单不可重试退款');
    }
    const claimed = await this.orderInfoEntity.update(
      { id: orderId, refundStatus: REFUND_STATUS.FAILED },
      {
        refundStatus: REFUND_STATUS.PROCESSING,
        refundRejectReason: null,
      }
    );
    if (!claimed.affected) {
      throw new CoolCommException('退款状态已变化，请刷新后重试');
    }
    try {
      const result = await this.refundByWechat(order, order.refundNo);
      const refund = this.unwrapWechatPayResult(result);
      if (refund?.status === 'SUCCESS') {
        await this.finishRefund(orderId);
      }
    } catch (error) {
      await this.orderInfoEntity.update(
        { id: orderId, refundStatus: REFUND_STATUS.PROCESSING },
        {
          refundStatus: REFUND_STATUS.FAILED,
          refundRejectReason: this.getRefundErrorMessage(error),
        }
      );
      throw error;
    }
    return this.orderInfoEntity.findOneBy({ id: Equal(orderId) });
  }

  private async ensureRefundBusinessCanSettle(order: OrderInfoEntity) {
    const payParams = this.normalizePayParams(order.payParams);
    const messageQuota = Number(payParams.messageQuota || 0);
    if (messageQuota > 0) {
      const balance = await this.userBalanceService.getBalance(order.userId);
      if (Number(balance.messageQuota) < messageQuota) {
        throw new CoolCommException('用户已使用部分套餐条数，暂不能通过退款');
      }
    }
  }

  private async refundByWechat(order: OrderInfoEntity, refundNo: string) {
    const wxpay = await this.getWechatPayInstance();
    return wxpay.refunds({
      out_trade_no: order.orderNo,
      out_refund_no: refundNo,
      reason: order.refundReason,
      amount: {
        refund: Number(order.payAmount),
        total: Number(order.payAmount),
        currency: 'CNY',
      },
    });
  }

  private async getWechatPayInstance() {
    try {
      const plugin: any = await this.pluginService.getInstance('pay-wx');
      return plugin.getInstance();
    } catch (error) {
      throw new CoolCommException('微信支付插件未配置，无法发起退款');
    }
  }

  private async finishRefund(orderId: number) {
    await this.orderInfoEntity.manager.transaction(async manager => {
      const repository = manager.getRepository(OrderInfoEntity);
      const order = await repository.findOne({
        where: { id: Equal(orderId) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.refundStatus === REFUND_STATUS.REFUNDED) return;
      if (
        ![REFUND_STATUS.PROCESSING, REFUND_STATUS.FAILED].includes(
          order.refundStatus
        )
      ) {
        throw new CoolCommException('退款状态异常，请刷新后重试');
      }

      const payParams = this.normalizePayParams(order.payParams);
      const messageQuota = Number(payParams.messageQuota || 0);
      if (messageQuota > 0) {
        const result = await manager
          .createQueryBuilder()
          .update('user_balance')
          .set({ messageQuota: () => `messageQuota - ${messageQuota}` })
          .where('userId = :userId AND messageQuota >= :messageQuota', {
            userId: order.userId,
            messageQuota,
          })
          .execute();
        if (!result.affected) {
          throw new CoolCommException('用户剩余套餐条数不足，退款入账失败');
        }
      }
      if (order.payMethod === PAY_METHOD.BALANCE) {
        await manager
          .createQueryBuilder()
          .update('user_balance')
          .set({
            balance: () => `balance + ${Number(order.payAmount)}`,
            totalConsumed: () =>
              `GREATEST(totalConsumed - ${Number(order.payAmount)}, 0)`,
          })
          .where('userId = :userId', { userId: order.userId })
          .execute();
      }

      await repository.update(orderId, {
        status: ORDER_STATUS.REFUNDED,
        refundStatus: REFUND_STATUS.REFUNDED,
        refundAmount: Number(order.payAmount),
        refundTime: new Date(),
        refundRejectReason: null,
      });
    });
  }

  private getRefundErrorMessage(error: any) {
    const message =
      error?.message || error?.response?.body?.message || '退款请求失败';
    return String(message).slice(0, 200);
  }

  /**
   * 订单列表
   */
  async orderList(userId: number, params: any) {
    const { page = 1, size = 10 } = params;
    const options = {
      where: { userId: Equal(userId) },
      order: { createTime: 'DESC' as const },
      skip: (page - 1) * size,
      take: size,
    };
    let [list, total] = await this.orderInfoEntity.findAndCount(options);

    // 账单页打开时主动补查当前页最近的微信待支付订单。
    const pendingWechatOrders = list
      .filter(
        order =>
          order.status === ORDER_STATUS.PENDING &&
          order.payMethod === PAY_METHOD.WECHAT
      )
      .slice(0, 3);
    const paymentReconciled = await Promise.all(
      pendingWechatOrders.map(order => this.reconcileWechatOrder(order))
    );

    // 退款异步到账后主动补查，避免用户端长期显示“退款处理中”。
    const processingWechatRefunds = list
      .filter(
        order =>
          order.payMethod === PAY_METHOD.WECHAT &&
          order.refundStatus === REFUND_STATUS.PROCESSING &&
          Boolean(order.refundNo)
      )
      .slice(0, 3);
    const refundReconciled = await Promise.all(
      processingWechatRefunds.map(order => this.reconcileWechatRefund(order))
    );

    if (paymentReconciled.some(Boolean) || refundReconciled.some(Boolean)) {
      [list, total] = await this.orderInfoEntity.findAndCount(options);
    }

    return { list, total, page, size };
  }
}
