import { CoolController, BaseController } from '@cool-midway/core';
import { ConversationInfoEntity } from '../../entity/info';
import { ConversationInfoService } from '../../service/info';
import { UserInfoEntity } from '../../../user/entity/info';
import { Get, Inject, Query } from '@midwayjs/core';

/**
 * 对话信息管理
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: ConversationInfoEntity,
  service: ConversationInfoService,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.isMarked', 'a.isReceiverUnsubscribed'],
    keyWordLikeFields: ['a.receiverPhone', 'a.receiverPhoneMask'],
    select: ['a.*', 'b.nickName as userName'],
    join: [
      { entity: UserInfoEntity, alias: 'b', condition: 'a.userId = b.id' },
    ],
  },
})
export class AdminConversationInfoController extends BaseController {
  @Inject()
  conversationInfoService: ConversationInfoService;

  @Get('/detail', { summary: '对话详情及完整聊天记录' })
  async detail(@Query('id') id: number) {
    return this.ok(await this.conversationInfoService.adminDetail(id));
  }
}
