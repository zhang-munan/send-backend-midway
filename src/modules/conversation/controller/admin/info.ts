import { CoolController, BaseController } from '@cool-midway/core';
import { ConversationInfoEntity } from '../../entity/info';
import { ConversationInfoService } from '../../service/info';
import { UserInfoEntity } from '../../../user/entity/info';

/**
 * 对话信息管理
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: ConversationInfoEntity,
  service: ConversationInfoService,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.isMarked', 'a.isReceiverUnsubscribed'],
    keyWordLikeFields: ['a.receiverPhoneMask'],
    select: ['a.*', 'b.nickName as userName'],
    join: [
      { entity: UserInfoEntity, alias: 'b', condition: 'a.userId = b.id' },
    ],
  },
})
export class AdminConversationInfoController extends BaseController {}
