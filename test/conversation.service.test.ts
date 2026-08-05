import * as crypto from 'crypto';
import { ConversationInfoService } from '../src/modules/conversation/service/info';

describe('消息页会话查询', () => {
  const phone = '13800138000';
  const phoneHash = crypto.createHash('sha256').update(phone).digest('hex');

  it('会同时查询当前用户发起和发往其绑定手机号的会话', async () => {
    const service = new ConversationInfoService();
    let listOptions: any;
    const findAndCount = jest.fn(async (options: any) => {
      listOptions = options;
      return [
        [
          {
            id: 1,
            userId: 10,
            receiverPhoneMask: '139****0000',
            unreadCount: 2,
          },
          {
            id: 2,
            userId: 20,
            receiverPhoneMask: '138****8000',
            unreadCount: 3,
          },
        ],
        2,
      ];
    });
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 10, phone })),
    } as any;
    service.conversationInfoEntity = { findAndCount } as any;

    const result = await service.list(10, 1, 20);

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ userId: expect.anything() }),
          expect.objectContaining({ receiverPhoneHash: expect.anything() }),
        ]),
      })
    );
    expect(JSON.stringify(listOptions.where)).toContain(phoneHash);
    expect(result.list).toEqual([
      expect.objectContaining({ id: 1, viewerRole: 'sender', unreadCount: 2 }),
      expect.objectContaining({
        id: 2,
        viewerRole: 'receiver',
        peerLabel: '收到的消息',
        unreadCount: 0,
      }),
    ]);
  });

  it('收件人查看详情时反转消息方向并隐藏发送费用', async () => {
    const service = new ConversationInfoService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 10, phone })),
    } as any;
    service.conversationInfoEntity = {
      findOne: jest.fn(async () => ({
        id: 2,
        userId: 20,
        receiverPhoneHash: phoneHash,
      })),
    } as any;
    service.conversationTimelineEntity = {
      findAndCount: jest.fn(async () => [
        [{ id: 3, direction: 1, contentPreview: '历史来信', feeAmount: 199 }],
        1,
      ]),
    } as any;

    const result = await service.getMessages(10, 2, 1, 20);

    expect(result.list[0]).toMatchObject({
      direction: 2,
      contentPreview: '历史来信',
      feeAmount: null,
    });
  });
});
