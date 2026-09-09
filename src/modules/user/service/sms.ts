import { Provide, Config, Inject, InjectClient, Logger } from '@midwayjs/core';
import { BaseService, CoolCommException } from '@cool-midway/core';
import { CachingFactory, MidwayCache } from '@midwayjs/cache-manager';
import { TencentSmsService } from '../../setting/service/tencent_sms';
import { ZthySmsService } from '../../setting/service/zthy_sms';
import { randomInt } from 'crypto';
import { ILogger } from '@midwayjs/logger';

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

  @Inject()
  zthySmsService: ZthySmsService;

  @Logger()
  logger: ILogger;

  /**
   * 发送验证码
   * @param phone
   */
  async sendSms(phone: string) {
    if (!PHONE_REGEXP.test(phone)) {
      throw new CoolCommException('请输入正确的手机号');
    }
    // 随机六位验证码
    const code = String(randomInt(100000, 1000000));
    try {
      // 智享通道开启时优先使用智享模板短信，否则回退腾讯云
      if (await this.zthySmsService.isEnabled()) {
        await this.zthySmsService.sendLoginCode(phone, code);
      } else {
        await this.tencentSmsService.sendLoginCode(phone, code);
      }
      await this.midwayCache.set(
        `sms:${phone}`,
        code,
        this.config.timeout * 1000
      );
    } catch (error) {
      // 记录真实错误便于排查，前端统一展示友好提示
      this.logger.error('发送短信失败 %s: %s', phone, error?.message || error);
      throw new CoolCommException('发送失败，请稍后重试');
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
