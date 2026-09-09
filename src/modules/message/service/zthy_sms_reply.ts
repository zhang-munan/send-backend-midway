import { ILogger, Inject, Logger, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { createHash, timingSafeEqual } from 'crypto';
import { Equal, Repository } from 'typeorm';
import { BaseSysParamService } from '../../base/service/sys/param';
import { SettingUserService } from '../../setting/service/user_setting';
import { ZthySmsService } from '../../setting/service/zthy_sms';
import { MessageReceiverNoticeEntity } from '../entity/receiver_notice';

/** 智享上行回复推送的单条内容 */
export interface ZthyMoPayload {
  mobile?: string;
  msgId?: string;
 content?: string;
  spCode?: string;
  ext?: string | number;
  extend?: string;
  createTime?: string;
  username?: string;
}

/**
 * 处理智享（zthysms）上行回复推送：识别 TD 退订。
 *
 * 鉴权方式与腾讯云回调不同：智享推送时在 header 中携带
 * zt-tkey（时间戳）+ zt-password（md5(md5(密码)+tKey)），
 * 服务端用同样算法验证，允许 ±10 分钟时钟偏差。
 */
@Provide()
export class ZthySmsReplyService {
  @InjectEntityModel(MessageReceiverNoticeEntity)
  noticeEntity: Repository<MessageReceiverNoticeEntity>;

  @Inject()
  settingUserService: SettingUserService;

  @Inject()
  zthySmsService: ZthySmsService;

  @Inject()
  baseSysParamService: BaseSysParamService;

  @Logger()
  logger: ILogger;

  private md5(input: string) {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  private normalizePhone(raw: unknown) {
    let phone = String(raw ?? '').replace(/[\s-]/g, '');
    if (/^\+?86\d{11}$/.test(phone)) phone = phone.replace(/^\+?86/, '');
    return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
  }

  private isUnsubscribe(content: unknown) {
    return (
      String(content ?? '')
        .trim()
        .toUpperCase() === 'TD'
    );
  }

  /**
   * 处理一批上行回复。返回 true 表示受理成功（响应 SUCCESS 给智享）。
   */
  async process(
    payload: ZthyMoPayload[],
    tKey: string,
    ztPassword: string
  ): Promise<boolean> {
    // 1. 前置：智享通道须启用且配置完整
    const password = await this.getPlainPassword();
    if (password === null) {
      this.logger.warn('智享通道未启用或未配置，忽略上行回复推送');
      return false;
    }

    // 2. 校验 tKey 时间窗（±10 分钟）
    const tKeyNum = Number(tKey);
    if (
      !Number.isFinite(tKeyNum) ||
      Math.abs(Date.now() / 1000 - tKeyNum) > 600
    ) {
      this.logger.warn('智享推送 tKey 超出允许时间窗');
      return false;
    }

    // 3. 校验签名 md5(md5(password)+tKey)
    const expected = this.md5(this.md5(password) + String(tKeyNum));
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(String(ztPassword || ''));
    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      this.logger.warn('拒绝未通过鉴权的智享上行回复推送');
      return false;
    }

    // 4. 只处理 TD 退订，其余内容确认接收但不处理
    const reports = Array.isArray(payload) ? payload : [];
    for (const item of reports) {
      const phone = this.normalizePhone(item?.mobile);
      if (!phone || !this.isUnsubscribe(item?.content)) continue;

      // 只接受本系统确实成功发送过告知短信的手机号，避免回调入口被滥用
      const sent = await this.noticeEntity.findOne({
        where: { phone: Equal(phone), status: Equal(2) },
        select: ['id'],
      });
      if (!sent) {
        this.logger.warn(`忽略没有成功告知短信记录的TD回复 ${phone}`);
        continue;
      }

      // 双黑名单：本地拦截 + 智享平台黑名单
      try {
        await this.settingUserService.blockAllSmsByPhone(phone);
      } catch (error) {
        this.logger.error(
          `本地退订拉黑失败 ${phone}: ${error instanceof Error ? error.message : error}`
        );
      }
      try {
        await this.zthySmsService.addBlacklist(phone);
      } catch (error) {
        this.logger.error(
          `智享平台黑名单添加失败 ${phone}: ${error instanceof Error ? error.message : error}`
        );
        // 平台黑名单失败不影响本地拦截，继续处理下一条
      }
    }
    return true;
  }

  /** 读取智享明文密码；未配置返回 null。 */
  private async getPlainPassword(): Promise<string | null> {
    const value = await this.baseSysParamService.dataByKey('zthySmsConfig');
    if (!value?.username || !value?.password) return null;
    return String(value.password);
  }
}
