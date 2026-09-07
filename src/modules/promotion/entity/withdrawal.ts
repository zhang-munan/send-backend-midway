import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../base/entity/base';

/** 推广余额提现单。 */
@Entity('promotion_withdrawal')
export class PromotionWithdrawalEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '推广大使账户ID' })
  ambassadorId: number;

  @Index()
  @Column({ type: 'bigint', comment: '申请用户ID' })
  userId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '提现单号' })
  withdrawalNo: string;

  @Column({ type: 'bigint', unsigned: true, comment: '申请金额（分）' })
  amount: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '手续费（分）',
    default: 0,
  })
  feeAmount: number;

  @Column({ type: 'bigint', unsigned: true, comment: '实际到账金额（分）' })
  actualAmount: number;

  @Column({ type: 'tinyint', comment: '提现方式：1微信 2支付宝 3银行卡' })
  withdrawMethod: number;

  @Column({ type: 'varchar', length: 50, comment: '收款人姓名' })
  accountName: string;

  @Column({ type: 'varchar', length: 120, comment: '收款账号（展示时应脱敏）' })
  accountNo: string;

  @Column({ type: 'varchar', length: 100, comment: '开户行', nullable: true })
  bankName: string;

  @Index()
  @Column({
    type: 'tinyint',
    comment: '状态：0待审核 1打款中 2已打款 3已驳回 4已取消',
    default: 0,
  })
  status: number;

  @Column({ type: 'datetime', comment: '审核时间', nullable: true })
  auditTime: Date;

  @Column({ type: 'bigint', comment: '审核管理员ID', nullable: true })
  auditUserId: number;

  @Column({ type: 'datetime', comment: '打款完成时间', nullable: true })
  paidAt: Date;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '打款流水号',
    nullable: true,
  })
  paymentTradeNo: string;

  @Column({
    type: 'varchar',
    length: 200,
    comment: '审核/处理备注',
    nullable: true,
  })
  auditRemark: string;
}
