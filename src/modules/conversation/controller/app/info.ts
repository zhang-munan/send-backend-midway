import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { ConversationInfoEntity } from '../../entity/info';
import { ConversationInfoService } from '../../service/info';

/**
 * 对话信息
 */
@CoolController({
  api: [],
  entity: ConversationInfoEntity,
})
export class AppConversationInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  conversationInfoService: ConversationInfoService;

  @Get('/conversationList', { summary: '对话列表' })
  async conversationList(@Query('page') page = 1, @Query('size') size = 20) {
    return this.ok(
      await this.conversationInfoService.list(this.ctx.user.id, page, size)
    );
  }

  @Get('/:id/messages', { summary: '获取对话消息' })
  async messages(@Query('page') page = 1, @Query('size') size = 20) {
    return this.ok(
      await this.conversationInfoService.getMessages(
        this.ctx.user.id,
        this.ctx.params.id,
        page,
        size
      )
    );
  }

  @Get('/:id/reply-context', { summary: '获取回复上下文' })
  async replyContext() {
    const context = await this.conversationInfoService.getReplyContext(
      this.ctx.user.id,
      this.ctx.params.id
    );
    // receiverPhone 只供服务端投递使用。匿名和实名场景都只返回允许展示的字段。
    return this.ok({
      conversationId: context.conversationId,
      receiverPhoneDisplay: context.receiverPhoneDisplay,
      isPeerAnonymous: context.isPeerAnonymous,
    });
  }

  @Post('/:id/read', { summary: '标记已读' })
  async read() {
    await this.conversationInfoService.markRead(
      this.ctx.user.id,
      this.ctx.params.id
    );
    return this.ok();
  }

  @Post('/:id/mark', { summary: '标记/取消标记' })
  async mark(
    @Body('isMarked') isMarked: number,
    @Body('markType') markType: string
  ) {
    await this.conversationInfoService.mark(
      this.ctx.user.id,
      this.ctx.params.id,
      isMarked,
      markType
    );
    return this.ok();
  }
}
