import {
  CoolController,
  BaseController,
  CoolUrlTag,
  TagTypes,
  CoolTag,
} from '@cool-midway/core';
import { Inject, Post } from '@midwayjs/core';
import { OrderInfoService } from '../../service/info';

/**
 * 支付回调通知-APP端（无需鉴权）
 */
@CoolUrlTag()
@CoolController()
export class AppOrderNotifyController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  orderInfoService: OrderInfoService;

  /**
   * 微信支付异步回调
   * 微信服务器会 POST 到此地址，无需 token 验证
   */
  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/wxpay', { summary: '微信支付回调' })
  async wxpay() {
    // 微信支付要求回调接口直接返回 { code, message }，
    // 不能再包装成 Cool Admin 的通用响应格式。
    return await this.orderInfoService.wxpayNotify(this.ctx);
  }

  /**
   * 微信退款结果异步回调
   */
  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/wxpay/refund', { summary: '微信退款回调' })
  async wxpayRefund() {
    return await this.orderInfoService.wxpayRefundNotify(this.ctx);
  }
}
