import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { FeedbackInfoEntity } from '../../entity/info';
import { FeedbackInfoService } from '../../service/info';

/**
 * 意见反馈 - 管理端
 */
@CoolController({
  api: ['delete', 'info', 'list', 'page'],
  entity: FeedbackInfoEntity,
  pageQueryOp: {
    fieldEq: ['a.type', 'a.status'],
    keyWordLikeFields: ['a.content', 'a.contact'],
    addOrderBy: { 'a.createTime': 'DESC' },
    select: [
      'a.*',
      'u.nickName as userNickName',
      'u.phone as userPhone',
      'u.avatarUrl as userAvatarUrl',
    ],
    join: [
      {
        entity: 'user_info',
        alias: 'u',
        condition: 'u.id = a.userId',
        type: 'leftJoin',
      },
    ],
  },
})
export class AdminFeedbackInfoController extends BaseController {
  @Inject()
  feedbackInfoService: FeedbackInfoService;

  @Post('/reply', { summary: '回复反馈' })
  async reply(@Body('id') id: number, @Body('reply') reply: string) {
    await this.feedbackInfoService.replyFeedback(id, reply);
    return this.ok();
  }

  @Post('/updateStatus', { summary: '更新状态' })
  async updateStatus(@Body('id') id: number, @Body('status') status: number) {
    await this.feedbackInfoService.updateStatus(id, status);
    return this.ok();
  }
}
