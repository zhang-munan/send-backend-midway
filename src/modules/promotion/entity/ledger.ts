import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 推广资金不可变账本。 */
@Entity('promotion_ledger')
@Index(['bizType', 'bizId', 'entryType'], { unique: true })
export class PromotionLedgerEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '推广大使账户ID' })
  ambassadorId: number;

  @Column({
    type: 'tinyint',
    comment: '类型：1佣金结算 2提现冻结 3提现退回 4提现完成 5退款冲正',
  })
  entryType: number;

  @Column({ type: 'bigint', comment: '可提现余额变动（分，可为负）' })
  availableChange: number;

  @Column({ type: 'bigint', comment: '冻结余额变动（分，可为负）' })
  frozenChange: number;

  @Column({ type: 'bigint', comment: '变动后可提现余额（分）' })
  availableAfter: number;

  @Column({ type: 'bigint', unsigned: true, comment: '变动后冻结余额（分）' })
  frozenAfter: number;

  @Column({ type: 'varchar', length: 32, comment: '业务类型' })
  bizType: string;

  @Column({ type: 'bigint', comment: '业务记录ID' })
  bizId: number;

  @Column({ type: 'varchar', length: 200, comment: '账本说明', nullable: true })
  remark: string;
}
