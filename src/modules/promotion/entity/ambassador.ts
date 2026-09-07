import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 推广大使账户。金额单位均为分。 */
@Entity('promotion_ambassador')
export class PromotionAmbassadorEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '用户ID' })
  userId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16, comment: '推广码' })
  promotionCode: string;

  @Index()
  @Column({ type: 'tinyint', comment: '状态：0停用 1正常', default: 1 })
  status: number;

  @Column({
    type: 'bigint',
    comment: '可提现余额（分，可因退款冲正为负）',
    default: 0,
  })
  availableBalance: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '提现冻结金额（分）',
    default: 0,
  })
  frozenBalance: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '累计有效佣金（分）',
    default: 0,
  })
  totalCommission: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '累计已提现（分）',
    default: 0,
  })
  totalWithdrawn: number;

  @Column({
    type: 'int',
    unsigned: true,
    comment: '累计绑定用户数',
    default: 0,
  })
  totalReferrals: number;

  @Column({ type: 'datetime', comment: '同意推广规则时间' })
  agreedAt: Date;

  @Column({
    type: 'varchar',
    length: 64,
    comment: '同意的规则版本',
    nullable: true,
  })
  agreedRulesVersion: string;
}
