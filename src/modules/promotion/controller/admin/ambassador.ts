import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { PromotionAmbassadorEntity } from '../../entity/ambassador';
import { UserInfoEntity } from '../../../user/entity/info';
import { PromotionService } from '../../service/promotion';

@CoolController({
  api: ['info', 'list', 'page'],
  entity: PromotionAmbassadorEntity,
  pageQueryOp: {
    fieldEq: ['a.status'],
    keyWordLikeFields: ['a.promotionCode', 'b.nickName', 'b.phone'],
    select: ['a.*', 'b.nickName as userNickName', 'b.phone as userPhone'],
    join: [
      {
        entity: UserInfoEntity,
        alias: 'b',
        condition: 'a.userId = b.id',
        type: 'leftJoin',
      },
    ],
    addOrderBy: { createTime: 'DESC' },
  },
})
export class AdminPromotionAmbassadorController extends BaseController {
  @Inject()
  promotionService: PromotionService;

  @Post('/setStatus', { summary: '启用或停用推广大使' })
  async setStatus(@Body('id') id: number, @Body('status') status: number) {
    await this.promotionService.setAmbassadorStatus(Number(id), Number(status));
    return this.ok();
  }
}
