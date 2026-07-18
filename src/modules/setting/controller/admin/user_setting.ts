import { CoolController, BaseController } from '@cool-midway/core';
import { SettingUserEntity } from '../../entity/user_setting';

/**
 * 用户设置 - 管理端（只读查询）
 */
@CoolController({
  api: ['info', 'list', 'page'],
  entity: SettingUserEntity,
  prefix: '/admin/setting/userSetting',
  pageQueryOp: {
    fieldEq: [
      'a.notifySendResult',
      'a.notifyReply',
      'a.notifyActivity',
      'a.defaultAnonymous',
    ],
  },
})
export class AdminSettingUserController extends BaseController {}
