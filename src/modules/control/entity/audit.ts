import { BaseEntity, transformerJson } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/** 总控制台高权限操作审计日志。 */
@Entity('control_audit_log')
export class ControlAuditLogEntity extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 40, comment: '操作类型' })
  actionType: string;

  @Column({ type: 'varchar', length: 100, comment: '操作名称' })
  actionName: string;

  @Index()
  @Column({ type: 'bigint', comment: '操作管理员ID' })
  operatorId: number;

  @Column({ type: 'varchar', length: 100, comment: '操作管理员账号' })
  operatorName: string;

  @Index()
  @Column({ type: 'bigint', comment: '目标用户ID', nullable: true })
  targetUserId: number;

  @Index()
  @Column({ type: 'bigint', comment: '目标订单ID', nullable: true })
  targetOrderId: number;

  @Column({ type: 'varchar', length: 200, comment: '操作原因' })
  reason: string;

  @Column({
    type: 'json',
    comment: '操作前数据',
    nullable: true,
    transformer: transformerJson,
  })
  beforeData: any;

  @Column({
    type: 'json',
    comment: '操作后数据',
    nullable: true,
    transformer: transformerJson,
  })
  afterData: any;

  @Index()
  @Column({ type: 'tinyint', comment: '状态：0处理中 1成功 2失败', default: 0 })
  status: number;

  @Column({ type: 'varchar', length: 500, comment: '失败原因', nullable: true })
  errorMessage: string;

  @Column({ type: 'varchar', length: 45, comment: '操作IP', nullable: true })
  ip: string;
}
