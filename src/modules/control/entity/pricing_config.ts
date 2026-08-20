import { BaseEntity, transformerJson } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/** 总控制台发布的消息计价配置；每次发布新增一个版本。 */
@Entity('control_pricing_config')
export class ControlPricingConfigEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'int', comment: '配置版本号' })
  version: number;

  @Index()
  @Column({ type: 'tinyint', comment: '是否当前生效版本：0否 1是', default: 1 })
  isActive: number;

  @Column({ type: 'varchar', length: 100, comment: '计价方案名称' })
  name: string;

  @Column({ type: 'json', comment: '完整计价配置', transformer: transformerJson })
  config: any;

  @Column({ type: 'bigint', comment: '发布管理员ID' })
  operatorId: number;

  @Column({ type: 'varchar', length: 100, comment: '发布管理员账号' })
  operatorName: string;

  @Column({ type: 'varchar', length: 200, comment: '发布原因' })
  reason: string;
}
