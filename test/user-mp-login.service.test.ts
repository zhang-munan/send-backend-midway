import { UserLoginService } from '../src/modules/user/service/login';
import { UserWxService } from '../src/modules/user/service/wx';
import { OrderInfoService } from '../src/modules/order/service/info';

describe('公众号静默登录', () => {
  it('用 unionid 命中已有小程序用户，并保存公众号 openid', async () => {
    const service = new UserLoginService();
    service.userWxService = {
      mpSilentUserInfo: jest.fn(async () => ({
        openid: 'mp-openid-1',
        unionid: 'union-1',
        scope: 'snsapi_base',
      })),
    } as any;
    service.userWxEntity = {
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async data => ({ id: 9, ...data })),
    } as any;
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 12, unionid: 'union-1' })),
    } as any;
    jest.spyOn(service, 'token').mockResolvedValue({
      token: 'access',
      expire: 1,
      refreshToken: 'refresh',
      refreshExpire: 2,
    } as any);

    const result = await service.mp('oauth-code');

    expect(service.userWxService.mpSilentUserInfo).toHaveBeenCalledWith(
      'oauth-code'
    );
    expect(service.userWxEntity.save).toHaveBeenCalledWith(
      expect.objectContaining({
        openid: 'mp-openid-1',
        unionid: 'union-1',
        type: 1,
      })
    );
    expect(result.token).toBe('access');
  });

  it('静默授权没有头像时仍能创建新用户', async () => {
    const service = new UserLoginService();
    service.userWxService = {
      mpSilentUserInfo: jest.fn(async () => ({
        openid: 'mp-openid-2',
        unionid: 'union-2',
        scope: 'snsapi_base',
      })),
    } as any;
    service.userWxEntity = {
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async data => ({ id: 3, type: 1, ...data })),
    } as any;
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => null),
      save: jest.fn(async data => ({ id: 88, ...data })),
    } as any;
    service.pluginService = {
      getInstance: jest.fn(),
    } as any;
    jest.spyOn(service, 'token').mockResolvedValue({
      token: 'new-token',
      expire: 1,
      refreshToken: 'refresh',
      refreshExpire: 2,
    } as any);

    const result = await service.mp('oauth-code');

    expect(service.pluginService.getInstance).not.toHaveBeenCalled();
    expect(service.userInfoEntity.save).toHaveBeenCalledWith(
      expect.objectContaining({
        unionid: 'union-2',
        nickName: '微信用户',
        loginType: 1,
      })
    );
    expect(result.token).toBe('new-token');
  });
});

describe('公众号网页授权链接', () => {
  it('按微信文档顺序构造 snsapi_base 授权链接', async () => {
    const service = new UserWxService();
    jest.spyOn(service, 'getMpAppId').mockResolvedValue('wx_mp_appid');

    const result = await service.buildMpOauthUrl(
      'https://mljxcloud.com/bangni_h5/',
      'snsapi_base',
      'silent'
    );

    expect(result.oauthUrl).toBe(
      'https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx_mp_appid&redirect_uri=https%3A%2F%2Fmljxcloud.com%2Fbangni_h5%2F&response_type=code&scope=snsapi_base&state=silent#wechat_redirect'
    );
  });

  it('未传 redirectUri 时默认指向线上 H5 入口', async () => {
    const service = new UserWxService();
    jest.spyOn(service, 'getMpAppId').mockResolvedValue('wx_mp_appid');
    const result = await service.buildMpOauthUrl('', 'snsapi_base', 'silent');
    expect(result.redirectUri).toBe('https://mljxcloud.com/bangni_h5/');
    expect(result.oauthUrl).toContain(
      'redirect_uri=https%3A%2F%2Fmljxcloud.com%2Fbangni_h5%2F'
    );
  });
});

describe('公众号JSAPI支付身份', () => {
  it('使用公众号openid和公众号appid预下单', async () => {
    const service = new OrderInfoService();
    const transactionsJsapi = jest.fn(async params => {
      expect(params.appid).toBe('wx_mp_appid');
      expect(params.payer).toEqual({ openid: 'mp-openid-1' });
      return {
        timeStamp: '1722787200',
        nonceStr: 'nonce',
        package: 'prepay_id=wx_valid_prepay_id',
        signType: 'RSA',
        paySign: 'signed-value',
      };
    });
    service.pluginService = {
      getInstance: jest.fn(async () => ({
        getConfig: jest.fn(async () => ({
          appid: 'wx_mini_appid',
          mchid: '1900000001',
          notify_url: 'https://example.com/notify',
        })),
        getInstance: jest.fn(async () => ({
          transactions_jsapi: transactionsJsapi,
        })),
      })),
    } as any;
    service.userWxService = {
      getMpAppId: jest.fn(async () => 'wx_mp_appid'),
    } as any;
    jest
      .spyOn(service as any, 'getWechatJsapiOpenid')
      .mockResolvedValue('mp-openid-1');

    const result = await (service as any).payByWechat(
      {
        id: 1,
        orderNo: 'BNSC2026082000001',
        productName: '测试套餐',
        payAmount: 1,
      },
      12,
      {},
      { tradeType: 'JSAPI', wxType: 1 }
    );

    expect(service.userWxService.getMpAppId).toHaveBeenCalled();
    expect(transactionsJsapi).toHaveBeenCalled();
    expect(result.package).toBe('prepay_id=wx_valid_prepay_id');
  });

  it('缺少公众号openid时不回退到小程序code2session', async () => {
    const service = new OrderInfoService();
    service.userInfoEntity = {
      findOneBy: jest.fn(async () => ({ id: 12, unionid: 'union-1' })),
    } as any;
    service.userWxEntity = {
      findOne: jest.fn(async () => null),
    } as any;
    service.userWxService = {
      miniSession: jest.fn(),
    } as any;

    await expect(
      (service as any).getWechatJsapiOpenid(12, 'mini-code', 1)
    ).rejects.toThrow('未获取到公众号openid');
    expect(service.userWxService.miniSession).not.toHaveBeenCalled();
  });
});
