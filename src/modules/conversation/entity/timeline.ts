import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 对话时间线
 */
@Entity('conversation_timeline')
export class ConversationTimelineEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '对话 ID' })
  conversationId: number;

  @Column({ type: 'bigint', comment: '关联消息 ID（发出时）', nullable: true })
  messageId: number;

  @Column({ type: 'bigint', comment: '关联回复 ID（收到回复时）', nullable: true })
  replyId: number;

  @Column({ type: 'tinyint', comment: '1发出 2收到', dict: ['发出', '收到'] })
  direction: number;

  @Column({ type: 'varchar', length: 100, comment: '内容摘要' })
  contentPreview: string;

  @Column({ type: 'bigint', unsigned: true, comment: '发送费用（分）', nullable: true })
  feeAmount: number;

  @Column({ type: 'tinyint', comment: '计费条数', nullable: true })
  smsCount: number;

  @Column({
    type: 'tinyint',
    comment: '支付来源 1套餐配额 2余额 3在线支付 4模拟支付',
    nullable: true,
  })
  payType: number;

  @Column({
    type: 'tinyint',
    comment: '状态',
    dict: ['已删除', '正常'],
    default: 1,
  })
  status: number;
}
