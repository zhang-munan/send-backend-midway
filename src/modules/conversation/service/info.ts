import { BaseService } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Like, Repository } from 'typeorm';
import { ConversationInfoEntity } from '../entity/info';
import { ConversationTimelineEntity } from '../entity/timeline';

/**
 * 对话信息
 */
@Provide()
export class ConversationInfoService extends BaseService {
  @InjectEntityModel(ConversationInfoEntity)
  conversationInfoEntity: Repository<ConversationInfoEntity>;

  @InjectEntityModel(ConversationTimelineEntity)
  conversationTimelineEntity: Repository<ConversationTimelineEntity>;

  /**
   * 获取或创建对话
   * @param userId
   * @param receiverPhoneHash
   * @param receiverPhoneMask
   */
  async getOrCreate(userId: number, receiverPhoneHash: string, receiverPhoneMask: string) {
    let conversation = await this.conversationInfoEntity.findOneBy({
      userId: Equal(userId),
      receiverPhoneHash,
      status: Equal(1),
    });
    if (!conversation) {
      conversation = await this.conversationInfoEntity.save({
        userId,
        receiverPhoneHash,
        receiverPhoneMask,
        lastMsgIsReply: 0,
        unreadCount: 0,
        msgCount: 0,
        isReceiverUnsubscribed: 0,
        isMarked: 0,
        status: 1,
      });
    }
    return conversation;
  }

  /**
   * 添加时间线记录
   * @param conversationId
   * @param data
   */
  async addTimelineItem(conversationId: number, data: Partial<ConversationTimelineEntity>) {
    return await this.conversationTimelineEntity.save({
      conversationId,
      ...data,
      status: 1,
    });
  }

  /**
   * 更新最后消息
   * @param conversationId
   * @param content
   * @param isReply
   */
  async updateLastMsg(conversationId: number, content: string, isReply: number) {
    await this.conversationInfoEntity.update(
      { id: Equal(conversationId) },
      {
        lastMsgContent: content,
        lastMsgTime: new Date(),
        lastMsgIsReply: isReply,
      }
    );
    await this.conversationInfoEntity.increment(
      { id: Equal(conversationId) },
      'msgCount',
      1
    );
  }

  /**
   * 未读+1
   * @param conversationId
   */
  async incrementUnread(conversationId: number) {
    await this.conversationInfoEntity.increment(
      { id: Equal(conversationId) },
      'unreadCount',
      1
    );
  }

  /**
   * 标记已读
   * @param conversationId
   */
  async markRead(conversationId: number) {
    await this.conversationInfoEntity.update(
      { id: Equal(conversationId) },
      { unreadCount: 0 }
    );
  }

  /**
   * 获取对话中的消息列表
   * @param conversationId
   * @param page
   * @param size
   */
  async getMessages(conversationId: number, page: number, size: number) {
    const skip = (page - 1) * size;
    const [list, total] = await this.conversationTimelineEntity.findAndCount({
      where: {
        conversationId: Equal(conversationId),
        status: Equal(1),
      },
      order: { createTime: 'DESC' },
      skip,
      take: size,
    });
    return { list, total, page, size };
  }

  /**
   * 标记/取消标记
   * @param conversationId
   * @param isMarked
   * @param markType
   */
  async mark(conversationId: number, isMarked: number, markType: string) {
    await this.conversationInfoEntity.update(
      { id: Equal(conversationId) },
      { isMarked, markType }
    );
  }

  /**
   * 用户对话列表
   * @param userId
   * @param page
   * @param size
   */
  async list(userId: number, page: number, size: number) {
    const skip = (page - 1) * size;
    const [list, total] = await this.conversationInfoEntity.findAndCount({
      where: {
        userId: Equal(userId),
        status: Equal(1),
      },
      order: { lastMsgTime: 'DESC' },
      skip,
      take: size,
    });
    return { list, total, page, size };
  }
}
