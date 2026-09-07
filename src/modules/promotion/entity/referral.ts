import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 新用户与推广大使的一次性归因关系。 */
@Entity('promotion_referral')
export class PromotionReferralEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '推广大使账户ID' })
  ambassadorId: number;

  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '被推广用户ID（全局只可绑定一次）' })
  referredUserId: number;

  @Column({ type: 'varchar', length: 16, comment: '绑定时的推广码快照' })
  promotionCode: string;

  @Column({ type: 'int', comment: '赠送短信次数', default: 0 })
  rewardQuota: number;

  @Column({ type: 'tinyint', comment: '赠送状态：0未发放 1已发放', default: 0 })
  rewardGranted: number;

  @Column({ type: 'datetime', comment: '绑定时间' })
  boundAt: Date;
}
