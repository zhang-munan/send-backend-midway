import { BaseEntity } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 消息信息
 */
@Entity('message_info')
export class MessageInfoEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '发送用户ID' })
  userId: number;

  @Column({ type: 'bigint', comment: '使用的模板ID', nullable: true })
  templateId: number;

  @Index()
  @Column({ type: 'bigint', comment: '所属对话ID', nullable: true })
  conversationId: number;

  @Index()
  @Column({ type: 'varchar', length: 64, comment: '收件人手机号（后续加密）' })
  receiverPhone: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '收件人脱敏号码',
  })
  receiverPhoneMask: string;

  @Index()
  @Column({ type: 'varchar', length: 64, comment: '收件人手机号哈希' })
  receiverPhoneHash: string;

  @Column({ type: 'text', comment: '消息内容' })
  content: string;

  @Column({
    type: 'smallint',
    comment: '消息字数',
    default: 0,
  })
  contentLength: number;

  @Column({
    type: 'tinyint',
    comment: '计费条数',
    default: 1,
  })
  smsCount: number;

  @Column({
    type: 'tinyint',
    comment: '是否匿名 0实名 1匿名',
    default: 1,
  })
  isAnonymous: number;

  @Column({
    type: 'tinyint',
    comment: '是否公开到广场 0私密 1公开',
    default: 0,
  })
  isPublic: number;

  @Column({
    type: 'varchar',
    length: 50,
    comment: '发送者签名',
    nullable: true,
  })
  senderSignature: string;

  @Column({
    type: 'tinyint',
    comment: '1立即发送 2定时发送',
    default: 1,
    dict: ['立即发送', '定时发送'],
  })
  sendType: number;

  @Column({
    type: 'datetime',
    comment: '定时发送时间',
    nullable: true,
  })
  scheduledAt: Date;

  @Column({
    type: 'tinyint',
    comment: '0待审核 1审核通过 2审核拒绝 3待发送 4发送中 5已送达 6发送失败 7已取消',
    default: 1,
    dict: ['待审核', '审核通过', '审核拒绝', '待发送', '发送中', '已送达', '发送失败', '已取消'],
  })
  status: number;

  @Column({
    type: 'tinyint',
    comment: '0待审核 1通过 2拒绝 3转人工',
    default: 1,
    dict: ['待审核', '通过', '拒绝', '转人工'],
  })
  auditStatus: number;

  @Column({
    type: 'varchar',
    length: 200,
    comment: '审核备注',
    nullable: true,
  })
  auditRemark: string;

  @Column({
    type: 'datetime',
    comment: '审核时间',
    nullable: true,
  })
  auditedAt: Date;

  @Column({
    type: 'varchar',
    length: 64,
    comment: '短信平台消息ID',
    nullable: true,
  })
  smsMsgId: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: '短信通道标识',
    nullable: true,
  })
  smsChannel: string;

  @Column({
    type: 'datetime',
    comment: '送达时间',
    nullable: true,
  })
  deliveredAt: Date;

  @Column({
    type: 'varchar',
    length: 200,
    comment: '失败原因',
    nullable: true,
  })
  failReason: string;

  @Column({
    type: 'tinyint',
    comment: '重试次数',
    default: 0,
  })
  retryCount: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '扣费金额（分）',
    default: 0,
  })
  feeAmount: number;

  @Column({
    type: 'tinyint',
    comment: '支付来源 1套餐配额 2余额 3在线支付 4模拟支付',
    nullable: true,
    dict: ['套餐配额', '余额', '在线支付', '模拟支付'],
  })
  payType: number;

  @Column({
    type: 'tinyint',
    comment: '是否免费重发',
    default: 0,
  })
  isFreeRetry: number;

  @Column({
    type: 'varchar',
    length: 45,
    comment: '发送端IP',
    nullable: true,
  })
  clientIp: string;
}
