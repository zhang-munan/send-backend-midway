import {
  CoolController,
  BaseController,
  CoolCommException,
} from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { OrderInfoEntity } from '../../entity/info';
import { UserInfoEntity } from '../../../user/entity/info';
import { ORDER_STATUS, OrderInfoService } from '../../service/info';

/**
 * 订单管理-后台
 */
@CoolController({
  api: ['delete', 'info', 'list', 'page'],
  entity: OrderInfoEntity,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.payMethod', 'a.refundStatus'],
    keyWordLikeFields: ['a.orderNo', 'a.productName', 'b.nickName', 'b.phone'],
    select: ['a.*', 'b.nickName as userNickName', 'b.phone as userPhone'],
    join: [
      {
        entity: UserInfoEntity,
        alias: 'b',
        condition: 'a.userId = b.id',
        type: 'leftJoin',
      },
    ],
    addOrderBy: { createTime: 'DESC' },
  },
})
export class AdminOrderInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  orderInfoService: OrderInfoService;

  @InjectEntityModel(OrderInfoEntity)
  orderInfoEntity: Repository<OrderInfoEntity>;

  /**
   * 手动关闭订单
   */
  @Post('/close', { summary: '关闭订单' })
  async close(@Body('id') id: number) {
    const order = await this.orderInfoEntity.findOneBy({ id: Equal(id) });
    if (!order) throw new CoolCommException('订单不存在');
    if (order.status !== ORDER_STATUS.PENDING) {
      throw new CoolCommException('只能关闭待支付的订单');
    }
    await this.orderInfoEntity.update(id, { status: ORDER_STATUS.CLOSED });
    return this.ok();
  }

  /**
   * 审批退款申请
   */
  @Post('/refundAudit', { summary: '审批退款申请' })
  async refundAudit(
    @Body('id') id: number,
    @Body('approved') approved: boolean,
    @Body('remark') remark: string
  ) {
    await this.orderInfoService.auditRefund(
      id,
      approved,
      remark,
      this.ctx.admin.userId
    );
    return this.ok();
  }

  /**
   * 同步第三方退款结果
   */
  @Post('/syncRefund', { summary: '同步退款状态' })
  async syncRefund(@Body('id') id: number) {
    return this.ok(await this.orderInfoService.syncRefund(id));
  }

  /**
   * 重试失败的微信退款
   */
  @Post('/retryRefund', { summary: '重试微信退款' })
  async retryRefund(@Body('id') id: number) {
    return this.ok(await this.orderInfoService.retryRefund(id));
  }
}
