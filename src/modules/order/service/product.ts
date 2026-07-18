import { BaseService } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { ProductInfoEntity } from '../entity/product';

/**
 * 商品信息
 */
@Provide()
export class ProductInfoService extends BaseService {
  @InjectEntityModel(ProductInfoEntity)
  productInfoEntity: Repository<ProductInfoEntity>;

  /**
   * 获取上架商品列表
   */
  async listProducts() {
    return this.productInfoEntity.find({
      where: { status: Equal(1) },
      order: { sortOrder: 'ASC', createTime: 'ASC' },
    });
  }

  /**
   * 获取商品详情
   */
  async getProduct(id: number) {
    return this.productInfoEntity.findOneBy({
      id: Equal(id),
      status: Equal(1),
    });
  }
}
