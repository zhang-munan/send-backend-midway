import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/** 腾讯云收件人引导短信异步任务。 */
@Entity('message_receiver_notice')
@Index(['phone', 'triggerCount'], { unique: true })
export class MessageReceiverNoticeEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 20, comment: '收件手机号' })
  phone: string;

  @Column({ type: 'int', unsigned: true, comment: '第几次业务短信触发' })
  triggerCount: number;

  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '触发告知的业务消息ID' })
  sourceMessageId: number;

  @Index()
  @Column({
    type: 'tinyint',
    default: 0,
    comment: '0待发送 1发送中 2成功 3待重试 4已跳过',
  })
  status: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '腾讯云调用次数',
  })
  attempts: number;

  @Column({ type: 'datetime', nullable: true, comment: '下次重试时间' })
  nextRetryAt: Date;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '腾讯云消息ID',
  })
  providerMsgId: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '最近错误或跳过原因',
  })
  lastError: string;

  @Column({ type: 'datetime', nullable: true, comment: '发送成功时间' })
  sentAt: Date;
}
