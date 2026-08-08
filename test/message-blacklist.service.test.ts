import { MessageBlacklistService } from '../src/modules/message/service/blacklist';

describe('短信发送者拉黑', () => {
  function createService(deliveredCount: number) {
    const service = new MessageBlacklistService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000', status: 1 })),
    } as any;
    service.conversationInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 30,
        userId: 10,
        receiverPhoneHash: 'hash',
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

  it('第6条成功送达后允许收件人拉黑并取消待发消息', async () => {
    const service = createService(6);

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

  it('仅收到5条时不允许拉黑', async () => {
    const service = createService(5);
    await expect(service.block(20, 30)).rejects.toThrow('至少6条');
    expect(service.blacklistEntity.save).not.toHaveBeenCalled();
  });

  it('发送前发现有效拉黑关系时返回明确提示', async () => {
    const service = new MessageBlacklistService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000', status: 1 })),
    } as any;
    service.blacklistEntity = {
      findOneBy: jest.fn(async () => ({ id: 40, status: 1 })),
    } as any;

    await expect(service.assertCanSend(10, '13800138000')).rejects.toThrow(
      '对方已将你拉黑'
    );
  });
});
