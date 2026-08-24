import { Config, Inject, Provide } from '@midwayjs/core';
import { BaseService, CoolCommException } from '@cool-midway/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { UserInfoEntity } from '../entity/info';
import { UserWxService } from './wx';
import * as jwt from 'jsonwebtoken';
import { UserWxEntity } from '../entity/wx';
import { BaseSysLoginService } from '../../base/service/sys/login';
import { UserSmsService } from './sms';
import { v1 as uuid } from 'uuid';
import * as md5 from 'md5';
import { PluginService } from '../../plugin/service/info';

/**
 * 登录
 */
@Provide()
export class UserLoginService extends BaseService {
  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(UserWxEntity)
  userWxEntity: Repository<UserWxEntity>;

  @Inject()
  userWxService: UserWxService;

  @Config('module.user.jwt')
  jwtConfig;

  @Inject()
  baseSysLoginService: BaseSysLoginService;

  @Inject()
  pluginService: PluginService;

  @Inject()
  userSmsService: UserSmsService;

  /**
   * 发送手机验证码
   * @param phone
   * @param captchaId
   * @param code
   */
  async smsCode(phone, captchaId, code) {
    if (!/^1[3-9]\d{9}$/.test(phone || '')) {
      throw new CoolCommException('请输入正确的手机号');
    }
    // 1、检查图片验证码  2、发送短信验证码
    const check = await this.baseSysLoginService.captchaCheck(captchaId, code);
    if (!check) {
      throw new CoolCommException('图片验证码错误');
    }
    await this.userSmsService.sendSms(phone);
  }

  /**
   *  手机验证码登录
   * @param phone
   * @param smsCode
   */
  async phoneVerifyCode(phone, smsCode) {
    if (!/^1[3-9]\d{9}$/.test(phone || '')) {
      throw new CoolCommException('请输入正确的手机号');
    }
    // 1、检查短信验证码  2、登录
    const check = await this.userSmsService.checkCode(phone, smsCode);
    if (check) {
      return await this.phone(phone);
    } else {
      throw new CoolCommException('验证码错误');
    }
  }

  /**
   * 小程序手机号登录
   * @param code
   * @param encryptedData
   * @param iv
   */
  async miniPhone(code, encryptedData, iv) {
    const wxPhone = await this.userWxService.miniPhone(code, encryptedData, iv);
    if (wxPhone?.phone) {
      let user: any = await this.userInfoEntity.findOneBy({
        phone: Equal(wxPhone.phone),
      });
      const unionid = wxPhone.unionid || wxPhone.openid || wxPhone.phone;
      if (!user) {
        user = {
          phone: wxPhone.phone,
          unionid,
          loginType: 0,
          nickName: wxPhone.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
        };
        const result: any = await this.userInfoEntity.insert(user);
        user.id = result.identifiers?.[0]?.id;
      } else if (!user.unionid || user.unionid === user.phone) {
        await this.userInfoEntity.update(user.id, {
          unionid,
          loginType: 0,
        });
        user.unionid = unionid;
      }
      await this.saveWxInfo(
        {
          openid: wxPhone.openid,
          unionid,
        },
        0
      );
      return this.token({ id: user.id });
    } else {
      throw new CoolCommException('获得手机号失败，请检查配置');
    }
  }

  /**
   * 手机号一键登录
   * @param access_token
   * @param openid
   */
  async uniPhone(access_token, openid, appId) {
    const instance: any = await this.pluginService.getInstance('uniphone');
    const phone = await instance.getPhone(access_token, openid, appId);
    if (phone) {
      return await this.phone(phone);
    } else {
      throw new CoolCommException('获得手机号失败，请检查配置');
    }
  }

  /**
   * 手机登录
   * @param phone
   * @returns
   */
  async phone(phone: string) {
    let user: any = await this.userInfoEntity.findOneBy({
      phone: Equal(phone),
    });
    if (!user) {
      user = {
        phone,
        unionid: phone,
        loginType: 2,
        nickName: phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
      };
      user = await this.userInfoEntity.save(user);
    }
    return this.token({ id: user.id });
  }

