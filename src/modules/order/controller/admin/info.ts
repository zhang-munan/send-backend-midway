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
import { ORDER_STATUS } from '../../service/info';

/**
 * 订单管理-后台
 */
@CoolController({
  api: ['delete', 'info', 'list', 'page'],
  entity: OrderInfoEntity,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.payMethod'],
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
}
