import {
  BaseController,
  CoolController,
  CoolTag,
  TagTypes,
} from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { MessageReplyService } from '../../service/reply';

/** Public endpoints used by recipients who may not have an account. */
@CoolController({ api: [], prefix: '/app/message' })
export class AppMessageReplyController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  messageReplyService: MessageReplyService;

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Get('/reply/info', { summary: '获取回复原始消息' })
  async replyInfo(@Query('token') token: string) {
    return this.ok(await this.messageReplyService.getReplyInfo(token));
  }

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Post('/reply/send', { summary: '发送消息回复' })
  async sendReply(
    @Body() body: { token: string; content: string; replyPhone?: string }
  ) {
    return this.ok(
      await this.messageReplyService.sendReply({
        ...body,
        ip: this.ctx.ip || this.ctx.request.ip,
      })
    );
  }
}
