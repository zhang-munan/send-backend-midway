import {
  BaseController,
  CoolController,
  CoolTag,
  TagTypes,
} from '@cool-midway/core';
import { Body, Inject, Post, Query } from '@midwayjs/core';
import {
  TencentSmsDeliveryStatusPayload,
  TencentSmsReplyPayload,
  TencentSmsReplyService,
} from '../../service/tencent_sms_reply';

/** 腾讯云短信公开回调（无需登录 token）。 */
@CoolController({ api: [], prefix: '/app/message' })
export class AppTencentSmsController extends BaseController {
  @Inject()
  tencentSmsReplyService: TencentSmsReplyService;

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/tencent-sms/reply', { summary: '腾讯云短信上行回复回调' })
  async reply(
    @Body() body: TencentSmsReplyPayload,
    @Query('token') token: string
  ) {
    // 腾讯云要求直接返回 result/errmsg，不能套 Cool Admin 通用响应结构。
    return this.tencentSmsReplyService.process(body || {}, token || '');
  }

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/tencent-sms/status', { summary: '腾讯云短信下发状态回调' })
  async status(
    @Body() body: TencentSmsDeliveryStatusPayload[],
    @Query('token') token: string
  ) {
    return this.tencentSmsReplyService.processDeliveryStatus(
      body || [],
      token || ''
    );
  }
}
