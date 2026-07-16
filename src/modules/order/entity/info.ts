import { BaseEntity, transformerTextJson } from '../../base/entity/base';
import { Column, Entity, Index } from 'typeorm';

/**
 * 订单信息
 */
@Entity('order_info')
export class OrderInfoEntity extends BaseEntity {
  @Index()
  @Column({ type: 'bigint', comment: '用户ID' })
  userId: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '订单编号' })
  orderNo: string;

  @Column({ type: 'bigint', comment: '商品ID', nullable: true })
  productId: number;

  @Column({ type: 'varchar', length: 100, comment: '商品名称', nullable: true })
  productName: string;

  @Column({ type: 'int', comment: '数量', default: 1 })
  quantity: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '商品原价（分）',
    default: 0,
  })
  originalPrice: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '优惠金额（分）',
    default: 0,
  })
  discountAmount: number;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '实付金额（分）',
    default: 0,
  })
  payAmount: number;

  @Column({
    type: 'tinyint',
    comment: '支付方式：1微信 2支付宝 3余额 4模拟支付 5套餐余额',
    nullable: true,
    dict: ['', '微信', '支付宝', '余额', '模拟支付', '套餐余额'],
  })
  payMethod: number;

  @Column({
    type: 'tinyint',
    comment: '0待支付 1已支付 2已退款 3已关闭',
    default: 0,
    dict: ['待支付', '已支付', '已退款', '已关闭'],
  })
  status: number;

  @Column({ type: 'datetime', comment: '支付时间', nullable: true })
  payTime: Date;

  @Column({
    type: 'varchar',
    length: 64,
    comment: '第三方支付流水号',
    nullable: true,
  })
  tradeNo: string;

  @Column({
    type: 'text',
    comment: '支付参数JSON（如消息内容等附加参数）',
    nullable: true,
    transformer: transformerTextJson,
  })
  payParams: any;

  @Column({
    type: 'bigint',
    unsigned: true,
    comment: '退款金额（分）',
    default: 0,
  })
  refundAmount: number;

  @Column({ type: 'datetime', comment: '退款时间', nullable: true })
  refundTime: Date;

  @Column({
    type: 'varchar',
    length: 200,
    comment: '退款原因',
    nullable: true,
  })
  refundReason: string;

  @Column({
    type: 'varchar',
    length: 45,
    comment: '客户端IP',
    nullable: true,
  })
  clientIp: string;

  @Column({
    type: 'varchar',
    length: 200,
    comment: '备注',
    nullable: true,
  })
  remark: string;
}
