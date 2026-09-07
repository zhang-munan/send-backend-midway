import { BaseController, CoolController } from '@cool-midway/core';
import { Body, Get, Inject, Post } from '@midwayjs/core';
import { PromotionService } from '../../service/promotion';

@CoolController({ api: [] })
export class AdminPromotionConfigController extends BaseController {
  @Inject()
  promotionService: PromotionService;

  @Get('/get', { summary: '获取推广配置与规则' })
  async get() {
    return this.ok(await this.promotionService.getSettings());
  }

  @Post('/save', { summary: '保存推广配置与规则' })
  async save(@Body() body: any) {
    return this.ok(await this.promotionService.saveSettings(body));
  }
}
