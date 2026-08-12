import { MessageReplyService } from '../src/modules/message/service/reply';

describe('短信链接回复时间线', () => {
  it('回复由会话收件人发出的消息时，仍归入原会话且方向回到发起人侧', async () => {
    const service = new MessageReplyService();
    service.replyTokenService = {
      parseReplyToken: jest.fn(() => ({
        messageId: 11,
        conversationId: 8,
        receiverPhone: '13900139000',
      })),
    } as any;
    service.midwayCache = {
      get: jest.fn(async () => 0),
      set: jest.fn(async () => undefined),
    } as any;
    service.messageInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 11,
        userId: 20,
        conversationId: 8,
        receiverPhone: '13900139000',
      })),
    } as any;
    service.messageReplyEntity = {
      save: jest.fn(async data => ({ ...data, id: 12 })),
    } as any;
    const incrementUnread = jest.fn();
    const addTimelineItem = jest.fn();
    const updateLastMsg = jest.fn();
    service.conversationInfoService = {
      getSenderDirection: jest.fn(async () => 2),
      incrementUnread,
      addTimelineItem,
      updateLastMsg,
    } as any;

    await service.sendReply({ token: 'valid-token', content: '收到，谢谢' });

    expect(updateLastMsg).toHaveBeenCalledWith(8, '收到，谢谢', 0);
    expect(incrementUnread).not.toHaveBeenCalled();
    expect(addTimelineItem).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ replyId: 12, direction: 1 })
    );
  });
});
