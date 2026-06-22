import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 协议/文档（用户协议、隐私政策、使用须知等）
 */
@Entity('setting_doc')
export class SettingDocEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 64,
    comment: '文档标识：user_agreement | privacy_policy | usage_guide',
  })
  docKey: string;

  @Column({ type: 'varchar', length: 100, comment: '文档标题' })
  title: string;

  @Column({ type: 'longtext', comment: '文档内容（富文本HTML）' })
  content: string;

  @Column({ type: 'tinyint', comment: '状态 0-禁用 1-启用', default: 1 })
  status: number;
}
