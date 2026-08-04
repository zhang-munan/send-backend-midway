import {
  OrderInfoService,
  ORDER_STATUS,
  PAY_METHOD,
  REFUND_STATUS,
} from '../src/modules/order/service/info';
import {
  calculateSmsCount,
  calculateSmsFee,
} from '../src/modules/message/service/pricing';

describe('短信套餐余额订单', () => {
  it('按次支付按每 10 字一条、每条 1.99 元计算费用', () => {
    expect(calculateSmsCount('')).toBe(1);
    expect(calculateSmsCount('a'.repeat(10))).toBe(1);
    expect(calculateSmsCount('a'.repeat(11))).toBe(2);
    expect(calculateSmsFee('a'.repeat(11))).toBe(398);
  });

  it('套餐配额发送会生成一笔已支付的套餐余额订单', async () => {
    const service = new OrderInfoService();
    const orderInfoEntity = {
      create: jest.fn(data => data),
      save: jest.fn(async data => ({ ...data, id: 100 })),
    };
    const deductQuota = jest.fn();

    service.orderInfoEntity = orderInfoEntity as any;
    service.userBalanceService = {
      getBalance: jest.fn(async () => ({ messageQuota: 1 })),
      deductQuota,
    } as any;
    jest
      .spyOn(service as any, 'generateOrderNo')
      .mockResolvedValue('BNSC2026071600001');
    jest
      .spyOn(service as any, 'createMessageAfterPaid')
      .mockResolvedValue(undefined);

    const order = await service.sendByPackageBalance(12, {
      receiverPhone: '13800138000',
      content: 'a'.repeat(71),
    });

    expect(order).toMatchObject({
      id: 100,
      status: ORDER_STATUS.PAID,
      payMethod: PAY_METHOD.PACKAGE_BALANCE,
      payAmount: 0,
    });
    expect(deductQuota).toHaveBeenCalledWith(12, 1);
  });
});

describe('订单退款流程', () => {
  it('用户可以为已支付订单提交退款申请', async () => {
    const service = new OrderInfoService();
    const execute = jest.fn(async () => ({ affected: 1 }));
    const queryBuilder: any = {
      update: jest.fn(() => queryBuilder),
      set: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      execute,
    };
    service.orderInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 1,
        userId: 12,
        status: ORDER_STATUS.PAID,
        payAmount: 199,
        refundStatus: REFUND_STATUS.NONE,
      })),
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as any;
    jest.spyOn(service, 'orderDetail').mockResolvedValue({ id: 1 } as any);

    await expect(
      service.applyRefund(12, 1, '不再需要该服务')
    ).resolves.toMatchObject({ id: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        refundStatus: REFUND_STATUS.PENDING,
        refundReason: '不再需要该服务',
      })
    );
  });

  it('后台拒绝退款时必须填写原因并记录审批人', async () => {
    const service = new OrderInfoService();
    const update = jest.fn(async () => ({ affected: 1 }));
    service.orderInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 1,
        refundStatus: REFUND_STATUS.PENDING,
      })),
      update,
    } as any;

    await service.auditRefund(1, false, '订单服务已履约', 99);

    expect(update).toHaveBeenCalledWith(
      { id: 1, refundStatus: REFUND_STATUS.PENDING },
      expect.objectContaining({
        refundStatus: REFUND_STATUS.REJECTED,
        refundAuditUserId: 99,
        refundRejectReason: '订单服务已履约',
      })
    );
  });

  it('用户查看订单详情时会补查处理中的微信退款', async () => {
    const service = new OrderInfoService();
    const processingOrder = {
      id: 1,
      userId: 12,
      payMethod: PAY_METHOD.WECHAT,
      refundStatus: REFUND_STATUS.PROCESSING,
      refundNo: 'RFBNSC2026080400001',
    };
    const refundedOrder = {
      ...processingOrder,
      status: ORDER_STATUS.REFUNDED,
      refundStatus: REFUND_STATUS.REFUNDED,
    };
    const findOneBy = jest
      .fn()
      .mockResolvedValueOnce(processingOrder)
      .mockResolvedValueOnce(refundedOrder);
    service.orderInfoEntity = { findOneBy } as any;
    const reconcile = jest
      .spyOn(service as any, 'reconcileWechatRefund')
      .mockResolvedValue(true);

    await expect(service.orderDetail(12, 1)).resolves.toMatchObject({
      status: ORDER_STATUS.REFUNDED,
      refundStatus: REFUND_STATUS.REFUNDED,
    });
    expect(reconcile).toHaveBeenCalledWith(processingOrder);
    expect(findOneBy).toHaveBeenCalledTimes(2);
  });
});

