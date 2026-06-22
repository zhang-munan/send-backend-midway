import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 模板分类
 */
@Entity('template_category')
export class TemplateCategoryEntity extends BaseEntity {
  @Column({ comment: '分类名称', length: 50 })
  name: string;

  @Index({ unique: true })
  @Column({ comment: '分类标识(英文key)', length: 30 })
  value: string;

  @Column({ comment: '分类描述', length: 200, nullable: true })
  description: string;

  @Column({ comment: '排序权重(越大越靠前)', default: 0 })
  sortOrder: number;

  @Column({
    comment: '是否启用',
    default: 1,
    dict: ['禁用', '启用'],
  })
  isActive: number;
}
