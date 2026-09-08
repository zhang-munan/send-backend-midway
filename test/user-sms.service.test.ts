import { UserSmsService } from '../src/modules/user/service/sms';

describe('腾讯云登录验证码', () => {
  it('发送成功后缓存验证码，验证成功只允许消费一次', async () => {
    let cached: string | undefined;
    const service = new UserSmsService();
    service.config = { timeout: 180 };
    service.tencentSmsService = {
      sendLoginCode: jest.fn(async (_phone, code) => {
        expect(code).toMatch(/^\d{6}$/);
      }),
    } as any;
    service.zthySmsService = { isEnabled: jest.fn(async () => false) } as any;
    service.midwayCache = {
      set: jest.fn(async (_key, code) => {
        cached = String(code);
      }),
      get: jest.fn(async () => cached),
      del: jest.fn(async () => {
        cached = undefined;
      }),
    } as any;

    await service.sendSms('13800138000');
    expect(await service.checkCode('13800138000', cached)).toBe(true);
    expect(await service.checkCode('13800138000', cached)).toBe(false);
  });

  it('拒绝非法手机号且不调用腾讯云', async () => {
    const service = new UserSmsService();
    service.tencentSmsService = { sendLoginCode: jest.fn() } as any;
    service.zthySmsService = { isEnabled: jest.fn(async () => false) } as any;
    await expect(service.sendSms('123')).rejects.toThrow('手机号');
    expect(service.tencentSmsService.sendLoginCode).not.toHaveBeenCalled();
  });

  it('智享开启时走智享通道发送六位验证码', async () => {
    let zthyCode: string | undefined;
    const service = new UserSmsService();
    service.config = { timeout: 180 };
    service.zthySmsService = {
      isEnabled: jest.fn(async () => true),
      sendLoginCode: jest.fn(async (_phone, code) => {
        expect(code).toMatch(/^\d{6}$/);
        zthyCode = String(code);
      }),
    } as any;
    service.tencentSmsService = { sendLoginCode: jest.fn() } as any;
    service.midwayCache = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as any;

    await service.sendSms('13800138000');
    expect(service.zthySmsService.sendLoginCode).toHaveBeenCalledWith(
      '13800138000',
      zthyCode
    );
    expect(service.tencentSmsService.sendLoginCode).not.toHaveBeenCalled();
  });
});
