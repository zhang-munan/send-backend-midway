import { PromotionService } from '../src/modules/promotion/service/promotion';

function insertBuilder() {
  const builder: any = {};
  for (const method of ['insert', 'into', 'values', 'orIgnore']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.execute = jest.fn().mockResolvedValue({});
  return builder;
}

describe('推广大使佣金规则', () => {
  it('真实第三方支付按配置比例生成一次待结算佣金', async () => {
    const service = new PromotionService();
    const builder = insertBuilder();
    const order = {
      id: 9,
      userId: 20,
      orderNo: 'BNSC2026082600001',
      status: 1,
      payMethod: 1,
      payAmount: 199,
      payTime: new Date('2026-08-26T00:00:00.000Z'),
    };
    service.orderRepository = {
      findOneBy: jest.fn().mockResolvedValue(order),
    } as any;
    service.referralRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ ambassadorId: 3, referredUserId: 20 }),
    } as any;
    service.ambassadorRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 3, status: 1 }),
    } as any;
    service.commissionRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 6 }),
      createQueryBuilder: jest.fn(() => builder),
    } as any;
    jest.spyOn(service, 'getConfig').mockResolvedValue({
      commissionRateBps: 5000,
      settlementDays: 7,
    } as any);

    await service.recordPaidOrder(9);

    expect(builder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 9,
        sourceAmount: 199,
        commissionRateBps: 5000,
        commissionAmount: 99,
        status: 0,
        availableAt: new Date('2026-09-02T00:00:00.000Z'),
      })
    );
    expect(builder.orIgnore).toHaveBeenCalled();
  });

  it.each([3, 4, 5])('支付方式 %s 不重复计算现金佣金', async payMethod => {
    const service = new PromotionService();
    service.orderRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 9,
        status: 1,
        payMethod,
        payAmount: 199,
      }),
    } as any;
    service.referralRepository = { findOneBy: jest.fn() } as any;

    await expect(service.recordPaidOrder(9)).resolves.toBeNull();
    expect(service.referralRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('拒绝最高提现金额低于最低金额的配置', () => {
    const service = new PromotionService();
    expect(() =>
      (service as any).validateConfig({
        enabled: 1,
        referralRewardQuota: 2,
        commissionRateBps: 5000,
        settlementDays: 7,
        bindWindowHours: 24,
        minWithdrawAmount: 1000,
        maxWithdrawAmount: 999,
        withdrawFeeRateBps: 0,
      })
    ).toThrow('单笔最高提现金额不能低于最低提现金额');
  });

  it('C端提现记录隐藏完整收款账号', () => {
    const service = new PromotionService();
    expect((service as any).maskAccount('13800138000')).toBe('138****8000');
  });
});
