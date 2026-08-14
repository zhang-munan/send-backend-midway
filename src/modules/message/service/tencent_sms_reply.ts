import { ILogger, Inject, Logger, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { Equal, Repository } from 'typeorm';
import { SettingUserService } from '../../setting/service/user_setting';
import { MessageReceiverNoticeEntity } from '../entity/receiver_notice';

export interface TencentSmsReplyPayload {
  extend?: string;
  mobile?: string;
  nationcode?: string;
  sign?: string;
  text?: string;
  time?: number;
  SubscriberNumber?: string;
  PhoneNumber?: string;
  ReplyContent?: string;
}

export interface TencentSmsDeliveryStatusPayload {
  user_receive_time?: string;
  nationcode?: string;
  mobile?: string;
  report_status?: string;
  errmsg?: string;
  description?: string;
  sid?: string;
  ext?: string;
}

/** 处理腾讯云短信上行回复回调。 */
@Provide()
export class TencentSmsReplyService {
  @InjectEntityModel(MessageReceiverNoticeEntity)
  noticeEntity: Repository<MessageReceiverNoticeEntity>;

  @Inject()
  settingUserService: SettingUserService;

  @Logger()
  logger: ILogger;

  private tokenMatches(received: string) {
    const expected = process.env.TENCENT_SMS_REPLY_CALLBACK_TOKEN || '';
    if (!expected || !received) return false;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  private phone(payload: TencentSmsReplyPayload) {
    let phone = String(
      payload.mobile || payload.SubscriberNumber || payload.PhoneNumber || ''
    ).replace(/[\s-]/g, '');
    if (/^\+?86\d{11}$/.test(phone)) phone = phone.replace(/^\+?86/, '');
    return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
  }

  private content(payload: TencentSmsReplyPayload) {
    return String(payload.text ?? payload.ReplyContent ?? '')
      .trim()
      .toUpperCase();
  }

  private receivedAt(value: string | undefined) {
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
      return null;
    }
    const date = new Date(`${normalized.replace(' ', 'T')}+08:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async wasRecipientNoticeSent(phone: string) {
    return Boolean(
      await this.noticeEntity.findOne({
        where: { phone: Equal(phone), status: Equal(2) },
        select: ['id'],
      })
    );
  }

  async process(payload: TencentSmsReplyPayload, token: string) {
    if (!this.tokenMatches(token)) {
      this.logger.warn('拒绝未通过 token 校验的腾讯云短信回复回调');
      return { result: 1, errmsg: 'Unauthorized callback' };
    }

    // 非退订回复由腾讯云正常确认，但不修改任何业务数据。
    if (this.content(payload) !== 'TD') return { result: 0, errmsg: 'OK' };

    const phone = this.phone(payload);
    if (!phone) return { result: 1, errmsg: 'Invalid mobile' };

    // 只接受本系统确实成功发送过告知短信的手机号，避免回调入口被滥用。
    if (!(await this.wasRecipientNoticeSent(phone))) {
      this.logger.warn('忽略没有成功告知短信记录的TD回复');
      return { result: 0, errmsg: 'OK' };
    }

    await this.settingUserService.blockAllSmsByPhone(phone);
    return { result: 0, errmsg: 'OK' };
  }

  async processDeliveryStatus(
    payload: TencentSmsDeliveryStatusPayload[],
    token: string
  ) {
    if (!this.tokenMatches(token)) {
      this.logger.warn('拒绝未通过 token 校验的腾讯云短信下发状态回调');
      return { result: 1, errmsg: 'Unauthorized callback' };
    }

    const reports = Array.isArray(payload) ? payload.slice(0, 100) : [];
    for (const report of reports) {
      const sid = String(report?.sid || '').trim();
      const status = String(report?.report_status || '')
        .trim()
        .toUpperCase();
      const phone = this.phone({ mobile: report?.mobile });
      if (!sid || !phone || !['SUCCESS', 'FAIL'].includes(status)) continue;

      // 登录验证码也会产生回调，但只有告知短信的 SerialNo 会保存在本表。
      const notice = await this.noticeEntity.findOne({
        where: {
          providerMsgId: Equal(sid),
          phone: Equal(phone),
        },
        select: ['id'],
      });
      if (!notice) continue;

      const deliveredAt =
        status === 'SUCCESS' ? this.receivedAt(report.user_receive_time) : null;
      await this.noticeEntity.update(notice.id, {
        deliveryStatus: status,
        deliveryCode: String(report.errmsg || '').slice(0, 128) || null,
        deliveryDescription:
          String(report.description || '').slice(0, 500) || null,
        deliveryReportedAt: new Date(),
        ...(deliveredAt ? { deliveredAt } : {}),
        lastError:
          status === 'FAIL'
            ? `腾讯云下发失败: ${String(
                report.description || report.errmsg || '未知原因'
              ).slice(0, 470)}`
            : null,
      });
    }
    return { result: 0, errmsg: 'OK' };
  }
}
