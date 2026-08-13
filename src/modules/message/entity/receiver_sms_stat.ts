import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/** 收件手机号收到业务短信的累计次数。 */
@Entity('message_receiver_sms_stat')
export class MessageReceiverSmsStatEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, comment: '收件手机号' })
  phone: string;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '业务短信成功次数',
  })
  receivedCount: number;

  @Column({
    type: 'int',
    unsigned: true,
    default: 0,
    comment: '最近告知短信触发次数',
  })
  lastNoticeTriggerCount: number;

  @Column({ type: 'bigint', nullable: true, comment: '最近一条业务消息ID' })
  lastMessageId: number;
}
