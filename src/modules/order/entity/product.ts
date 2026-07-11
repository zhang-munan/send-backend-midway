import { BaseEntity } from '../../base/entity/base';
import { Column, Entity } from 'typeorm';

/**
 * 套餐信息
 */
@Entity('product_info')
export class ProductInfoEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100, comment: '套餐名称' })
  name: string;

  @Column({ type: 'varchar', length: 200, comment: '副标题/宣传语', nullable: true })
  subtitle: string;

  @Column({ type: 'text', comment: '套餐描述', nullable: true })
  description: string;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '原价（分）',
    default: 0,
  })
  originalPrice: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '售价（分）',
    default: 0,
  })
  sellPrice: number;

  @Column({ type: 'int', comment: '包含消息条数', default: 0 })
  messageQuota: number;

  @Column({
    type: 'tinyint',
    comment: '0下架 1上架',
    default: 1,
    dict: ['下架', '上架'],
  })
  status: number;

  @Column({ type: 'int', comment: '排序', default: 0 })
  sortOrder: number;

  @Column({
    type: 'varchar',
    length: 500,
    comment: '封面图URL',
    nullable: true,
  })
  coverImage: string;
}
