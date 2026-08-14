import { SettingUserService } from '../src/modules/setting/service/user_setting';

describe('用户短信屏蔽设置', () => {
  it('开启后取消发往当前手机号的全部待发业务短信', async () => {
    const service = new SettingUserService();
    const setting = { id: 1, userId: 20, blockAllSms: 0 };
    service.settingUserEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(setting)
        .mockResolvedValueOnce({ ...setting, blockAllSms: 1 }),
      update: jest.fn(),
    } as any;
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 20, phone: '13800138000' })),
    } as any;
    service.messageInfoEntity = { update: jest.fn() } as any;

    await service.updateSetting(20, { blockAllSms: 1 });

    expect(service.settingUserEntity.update).toHaveBeenCalledWith(
      expect.anything(),
      { blockAllSms: 1 }
    );
    expect(service.messageInfoEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverPhone: expect.anything(),
        status: expect.anything(),
      }),
      expect.objectContaining({ status: 7 })
    );
  });

  it('腾讯云TD回调可为未注册手机号创建设置并取消待发短信', async () => {
    const service = new SettingUserService();
    service.userInfoEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 20, phone: '13800138000' }),
      insert: jest.fn(),
    } as any;
    const setting = { id: 1, userId: 20, blockAllSms: 0 };
    service.settingUserEntity = {
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce(setting)
        .mockResolvedValueOnce({ ...setting, blockAllSms: 1 }),
      update: jest.fn(),
    } as any;
    service.messageInfoEntity = { update: jest.fn() } as any;

    await expect(
      service.blockAllSmsByPhone('13800138000')
    ).resolves.toMatchObject({ userId: 20, blockAllSms: 1 });
    expect(service.userInfoEntity.insert).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '13800138000' })
    );
    expect(service.settingUserEntity.update).toHaveBeenCalledWith(
      expect.anything(),
      { blockAllSms: 1 }
    );
    expect(service.messageInfoEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverPhone: expect.anything(),
        status: expect.anything(),
      }),
      expect.objectContaining({ status: 7 })
    );
  });
});
