import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** ADB 短信发送审计；每条消息保留最近一次发送尝试及其设备。 */
@Entity('adb_sms_dispatch')
export class AdbSmsDispatchEntity {
  @PrimaryColumn({ name: 'message_id', type: 'bigint' })
  messageId: number;

  @Index({ unique: true })
  @Column({ name: 'attempt_token', type: 'char', length: 32 })
  attemptToken: string;

  @Index()
  @Column({ name: 'device_serial', type: 'varchar', length: 128 })
  deviceSerial: string;

  @Column({ type: 'varchar', length: 32 })
  state: string;

  @Column({ name: 'attempt_count', type: 'int', unsigned: true, default: 1 })
  attemptCount: number;

  @Column({ name: 'claimed_at', type: 'datetime' })
  claimedAt: Date;

  @Column({ name: 'composer_opened_at', type: 'datetime', nullable: true })
  composerOpenedAt: Date;

  @Column({ name: 'armed_at', type: 'datetime', nullable: true })
  armedAt: Date;

  @Column({ name: 'send_clicked_at', type: 'datetime', nullable: true })
  sendClickedAt: Date;

  @Column({ name: 'finished_at', type: 'datetime', nullable: true })
  finishedAt: Date;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string;

  @Column({ name: 'create_time', type: 'datetime' })
  createTime: Date;

  @Column({ name: 'update_time', type: 'datetime' })
  updateTime: Date;
}
