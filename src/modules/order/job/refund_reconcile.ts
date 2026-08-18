import { Job, IJob } from '@midwayjs/cron';
import { ILogger, Inject } from '@midwayjs/core';
import { OrderInfoService } from '../service/info';

/** 每分钟主动补查微信处理中退款，作为异步通知的可靠兜底。 */
@Job({ cronTime: '0 * * * * *', start: true })
export class OrderRefundReconcileJob implements IJob {
  @Inject()
  orderInfoService: OrderInfoService;

  @Inject()
  logger: ILogger;

  async onTick() {
    const result = await this.orderInfoService.reconcileProcessingWechatRefunds();
    if (result.failed > 0) {
      this.logger.warn(
        `微信退款定时对账存在失败：checked=${result.checked}, failed=${result.failed}`
      );
    }
  }
}
