import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 推广大使业务配置（固定使用 id=1）。 */
@Entity('promotion_config')
export class PromotionConfigEntity extends BaseEntity {
  @Column({ type: 'tinyint', comment: '推广功能：0关闭 1开启', default: 1 })
  enabled: number;

  @Column({ type: 'int', comment: '新用户赠送短信次数', default: 2 })
  referralRewardQuota: number;

  @Column({ type: 'int', comment: '佣金比例（基点，5000=50%）', default: 5000 })
  commissionRateBps: number;

  @Column({ type: 'int', comment: '佣金结算等待天数', default: 7 })
  settlementDays: number;

  @Column({
    type: 'int',
    comment: '新用户可绑定推广码时限（小时）',
    default: 24,
  })
  bindWindowHours: number;

  @Column({ type: 'bigint', comment: '最低提现金额（分）', default: 1000 })
  minWithdrawAmount: number;

  @Column({
    type: 'bigint',
    comment: '单笔最高提现金额（分）',
    default: 500000,
  })
  maxWithdrawAmount: number;

  @Column({ type: 'int', comment: '提现手续费比例（基点）', default: 0 })
  withdrawFeeRateBps: number;
}
