import { MessageReceiverNoticeService } from '../src/modules/message/service/receiver_notice';

describe('收件人告知短信消费', () => {
  function serviceFor(registered: boolean) {
    const service = new MessageReceiverNoticeService();
    const update = jest
      .fn()
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValue({ affected: 1 });
    service.noticeEntity = {
      find: jest.fn(async () => [
        { id: 7, phone: '13800138000', triggerCount: 5, attempts: 0 },
      ]),
      findOne: jest.fn(async () => null),
      update,
    } as any;
    service.userInfoEntity = {
      findOne: jest.fn(async () => (registered ? { id: 1 } : null)),
    } as any;
    service.tencentSmsService = {
      isRecipientNoticeEnabled: jest.fn(async () => true),
      sendRecipientNotice: jest.fn(async () => 'tx-message-id'),
    } as any;
    service.logger = { error: jest.fn() } as any;
    return service;
  }

  it('未登录手机号调用腾讯云并标记成功', async () => {
    const service = serviceFor(false);
    await expect(service.processPending()).resolves.toBe(1);
    expect(service.tencentSmsService.sendRecipientNotice).toHaveBeenCalledWith(
      '13800138000',
      5
    );
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ status: 2, providerMsgId: 'tx-message-id' })
    );
  });

  it('队列产生后已登录则跳过腾讯云', async () => {
    const service = serviceFor(true);
    await service.processPending();
    expect(service.tencentSmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({ status: 4 })
    );
  });

  it('同一手机号当天已成功发送告知短信则跳过腾讯云', async () => {
    const service = serviceFor(false);
    service.noticeEntity.findOne = jest.fn(async () => ({ id: 6 })) as any;

    await expect(service.processPending()).resolves.toBe(1);
    expect(service.tencentSmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenLastCalledWith(
      7,
      expect.objectContaining({
        status: 4,
        lastError: expect.stringContaining('今日已发送'),
      })
    );
  });

  it('开关关闭时跳过所有待发任务且不调用腾讯云', async () => {
    const service = serviceFor(false);
    service.tencentSmsService.isRecipientNoticeEnabled = jest.fn(
      async () => false
    );

    await expect(service.processPending()).resolves.toBe(0);
    expect(service.noticeEntity.find).not.toHaveBeenCalled();
    expect(service.tencentSmsService.sendRecipientNotice).not.toHaveBeenCalled();
    expect(service.noticeEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() }),
      expect.objectContaining({ status: 4, lastError: expect.stringContaining('关闭') })
    );
  });
});
