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
  const officialConfig = {
    app_id: 'wx_mp_appid',
    secret: 'abcdefghijklmnopqrstuvwxyz123456',
    oauth: {
      scope: 'snsapi_base',
      scopes: ['snsapi_base'],
      redirect: 'https://mljxcloud.com/bangni_h5/',
      redirect_url: 'https://mljxcloud.com/bangni_h5/',
    },
  };

  it('按微信文档顺序构造 snsapi_base 授权链接', async () => {
    const service = new UserWxService();
    jest
      .spyOn(service, 'getOfficialAccountConfig')
      .mockResolvedValue(officialConfig as any);

    const result = await service.buildMpOauthUrl(
      'https://mljxcloud.com/bangni_h5/',
      'snsapi_base',
      'silent'
    );

    expect(result.oauthUrl).toBe(
      'https://open.weixin.qq.com/connect/oauth2/authorize?appid=wx_mp_appid&redirect_uri=https%3A%2F%2Fmljxcloud.com%2Fbangni_h5%2F&response_type=code&scope=snsapi_base&state=silent#wechat_redirect'
    );
  });

  it('未传 redirectUri 时使用插件 oauth.redirect', async () => {
    const service = new UserWxService();
    jest
      .spyOn(service, 'getOfficialAccountConfig')
      .mockResolvedValue(officialConfig as any);
    const result = await service.buildMpOauthUrl('', 'snsapi_base', 'silent');
    expect(result.redirectUri).toBe('https://mljxcloud.com/bangni_h5/');
    expect(result.oauthUrl).toContain(
      'redirect_uri=https%3A%2F%2Fmljxcloud.com%2Fbangni_h5%2F'
    );
  });
});

describe('公众号插件配置校验', () => {
  it('拒绝插件安装时的占位 appid', async () => {
    const service = new UserWxService();
    service.pluginService = {
      getConfig: jest.fn(async () => ({
        OfficialAccount: {
          app_id: '公众号的 app key',
          secret: '公众号的 secret',
        },
        MiniApp: {
          app_id: 'wx492578b4c8018e67',
          secret: 'abcdefghijklmnopqrstuvwxyz123456',
        },
      })),
    } as any;

    await expect(service.getOfficialAccountConfig()).rejects.toThrow(
      '未配置微信公众号'
    );
  });

  it('拒绝把小程序 appid 当成公众号使用', async () => {
    const service = new UserWxService();
    service.pluginService = {
      getConfig: jest.fn(async () => ({
        OfficialAccount: {
          app_id: 'wx492578b4c8018e67',
          secret: 'abcdefghijklmnopqrstuvwxyz123456',
        },
        MiniApp: {
          app_id: 'wx492578b4c8018e67',
          secret: 'abcdefghijklmnopqrstuvwxyz123456',
        },
      })),
    } as any;

    await expect(service.getOfficialAccountConfig()).rejects.toThrow(
      '公众号 appid 与小程序相同'
    );
  });

  it('把微信 invalid appid 转成可执行的配置提示', () => {
    const service = new UserWxService();
    expect(() =>
      (service as any).throwWechatAppIdError({
        message:
          'Failed to get stable access_token: {"errcode":40013,"errmsg":"invalid appid"}',
      })
    ).toThrow('微信公众号 appid 无效');
  });

  it('把插件 oauth.scope/redirect 补齐为 SDK 的 scopes/redirect_url', async () => {
    const service = new UserWxService();
    service.pluginService = {
      getConfig: jest.fn(async () => ({
        OfficialAccount: {
          app_id: 'wx1234567890abcdef',
          secret: 'abcdefghijklmnopqrstuvwxyz123456',
          oauth: {
            scope: 'snsapi_base',
            redirect: 'https://mljxcloud.com/bangni_h5/',
          },
          use_stable_access_token: true,
        },
        MiniApp: {
          app_id: 'wx492578b4c8018e67',
        },
      })),
    } as any;

    const config = await service.getOfficialAccountConfig();
    expect(config.oauth).toEqual(
      expect.objectContaining({
        scope: 'snsapi_base',
        scopes: ['snsapi_base'],
        redirect: 'https://mljxcloud.com/bangni_h5/',
        redirect_url: 'https://mljxcloud.com/bangni_h5/',
      })
    );
  });
});

