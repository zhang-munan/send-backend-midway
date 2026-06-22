import { CoolController, BaseController } from '@cool-midway/core';
import { Get, Inject, Query } from '@midwayjs/core';
import { ProductInfoEntity } from '../../entity/product';
import { ProductInfoService } from '../../service/product';

/**
 * 商品信息-APP端
 */
@CoolController({
  api: [],
  entity: ProductInfoEntity,
})
export class AppProductController extends BaseController {
  @Inject()
  productInfoService: ProductInfoService;

  /**
   * 获取上架商品列表
   */
  @Get('/list', { summary: '商品列表' })
  async list() {
    return this.ok(await this.productInfoService.listProducts());
  }

  /**
   * 商品详情
   */
  @Get('/detail', { summary: '商品详情' })
  async detail(@Query('id') id: number) {
    return this.ok(await this.productInfoService.getProduct(id));
  }
}
