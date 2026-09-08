import { BaseController, CoolController, CoolTag, TagTypes } from '@cool-midway/core';
import { Body, Headers, Inject, Post } from '@midwayjs/core';
import { ZthyMoPayload, ZthySmsReplyService } from '../../service/zthy_sms_reply';

/**
 * 智享短信公开回调（无需登录 token）。
 * 上行回复推送：POST /app/message/zthy-sms/mo
 * 智享要求响应体为 SUCCESS，不能套 Cool Admin 通用响应结构。
 */
@CoolController({ api: [], prefix: '/app/message' })
export class AppZthySmsController extends BaseController {
  @Inject()
  zthySmsReplyService: ZthySmsReplyService;

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/zthy-sms/mo', { summary: '智享短信上行回复推送（TD退订）' })
  async mo(
    @Body() body: ZthyMoPayload[] | ZthyMoPayload | Record<string, any>,
    @Headers('zt-tkey') ztTKey: string,
    @Headers('zt-password') ztPassword: string
  ) {
    // 智享可能推单条对象或数组，统一为数组
    const reports = Array.isArray(body) ? body : [body];
    const ok = await this.zthySmsReplyService.process(
      reports,
      String(ztTKey ?? ''),
      String(ztPassword ?? '')
    );
    // 响应体直接返回 SUCCESS / FAIL，由 Koa 原样输出
    return ok ? 'SUCCESS' : 'FAIL';
  }
}
