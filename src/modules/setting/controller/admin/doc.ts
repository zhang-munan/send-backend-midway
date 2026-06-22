import { CoolController, BaseController } from '@cool-midway/core';
import { SettingDocEntity } from '../../entity/doc';

/**
 * 协议文档 - 管理端
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: SettingDocEntity,
  pageQueryOp: {
    fieldEq: ['a.status'],
    keyWordLikeFields: ['a.title', 'a.docKey'],
  },
})
export class AdminSettingDocController extends BaseController {}
