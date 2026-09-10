import { MessageReceiverNoticeService } from '../src/modules/message/service/receiver_notice';
import { Equal } from 'typeorm';

describe('收件人告知短信消费', () => {
  function serviceFor(registered: boolean) {
    const service = new MessageReceiverNoticeService();
    const update = jest
      .fn()
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValue({ affected: 1 });
    service.noticeEntity = {
      find: jest.fn(async () => [
        {
          id: 7,
          phone: '13800138000',
          triggerCount: 5,
          sourceMessageId: 42,
          attempts: 0,
        },
      ]),
      findOne: jest.fn(async () => null),
      update,
    } as any;
    service.userInfoEntity = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(registered ? { id: 1 } : null)
        .mockResolvedValue({ phone: '13912345678' }),
    } as any;
    service.messageInfoEntity = {
      findOne: jest.fn(async () => ({ userId: 99 })),
    } as any;
    service.zthySmsService = {
      sendRecipientNotice: jest.fn(async () => 'zthy-message-id'),
    } as any;
    service.logger = { info: jest.fn(), error: jest.fn() } as any;
    return service;
  }

  it('从触发消息查询发送人，将发送人手机号传给告知模板并标记成功', async () => {
    const service = serviceFor(false);
    await expect(service.processPending()).resolves.toBe(1);
    expect(service.messageInfoEntity.findOne).toHaveBeenCalledWith({
      where: { id: Equal(42) },
      select: ['userId'],
    });
    expect(service.userInfoEntity.findOne).toHaveBeenLastCalledWith({
      where: { id: Equal(99) },
      select: ['phone'],
    });
    expect(service.zthySmsService.sendRecipientNotice).toHaveBeenCalledWith(
      '13800138000',
      '13912345678'
    );
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ status: 2, providerMsgId: 'zthy-message-id' })
    );
  });

  it('队列产生后已登录则跳过告知短信', async () => {
    const service = serviceFor(true);
    await service.processPending();
    expect(service.zthySmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ status: 4 })
    );
  });

  it('同一手机号当天已成功发送告知短信则跳过', async () => {
    const service = serviceFor(false);
    service.noticeEntity.findOne = jest.fn(async () => ({ id: 6 })) as any;

    await expect(service.processPending()).resolves.toBe(1);
    expect(service.zthySmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: 4,
        lastError: expect.stringContaining('今日已发送'),
      })
    );
  });

  it('触发消息缺失时记录错误并等待重试，不发送短信', async () => {
    const service = serviceFor(false);
    service.messageInfoEntity.findOne = jest.fn(async () => null);

    await expect(service.processPending()).resolves.toBe(1);
    expect(service.zthySmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: 3,
        nextRetryAt: expect.any(Date),
        lastError: '告知短信关联的业务消息不存在',
      })
    );
  });
});
