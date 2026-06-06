import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 模板收藏
 */
@Entity('template_collect')
export class TemplateCollectEntity extends BaseEntity {
  @Index()
  @Column({ comment: '用户ID', type: 'bigint' })
  userId: number;

  @Index()
  @Column({ comment: '模板ID', type: 'bigint' })
  templateId: number;

  @Column({ comment: '是否自定义模板', default: 0 })
  isCustom: number;

  @Column({ comment: '自定义内容', type: 'text', nullable: true })
  customContent: string;

  @Column({ comment: '自定义标题', length: 100, nullable: true })
  customTitle: string;
}
