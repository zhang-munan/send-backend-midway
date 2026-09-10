import axios from 'axios';
import { ZthySmsService } from '../src/modules/setting/service/zthy_sms';

jest.mock('axios');

describe('智享告知短信发送人尾号', () => {
  beforeEach(() => jest.clearAllMocks());

  function serviceFor() {
    const service = new ZthySmsService();
    service.baseSysParamService = {
      dataByKey: jest.fn(async () => ({
        username: 'test-user',
        password: 'test-password',
        signature: '【测试】',
        noticeTpId: '905343',
      })),
    } as any;
    service.logger = { info: jest.fn() } as any;
    (axios.post as jest.Mock).mockResolvedValue({
      data: { code: 200, msg: 'success', msgId: 'notice-id' },
    });
    return service;
  }

  it.each(['13912345678', '13912340008'])(
    '短信发给收件人，正文使用发送人 %s 的后四位并保留前导零',
    async senderPhone => {
      const service = serviceFor();
      await expect(
        service.sendRecipientNotice('13800138000', senderPhone)
      ).resolves.toBe('notice-id');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api-shss.zthysms.com/v2/sendSmsTp',
        expect.objectContaining({
          tpId: 905343,
          records: [
            {
              mobile: '13800138000',
              tpContent: { phone: senderPhone.slice(-4) },
            },
          ],
        }),
        expect.any(Object)
      );
    }
  );

  it.each([undefined, null, '', '123', 'invalid'])(
    '发送人手机号无效（%p）时不发送短信',
    async senderPhone => {
      const service = serviceFor();
      await expect(
        service.sendRecipientNotice('13800138000', senderPhone)
      ).rejects.toThrow('发送人手机号缺失或无效');
      expect(axios.post).not.toHaveBeenCalled();
    }
  );
});
