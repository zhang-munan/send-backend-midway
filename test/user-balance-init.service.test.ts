import { ControlWorkspaceService } from '../src/modules/control/service/workspace';
import { UserBalanceService } from '../src/modules/order/service/balance';

function createInsertBuilder() {
  const builder: any = {};
  for (const method of [
    'insert',
    'into',
    'values',
    'orIgnore',
    'updateEntity',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.execute = jest.fn().mockResolvedValue({});
  return builder;
}

describe('用户权益记录初始化', () => {
  it('总控制台幂等初始化时关闭 TypeORM 实体回填', async () => {
    const service = new ControlWorkspaceService();
    const builder = createInsertBuilder();
    service.balanceEntity = {
      createQueryBuilder: jest.fn(() => builder),
    } as any;

    await (service as any).ensureBalance(42);

    expect(builder.orIgnore).toHaveBeenCalled();
    expect(builder.updateEntity).toHaveBeenCalledWith(false);
    expect(builder.execute).toHaveBeenCalled();
  });

  it('并发创建被忽略时仍能重新读取权益记录', async () => {
    const service = new UserBalanceService();
    const builder = createInsertBuilder();
    const balance = { id: 7, userId: 42, balance: 0, messageQuota: 0 };
    service.userBalanceEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(balance),
      createQueryBuilder: jest.fn(() => builder),
    } as any;

    await expect(service.getOrInit(42)).resolves.toBe(balance);
    expect(builder.updateEntity).toHaveBeenCalledWith(false);
  });
});
