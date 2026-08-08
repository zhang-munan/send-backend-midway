import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/** 收件人对站内发送账号的拉黑关系。 */
@Entity('message_blacklist')
@Index('uk_message_blacklist_users', ['blockerUserId', 'blockedUserId'], {
  unique: true,
})
export class MessageBlacklistEntity extends BaseEntity {
  @Index()
  @Column({ type: 'int', comment: '执行拉黑的收件用户ID' })
  blockerUserId: number;

  @Index()
  @Column({ type: 'int', comment: '被拉黑的发送用户ID' })
  blockedUserId: number;

  @Column({ type: 'int', comment: '发起拉黑的会话ID', nullable: true })
  sourceConversationId: number;

  @Column({
    type: 'int',
    unsigned: true,
    comment: '拉黑时已成功送达的消息数',
    default: 0,
  })
  deliveredMessageCount: number;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '收件端展示用的最近消息摘要',
    nullable: true,
  })
  lastMessagePreview: string;

  @Column({ type: 'datetime', comment: '拉黑时间' })
  blockedAt: Date;

  @Column({ type: 'datetime', comment: '解除拉黑时间', nullable: true })
  unblockedAt: Date;

  @Column({
    type: 'tinyint',
    comment: '状态 0已解除 1拉黑中',
    dict: ['已解除', '拉黑中'],
    default: 1,
  })
  status: number;
}
