import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import * as moment from 'moment';
import { FeedbackInfoEntity } from '../entity/info';

/**
 * 意见反馈
 */
@Provide()
export class FeedbackInfoService extends BaseService {
  @InjectEntityModel(FeedbackInfoEntity)
  feedbackInfoEntity: Repository<FeedbackInfoEntity>;

  /**
   * 用户提交反馈
   */
  async submit(userId: number, body: Partial<FeedbackInfoEntity>) {
    const { type, content, images, contact } = body;
    if (!content || content.trim().length === 0) {
      throw new CoolCommException('反馈内容不能为空');
    }
    if (content.length > 500) {
      throw new CoolCommException('反馈内容不能超过500字');
    }
    const entity = this.feedbackInfoEntity.create({
      userId,
      type: type ?? 0,
      content: content.trim(),
      images: images || [],
      contact: contact || null,
      status: 0,
    });
    await this.feedbackInfoEntity.save(entity);
    return entity;
  }

  /**
   * 获取用户自己的反馈列表
   */
  async myList(userId: number) {
    return this.feedbackInfoEntity.find({
      where: { userId: Equal(userId) },
      order: { createTime: 'DESC' },
    });
  }

  /**
   * 管理员回复反馈
   */
  async replyFeedback(id: number, reply: string) {
    if (!reply || reply.trim().length === 0) {
      throw new CoolCommException('回复内容不能为空');
    }
    await this.feedbackInfoEntity.update(
      { id: Equal(id) },
      {
        reply: reply.trim(),
        replyTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        status: 1,
      }
    );
  }

  /**
   * 管理员更新状态
   */
  async updateStatus(id: number, status: number) {
    await this.feedbackInfoEntity.update({ id: Equal(id) }, { status });
  }
}
