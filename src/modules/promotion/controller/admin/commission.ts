import { BaseController, CoolController } from '@cool-midway/core';
import { PromotionCommissionEntity } from '../../entity/commission';
import { PromotionAmbassadorEntity } from '../../entity/ambassador';
import { UserInfoEntity } from '../../../user/entity/info';

@CoolController({
  api: ['info', 'list', 'page'],
  entity: PromotionCommissionEntity,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.ambassadorId'],
    keyWordLikeFields: ['a.orderNo', 'c.nickName', 'c.phone'],
    select: [
      'a.*',
      'b.promotionCode as promotionCode',
      'c.nickName as referredUserName',
      'c.phone as referredUserPhone',
    ],
    join: [
      {
        entity: PromotionAmbassadorEntity,
        alias: 'b',
        condition: 'a.ambassadorId = b.id',
        type: 'leftJoin',
      },
      {
        entity: UserInfoEntity,
        alias: 'c',
        condition: 'a.referredUserId = c.id',
        type: 'leftJoin',
      },
    ],
    addOrderBy: { createTime: 'DESC' },
  },
})
export class AdminPromotionCommissionController extends BaseController {}
