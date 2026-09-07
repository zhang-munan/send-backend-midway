import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { UserInfoEntity } from '../../../user/entity/info';
import { AdbSmsDispatchEntity } from '../../entity/adb_sms_dispatch';
import { MessageInfoEntity } from '../../entity/info';
import { MessageInfoService } from '../../service/info';

/**
 * 消息信息-后台管理
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: MessageInfoEntity,
  service: MessageInfoService,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.auditStatus', 'a.sendType', 'a.isAnonymous'],
    fieldLike: ['a.receiverPhoneMask', 'a.receiverPhone'],
    keyWordLikeFields: [
      'a.receiverPhoneMask',
      'a.senderSignature',
      'a.failReason',
    ],
    select: [
      'a.*',
      'b.nickName as senderNickName',
      'c.deviceSerial as sendDevice',
    ],
    join: [
      { entity: UserInfoEntity, alias: 'b', condition: 'a.userId = b.id' },
      {
        entity: AdbSmsDispatchEntity,
        alias: 'c',
        condition: 'a.id = c.messageId',
        type: 'leftJoin',
      },
    ],
  },
})
export class AdminMessageInfoController extends BaseController {
  @Inject()
  messageInfoService: MessageInfoService;

  /**
   * 审核消息
   */
  @Post('/audit', { summary: '审核消息' })
  async audit(
    @Body('id') id: number,
    @Body('status') status: number,
    @Body('remark') remark: string
  ) {
    await this.messageInfoService.auditMessage(id, status, remark);
    return this.ok();
  }
}
