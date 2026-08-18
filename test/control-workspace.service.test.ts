import { ControlWorkspaceService } from '../src/modules/control/service/workspace';
import { ORDER_STATUS, REFUND_STATUS } from '../src/modules/order/service/info';
import { appendControlRemark } from '../src/modules/base/utils/control-remark';

describe('总控制台订单操作', () => {
  const operator = { userId: 1, username: 'admin' };
  const reason = '人工核对退款流程后修复状态';

  it('备注接近长度上限时仍完整保留最新总控制台标识', () => {
    const remark = appendControlRemark('旧备注'.repeat(80), reason, 'admin');

    expect(remark.length).toBeLessThanOrEqual(200);
    expect(remark).toContain(`[总控制台:admin] ${reason}`);
  });

  function createService(overrides: Record<string, any> = {}) {
    const order = {
      id: 10,
      orderNo: 'ORDER-10',
      userId: 20,
      status: ORDER_STATUS.PAID,
      payAmount: 199,
      payMethod: 1,
      payTime: new Date('2026-08-18T00:00:00.000Z'),
      tradeNo: 'TRADE-10',
      refundStatus: REFUND_STATUS.NONE,
      refundAmount: 0,
      refundNo: null,
      refundTime: null,
      isForceRefund: 0,
      remark: null,
      ...overrides,
    };
    const updatedOrder = { ...order };
    const repository = {
      findOne: jest.fn(async () => order),
      update: jest.fn(async (_id, data) => {
        Object.assign(updatedOrder, data);
        return { affected: 1 };
      }),
      findOneBy: jest.fn(async () => updatedOrder),
    };
    const auditEntity = {
      create: jest.fn(data => data),
      save: jest.fn(async data => ({ ...data, id: 99 })),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const service = new ControlWorkspaceService();
    service.auditEntity = auditEntity as any;
    service.orderEntity = {
      findOneBy: jest.fn(async () => order),
      manager: {
        transaction: jest.fn(async callback =>
          callback({ getRepository: () => repository })
        ),
      },
    } as any;
    return { service, order, repository, auditEntity };
  }

  it('只修复订单状态，并写入完整审计快照', async () => {
    const { service, repository, auditEntity } = createService({
      refundStatus: REFUND_STATUS.REFUNDED,
      refundTime: new Date('2026-08-18T01:00:00.000Z'),
      refundAmount: 199,
    });

    const result = await service.repairOrderStatus(
      {
        orderId: 10,
        userId: 20,
        targetStatus: ORDER_STATUS.REFUNDED,
        reason,
      },
      operator,
      '127.0.0.1'
    );

    expect(repository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ status: ORDER_STATUS.REFUNDED })
    );
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('refundStatus');
    expect(auditEntity.save).toHaveBeenCalledWith(
      expect.objectContaining({ actionName: '订单状态修复' })
    );
    expect(auditEntity.update).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        status: 1,
        afterData: expect.objectContaining({
          status: ORDER_STATUS.REFUNDED,
        }),
      })
    );
    expect(result.status).toBe(ORDER_STATUS.REFUNDED);
  });

  it('不再接受只修改退款状态', async () => {
    const { service, repository } = createService();
    await expect(
      service.repairOrderStatus(
        {
          orderId: 10,
          targetRefundStatus: REFUND_STATUS.FAILED,
          reason,
        },
        operator
      )
    ).rejects.toThrow('目标订单状态不合法');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('没有真实退款记录时禁止标记为已退款', async () => {
    const { service, repository } = createService();

    await expect(
      service.repairOrderStatus(
        {
          orderId: 10,
          targetStatus: ORDER_STATUS.REFUNDED,
          reason,
        },
        operator
      )
    ).rejects.toThrow('退款尚未完成，不能修复为已退款');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('强制退款会把管理员账号传给订单备注', async () => {
    const { service, order, auditEntity } = createService();
    const forceRefund = jest.fn(async () => ({
      ...order,
      refundStatus: REFUND_STATUS.REFUNDED,
    }));
    service.orderInfoService = { forceRefund } as any;

    await service.forceRefund(
      { orderId: order.id, userId: order.userId, reason },
      operator,
      '127.0.0.1'
    );

    expect(forceRefund).toHaveBeenCalledWith(
      order.id,
      reason,
      operator.userId,
      operator.username
    );
    expect(auditEntity.update).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ status: 1 })
    );
  });
});
