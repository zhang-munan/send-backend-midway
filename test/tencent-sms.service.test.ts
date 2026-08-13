import { TencentSmsService } from '../src/modules/setting/service/tencent_sms';

describe('腾讯云收件人告知短信开关', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['on', true],
    [1, true],
    [true, true],
    ['0', false],
    [false, false],
    [undefined, false],
  ])('参数值 %p 解析为 %p', async (value, expected) => {
    const service = new TencentSmsService();
    service.baseSysParamService = {
      dataByKey: jest.fn(async () => value),
    } as any;
    await expect(service.isRecipientNoticeEnabled()).resolves.toBe(expected);
  });

  it('开关关闭时不调用 sms-tx', async () => {
    const service = new TencentSmsService();
    service.baseSysParamService = {
      dataByKey: jest.fn(async key =>
        key === 'recipientNoticeSmsEnabled' ? '0' : {}
      ),
    } as any;
    service.pluginService = { invoke: jest.fn() } as any;

    await expect(
      service.sendRecipientNotice('13800138000', 5)
    ).rejects.toThrow('开关已关闭');
    expect(service.pluginService.invoke).not.toHaveBeenCalled();
  });
});
