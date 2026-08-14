import { ILogger, Inject, Logger, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, In, IsNull, LessThanOrEqual, Raw, Repository } from 'typeorm';
import { MessageReceiverNoticeEntity } from '../entity/receiver_notice';
import { UserInfoEntity } from '../../user/entity/info';
import { TencentSmsService } from '../../setting/service/tencent_sms';

const MAX_BATCH_SIZE = 20;

/** 领取并发送腾讯云收件人告知短信。 */
@Provide()
export class MessageReceiverNoticeService {
  @InjectEntityModel(MessageReceiverNoticeEntity)
  noticeEntity: Repository<MessageReceiverNoticeEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @Inject()
  tencentSmsService: TencentSmsService;

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
      if (!(await this.tencentSmsService.isRecipientNoticeEnabled())) {
        // 关闭期间不保留旧任务，避免以后重新开启时补发已经过时的告知短信。
        await this.noticeEntity.update(
          { status: In([0, 3]) },
          {
            status: 4,
            nextRetryAt: null,
            lastError: '腾讯云收件人告知短信开关已关闭',
          }
        );
        return 0;
      }

      const pending = await this.noticeEntity.find({
        where: [
          { status: Equal(0) },
          { status: Equal(3), nextRetryAt: IsNull() },
          { status: Equal(3), nextRetryAt: LessThanOrEqual(new Date()) },
        ],
        order: { id: 'ASC' },
        take: MAX_BATCH_SIZE,
      });

      for (const notice of pending) {
        if (!(await this.claim(notice.id, notice.attempts))) continue;
        processed += 1;
        // 开关可能在本批任务执行期间被关闭，腾讯云调用前再次复核。
        if (!(await this.tencentSmsService.isRecipientNoticeEnabled())) {
          await this.noticeEntity.update(notice.id, {
            status: 4,
            lastError: '腾讯云收件人告知短信开关已关闭',
            nextRetryAt: null,
          });
          continue;
        }
        // 队列产生后用户可能已经登录，调用腾讯云前必须再次判断。
        const registered = await this.userInfoEntity.findOne({
          where: { phone: Equal(notice.phone) },
          select: ['id'],
        });
        if (registered) {
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
          await this.noticeEntity.update(notice.id, {
            status: 4,
            lastError: '该手机号今日已发送过告知短信',
            nextRetryAt: null,
          });
          continue;
        }

        try {
          const providerMsgId =
            await this.tencentSmsService.sendRecipientNotice(
              notice.phone,
              notice.triggerCount
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
