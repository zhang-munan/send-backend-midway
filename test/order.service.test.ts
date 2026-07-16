import {
  OrderInfoService,
  ORDER_STATUS,
  PAY_METHOD,
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
