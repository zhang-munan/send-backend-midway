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
      update,
    } as any;
    service.userInfoEntity = {
      findOne: jest.fn(async () => (registered ? { id: 1 } : null)),
    } as any;
    service.tencentSmsService = {
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
});
