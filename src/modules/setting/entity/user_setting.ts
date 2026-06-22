import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 用户设置（通知偏好 & 隐私设置）
 */
@Entity('setting_user')
export class SettingUserEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'bigint', comment: '用户ID' })
  userId: number;

  // ---------- 通知设置 ----------
  @Column({ type: 'tinyint', comment: '发送结果通知', default: 1 })
  notifySendResult: number;

  @Column({ type: 'tinyint', comment: '回复通知', default: 1 })
  notifyReply: number;

  @Column({ type: 'tinyint', comment: '活动推送通知', default: 1 })
  notifyActivity: number;

  // ---------- 隐私设置 ----------
  @Column({ type: 'tinyint', comment: '匿名发送默认开启', default: 1 })
  defaultAnonymous: number;
}
