import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateCategoryEntity } from '../entity/category';

const DEFAULT_CATEGORIES = [
  { name: '道歉和解', value: 'apology',    description: '分手和解、真诚道歉等场景',   sortOrder: 80 },
  { name: '真心表白', value: 'confession',  description: '表白、告白等场景',           sortOrder: 70 },
  { name: '节日祝福', value: 'blessing',    description: '生日、新年、节日祝福等场景', sortOrder: 60 },
  { name: '感谢感恩', value: 'gratitude',   description: '感谢帮助、感恩陪伴等场景',   sortOrder: 50 },
  { name: '温暖关心', value: 'care',        description: '关心问候、日常关怀等场景',   sortOrder: 40 },
  { name: '事务通知', value: 'notice',      description: '通知、告知等场景',           sortOrder: 30 },
  { name: '毕业告别', value: 'graduation',  description: '毕业、离职、告别等场景',     sortOrder: 20 },
  { name: '通用',     value: 'general',     description: '其他通用场景',               sortOrder: 10 },
];

/**
 * 模板分类数据补种：若表为空则插入默认 8 大分类
 */
@Provide()
export class TemplateCategoryInit {
  @InjectEntityModel(TemplateCategoryEntity)
  repo: Repository<TemplateCategoryEntity>;

  async seed() {
    try {
      const count = await this.repo.count();
      if (count > 0) return;
      await this.repo.save(
        DEFAULT_CATEGORIES.map(item => ({ ...item, isActive: 1 })),
      );
    } catch (e) {
      // 不影响服务启动
    }
  }
}
