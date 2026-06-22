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

/** 支付方式 */
export const PAY_METHOD = {
  WECHAT: 1,
  ALIPAY: 2,
  BALANCE: 3,
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
      payAmount = Number(
        (Number(product.sellPrice) * quantity).toFixed(2)
      );
      productName = product.name;
      messageQuota = product.messageQuota * quantity;
    } else {
      // 未指定商品时，按消息条数计费（每条0.05元，70字/条）
      const contentLen = content ? content.length : 0;
      const smsCount = Math.ceil(contentLen / 70) || 1;
      payAmount = Number((smsCount * 0.05).toFixed(2));
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

    // 生成订单号
    const plugin = await this.pluginService.getInstance('pay-wx').catch(
      () => null
    );
    const orderNo = plugin
      ? plugin.createOrderNum(userId.toString())
      : `BYSC${Date.now()}${userId}`;

    // 消息参数存入 payParams
    const messageParams = {
      receiverPhone,
      content,
      isAnonymous: isAnonymous !== undefined ? isAnonymous : 1,
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
  async pay(userId: number, orderId: number, payMethod: number, ctx?: any) {
    const order = await this.orderInfoEntity.findOneBy({
      id: Equal(orderId),
      userId: Equal(userId),
    });
    if (!order) throw new CoolCommException('订单不存在');
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new CoolCommException('订单状态不可支付');
    }

    // 更新支付方式
    await this.orderInfoEntity.update(order.id, { payMethod });

    if (payMethod === PAY_METHOD.WECHAT) {
      return this.payByWechat(order, userId);
    } else if (payMethod === PAY_METHOD.BALANCE) {
      return this.payByBalance(order, userId);
    } else {
      throw new CoolCommException('暂不支持该支付方式');
    }
  }

  /**
   * 微信支付（小程序 JSAPI）
   */
  private async payByWechat(order: OrderInfoEntity, userId: number) {
    // 获取用户 openid
    const userInfo = await this.userInfoEntity.findOneBy({
      id: Equal(userId),
    });
    if (!userInfo?.unionid) {
      throw new CoolCommException('未绑定微信，无法使用微信支付');
    }
    const userWx = await this.userWxEntity.findOne({
      where: { unionid: Equal(userInfo.unionid) },
      order: { createTime: 'DESC' },
    });
    if (!userWx?.openid) {
      throw new CoolCommException('未获取到微信openid，无法发起支付');
    }

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

    // 发起 JSAPI 预支付
    const result = await wxpay.transactions_jsapi({
      appid: config.appid,
      mchid: config.mchid,
      description: order.productName,
      out_trade_no: order.orderNo,
      notify_url: config.notify_url,
      amount: {
        total: Math.round(Number(order.payAmount) * 100),
        currency: 'CNY',
      },
      payer: { openid: userWx.openid },
    });

    // 生成小程序调起支付所需签名
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const packageStr = `prepay_id=${result.prepay_id}`;
    const signStr = `${config.appid}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;
    const paySign = crypto
      .createSign('RSA-SHA256')
      .update(signStr)
      .sign(config.privateKey, 'base64');

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      payAmount: order.payAmount,
      timeStamp: timestamp,
      nonceStr,
      package: packageStr,
      signType: 'RSA',
      paySign,
    };
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

    await this.userBalanceService.deductQuota(
      userId,
      0,
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
    const payParams = order.payParams || {};
    const messageQuota: number = payParams.messageQuota || 0;

    // 增加用户消息配额（购买套餐时 messageQuota > 0）
    if (messageQuota > 0) {
      await this.userBalanceService.addQuota(
        order.userId,
        messageQuota,
        Number(order.payAmount)
      );
    }

    // 如果有消息内容，创建消息记录（按次支付模式）
    if (payParams.receiverPhone && payParams.content) {
      const receiverPhone: string = payParams.receiverPhone;
      const content: string = payParams.content;
      const contentLength = content.length;
      const smsCount = Math.ceil(contentLength / 70);
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
        isAnonymous: payParams.isAnonymous !== undefined ? payParams.isAnonymous : 1,
        senderSignature: payParams.senderSignature || null,
        sendType: payParams.sendType || 1,
        scheduledAt: payParams.scheduledAt || null,
        status: 0, // 待审核
        auditStatus: 0,
        feeAmount: Number(order.payAmount),
        retryCount: 0,
        isFreeRetry: 0,
      });
      await this.messageInfoEntity.save(message);
    }
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
