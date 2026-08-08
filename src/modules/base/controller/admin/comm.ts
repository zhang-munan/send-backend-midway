import {
  BaseController,
  CoolController,
  CoolTag,
  CoolUrlTag,
  TagTypes,
} from '@cool-midway/core';
import { ALL, Body, Get, Inject, Post, Provide } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { PluginService } from '../../../plugin/service/info';
import { BaseSysUserEntity } from '../../entity/sys/user';
import { BaseSysLoginService } from '../../service/sys/login';
import { BaseSysPermsService } from '../../service/sys/perms';
import { BaseSysUserService } from '../../service/sys/user';
import { BaseDashboardService } from '../../service/dashboard';

/**
 * Base 通用接口 一般写不需要权限过滤的接口
 */
@CoolUrlTag()
@Provide()
@CoolController()
export class BaseCommController extends BaseController {
  @Inject()
  baseSysUserService: BaseSysUserService;

  @Inject()
  baseSysPermsService: BaseSysPermsService;

  @Inject()
  baseSysLoginService: BaseSysLoginService;

  @Inject()
  ctx: Context;

  @Inject()
  pluginService: PluginService;

  @Inject()
  baseDashboardService: BaseDashboardService;

  /**
   * PC 管理端首页统计汇总
   */
  @Get('/dashboard', { summary: '首页统计汇总' })
  async dashboard() {
    return this.ok(await this.baseDashboardService.summary());
  }

  /**
   * PC 管理端首页业务排行
   */
  @Get('/dashboardRanking', { summary: '首页业务排行' })
  async dashboardRanking() {
    return this.ok(
      await this.baseDashboardService.ranking(
        String(this.ctx.query?.range || 'day')
      )
    );
  }

  /**
   * 获得个人信息
   */
  @Get('/person', { summary: '个人信息' })
  async person() {
    return this.ok(
      await this.baseSysUserService.person(this.ctx.admin?.userId)
    );
  }

  /**
   * 修改个人信息
   */
  @Post('/personUpdate', { summary: '修改个人信息' })
  async personUpdate(@Body(ALL) user: BaseSysUserEntity) {
    await this.baseSysUserService.personUpdate(user);
    return this.ok();
  }

  /**
   * 权限菜单
   */
  @Get('/permmenu', { summary: '权限与菜单' })
  async permmenu() {
    return this.ok(
      await this.baseSysPermsService.permmenu(this.ctx.admin.roleIds)
    );
  }

  /**
   * 文件上传
   */
  @Post('/upload', { summary: '文件上传' })
  async upload() {
    const file = await this.pluginService.getInstance('upload');
    return this.ok(await file.upload(this.ctx));
  }

  /**
   * 文件上传模式，本地或者云存储
   */
  @Get('/uploadMode', { summary: '文件上传模式' })
  async uploadMode() {
    const file = await this.pluginService.getInstance('upload');
    return this.ok(await file.getMode());
  }

  /**
   * 退出
   */
  @Post('/logout', { summary: '退出' })
  async logout() {
    await this.baseSysLoginService.logout();
    return this.ok();
  }

  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Get('/program', { summary: '编程' })
  async program() {
    return this.ok('Node');
  }
}
