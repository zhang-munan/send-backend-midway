import { Job, IJob } from '@midwayjs/cron';
import { Inject } from '@midwayjs/core';
import { PromotionService } from '../service/promotion';

/** 每十分钟补偿佣金入账并结算到期余额。 */
@Job({ cronTime: '0 */10 * * * *', start: true })
export class PromotionReconcileJob implements IJob {
  @Inject()
  promotionService: PromotionService;

  async onTick() {
    await this.promotionService.reconcile();
  }
}
