import { MessageBlacklistService } from '../src/modules/message/service/blacklist';

describe('短信发送者拉黑', () => {
  function createService(deliveredCount: number) {
    const service = new MessageBlacklistService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000', status: 1 })),
    } as any;
    service.settingUserEntity = {
      findOneBy: jest.fn(async () => ({ userId: 20, blockAllSms: 0 })),
    } as any;
    service.conversationInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 30,
        userId: 10,
        receiverPhone: '13800138000',
        lastMsgContent: '最近一条消息',
        status: 1,
      })),
    } as any;
    service.messageInfoEntity = {
      count: jest.fn(async () => deliveredCount),
      update: jest.fn(),
    } as any;
    service.blacklistEntity = {
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async data => ({ ...data, id: 40 })),
      update: jest.fn(),
    } as any;
    return service;
  }

  it('允许收件人拉黑并取消待发消息', async () => {
    const service = createService(1);

    await expect(service.block(20, 30)).resolves.toMatchObject({
      id: 40,
      blockerUserId: 20,
      blockedUserId: 10,
      status: 1,
    });
    expect(service.messageInfoEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.anything(), status: expect.anything() }),
      expect.objectContaining({ status: 7 })
    );
  });

  it('不受已送达消息数量限制', async () => {
    const service = createService(0);

    await expect(service.block(20, 30)).resolves.toMatchObject({
      id: 40,
      deliveredMessageCount: 0,
      status: 1,
    });

    await expect(service.conversationState(20, 30)).resolves.toMatchObject({
      canBlock: true,
      deliveredMessageCount: 0,
      requiredMessageCount: 0,
    });
  });

  it('发送前发现有效拉黑关系时返回明确提示', async () => {
    const service = new MessageBlacklistService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000', status: 1 })),
    } as any;
    service.blacklistEntity = {
      findOneBy: jest.fn(async () => ({ id: 40, status: 1 })),
    } as any;
    service.settingUserEntity = {
      findOneBy: jest.fn(async () => ({ userId: 20, blockAllSms: 0 })),
    } as any;

    await expect(service.assertCanSend(10, '13800138000')).rejects.toThrow(
      '对方已将你拉黑'
    );
  });

  it('收件人开启全局屏蔽后阻止任何账号发送', async () => {
    const service = new MessageBlacklistService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000', status: 1 })),
    } as any;
    service.settingUserEntity = {
      findOneBy: jest.fn(async () => ({ userId: 20, blockAllSms: 1 })),
    } as any;
    service.blacklistEntity = { findOneBy: jest.fn() } as any;

    await expect(service.assertCanSend(10, '13800138000')).rejects.toThrow(
      '对方已屏蔽所有短信'
    );
    expect(service.blacklistEntity.findOneBy).not.toHaveBeenCalled();
  });
});
