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
      const prepayId = result.prepay_id;
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
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        payAmount: order.payAmount,
        tradeType,
        h5Url: result.h5_url,
        mwebUrl: result.h5_url,
      };
    }

    const openid = await this.getWechatJsapiOpenid(userId, params.code);

    // 发起 JSAPI 预支付
    const result = await wxpay.transactions_jsapi({
      ...baseParams,
      payer: { openid },
    });

    // 生成小程序调起支付所需签名
    const packageStr = `prepay_id=${result.prepay_id}`;
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

    const { out_trade_no, trade_state, transaction_id } = notifyData;

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

    // 幂等处理：已支付则直接返回
    if (order.status === ORDER_STATUS.PAID) {
      return { code: 'SUCCESS', message: '已处理' };
    }

    await this.orderInfoEntity.update(order.id, {
      status: ORDER_STATUS.PAID,
      payTime: new Date(),
      tradeNo: transaction_id,
    });

    // 支付成功后给用户增加配额（如果是购买套餐）并创建消息记录
    await this.createMessageAfterPaid(order);

    return { code: 'SUCCESS', message: '处理成功' };
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
    const order = await this.orderInfoEntity.findOne({
      where: { id: Equal(orderId), userId: Equal(userId) },
      select: ['id', 'orderNo', 'status', 'payAmount', 'payTime'],
    });
    if (!order) throw new CoolCommException('订单不存在');
    return order;
  }

  /**
   * 订单详情
   */
  async orderDetail(userId: number, orderId: number) {
    const order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    return order;
  }

  /**
   * 订单列表
   */
  async orderList(userId: number, params: any) {
    const { page = 1, size = 10 } = params;
    const [list, total] = await this.orderInfoEntity.findAndCount({
      where: { userId: Equal(userId) },
      order: { createTime: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }
}