describe('微信JSAPI支付参数', () => {
  it('直接透传SDK返回的完整预支付参数', async () => {
    const service = new OrderInfoService();
    const sdkPayParams = {
      appId: 'wx_test',
      timeStamp: '1722787200',
      nonceStr: 'nonce',
      package: 'prepay_id=wx_valid_prepay_id',
      signType: 'RSA',
      paySign: 'signed-value',
    };
    service.pluginService = {
      getInstance: jest.fn(async () => ({
        getConfig: jest.fn(async () => ({
          appid: 'wx_test',
          mchid: '1900000001',
          notify_url: 'https://example.com/notify',
        })),
        getInstance: jest.fn(async () => ({
          transactions_jsapi: jest.fn(async () => sdkPayParams),
        })),
      })),
    } as any;
    jest
      .spyOn(service as any, 'getWechatJsapiOpenid')
      .mockResolvedValue('openid_test');

    const result = await (service as any).payByWechat(
      {
        id: 1,
        orderNo: 'BNSC2026080400001',
        productName: '测试套餐',
        payAmount: 1,
      },
      12,
      {},
      { tradeType: 'JSAPI', code: 'login-code' }
    );

    expect(result).toMatchObject({
      timeStamp: sdkPayParams.timeStamp,
      nonceStr: sdkPayParams.nonceStr,
      package: sdkPayParams.package,
      signType: sdkPayParams.signType,
      paySign: sdkPayParams.paySign,
    });
    expect(result.package).toBe('prepay_id=wx_valid_prepay_id');
  });

  it('拒绝缺少有效package的SDK响应', async () => {
    const service = new OrderInfoService();
    service.pluginService = {
      getInstance: jest.fn(async () => ({
        getConfig: jest.fn(async () => ({
          appid: 'wx_test',
          mchid: '1900000001',
          notify_url: 'https://example.com/notify',
        })),
        getInstance: jest.fn(async () => ({
          transactions_jsapi: jest.fn(async () => ({
            timeStamp: '1722787200',
            nonceStr: 'nonce',
            package: 'prepay_id=undefined',
            signType: 'RSA',
            paySign: 'signed-value',
          })),
        })),
      })),
    } as any;
    jest
      .spyOn(service as any, 'getWechatJsapiOpenid')
      .mockResolvedValue('openid_test');

    await expect(
      (service as any).payByWechat(
        {
          id: 1,
          orderNo: 'BNSC2026080400001',
          productName: '测试套餐',
          payAmount: 1,
        },
        12,
        {},
        { tradeType: 'JSAPI', code: 'login-code' }
      )
    ).rejects.toThrow('微信JSAPI预支付返回参数不完整');
  });
});

describe('微信支付状态补偿', () => {
  it('轮询时主动查单并将微信已成功订单入账', async () => {
    const service = new OrderInfoService();
    const order: any = {
      id: 10,
      userId: 12,
      orderNo: 'BNSC2026080450898',
      payMethod: PAY_METHOD.WECHAT,
      payAmount: 199,
      status: ORDER_STATUS.PENDING,
      payParams: { messageQuota: 10 },
    };
    const update = jest.fn(async () => ({ affected: 1 }));
    const query = jest.fn(async () => ({
      status: 200,
      out_trade_no: order.orderNo,
      transaction_id: '4200000000202608040001',
      trade_state: 'SUCCESS',
      success_time: '2026-08-04T22:38:20+08:00',
      amount: { total: 199 },
    }));
    service.orderInfoEntity = {
      findOneBy: jest.fn(async () => order),
      update,
    } as any;
    service.pluginService = {
      getInstance: jest.fn(async () => ({
        getInstance: jest.fn(async () => ({ query })),
      })),
    } as any;
    jest
      .spyOn(service as any, 'createMessageAfterPaid')
      .mockResolvedValue(undefined);

    const result = await service.queryStatus(12, 10);

    expect(query).toHaveBeenCalledWith({ out_trade_no: order.orderNo });
    expect(update).toHaveBeenCalledWith(
      { id: order.id, status: ORDER_STATUS.PENDING },
      expect.objectContaining({
        status: ORDER_STATUS.PAID,
        tradeNo: '4200000000202608040001',
      })
    );
    expect(result.status).toBe(ORDER_STATUS.PAID);
  });

  it('回调与查单并发时只执行一次套餐入账', async () => {
    const service = new OrderInfoService();
    const order: any = {
      id: 10,
      status: ORDER_STATUS.PENDING,
    };
    const update = jest
      .fn()
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    const fulfill = jest
      .spyOn(service as any, 'createMessageAfterPaid')
      .mockResolvedValue(undefined);
    service.orderInfoEntity = { update } as any;

    await Promise.all([
      (service as any).markOrderPaid(order, 'WX_1'),
      (service as any).markOrderPaid(order, 'WX_1'),
    ]);

    expect(fulfill).toHaveBeenCalledTimes(1);
  });

  it('打开账单页时补查当前页的微信待支付订单', async () => {
    const service = new OrderInfoService();
    const pendingOrder: any = {
      id: 10,
      orderNo: 'BNSC2026080450898',
      payMethod: PAY_METHOD.WECHAT,
      status: ORDER_STATUS.PENDING,
    };
    const paidOrder = { ...pendingOrder, status: ORDER_STATUS.PAID };
    const findAndCount = jest
      .fn()
      .mockResolvedValueOnce([[pendingOrder], 1])
      .mockResolvedValueOnce([[paidOrder], 1]);
    service.orderInfoEntity = { findAndCount } as any;
    jest
      .spyOn(service as any, 'reconcileWechatOrder')
      .mockResolvedValue(true);

    const result = await service.orderList(12, { page: 1, size: 10 });

    expect(findAndCount).toHaveBeenCalledTimes(2);
    expect(result.list[0].status).toBe(ORDER_STATUS.PAID);
  });
});
