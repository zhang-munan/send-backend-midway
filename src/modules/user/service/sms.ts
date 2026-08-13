import { Provide, Config, Inject, InjectClient } from '@midwayjs/core';
import { BaseService, CoolCommException } from '@cool-midway/core';
import { CachingFactory, MidwayCache } from '@midwayjs/cache-manager';
import { TencentSmsService } from '../../setting/service/tencent_sms';
import { randomInt } from 'crypto';

const PHONE_REGEXP = /^1[3-9]\d{9}$/;

/**
 * 描述
 */
@Provide()
export class UserSmsService extends BaseService {
  // 获得模块的配置信息
  @Config('module.user.sms')
  config;

  @InjectClient(CachingFactory, 'default')
  midwayCache: MidwayCache;

  @Inject()
  tencentSmsService: TencentSmsService;

  /**
   * 发送验证码
   * @param phone
   */
  async sendSms(phone: string) {
    if (!PHONE_REGEXP.test(phone)) {
      throw new CoolCommException('请输入正确的手机号');
    }
    // 随机四位验证码
    const code = String(randomInt(1000, 10000));
    try {
      // 登录验证码固定使用腾讯云插件；签名和模板由 sms-tx 插件配置提供。
      await this.tencentSmsService.sendLoginCode(phone, code);
      await this.midwayCache.set(
        `sms:${phone}`,
        code,
        this.config.timeout * 1000
      );
    } catch (error) {
      throw new CoolCommException('发送过于频繁，请稍后再试');
    }
  }

  /**
   * 验证验证码
   * @param phone
   * @param code
   * @returns
   */
  async checkCode(phone: string, code: string, consume = true) {
    const cacheCode = await this.midwayCache.get(`sms:${phone}`);
    if (code && cacheCode == code) {
      if (consume) await this.midwayCache.del(`sms:${phone}`);
      return true;
    }
    return false;
  }
}
