import { CoolController, BaseController } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { TemplateCategoryEntity } from '../../entity/category';
import { TemplateCategoryService } from '../../service/category';

/**
 * 模板分类(小程序端) — 仅提供启用分类列表
 */
@Provide()
@CoolController({
  api: ['list'],
  entity: TemplateCategoryEntity,
  service: TemplateCategoryService,
  listQueryOp: {
    fieldEq: ['isActive'],
    addOrderBy: { sortOrder: 'DESC' },
  },
})
export class AppTemplateCategoryController extends BaseController {}
