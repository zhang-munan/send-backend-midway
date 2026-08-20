import { BaseService, CoolCommException } from '@cool-midway/core';
import { Config, Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import * as moment from 'moment';
import { Equal, Repository } from 'typeorm';
import { v1 as uuid } from 'uuid';
import { PluginService } from '../../plugin/service/info';
import { UserInfoEntity } from '../entity/info';
import { UserWxEntity } from '../entity/wx';

/**
 * 微信
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
    return wxPlugin.MiniApp();
  }

  /**
   * 获得公众号实例
   * @returns
   */
  async getOfficialAccount() {
    const wxPlugin: any = await this.getPlugin();
    return wxPlugin.OfficialAccount();
  }

  /**
   * 获得App实例
   * @returns
   */
  async getOpenPlatform() {
    const wxPlugin: any = await this.getPlugin();
    return wxPlugin.OpenPlatform();
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
    const account = (await this.getOfficialAccount()).getAccount();
    const appid = account.getAppId();
    if (!appid || !/^wx[0-9a-z]{16}$/i.test(String(appid))) {
      throw new CoolCommException(
        '未配置有效的微信公众号 appid，请在插件市场完善 wx 插件 OfficialAccount 配置'
      );
    }
    return appid;
  }

  /**
   * 构造微信网页授权链接。参数顺序必须与微信文档一致，否则授权页无法打开。
   * https://developers.weixin.qq.com/doc/service/guide/h5/auth.html
   */
  async buildMpOauthUrl(
    redirectUri: string,
    scope = 'snsapi_base',
    state = 'STATE'
  ) {
    const appid = await this.getMpAppId();
    if (!appid) {
      throw new CoolCommException('未配置微信公众号');
    }
    const targetRedirectUri =
      redirectUri || 'https://mljxcloud.com/bangni_h5/';
    const oauthScope =
      scope === 'snsapi_userinfo' ? 'snsapi_userinfo' : 'snsapi_base';
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
    const accessToken = this.normalizeAccessToken(await this.getWxToken());
    const ticket = await axios.get(
      'https://api.weixin.qq.com/cgi-bin/ticket/getticket',
      {
        params: {
          access_token: accessToken,
          type: 'jsapi',
        },
      }
    );
    if (ticket.data?.errcode && ticket.data.errcode !== 0) {
      throw new CoolCommException(
        ticket.data.errmsg || '获取jsapi_ticket失败'
      );
    }

    const appid = await this.getMpAppId();
    const result = {
      timestamp: parseInt(moment().valueOf() / 1000 + ''),
      nonceStr: uuid(),
      appId: appid,
      signature: '',
      jsApiList: ['chooseWXPay'],
    };
    const plainUrl = decodeURI(String(url)).split('#')[0];
    const signArr = [];
    signArr.push('jsapi_ticket=' + ticket.data.ticket);
    signArr.push('noncestr=' + result.nonceStr);
    signArr.push('timestamp=' + result.timestamp);
    signArr.push('url=' + plainUrl);
    // 微信 JSSDK 签名为小写 sha1
    result.signature = crypto
      .createHash('sha1')
      .update(signArr.join('&'))
      .digest('hex');
    return result;
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
      const info = await this.openOrMpUserInfo(token);
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
      const accessToken = this.normalizeAccessToken(await this.getWxToken('mp'));
      const res = await axios.get(
        'https://api.weixin.qq.com/cgi-bin/user/info',
        {
          params: {
            access_token: accessToken,
            openid,
            lang: 'zh_CN',
          },
        }
      );
      return res.data?.unionid || null;
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
    return await this.openOrMpUserInfo(token);
  }

  /**
   * 获得微信token 不用code
   * @param appid
   * @param secret
   */
  public async getWxToken(type = 'mp') {
    let app;
    if (type == 'mp') {
      app = await this.getOfficialAccount();
    } else {
      app = await this.getOpenPlatform();
    }
    return await app.getAccessToken().getToken();
  }

  private normalizeAccessToken(token: any) {
    if (!token) return '';
    if (typeof token === 'string') return token;
    return token.access_token || token.token || '';
  }

  /**
   * 获得用户信息
   * @param token
   */
  async openOrMpUserInfo(token) {
    return await axios
      .get('https://api.weixin.qq.com/sns/userinfo', {
        params: {
          access_token: token.access_token,
          openid: token.openid,
          lang: 'zh_CN',
        },
      })
      .then(res => {
        return res.data;
      });
  }

  /**
   * 获得token嗯
   * @param code
   * @param type
   */
  async openOrMpToken(code, type = 'mp') {
    const account =
      type == 'mp'
        ? (await this.getOfficialAccount()).getAccount()
        : (await this.getMiniApp()).getAccount();
    const result = await axios.get(
      'https://api.weixin.qq.com/sns/oauth2/access_token',
      {
        params: {
          appid: account.getAppId(),
          secret: account.getSecret(),
          code,
          grant_type: 'authorization_code',
        },
      }
    );
    if (result.data?.errcode) {
      throw new CoolCommException(result.data.errmsg || '微信授权code无效');
    }
    return result.data;
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
