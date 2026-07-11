import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 短信通道配置（阿里云 / 腾讯云等服务商密钥与路由管理）
 */
@Entity('setting_sms_config')
export class SettingSmsConfigEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 30, comment: '通道名称：aliyun | tencent | other' })
  channelName: string;

  @Column({ type: 'varchar', length: 30, comment: '短信签名' })
  signName: string;

  @Column({ type: 'varchar', length: 30, comment: '短信模板编码' })
  templateCode: string;

  @Column({ type: 'varchar', length: 100, comment: 'AccessKey（加密存储）' })
  accessKey: string;

  @Column({ type: 'varchar', length: 100, comment: 'AccessSecret（加密存储）' })
  accessSecret: string;

  @Column({ type: 'varchar', length: 200, comment: 'API 端点', nullable: true })
  endpoint: string;

  @Index()
  @Column({ type: 'tinyint', comment: '是否主通道 0-备用 1-主通道', default: 0 })
  isPrimary: number;

  @Column({ type: 'tinyint', comment: '是否启用 0-禁用 1-启用', default: 1 })
  isActive: number;

  @Column({ type: 'int', comment: '日发送上限', default: 10000 })
  dailyLimit: number;

  @Column({ type: 'bigint', unsigned: true, comment: '通道余额（分）', nullable: true })
  balance: number;
}
