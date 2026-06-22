import { BaseEntity } from '../../base/entity/base';
import { Column, Entity } from 'typeorm';

/**
 * 意见反馈
 */
@Entity('feedback_info')
export class FeedbackInfoEntity extends BaseEntity {
  @Column({ comment: '用户ID' })
  userId: number;

  @Column({
    comment: '反馈类型',
    default: 0,
  })
  type: number;

  @Column({ comment: '反馈内容', type: 'text' })
  content: string;

  @Column({ comment: '截图', type: 'json', nullable: true })
  images: string[];

  @Column({ comment: '联系方式', nullable: true })
  contact: string;

  @Column({ comment: '状态', default: 0 })
  status: number;

  @Column({ comment: '管理员回复', type: 'text', nullable: true })
  reply: string;

  @Column({ comment: '回复时间', nullable: true, type: 'varchar' })
  replyTime: string;
}
