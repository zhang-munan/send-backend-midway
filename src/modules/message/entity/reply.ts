import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 消息回复表
 */
@Entity('message_reply')
export class MessageReplyEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '关联原始消息 ID' })
  messageId: number;

  @Index()
  @Column({ type: 'bigint', comment: '所属对话 ID' })
  conversationId: number;

  @Column({ type: 'text', comment: '回复内容' })
  replyContent: string;

  @Column({ type: 'varchar', length: 64, comment: '回复者手机号', nullable: true })
  replyPhone: string;

  @Column({
    type: 'tinyint',
    comment: '回复类型：1正常回复 2退订(TD) 3投诉(TS)',
    default: 1,
  })
  replyType: number;

  @Column({ type: 'tinyint', comment: '发送方是否已读', default: 0 })
  isRead: number;

  @Column({ type: 'datetime', comment: '收到回复时间', default: () => 'CURRENT_TIMESTAMP' })
  receivedAt: Date;
}
