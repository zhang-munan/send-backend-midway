import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { OrderInfoEntity } from '../../entity/info';
import { OrderInfoService } from '../../service/info';

/**
 * 订单信息-APP端
 */
@CoolController({
  api: [],
  entity: OrderInfoEntity,
})
export class AppOrderInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  orderInfoService: OrderInfoService;

  /**
   * 创建订单
   * 支持两种场景：
   *   1. 传入 productId → 购买套餐包
   *   2. 传入消息内容 → 按次计费发送
   */
  @Post('/create', { summary: '创建订单' })
  async create(@Body() body) {
    return this.ok(
      await this.orderInfoService.createOrder(this.ctx.user.id, {
        ...body,
        clientIp: this.ctx.request?.ip || null,
      })
    );
  }

  /**
   * 发起支付
   * @param orderId 订单ID
   * @param payMethod 支付方式：1微信 2支付宝 3余额 4模拟支付（开发模式）
   */
  @Post('/pay', { summary: '发起支付' })
  async pay(
    @Body('orderId') orderId: number,
    @Body('payMethod') payMethod: number,
    @Body('tradeType') tradeType?: string,
    @Body('code') code?: string,
    @Body('wxType') wxType?: number
  ) {
    return this.ok(
      await this.orderInfoService.pay(
        this.ctx.user.id,
        orderId,
        payMethod,
        this.ctx,
        { tradeType, code, wxType }
      )
    );
  }

  /**
   * 查询订单支付状态（前端轮询）
   */
  @Get('/status', { summary: '查询支付状态' })
  async status(@Query('orderId') orderId: number) {
    return this.ok(
      await this.orderInfoService.queryStatus(this.ctx.user.id, orderId)
    );
  }

  /**
   * 订单详情
   */
  @Get('/detail', { summary: '订单详情' })
  async detail(@Query('id') id: number) {
    return this.ok(
      await this.orderInfoService.orderDetail(this.ctx.user.id, id)
    );
  }

  /**
   * 申请退款
   */
  @Post('/applyRefund', { summary: '申请退款' })
  async applyRefund(
    @Body('orderId') orderId: number,
    @Body('reason') reason: string
  ) {
    return this.ok(
      await this.orderInfoService.applyRefund(this.ctx.user.id, orderId, reason)
    );
  }

  /**
   * 订单列表
   */
  @Get('/orderList', { summary: '订单列表' })
  async orderList(@Query('page') page: number, @Query('size') size: number) {
    return this.ok(
      await this.orderInfoService.orderList(this.ctx.user.id, {
        page: page || 1,
        size: size || 10,
      })
    );
  }
}
