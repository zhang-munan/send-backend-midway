import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { PromotionWithdrawalEntity } from '../../entity/withdrawal';
import { UserInfoEntity } from '../../../user/entity/info';
import { PromotionService } from '../../service/promotion';

@CoolController({
  api: ['info', 'list', 'page'],
  entity: PromotionWithdrawalEntity,
  pageQueryOp: {
    fieldEq: ['a.status', 'a.withdrawMethod'],
    keyWordLikeFields: [
      'a.withdrawalNo',
      'a.accountName',
      'a.accountNo',
      'b.nickName',
      'b.phone',
    ],
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
export class AdminPromotionWithdrawalController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  promotionService: PromotionService;

  @Post('/audit', { summary: '审核或确认提现' })
  async audit(@Body() body: any) {
    return this.ok(
      await this.promotionService.auditWithdrawal(
        Number(body.id),
        body.action,
        this.ctx.admin.userId,
        body
      )
    );
  }
}
