import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 推广佣金明细。 */
@Entity('promotion_commission')
export class PromotionCommissionEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '推广大使账户ID' })
  ambassadorId: number;

  @Index()
  @Column({ type: 'bigint', comment: '被推广用户ID' })
  referredUserId: number;

  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '来源订单ID' })
  orderId: number;

  @Column({ type: 'varchar', length: 32, comment: '来源订单号' })
  orderNo: string;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '符合条件的实付金额（分）',
  })
  sourceAmount: number;

  @Column({ type: 'int', comment: '佣金比例快照（基点）' })
  commissionRateBps: number;

  @Column({ type: 'bigint', unsigned: true, comment: '佣金金额（分）' })
  commissionAmount: number;

  @Index()
  @Column({
    type: 'tinyint',
    comment: '状态：0待结算 1已结算 2已冲正',
    default: 0,
  })
  status: number;

  @Index()
  @Column({ type: 'datetime', comment: '预计可提现时间' })
  availableAt: Date;

  @Column({ type: 'datetime', comment: '实际结算时间', nullable: true })
  settledAt: Date;

  @Column({ type: 'datetime', comment: '退款冲正时间', nullable: true })
  reversedAt: Date;

  @Column({ type: 'varchar', length: 200, comment: '冲正原因', nullable: true })
  reverseReason: string;
}
