import { CoolController, BaseController } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { TemplateCategoryEntity } from '../../entity/category';
import { TemplateCategoryService } from '../../service/category';

/**
 * 模板分类(管理端)
 */
@Provide()
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: TemplateCategoryEntity,
  service: TemplateCategoryService,
  pageQueryOp: {
    fieldEq: ['a.isActive'],
    keyWordLikeFields: ['a.name', 'a.value'],
    select: ['a.*'],
    addOrderBy: { sortOrder: 'DESC', createTime: 'DESC' },
  },
  listQueryOp: {
    fieldEq: ['isActive'],
    addOrderBy: { sortOrder: 'DESC' },
  },
})
export class AdminTemplateCategoryController extends BaseController {}
