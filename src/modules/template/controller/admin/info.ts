import { CoolController, BaseController } from '@cool-midway/core';
import { Body, Inject, Post } from '@midwayjs/core';
import { TemplateInfoEntity } from '../../entity/info';
import { TemplateInfoService } from '../../service/info';

/**
 * 模板信息(管理端)
 */
@CoolController({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: TemplateInfoEntity,
  service: TemplateInfoService,
  pageQueryOp: {
    fieldEq: [
      'a.category',
      'a.isActive',
      'a.isRecommended',
      'a.source',
      'a.auditStatus',
      'a.isAnonymous',
    ],
    keyWordLikeFields: ['a.title', 'a.content'],
  },
})
export class AdminTemplateInfoController extends BaseController {
  @Inject()
  templateInfoService: TemplateInfoService;

  @Post('/audit', { summary: '审核模板' })
  async audit(@Body('id') id: number, @Body('status') status: number) {
    return this.ok(await this.templateInfoService.auditTemplate(id, status));
  }
}