  /**
   * 公众号登录。H5 在微信内用 snsapi_userinfo 静默拿到 code 后走这里，
   * 通过 unionid 与小程序用户打通为同一 user_info。
   * @param code
   */
  async mp(code: string) {
    if (!code) {
      throw new CoolCommException('微信授权code不能为空');
    }
    const wxUserInfo = await this.userWxService.mpSilentUserInfo(code);
    if (!wxUserInfo?.openid) {
      throw new CoolCommException('微信登录失败');
    }
    const saved = await this.saveWxInfo(
      {
        openid: wxUserInfo.openid,
        unionid: wxUserInfo.unionid || wxUserInfo.openid,
        avatarUrl: wxUserInfo.avatarUrl,
        nickName: wxUserInfo.nickName,
        gender: wxUserInfo.gender,
        city: wxUserInfo.city,
        province: wxUserInfo.province,
        country: wxUserInfo.country,
      },
      1
    );
    return this.wxLoginToken(saved);
  }

  /**
   * 微信APP授权登录
   * @param code
   */
  async wxApp(code: string) {
    let wxUserInfo = await this.userWxService.appUserInfo(code);
    if (wxUserInfo) {
      delete wxUserInfo.privilege;
      wxUserInfo = await this.saveWxInfo(
        {
          openid: wxUserInfo.openid,
          unionid: wxUserInfo.unionid,
          avatarUrl: wxUserInfo.headimgurl,
          nickName: wxUserInfo.nickname,
          gender: wxUserInfo.sex,
          city: wxUserInfo.city,
          province: wxUserInfo.province,
          country: wxUserInfo.country,
        },
        1
      );
      return this.wxLoginToken(wxUserInfo);
    } else {
      throw new Error('微信登录失败');
    }
  }

  /**
   * 保存微信信息
   * @param wxUserInfo
   * @param type
   * @returns
   */
  async saveWxInfo(wxUserInfo, type) {
    const find: any = { openid: wxUserInfo.openid };
    let wxInfo: any = await this.userWxEntity.findOneBy(find);
    if (wxInfo) {
      wxUserInfo.id = wxInfo.id;
    }
    return this.userWxEntity.save({
      ...wxUserInfo,
      type,
    });
  }

  /**
   * 小程序登录
   * @param code
   * @param encryptedData
   * @param iv
   */
  async mini(code, encryptedData, iv) {
    let wxUserInfo = await this.userWxService.miniUserInfo(
      code,
      encryptedData,
      iv
    );
    if (wxUserInfo) {
      // 保存
      wxUserInfo = await this.saveWxInfo(wxUserInfo, 0);
      return await this.wxLoginToken(wxUserInfo);
    }
  }

  /**
   * 小程序静默登录。code 只用于识别微信身份，不请求用户资料或手机号授权。
   */
  async miniCode(code: string) {
    const session: any = await this.userWxService.miniSession(code);
    if (!session || session.errcode || !session.openid) {
      throw new CoolCommException(session?.errmsg || '微信登录失败');
    }

    const unionid = session.unionid || session.openid;
    let user: any = await this.userInfoEntity.findOneBy({ unionid });
    if (!user) {
      user = await this.userInfoEntity.save({
        unionid,
        nickName: '微信用户',
        loginType: 0,
      });
    }
    await this.saveWxInfo({ openid: session.openid, unionid }, 0);
    return this.token({ id: user.id });
  }

  /**
   * 为当前微信用户绑定手机号。若手机号属于旧版手机号登录账号，则接管该账号，
   * 保留其订单、消息和会话等全部 userId 关联数据。
   */
  async bindPhone(userId: number, phone: string, smsCode: string) {
    const valid = await this.userSmsService.checkCode(phone, smsCode);
    if (!valid) throw new CoolCommException('验证码错误');
    return this.bindPhoneToUser(userId, phone);
  }

  /** 为当前用户绑定微信授权手机号。 */
  async bindMiniPhone(
    userId: number,
    code: string,
    encryptedData: string,
    iv: string
  ) {
    const wxPhone = await this.userWxService.miniPhone(code, encryptedData, iv);
    if (!wxPhone?.phone)
      throw new CoolCommException('获得手机号失败，请检查配置');
    return this.bindPhoneToUser(userId, wxPhone.phone);
  }

