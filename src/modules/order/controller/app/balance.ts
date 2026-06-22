import { CoolController, BaseController } from '@cool-midway/core';
import { Get, Inject } from '@midwayjs/core';
import { UserBalanceEntity } from '../../entity/balance';
import { UserBalanceService } from '../../service/balance';

/**
 * 用户余额-APP端
 */
@CoolController({
  api: [],
  entity: UserBalanceEntity,
})
export class AppUserBalanceController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  userBalanceService: UserBalanceService;

  /**
   * 获取当前用户余额
   */
  @Get('/info', { summary: '余额信息' })
  async info() {
    return this.ok(
      await this.userBalanceService.getBalance(this.ctx.user.id)
    );
  }
}
