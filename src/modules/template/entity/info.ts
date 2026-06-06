import { BaseEntity, transformerJson } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 模板信息
 */
@Entity('template_info')
export class TemplateInfoEntity extends BaseEntity {
  @Column({ comment: '模板标题', length: 100 })
  title: string;

  @Column({ comment: '模板内容', type: 'text' })
  content: string;

  @Index()
  @Column({ comment: '分类', length: 20, dict: 'templateCategory' })
  category: string;

  @Column({
    comment: '标签(JSON数组)',
    type: 'json',
    nullable: true,
    transformer: transformerJson,
  })
  tags: string[];

  @Column({ comment: '使用建议', length: 200, nullable: true })
  usageTip: string;

  @Column({ comment: '使用人数', default: 0 })
  useCount: number;

  @Column({ comment: '收藏人数', default: 0 })
  collectCount: number;

  @Column({
    comment: '是否匿名模板',
    default: 1,
    dict: ['实名', '匿名'],
  })
  isAnonymous: number;

  @Column({ comment: '排序权重', default: 0 })
  sortOrder: number;

  @Column({ comment: '是否推荐', default: 0 })
  isRecommended: number;

  @Column({
    comment: '是否启用',
    default: 1,
    dict: ['禁用', '启用'],
  })
  isActive: number;

  @Column({
    comment: '来源',
    default: 1,
    dict: ['系统', '用户投稿'],
  })
  source: number;

  @Column({ comment: '创建者', type: 'bigint', nullable: true })
  creatorId: number;

  @Column({
    comment: '审核状态',
    default: 1,
    dict: ['待审核', '通过', '拒绝'],
  })
  auditStatus: number;
}
