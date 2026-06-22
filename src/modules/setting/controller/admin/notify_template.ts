import { CoolController, BaseController } from '@cool-midway/core';
import { SettingNotifyTemplateEntity } from '../../entity/notify_template';

/**
 * 通知模板配置 - 管理端
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: SettingNotifyTemplateEntity,
  prefix: '/admin/setting/notifyTemplate',
  pageQueryOp: {
    fieldEq: ['a.platform', 'a.enabled'],
    keyWordLikeFields: ['a.sceneName', 'a.templateId', 'a.templateTitle'],
  },
})
export class AdminSettingNotifyTemplateController extends BaseController {}
