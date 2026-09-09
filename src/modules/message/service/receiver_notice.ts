import { ILogger, Inject, Logger, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, In, IsNull, LessThanOrEqual, Raw, Repository } from 'typeorm';
import { MessageReceiverNoticeEntity } from '../entity/receiver_notice';
import { UserInfoEntity } from '../../user/entity/info';
import { ZthySmsService } from '../../setting/service/zthy_sms';

const MAX_BATCH_SIZE = 20;

/** 领取并发送收件人告知短信（智享通道）。 */
@Provide()
export class MessageReceiverNoticeService {
  @InjectEntityModel(MessageReceiverNoticeEntity)
  noticeEntity: Repository<MessageReceiverNoticeEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @Inject()
  zthySmsService: ZthySmsService;

  @Logger()
  logger: ILogger;

  private running = false;

  private retryAt(attempts: number) {
    const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(attempts, 7));
    return new Date(Date.now() + delaySeconds * 1000);
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(
      0,
      500
    );
  }

  private async claim(id: number, attempts: number) {
    const result = await this.noticeEntity.update(
      { id: Equal(id), status: In([0, 3]) },
      { status: 1, attempts: attempts + 1, lastError: null }
    );
    return result.affected === 1;
  }

  private async sentToday(phone: string) {
    const sent = await this.noticeEntity.findOne({
      where: {
        phone: Equal(phone),
        status: Equal(2),
        // Use MySQL's session date so this agrees with the worker's DB_TIMEZONE.
        sentAt: Raw(
          alias =>
            `${alias} >= CURDATE() AND ${alias} < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`
        ),
      },
      select: ['id'],
    });
    return Boolean(sent);
  }

  async processPending() {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const pending = await this.noticeEntity.find({
        where: [
          { status: Equal(0) },
          { status: Equal(3), nextRetryAt: IsNull() },
          { status: Equal(3), nextRetryAt: LessThanOrEqual(new Date()) },
        ],
        order: { id: 'ASC' },
        take: MAX_BATCH_SIZE,
      });
      this.logger.info(
        `[告知短信诊断] 本轮领取待处理任务 ${pending.length} 条（通道=智享）`
      );

      for (const notice of pending) {
        if (!(await this.claim(notice.id, notice.attempts))) {
          this.logger.info(
            `[告知短信诊断] 任务 id=${notice.id} 抢占失败（已被其他实例处理）`
          );
          continue;
        }
        processed += 1;
        this.logger.info(
          `[告知短信诊断] 开始处理任务 id=${notice.id} ` +
            `phone=${notice.phone.slice(0, 3)}****${notice.phone.slice(-4)} ` +
            `triggerCount=${notice.triggerCount} attempts=${notice.attempts}`
        );
        // 队列产生后用户可能已经登录，调用发送前必须再次判断。
        const registered = await this.userInfoEntity.findOne({
          where: { phone: Equal(notice.phone) },
          select: ['id'],
        });
        if (registered) {
          this.logger.info(
            `[告知短信诊断] 任务 id=${notice.id} 手机号已注册用户，跳过告知短信`
          );
          await this.noticeEntity.update(notice.id, {
            status: 4,
            lastError: '手机号已进入系统，跳过告知短信',
            nextRetryAt: null,
          });
          continue;
        }

        // Normally the worker creates at most one task per phone per day. This
        // second check also covers retries of tasks created on an earlier day.
        if (await this.sentToday(notice.phone)) {
          this.logger.info(
            `[告知短信诊断] 任务 id=${notice.id} 该手机号今日已发送过告知短信，跳过`
          );
          await this.noticeEntity.update(notice.id, {
            status: 4,
            lastError: '该手机号今日已发送过告知短信',
            nextRetryAt: null,
          });
          continue;
        }

        try {
          this.logger.info(
            `[告知短信诊断] 任务 id=${notice.id} 通过全部检查，准备发送（通道=智享）`
          );
          const providerMsgId = await this.zthySmsService.sendRecipientNotice(
            notice.phone,
            notice.triggerCount
          );
          this.logger.info(
            `[告知短信诊断] 任务 id=${notice.id} 发送成功 providerMsgId=${providerMsgId}`
          );
          await this.noticeEntity.update(notice.id, {
            status: 2,
            providerMsgId,
            sentAt: new Date(),
            nextRetryAt: null,
            lastError: null,
          });
        } catch (error) {
          const attempts = notice.attempts + 1;
          const lastError = this.errorMessage(error);
          this.logger.error(
            `收件人告知短信发送失败 id=${notice.id}: ${lastError}`
          );
          await this.noticeEntity.update(notice.id, {
            status: 3,
            nextRetryAt: this.retryAt(attempts),
            lastError,
          });
        }
      }
      return processed;
    } finally {
      this.running = false;
    }
  }
}
