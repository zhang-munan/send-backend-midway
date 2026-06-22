import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post } from '@midwayjs/core';
import { FeedbackInfoEntity } from '../../entity/info';
import { FeedbackInfoService } from '../../service/info';

/**
 * 意见反馈 - 用户端
 */
@CoolController({
  api: [],
  entity: FeedbackInfoEntity,
  prefix: '/app/feedback/info',
})
export class AppFeedbackInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  feedbackInfoService: FeedbackInfoService;

  @Post('/submit', { summary: '提交反馈' })
  async submit(@Body() body) {
    await this.feedbackInfoService.submit(this.ctx.user.id, body);
    return this.ok();
  }

  @Get('/myList', { summary: '我的反馈列表' })
  async myList() {
    return this.ok(await this.feedbackInfoService.myList(this.ctx.user.id));
  }
}
