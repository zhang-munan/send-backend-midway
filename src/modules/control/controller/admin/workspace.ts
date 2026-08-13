import {
  BaseController,
  CoolCommException,
  CoolController,
} from '@cool-midway/core';
import { ALL, Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ControlWorkspaceService } from '../../service/workspace';

@CoolController()
export class AdminControlWorkspaceController extends BaseController {
  @Inject()
  ctx: Context;

  @Inject()
  controlWorkspaceService: ControlWorkspaceService;

  @Get('/summary', { summary: '总控制台统计' })
  async summary() {
    this.assertSuperAdmin();
    return this.ok(await this.controlWorkspaceService.summary());
  }

  @Get('/auditList', { summary: '总控制台审计日志' })
  async auditList(@Query('page') page = 1, @Query('size') size = 20) {
    this.assertSuperAdmin();
    return this.ok(await this.controlWorkspaceService.auditList(page, size));
  }

  @Get('/searchUsers', { summary: '搜索真实用户及权益' })
  async searchUsers(@Query('keyword') keyword: string) {
    this.assertSuperAdmin();
    return this.ok(await this.controlWorkspaceService.searchUsers(keyword));
  }

  @Get('/searchOrders', { summary: '搜索真实订单' })
  async searchOrders(
    @Query('keyword') keyword: string,
    @Query('userId') userId: number,
    @Query('mode') mode: string
  ) {
    this.assertSuperAdmin();
    return this.ok(
      await this.controlWorkspaceService.searchOrders(keyword, userId, mode)
    );
  }

  @Post('/forceRefund', { summary: '超管强制退款' })
  async forceRefund(@Body(ALL) params: any) {
    this.assertSuperAdmin();
    return this.ok(
      await this.controlWorkspaceService.forceRefund(
        params,
        this.ctx.admin,
        this.ctx.ip
      )
    );
  }

  @Post('/repairOrderStatus', { summary: '超管修复订单状态' })
  async repairOrderStatus(@Body(ALL) params: any) {
    this.assertSuperAdmin();
    return this.ok(
      await this.controlWorkspaceService.repairOrderStatus(
        params,
        this.ctx.admin,
        this.ctx.ip
      )
    );
  }

  @Post('/adjustUserBenefit', { summary: '超管调整用户权益' })
  async adjustUserBenefit(@Body(ALL) params: any) {
    this.assertSuperAdmin();
    return this.ok(
      await this.controlWorkspaceService.adjustUserBenefit(
        params,
        this.ctx.admin,
        this.ctx.ip
      )
    );
  }

  private assertSuperAdmin() {
    if (this.ctx.admin?.username !== 'admin') {
      throw new CoolCommException('仅超级管理员可使用总控制台', 403);
    }
  }
}
