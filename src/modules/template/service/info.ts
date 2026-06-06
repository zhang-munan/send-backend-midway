import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository, In, Like, Equal } from 'typeorm';
import { TemplateInfoEntity } from '../entity/info';
import { TemplateCollectEntity } from '../entity/collect';

/**
 * 模板信息服务
 */
@Provide()
export class TemplateInfoService extends BaseService {
  @InjectEntityModel(TemplateInfoEntity)
  templateInfoEntity: Repository<TemplateInfoEntity>;

  @InjectEntityModel(TemplateCollectEntity)
  templateCollectEntity: Repository<TemplateCollectEntity>;

  /**
   * 获取模板列表(支持category筛选、keyword搜索、hot/new排序)
   */
  async list(params) {
    const { category, keyword, sort, page = 1, size = 10 } = params;
    const where: any = { isActive: 1, auditStatus: 1 };
    if (category) {
      where.category = category;
    }
    if (keyword) {
      where.title = Like(`%${keyword}%`);
    }
    const find = this.templateInfoEntity.createQueryBuilder('a').where(where);
    if (sort === 'hot') {
      find.orderBy('a.useCount', 'DESC').addOrderBy('a.sortOrder', 'DESC');
    } else if (sort === 'new') {
      find.orderBy('a.createTime', 'DESC');
    } else {
      find.orderBy('a.sortOrder', 'DESC').addOrderBy('a.createTime', 'DESC');
    }
    find.skip((page - 1) * size).take(size);
    const [list, total] = await find.getManyAndCount();
    return { list, total, page, size };
  }

  /**
   * 获取模板详情(含当前用户是否已收藏)
   */
  async detail(id, userId?: number) {
    const info = await this.templateInfoEntity.findOneBy({
      id: Equal(id),
    });
    if (!info) throw new CoolCommException('模板不存在');
    // 查询当前用户是否已收藏
    let isCollected = false;
    if (userId) {
      const collect = await this.templateCollectEntity.findOneBy({
        userId: Equal(userId),
        templateId: Equal(id),
      });
      isCollected = !!collect;
    }
    return { ...info, isCollected };
  }

  /**
   * 收藏/取消收藏
   */
  async collect(userId, templateId) {
    const template = await this.templateInfoEntity.findOneBy({
      id: Equal(templateId),
    });
    if (!template) throw new CoolCommException('模板不存在');
    const exist = await this.templateCollectEntity.findOneBy({
      userId: Equal(userId),
      templateId: Equal(templateId),
    });
    if (exist) {
      // 取消收藏
      await this.templateCollectEntity.remove(exist);
      await this.templateInfoEntity.update(
        { id: Equal(templateId) },
        { collectCount: Math.max(0, template.collectCount - 1) }
      );
      return { collected: false };
    } else {
      // 添加收藏
      await this.templateCollectEntity.save({ userId, templateId });
      await this.templateInfoEntity.update(
        { id: Equal(templateId) },
        { collectCount: template.collectCount + 1 }
      );
      return { collected: true };
    }
  }

  /**
   * 用户收藏列表
   */
  async collectedList(userId, page = 1, size = 10) {
    const find = this.templateCollectEntity
      .createQueryBuilder('a')
      .leftJoinAndSelect(
        'template_info',
        'b',
        'a.templateId = b.id AND a.isCustom = 0'
      )
      .where('a.userId = :userId', { userId })
      .orderBy('a.createTime', 'DESC')
      .skip((page - 1) * size)
      .take(size);
    const [list, total] = await find.getRawMany();
    // 转换字段映射
    const result = list.map(item => {
      if (item.b_id) {
        return {
          id: item.a_id,
          templateId: item.b_id,
          title: item.b_title,
          content: item.b_content,
          category: item.b_category,
          isCustom: 0,
          createTime: item.a_createTime,
        };
      }
      return {
        id: item.a_id,
        templateId: item.a_templateId,
        title: item.a_customTitle,
        content: item.a_customContent,
        isCustom: 1,
        createTime: item.a_createTime,
      };
    });
    return { list: result, total, page, size };
  }

  /**
   * 保存自定义模板
   */
  async saveCustom(userId, data) {
    const { title, content, templateId } = data;
    if (!content) throw new CoolCommException('自定义内容不能为空');
    await this.templateCollectEntity.save({
      userId,
      templateId: templateId || 0,
      isCustom: 1,
      customContent: content,
      customTitle: title || '',
    });
    return { success: true };
  }

  /**
   * 管理端新增
   */
  async adminAdd(data) {
    const record = await this.templateInfoEntity.save(data);
    return record;
  }

  /**
   * 管理端更新(更新useCount/collectCount)
   */
  async adminUpdate(data) {
    const { id, ...updateData } = data;
    if (!id) throw new CoolCommException('ID不能为空');
    await this.templateInfoEntity.update({ id: Equal(id) }, updateData);
    return { success: true };
  }

  /**
   * 审核模板
   */
  async auditTemplate(id, status) {
    if (![0, 1, 2].includes(status)) {
      throw new CoolCommException('审核状态不合法');
    }
    const template = await this.templateInfoEntity.findOneBy({
      id: Equal(id),
    });
    if (!template) throw new CoolCommException('模板不存在');
    await this.templateInfoEntity.update(
      { id: Equal(id) },
      { auditStatus: status }
    );
    return { success: true };
  }
}
