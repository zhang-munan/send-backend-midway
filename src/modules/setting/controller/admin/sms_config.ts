import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post } from '@midwayjs/core';
import { SettingSmsConfigEntity } from '../../entity/sms_config';
import { SettingSmsConfigService } from '../../service/sms_config';

/**
 * 短信通道配置 - 管理端
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: SettingSmsConfigEntity,
  service: SettingSmsConfigService,
  prefix: '/admin/setting/smsConfig',
  pageQueryOp: {
    fieldEq: ['a.channelName', 'a.isPrimary', 'a.isActive'],
    keyWordLikeFields: ['a.channelName', 'a.signName', 'a.templateCode'],
  },
})
export class AdminSettingSmsConfigController extends BaseController {
  @Inject()
  settingSmsConfigService: SettingSmsConfigService;

  /**
   * 设置主通道
   */
  @Post('/setPrimary')
  async setPrimary(@Body() body: { id: number }) {
    await this.settingSmsConfigService.setPrimary(body.id);
    return this.ok();
  }

  /**
   * 切换启用/禁用状态
   */
  @Post('/toggleActive')
  async toggleActive(@Body() body: { id: number }) {
    const result = await this.settingSmsConfigService.toggleActive(body.id);
    return this.ok(result);
  }

  /**
   * 获取当前主通道信息（脱敏返回）
   */
  @Get('/primaryChannel')
  async primaryChannel() {
    const channel = await this.settingSmsConfigService.getPrimaryChannel();
    const masked = {
      ...channel,
      accessKey: channel.accessKey.replace(/.(?=.{4})/g, '*'),
      accessSecret: '******',
    };
    return this.ok(masked);
  }
}
