import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 用户余额
 */
@Entity('user_balance')
export class UserBalanceEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '用户ID' })
  userId: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '当前余额（分）',
    default: 0,
  })
  balance: number;

  @Column({ type: 'int', comment: '剩余消息条数', default: 0 })
  messageQuota: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '累计充值（分）',
    default: 0,
  })
  totalRecharge: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '累计消费（分）',
    default: 0,
  })
  totalConsumed: number;
}
