import { BaseService, CoolCommException } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { SettingDocEntity } from '../entity/doc';

/**
 * 协议/文档服务
 */
@Provide()
export class SettingDocService extends BaseService {
  @InjectEntityModel(SettingDocEntity)
  settingDocEntity: Repository<SettingDocEntity>;

  /**
   * 按 key 获取文档内容（C端只返回启用的）
   */
  async getByKey(docKey: string): Promise<SettingDocEntity> {
    const doc = await this.settingDocEntity.findOneBy({
      docKey: Equal(docKey),
      status: Equal(1),
    });
    if (!doc) throw new CoolCommException('文档不存在或未启用');
    return doc;
  }
}
