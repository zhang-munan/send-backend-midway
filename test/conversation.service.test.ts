import { ConversationInfoService } from '../src/modules/conversation/service/info';

describe('消息页会话查询', () => {
  const phone = '13800138000';

  it('会同时查询当前用户发起和发往其绑定手机号的会话', async () => {
    const service = new ConversationInfoService();
    let listOptions: any;
    const findAndCount = jest.fn(async (options: any) => {
      listOptions = options;
      return [
        [
          {
            id: 1,
            // MySQL bigint 在真实环境可能返回字符串。
            userId: '10',
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
          expect.objectContaining({ receiverPhone: expect.anything() }),
        ]),
      })
    );
    expect(JSON.stringify(listOptions.where)).toContain(phone);
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

  it('详情查询能将 bigint 字符串 userId 正确识别为发送方', async () => {
    const service = new ConversationInfoService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 10, phone })),
    } as any;
    service.conversationInfoEntity = {
      findOne: jest.fn(async () => ({ id: 1, userId: '10' })),
    } as any;
    service.conversationTimelineEntity = {
      findAndCount: jest.fn(async () => [
        [{ id: 3, direction: 1, contentPreview: '我发出的消息' }],
        1,
      ]),
    } as any;

    const result = await service.getMessages(10, 1, 1, 20);

    expect(result.list[0]).toMatchObject({
      direction: 1,
      contentPreview: '我发出的消息',
    });
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
        receiverPhone: phone,
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

  it('匿名来信的回复上下文不展示手机号，并强制实名回复原会话', async () => {
    const service = new ConversationInfoService();
    service.userInfoEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 10, phone })
        .mockResolvedValueOnce({ id: 20, phone: '13900139000' })
        .mockResolvedValueOnce({ id: 10, phone })
        .mockResolvedValueOnce({ id: 20, phone: '13900139000' }),
    } as any;
    service.conversationInfoEntity = {
      findOne: jest.fn(async () => ({
        id: 2,
        userId: 20,
        receiverPhone: phone,
      })),
    } as any;
    service.messageInfoEntity = {
      findOne: jest.fn(async () => ({ id: 3, isAnonymous: 1 })),
    } as any;

    const context = await service.getReplyContext(10, 2);
    expect(context).toMatchObject({
      receiverPhone: '13900139000',
      receiverPhoneDisplay: '匿名用户',
      isPeerAnonymous: true,
    });

    await expect(
      service.prepareReplySend(10, {
        conversationId: 2,
        receiverPhone: '13811112222',
        isAnonymous: 1,
      })
    ).resolves.toMatchObject({
      conversationId: 2,
      receiverPhone: '13900139000',
      isAnonymous: 0,
      isConversationReply: true,
    });
  });

  it('实名来信的回复上下文展示发送者完整手机号', async () => {
    const service = new ConversationInfoService();
    service.userInfoEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 10, phone })
        .mockResolvedValueOnce({ id: 20, phone: '13900139000' }),
    } as any;
    service.conversationInfoEntity = {
      findOne: jest.fn(async () => ({
        id: 2,
        userId: 20,
        receiverPhone: phone,
      })),
    } as any;
    service.messageInfoEntity = {
      findOne: jest.fn(async () => ({ id: 3, isAnonymous: 0 })),
    } as any;

    await expect(service.getReplyContext(10, 2)).resolves.toMatchObject({
      receiverPhoneDisplay: '13900139000',
      isPeerAnonymous: false,
    });
  });

  it('原发送方继续会话时沿用服务端保存的明文收件号码', async () => {
    const service = new ConversationInfoService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 10, phone })),
    } as any;
    service.conversationInfoEntity = {
      findOne: jest.fn(async () => ({
        id: 2,
        userId: 10,
        receiverPhone: '13900139000',
      })),
    } as any;

    await expect(
      service.prepareConversationSend(10, {
        conversationId: 2,
        receiverPhone: '13811112222',
        isAnonymous: 1,
      })
    ).resolves.toMatchObject({
      conversationId: 2,
      receiverPhone: '13900139000',
      isAnonymous: 1,
      isConversationReply: false,
    });
  });
});

describe('管理端对话详情', () => {
  it('按时间正序返回全部记录，并用原始数据替换时间线摘要', async () => {
    const service = new ConversationInfoService();
    service.conversationInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 8,
        userId: 10,
        receiverPhone: '13900139000',
        msgCount: 2,
      })),
    } as any;
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 10,
        nickName: '测试用户',
        phone: '13800138000',
      })),
    } as any;
    service.conversationTimelineEntity = {
      find: jest.fn(async () => [
        { id: 1, messageId: 21, replyId: null, direction: 1, contentPreview: '截断内容' },
        { id: 2, messageId: null, replyId: 31, direction: 2, contentPreview: '截断回复' },
      ]),
    } as any;
    service.messageInfoEntity = {
      findBy: jest.fn(async () => [
        { id: 21, content: '完整的发送消息内容', status: 5 },
      ]),
    } as any;
    service.messageReplyEntity = {
      findBy: jest.fn(async () => [
        { id: 31, replyContent: '完整的回复内容', replyType: 1 },
      ]),
    } as any;

    const result = await service.adminDetail(8);

    expect(result.conversation).toMatchObject({
      id: 8,
      userName: '测试用户',
      userPhone: '13800138000',
    });
    expect(result.messages).toEqual([
      expect.objectContaining({ content: '完整的发送消息内容', messageStatus: 5 }),
      expect.objectContaining({ content: '完整的回复内容', replyType: 1 }),
    ]);
    expect(service.conversationTimelineEntity.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createTime: 'ASC' } })
    );
  });
});
