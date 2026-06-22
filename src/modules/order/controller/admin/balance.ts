import { CoolController, BaseController, CoolCommException } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { UserBalanceEntity } from '../../entity/balance';
import { UserInfoEntity } from '../../../user/entity/info';
import { UserBalanceService } from '../../service/balance';

/**
 * 用户余额管理-后台
 */
@CoolController({
  api: ['info', 'list', 'page'],
  entity: UserBalanceEntity,
  pageQueryOp: {
    keyWordLikeFields: ['b.nickName', 'b.phone'],
    select: [
      'a.*',
      'b.nickName as userNickName',
      'b.phone as userPhone',
      'b.avatarUrl as userAvatar',
    ],
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
export class AdminUserBalanceController extends BaseController {
  @Inject()
  userBalanceService: UserBalanceService;

  /**
   * 人工调整配额（增减）
   */
  @Post('/adjustQuota', { summary: '调整消息配额' })
  async adjustQuota(
    @Body('userId') userId: number,
    @Body('quota') quota: number,
    @Body('amount') amount: number,
  ) {
    if (!userId) throw new CoolCommException('用户ID不能为空');
    if (quota === undefined || quota === null) throw new CoolCommException('配额不能为空');
    if (quota >= 0) {
      await this.userBalanceService.addQuota(userId, quota, amount || 0);
    } else {
      await this.userBalanceService.deductQuota(userId, Math.abs(quota), Math.abs(amount || 0));
    }
    return this.ok();
  }
}
