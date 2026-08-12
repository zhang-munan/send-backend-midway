import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { MessageBlacklistEntity } from '../../entity/blacklist';
import { MessageBlacklistService } from '../../service/blacklist';

@CoolController({ api: [], entity: MessageBlacklistEntity })
export class AppMessageBlacklistController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  messageBlacklistService: MessageBlacklistService;

  @Get('/state', { summary: '查询会话拉黑状态' })
  async state(@Query('conversationId') conversationId: number) {
    return this.ok(
      await this.messageBlacklistService.conversationState(
        this.ctx.user.id,
        conversationId
      )
    );
  }

  @Post('/block', { summary: '拉黑消息发送者' })
  async block(@Body('conversationId') conversationId: number) {
    return this.ok(
      await this.messageBlacklistService.block(this.ctx.user.id, conversationId)
    );
  }

  @Get('/list', { summary: '我的拉黑列表' })
  async list(@Query('page') page = 1, @Query('size') size = 20) {
    return this.ok(
      await this.messageBlacklistService.list(this.ctx.user.id, page, size)
    );
  }

  @Post('/unblock', { summary: '解除拉黑' })
  async unblock(@Body('id') id: number) {
    await this.messageBlacklistService.unblock(this.ctx.user.id, id);
    return this.ok();
  }
}
