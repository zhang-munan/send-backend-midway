import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { PromotionService } from '../../service/promotion';

@CoolController({ api: [] })
export class AppPromotionAmbassadorController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  promotionService: PromotionService;

  @Get('/overview', { summary: '推广大使概览' })
  async overview() {
    return this.ok(await this.promotionService.overview(this.ctx.user.id));
  }

  @Post('/apply', { summary: '申请成为推广大使' })
  async apply(@Body('agreed') agreed: boolean) {
    if (agreed !== true) return this.fail('请先阅读并同意推广大使规则');
    return this.ok(
      await this.promotionService.applyAmbassador(this.ctx.user.id)
    );
  }

  @Get('/commissions', { summary: '佣金明细' })
  async commissions(@Query('page') page: number, @Query('size') size: number) {
    return this.ok(
      await this.promotionService.commissionList(
        this.ctx.user.id,
        Number(page) || 1,
        Math.min(Number(size) || 20, 100)
      )
    );
  }

  @Get('/referrals', { summary: '推广用户明细' })
  async referrals(@Query('page') page: number, @Query('size') size: number) {
    return this.ok(
      await this.promotionService.referralList(
        this.ctx.user.id,
        Number(page) || 1,
        Math.min(Number(size) || 20, 100)
      )
    );
  }

  @Get('/withdrawals', { summary: '提现记录' })
  async withdrawals(@Query('page') page: number, @Query('size') size: number) {
    return this.ok(
      await this.promotionService.withdrawalList(
        this.ctx.user.id,
        Number(page) || 1,
        Math.min(Number(size) || 20, 100)
      )
    );
  }

  @Post('/withdraw', { summary: '申请提现' })
  async withdraw(@Body() body: any) {
    return this.ok(
      await this.promotionService.applyWithdrawal(this.ctx.user.id, body)
    );
  }

  @Post('/cancelWithdrawal', { summary: '取消待审核提现' })
  async cancelWithdrawal(@Body('id') id: number) {
    await this.promotionService.cancelWithdrawal(this.ctx.user.id, Number(id));
    return this.ok();
  }
}
