import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { UserInfoEntity } from '../../../user/entity/info';
import { MessageBlacklistEntity } from '../../entity/blacklist';
import { MessageBlacklistService } from '../../service/blacklist';

@CoolController({
  api: ['info', 'page'],
  entity: MessageBlacklistEntity,
  service: MessageBlacklistService,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.blockerUserId', 'a.blockedUserId'],
    keyWordLikeFields: ['b.nickName', 'b.phone', 'c.nickName', 'c.phone'],
    select: [
      'a.*',
      'b.nickName as blockerNickName',
      'b.phone as blockerPhone',
      'c.nickName as blockedNickName',
      'c.phone as blockedPhone',
    ],
    join: [
      {
        entity: UserInfoEntity,
        alias: 'b',
        condition: 'a.blockerUserId = b.id',
      },
      {
        entity: UserInfoEntity,
        alias: 'c',
        condition: 'a.blockedUserId = c.id',
      },
    ],
  },
})
export class AdminMessageBlacklistController extends BaseController {
  @Inject()
  messageBlacklistService: MessageBlacklistService;

  @Post('/unblock', { summary: '管理员解除拉黑' })
  async unblock(@Body('id') id: number) {
    await this.messageBlacklistService.adminUnblock(id);
    return this.ok();
  }
}
