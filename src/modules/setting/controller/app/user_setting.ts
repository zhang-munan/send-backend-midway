import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post } from '@midwayjs/core';
import { SettingUserEntity } from '../../entity/user_setting';
import { SettingUserService } from '../../service/user_setting';

/**
 * 用户设置 - C端
 */
@CoolController({
  api: [],
  entity: SettingUserEntity,
  prefix: '/app/setting/userSetting',
})
export class AppSettingUserController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  settingUserService: SettingUserService;

  @Get('/info', { summary: '获取用户设置' })
  async info() {
    return this.ok(await this.settingUserService.getSetting(this.ctx.user.id));
  }

  @Post('/saveSetting', { summary: '更新用户设置' })
  async saveSetting(@Body() body) {
    return this.ok(
      await this.settingUserService.updateSetting(this.ctx.user.id, body)
    );
  }
}
