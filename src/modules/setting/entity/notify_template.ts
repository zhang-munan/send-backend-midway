import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 通知模板配置（公众号 / 小程序消息模板关联）
 */
@Entity('setting_notify_template')
export class SettingNotifyTemplateEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 64,
    comment: '业务场景标识：send_result | reply | activity',
  })
  sceneKey: string;

  @Column({ type: 'varchar', length: 100, comment: '场景名称' })
  sceneName: string;

  @Column({
    type: 'varchar',
    length: 10,
    comment: '平台：miniprogram | official',
  })
  platform: string;

  @Column({ type: 'varchar', length: 100, comment: '模板ID', nullable: true })
  templateId: string;

  @Column({ type: 'varchar', length: 200, comment: '模板标题', nullable: true })
  templateTitle: string;

  @Column({
    type: 'text',
    comment: '模板字段映射（JSON）',
    nullable: true,
  })
  fieldMapping: string;

  @Column({ type: 'tinyint', comment: '是否启用 0-禁用 1-启用', default: 0 })
  enabled: number;

  @Column({ type: 'varchar', length: 500, comment: '备注', nullable: true })
  remark: string;
}
