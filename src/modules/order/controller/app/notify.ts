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
    return this.ok(await this.orderInfoService.wxpayNotify(this.ctx));
  }
}
