import { CoolController, BaseController } from '@cool-midway/core';
import { Get, Inject, Query } from '@midwayjs/core';
import { SettingDocEntity } from '../../entity/doc';
import { SettingDocService } from '../../service/doc';

/**
 * 协议文档 - C端（无需登录）
 */
@CoolController({
  api: [],
  entity: SettingDocEntity,
  prefix: '/app/setting/doc',
})
export class AppSettingDocController extends BaseController {
  @Inject()
  settingDocService: SettingDocService;

  @Get('/get', { summary: '获取文档内容' })
  async get(@Query('key') key: string) {
    return this.ok(await this.settingDocService.getByKey(key));
  }
}
