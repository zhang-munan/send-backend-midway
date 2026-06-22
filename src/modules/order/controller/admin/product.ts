import { CoolController, BaseController } from '@cool-midway/core';
import { ProductInfoEntity } from '../../entity/product';

/**
 * 商品套餐管理-后台
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: ProductInfoEntity,
  pageQueryOp: {
    fieldEq: ['a.status'],
    keyWordLikeFields: ['a.name', 'a.subtitle'],
    addOrderBy: { sortOrder: 'ASC', createTime: 'DESC' },
  },
})
export class AdminProductController extends BaseController {}
