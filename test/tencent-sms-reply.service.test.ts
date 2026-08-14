import { TencentSmsReplyService } from '../src/modules/message/service/tencent_sms_reply';

describe('腾讯云短信上行退订回调', () => {
  const token = 'test-tencent-callback-token';

  function createService(noticeSent = true) {
    process.env.TENCENT_SMS_REPLY_CALLBACK_TOKEN = token;
    const service = new TencentSmsReplyService();
    service.noticeEntity = {
      findOne: jest.fn(async () => (noticeSent ? { id: 7 } : null)),
      update: jest.fn(),
    } as any;
    service.settingUserService = {
      blockAllSmsByPhone: jest.fn(async () => ({ id: 20 })),
    } as any;
    service.logger = { warn: jest.fn() } as any;
    return service;
  }

  afterEach(() => {
    delete process.env.TENCENT_SMS_REPLY_CALLBACK_TOKEN;
  });

  it('收到TD后按手机号开启屏蔽所有短信', async () => {
    const service = createService();

    await expect(
      service.process(
        {
          mobile: '13800138000',
          nationcode: '86',
          sign: '测试签名',
          text: ' td ',
          time: 1786665600,
        },
        token
      )
    ).resolves.toEqual({ result: 0, errmsg: 'OK' });
    expect(service.settingUserService.blockAllSmsByPhone).toHaveBeenCalledWith(
      '13800138000'
    );
  });

  it('兼容新版字段和E.164手机号', async () => {
    const service = createService();

    await service.process(
      { PhoneNumber: '+8613800138000', ReplyContent: 'TD' },
      token
    );

    expect(service.settingUserService.blockAllSmsByPhone).toHaveBeenCalledWith(
      '13800138000'
    );
  });

  it('非TD回复正常确认但不修改设置', async () => {
    const service = createService();

    await expect(
      service.process({ mobile: '13800138000', text: '你好' }, token)
    ).resolves.toEqual({ result: 0, errmsg: 'OK' });
    expect(service.noticeEntity.findOne).not.toHaveBeenCalled();
    expect(service.settingUserService.blockAllSmsByPhone).not.toHaveBeenCalled();
  });

  it('拒绝错误token', async () => {
    const service = createService();

    await expect(
      service.process({ mobile: '13800138000', text: 'TD' }, 'wrong')
    ).resolves.toEqual({ result: 1, errmsg: 'Unauthorized callback' });
    expect(service.settingUserService.blockAllSmsByPhone).not.toHaveBeenCalled();
  });

  it('没有成功告知短信记录时忽略TD', async () => {
    const service = createService(false);

    await expect(
      service.process({ mobile: '13800138000', text: 'TD' }, token)
    ).resolves.toEqual({ result: 0, errmsg: 'OK' });
    expect(service.settingUserService.blockAllSmsByPhone).not.toHaveBeenCalled();
  });

  it('按sid记录短信成功送达状态', async () => {
    const service = createService();

    await expect(
      service.processDeliveryStatus(
        [
          {
            user_receive_time: '2026-08-14 08:03:04',
            nationcode: '86',
            mobile: '13800138000',
            report_status: 'SUCCESS',
            errmsg: 'DELIVRD',
            description: '用户短信送达成功',
            sid: 'tx-serial-no',
          },
        ],
        token
      )
    ).resolves.toEqual({ result: 0, errmsg: 'OK' });
    expect(service.noticeEntity.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerMsgId: expect.anything(),
          phone: expect.anything(),
        }),
      })
    );
    expect(service.noticeEntity.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        deliveryStatus: 'SUCCESS',
        deliveryCode: 'DELIVRD',
        deliveredAt: expect.any(Date),
        lastError: null,
      })
    );
  });

  it('记录短信下发失败但不自动重发', async () => {
    const service = createService();

    await service.processDeliveryStatus(
      [
        {
          user_receive_time: '2026-08-14 08:03:04',
          mobile: '13800138000',
          report_status: 'FAIL',
          errmsg: 'UNDELIV',
          description: '用户短信送达失败',
          sid: 'tx-serial-no',
        },
      ],
      token
    );

    expect(service.noticeEntity.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        deliveryStatus: 'FAIL',
        deliveryCode: 'UNDELIV',
        lastError: expect.stringContaining('下发失败'),
      })
    );
    const update = service.noticeEntity.update as jest.Mock;
    expect(update.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('忽略无法匹配告知任务的登录验证码回调', async () => {
    const service = createService(false);

    await expect(
      service.processDeliveryStatus(
        [
          {
            mobile: '13800138000',
            report_status: 'SUCCESS',
            sid: 'login-code-serial-no',
          },
        ],
        token
      )
    ).resolves.toEqual({ result: 0, errmsg: 'OK' });
    expect(service.noticeEntity.update).not.toHaveBeenCalled();
  });
});