  private async bindPhoneToUser(userId: number, phone: string) {
    const current: any = await this.userInfoEntity.findOneBy({
      id: Equal(userId),
    });
    if (!current) throw new CoolCommException('用户不存在');

    const phoneOwner: any = await this.userInfoEntity.findOneBy({
      phone: Equal(phone),
    });
    if (!phoneOwner || phoneOwner.id === current.id) {
      await this.userInfoEntity.update(current.id, { phone });
      return this.token({ id: current.id });
    }

    // 兼容改版前“手机号即账号”的用户：切换回旧 userId，避免会话和订单丢失。
    if (phoneOwner.unionid === phone) {
      // unionid 有唯一索引，必须在同一事务中先释放临时用户的微信身份再迁移。
      await this.userInfoEntity.manager.transaction(async manager => {
        await manager.update(UserInfoEntity, current.id, { unionid: null });
        await manager.update(UserInfoEntity, phoneOwner.id, {
          unionid: current.unionid,
          loginType: 0,
        });
      });
      return this.token({ id: phoneOwner.id });
    }

    throw new CoolCommException('该手机号已绑定其他微信账号');
  }

  /**
   * 微信登录 获得token
   * @param wxUserInfo 微信用户信息
   * @returns
   */
  async wxLoginToken(wxUserInfo) {
    const unionid = wxUserInfo.unionid ? wxUserInfo.unionid : wxUserInfo.openid;
    let userInfo: any = await this.userInfoEntity.findOneBy({ unionid });
    if (!userInfo) {
      let avatarUrl = wxUserInfo.avatarUrl || null;
      if (avatarUrl) {
        try {
          const file = await this.pluginService.getInstance('upload');
          avatarUrl = await file.downAndUpload(avatarUrl, uuid() + '.png');
        } catch (e) {
          // 静默授权没有头像，或头像下载失败时不影响登录
        }
      }
      userInfo = await this.userInfoEntity.save({
        unionid,
        nickName: wxUserInfo.nickName || '微信用户',
        avatarUrl,
        gender: wxUserInfo.gender || 0,
        loginType: wxUserInfo.type ?? 1,
      });
    }
    return this.token({ id: userInfo.id });
  }

  /**
   * 刷新token
   * @param refreshToken
   */
  async refreshToken(refreshToken) {
    try {
      const info = jwt.verify(refreshToken, this.jwtConfig.secret);
      if (!info['isRefresh']) {
        throw new CoolCommException('token类型非refreshToken');
      }
      const userInfo = await this.userInfoEntity.findOneBy({
        id: info['id'],
      });
      return this.token({ id: userInfo.id });
    } catch (e) {
      throw new CoolCommException(
        '刷新token失败，请检查refreshToken是否正确或过期'
      );
    }
  }

  /**
   * 密码登录
   * @param phone
   * @param password
   */
  async password(phone, password) {
    const user = await this.userInfoEntity.findOneBy({ phone });

    if (user && user.password == md5(password)) {
      return this.token({
        id: user.id,
      });
    } else {
      throw new CoolCommException('账号或密码错误');
    }
  }

  /**
   * 获得token
   * @param info
   * @returns
   */
  async token(info) {
    const { expire, refreshExpire } = this.jwtConfig;
    return {
      expire,
      token: await this.generateToken(info),
      refreshExpire,
      refreshToken: await this.generateToken(info, true),
    };
  }

  /**
   * 生成token
   * @param tokenInfo 信息
   * @param roleIds 角色集合
   */
  async generateToken(info, isRefresh = false) {
    const { expire, refreshExpire, secret } = this.jwtConfig;
    const user = await this.userInfoEntity.findOneBy({ id: Equal(info.id) });
    const tokenInfo = {
      isRefresh,
      ...info,
      tenantId: user?.tenantId,
    };
    return jwt.sign(tokenInfo, secret, {
      expiresIn: isRefresh ? refreshExpire : expire,
    });
  }
}
