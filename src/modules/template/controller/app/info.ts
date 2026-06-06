import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { TemplateInfoEntity } from '../../entity/info';
import { TemplateInfoService } from '../../service/info';

/**
 * 模板信息(小程序端)
 */
@CoolController({
  api: [],
  entity: TemplateInfoEntity,
})
export class AppTemplateInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  templateInfoService: TemplateInfoService;

  @Get('/templateList', { summary: '模板列表' })
  async templateList(@Query() query) {
    return this.ok(await this.templateInfoService.list(query));
  }

  @Get('/:id', { summary: '模板详情' })
  async detail(@Query('id') id: number) {
    return this.ok(
      await this.templateInfoService.detail(id, this.ctx.user?.id)
    );
  }

  @Post('/:id/collect', { summary: '收藏/取消收藏' })
  async collect(@Query('id') id: number) {
    return this.ok(await this.templateInfoService.collect(this.ctx.user.id, id));
  }

  @Get('/collected', { summary: '收藏列表' })
  async collectedList(
    @Query('page') page: number,
    @Query('size') size: number
  ) {
    return this.ok(
      await this.templateInfoService.collectedList(this.ctx.user.id, page, size)
    );
  }

  @Post('/custom', { summary: '保存自定义模板' })
  async saveCustom(@Body() body) {
    return this.ok(await this.templateInfoService.saveCustom(this.ctx.user.id, body));
  }
}
