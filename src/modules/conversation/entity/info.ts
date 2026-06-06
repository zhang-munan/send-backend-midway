import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 对话信息
 */
@Entity('conversation_info')
export class ConversationInfoEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '用户 ID' })
  userId: number;

  @Index()
  @Column({ type: 'varchar', length: 64, comment: '收件人手机号哈希' })
  receiverPhoneHash: string;

  @Column({ type: 'varchar', length: 20, comment: '收件人脱敏号码' })
  receiverPhoneMask: string;

  @Column({ type: 'varchar', length: 100, comment: '最后一条消息摘要', nullable: true })
  lastMsgContent: string;

  @Column({ type: 'datetime', comment: '最后消息时间', nullable: true })
  lastMsgTime: Date;

  @Column({ type: 'tinyint', comment: '最后一条是否为回复', default: 0 })
  lastMsgIsReply: number;

  @Column({ type: 'int', comment: '未读回复数', default: 0 })
  unreadCount: number;

  @Column({ type: 'int', comment: '消息总数', default: 0 })
  msgCount: number;

  @Column({ type: 'tinyint', comment: '收件人是否已退订', default: 0 })
  isReceiverUnsubscribed: number;

  @Column({ type: 'tinyint', comment: '是否标记重要', default: 0 })
  isMarked: number;

  @Column({ type: 'varchar', length: 20, comment: '标记类型 important/processed/ended', nullable: true })
  markType: string;

  @Column({
    type: 'tinyint',
    comment: '状态',
    dict: ['已删除', '正常'],
    default: 1,
  })
  status: number;
}
