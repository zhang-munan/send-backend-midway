import { BaseService, CoolCommException } from '@cool-midway/core';
import { Config, Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { PluginService } from '../../plugin/service/info';
import { UserInfoEntity } from '../entity/info';
import { UserWxEntity } from '../entity/wx';

const DEFAULT_MP_REDIRECT_URI = 'https://mljxcloud.com/bangni_h5/';
const MP_JSAPI_LIST = ['chooseWXPay'];

/**
 * 微信。通过 cool-admin 插件标识 `wx` 调用 node-easywechat。
 * 缓存由插件继承 cool-admin 缓存，这里不再自行管理 access_token。
 */
@Provide()
export class UserWxService extends BaseService {
  @Config('module.user')
  config;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(UserWxEntity)
  userWxEntity: Repository<UserWxEntity>;

  @Inject()
  pluginService: PluginService;

  /**
   * 获得插件实例
   * @returns
   */
  async getPlugin() {
    try {
      const wxPlugin: any = await this.pluginService.getInstance('wx');
      return wxPlugin;
    } catch (error) {
      throw new CoolCommException(
        '未配置微信插件，请到插件市场下载安装配置：https://cool-js.com/plugin/70'
      );
    }
  }

  /**
   * 获得小程序实例
   * @returns
   */
  async getMiniApp() {
    const wxPlugin: any = await this.getPlugin();
    return await wxPlugin.MiniApp();
  }

  /**
   * 获得公众号实例
   * @returns
   */
  async getOfficialAccount() {
    const official = await this.getOfficialAccountConfig();
    const wxPlugin: any = await this.getPlugin();
    return await wxPlugin.OfficialAccount(official);
  }

  /**
   * 读取并校验公众号配置。网页授权 / JSSDK 必须用已认证服务号，
   * 不能沿用小程序 appid，也不能留插件安装时的占位文案。
   * oauth 同时补齐插件文档的 scope/redirect 与 SDK 的 scopes/redirect_url。
   */
  async getOfficialAccountConfig() {
    const config = await this.pluginService.getConfig('wx');
    const official = config?.OfficialAccount || {};
    const appid = String(
      official.app_id || official.appid || official.appId || ''
    ).trim();
    const secret = String(official.secret || '').trim();
    const miniAppId = String(config?.MiniApp?.app_id || '').trim();

    if (
      !this.isValidWxAppId(appid) ||
      this.isPlaceholderValue(appid) ||
      this.isPlaceholderValue(secret) ||
      secret.length < 16
    ) {
      throw new CoolCommException(
        '未配置微信公众号：请在管理后台「插件 → wx」填写 OfficialAccount.app_id 和 secret。必须使用已认证服务号，不能填写小程序 appid'
      );
    }
    if (miniAppId && appid === miniAppId) {
      throw new CoolCommException(
        '公众号 appid 与小程序相同，网页授权和 JSSDK 无法使用。请填写已认证服务号的 appid'
      );
    }
    return {
      ...official,
      app_id: appid,
      secret,
      oauth: this.normalizeOfficialAccountOAuth(official.oauth),
    };
  }

  private normalizeOfficialAccountOAuth(oauth: any = {}) {
    const rawScope = Array.isArray(oauth?.scopes)
      ? String(oauth.scopes[0] || '')
      : String(oauth?.scope || '');
    const scope =
      rawScope === 'snsapi_userinfo' || rawScope === 'snsapi_userinfo'
        ? rawScope
        : 'snsapi_userinfo';
    const rawRedirect = String(
      oauth?.redirect_url || oauth?.redirect || ''
    ).trim();
    const redirect =
      rawRedirect.startsWith('http') && !this.isPlaceholderValue(rawRedirect)
        ? rawRedirect
        : DEFAULT_MP_REDIRECT_URI;
    return {
      ...oauth,
      scope,
      scopes: [scope],
      redirect,
      redirect_url: redirect,
    };
  }

  private isValidWxAppId(appid: string) {
    return /^wx[0-9a-z]{16}$/i.test(appid);
  }

  private isPlaceholderValue(value: string) {
    return /公众号|示例|placeholder|app key|your |please/i.test(value);
  }

  private throwWechatAppIdError(error: any): never {
    const message = String(error?.message || error || '');
    if (message.includes('40013') || /invalid appid/i.test(message)) {
      throw new CoolCommException(
        '微信公众号 appid 无效：请在管理后台「插件 → wx」把 OfficialAccount.app_id / secret 改成已认证服务号的凭证，不要使用小程序或安装时的占位值'
      );
    }
    throw new CoolCommException(message || '微信公众号接口调用失败');
  }

  private unwrapWxResponse(response: any) {
    if (!response) return {};
    if (typeof response.toObject === 'function') {
      return response.toObject() || {};
    }
    return response.data || response;
  }

  /**
   * 获得App实例
   * @returns
   */
  async getOpenPlatform() {
    const wxPlugin: any = await this.getPlugin();
    return await wxPlugin.OpenPlatform();
  }

  /**
   * 获得用户的openId
   * @param userId
   * @param type 0-小程序 1-公众号 2-App
   */
  async getOpenid(userId: number, type = 0) {
    const user = await this.userInfoEntity.findOneBy({
      id: Equal(userId),
      status: 1,
    });
    if (!user) {
      throw new CoolCommException('用户不存在或已被禁用');
    }
    const wx = await this.userWxEntity
      .createQueryBuilder('a')
      .where('a.type = :type', { type })
      .andWhere('(a.unionid = :unionid or a.openid =:openid )', {
        unionid: user.unionid,
        openid: user.unionid,
      })
      .getOne();
    return wx ? wx.openid : null;
  }

  /**
   * 获得公众号 appid
   */
  async getMpAppId() {
    const official = await this.getOfficialAccountConfig();
    return official.app_id;
  }

  /**
   * 构造微信网页授权链接。参数顺序必须与微信文档一致，否则授权页无法打开。
   * https://developers.weixin.qq.com/doc/service/guide/h5/auth.html
   */
  async buildMpOauthUrl(
    redirectUri: string,
    scope = 'snsapi_userinfo',
    state = 'STATE'
  ) {
    const official = await this.getOfficialAccountConfig();
    const appid = official.app_id;
    if (!appid) {
      throw new CoolCommException('未配置微信公众号');
    }
    const targetRedirectUri =
      redirectUri || official.oauth?.redirect || DEFAULT_MP_REDIRECT_URI;
    const oauthScope =
      scope === 'snsapi_userinfo' ? 'snsapi_userinfo' : 'snsapi_userinfo';
    const oauthState = String(state || 'STATE').slice(0, 128);
    const encodedRedirectUri = encodeURIComponent(targetRedirectUri);
    const oauthUrl =
      'https://open.weixin.qq.com/connect/oauth2/authorize' +
      `?appid=${appid}` +
      `&redirect_uri=${encodedRedirectUri}` +
      '&response_type=code' +
      `&scope=${oauthScope}` +
      `&state=${oauthState}` +
      '#wechat_redirect';
    return {
      appid,
      scope: oauthScope,
      state: oauthState,
      redirectUri: targetRedirectUri,
      oauthUrl,
    };
  }

  /**
   * 获得微信配置
   * @param url 当前网页的URL，不包含#及其后面部分(必须是调用JS接口页面的完整URL)
   */
  public async getWxMpConfig(url: string) {
    if (!url) {
      throw new CoolCommException('url不能为空');
    }
    const plainUrl = decodeURI(String(url)).split('#')[0];
    try {
      const app = await this.getOfficialAccount();
      const utils = app.getUtils?.();
      if (!utils?.buildJsSdkConfig) {
        throw new CoolCommException('微信插件版本过低，请升级 wx 插件');
      }
      const config = await utils.buildJsSdkConfig(plainUrl, MP_JSAPI_LIST);
      return {
        timestamp: config.timestamp,
        nonceStr: config.nonceStr,
        appId: config.appId,
        signature: config.signature,
        jsApiList: config.jsApiList || MP_JSAPI_LIST,
        openTagList: config.openTagList || [],
      };
    } catch (error) {
      if (error instanceof CoolCommException) {
        throw error;
      }
      this.throwWechatAppIdError(error);
    }
  }

  /**
   * 用网页授权 code 换取公众号身份。snsapi_base 静默授权只保证 openid，
   * unionid 优先取授权接口，其次用公众号 user/info 补齐，以便与小程序账号打通。
   */
  async mpSilentUserInfo(code: string) {
    const token = await this.openOrMpToken(code, 'mp');
    if (!token?.openid) {
      throw new CoolCommException(token?.errmsg || '微信授权失败');
    }

    const result: any = {
      openid: token.openid,
      unionid: token.unionid || null,
      scope: token.scope,
    };
    const scope = String(token.scope || '');
    if (scope.includes('snsapi_userinfo')) {
      const info = await this.openOrMpUserInfo(token, 'mp');
      if (info && !info.errcode) {
        result.unionid = info.unionid || result.unionid;
        result.nickName = info.nickname;
        result.avatarUrl = info.headimgurl;
        result.gender = info.sex;
        result.city = info.city;
        result.province = info.province;
        result.country = info.country;
      }
    }
    if (!result.unionid) {
      result.unionid = await this.getMpUnionidByOpenid(token.openid);
    }
    return result;
  }

  /**
   * 已关注用户可通过公众号 user/info 拿到 unionid，与小程序同一开放平台账号打通。
   */
  async getMpUnionidByOpenid(openid: string) {
    try {
      const app = await this.getOfficialAccount();
      const response = await app.getClient().get('/cgi-bin/user/info', {
        params: {
          openid,
          lang: 'zh_CN',
        },
      });
      return this.unwrapWxResponse(response)?.unionid || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 获得公众号用户信息
   * @param code
   */
  async mpUserInfo(code) {
    return await this.mpSilentUserInfo(code);
  }

  /**
   * 获得app用户信息
   * @param code
   */
  async appUserInfo(code) {
    const token = await this.openOrMpToken(code, 'open');
    return await this.openOrMpUserInfo(token, 'open');
  }

  /**
   * 获得微信 token。按插件文档：先 getAccessToken，再 getToken。
   * 插件已把缓存接到 cool-admin，不要自行缓存。
   */
  public async getWxToken(type = 'mp') {
    try {
      const app =
        type == 'mp'
          ? await this.getOfficialAccount()
          : await this.getOpenPlatform();
      const accessToken = await app.getAccessToken();
      return await accessToken.getToken();
    } catch (error) {
      if (error instanceof CoolCommException) {
        throw error;
      }
      this.throwWechatAppIdError(error);
    }
  }

  /**
   * 获得用户信息
   * @param token
   */
  async openOrMpUserInfo(token, type = 'mp') {
    const app =
      type == 'mp'
        ? await this.getOfficialAccount()
        : await this.getOpenPlatform();
    const oauth = app.getOAuth();
    if (typeof oauth.withOpenid === 'function') {
      oauth.withOpenid(token.openid);
    }
    const user = await oauth.userFromToken(token.access_token);
    const raw = user?.getRaw?.() || {};
    if (raw.errcode) {
      return raw;
    }
    return {
      openid: raw.openid || user?.getId?.(),
      unionid: raw.unionid,
      nickname: raw.nickname || user?.getNickname?.(),
      headimgurl: raw.headimgurl || user?.getAvatar?.(),
      sex: raw.sex,
      city: raw.city,
      province: raw.province,
      country: raw.country,
    };
  }

  /**
   * 用网页授权 code 换 token
   * @param code
   * @param type
   */
  async openOrMpToken(code, type = 'mp') {
    try {
      const app =
        type == 'mp'
          ? await this.getOfficialAccount()
          : await this.getOpenPlatform();
      const oauth = app.getOAuth();
      const scoped =
        type == 'mp' && typeof oauth.scopes === 'function'
          ? oauth.scopes(['snsapi_userinfo']) || oauth
          : oauth;
      const token = await scoped.tokenFromCode(code);
      if (token?.errcode) {
        this.throwWechatAppIdError({
          message: token.errmsg || '微信授权code无效',
        });
      }
      return token;
    } catch (error) {
      if (error instanceof CoolCommException) {
        throw error;
      }
      this.throwWechatAppIdError(error);
    }
  }

  /**
   * 获得小程序session
   * @param code 微信code
   * @param conf 配置
   */
  async miniSession(code) {
    const app = await this.getMiniApp();
    const utils = app.getUtils();
    const result = await utils.codeToSession(code);
    return result;
  }

  /**
   * 获得小程序用户信息
   * @param code
   * @param encryptedData
   * @param iv
   */
  async miniUserInfo(code, encryptedData, iv) {
    const session = await this.miniSession(code);
    if (session.errcode) {
      throw new CoolCommException('登录失败，请重试');
    }
    const info: any = await this.miniDecryptData(
      encryptedData,
      iv,
      session.session_key
    );
    if (info) {
      delete info['watermark'];
      return {
        ...info,
        openid: session['openid'],
        unionid: session['unionid'],
      };
    }
    return null;
  }

  /**
   * 获得小程序手机
   * @param code
   * @param encryptedData
   * @param iv
   */
  async miniPhone(code, encryptedData, iv) {
    const session = await this.miniSession(code);
    if (session.errcode) {
      throw new CoolCommException('获取手机号失败，请刷新重试');
    }
    const result = await this.miniDecryptData(
      encryptedData,
      iv,
      session.session_key
    );
    return {
      phone: result.phoneNumber,
      openid: session['openid'],
      unionid: session['unionid'],
    };
  }

  /**
   * 小程序信息解密
   * @param encryptedData
   * @param iv
   * @param sessionKey
   */
  async miniDecryptData(encryptedData, iv, sessionKey) {
    const app = await this.getMiniApp();
    const utils = app.getUtils();
    return await utils.decryptSession(sessionKey, iv, encryptedData);
  }
}