describe('wx 插件 SDK 调用', () => {
  it('await OfficialAccount 并传入校验后的配置', async () => {
    const OfficialAccount = jest.fn(async config => ({ config }));
    const service = new UserWxService();
    jest.spyOn(service, 'getOfficialAccountConfig').mockResolvedValue({
      app_id: 'wx1234567890abcdef',
      secret: 'abcdefghijklmnopqrstuvwxyz123456',
      oauth: {
        scope: 'snsapi_base',
        scopes: ['snsapi_base'],
        redirect: 'https://mljxcloud.com/bangni_h5/',
        redirect_url: 'https://mljxcloud.com/bangni_h5/',
      },
    } as any);
    service.pluginService = {
      getInstance: jest.fn(async () => ({ OfficialAccount })),
    } as any;

    await service.getOfficialAccount();

    expect(OfficialAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: 'wx1234567890abcdef',
        oauth: expect.objectContaining({
          redirect_url: 'https://mljxcloud.com/bangni_h5/',
        }),
      })
    );
  });

  it('按插件文档先 getAccessToken 再 getToken', async () => {
    const getToken = jest.fn(async () => 'access-token');
    const getAccessToken = jest.fn(async () => ({ getToken }));
    const service = new UserWxService();
    jest.spyOn(service, 'getOfficialAccount').mockResolvedValue({
      getAccessToken,
    } as any);

    await expect(service.getWxToken('mp')).resolves.toBe('access-token');
    expect(getAccessToken).toHaveBeenCalled();
    expect(getToken).toHaveBeenCalled();
  });

  it('用 SDK Utils.buildJsSdkConfig 生成 JSSDK 签名', async () => {
    const buildJsSdkConfig = jest.fn(async url => ({
      appId: 'wx_mp_appid',
      nonceStr: 'abc',
      timestamp: 1710000000,
      signature: 'lowercase-sha1',
      jsApiList: ['chooseWXPay'],
      url,
    }));
    const service = new UserWxService();
    jest.spyOn(service, 'getOfficialAccount').mockResolvedValue({
      getUtils: () => ({ buildJsSdkConfig }),
    } as any);

    const result = await service.getWxMpConfig(
      'https://mljxcloud.com/bangni_h5/#/pages/index'
    );

    expect(buildJsSdkConfig).toHaveBeenCalledWith(
      'https://mljxcloud.com/bangni_h5/',
      ['chooseWXPay']
    );
    expect(result).toEqual(
      expect.objectContaining({
        appId: 'wx_mp_appid',
        nonceStr: 'abc',
        signature: 'lowercase-sha1',
        jsApiList: ['chooseWXPay'],
      })
    );
  });

  it('用公众号 OAuth tokenFromCode 换取静默身份', async () => {
    const tokenFromCode = jest.fn(async () => ({
      openid: 'mp-openid',
      unionid: 'union-1',
      scope: 'snsapi_base',
      access_token: 'oauth-token',
    }));
    const oauth: any = {
      tokenFromCode,
      scopes: jest.fn(function () {
        return this;
      }),
    };
    const service = new UserWxService();
    jest.spyOn(service, 'getOfficialAccount').mockResolvedValue({
      getOAuth: () => oauth,
    } as any);

    const result = await service.mpSilentUserInfo('oauth-code');

    expect(oauth.scopes).toHaveBeenCalledWith(['snsapi_base']);
    expect(tokenFromCode).toHaveBeenCalledWith('oauth-code');
    expect(result).toEqual({
      openid: 'mp-openid',
      unionid: 'union-1',
      scope: 'snsapi_base',
    });
  });

  it('没有 unionid 时用 getClient 调 cgi-bin/user/info 补齐', async () => {
    const get = jest.fn(async () => ({
      toObject: () => ({ unionid: 'union-from-userinfo' }),
    }));
    const oauth: any = {
      tokenFromCode: jest.fn(async () => ({
        openid: 'mp-openid',
        scope: 'snsapi_base',
        access_token: 'oauth-token',
      })),
      scopes: jest.fn(function () {
        return this;
      }),
    };
    const service = new UserWxService();
    jest.spyOn(service, 'getOfficialAccount').mockResolvedValue({
      getOAuth: () => oauth,
      getClient: () => ({ get }),
    } as any);

    const result = await service.mpSilentUserInfo('oauth-code');

    expect(get).toHaveBeenCalledWith('/cgi-bin/user/info', {
      params: { openid: 'mp-openid', lang: 'zh_CN' },
    });
    expect(result.unionid).toBe('union-from-userinfo');
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
