import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ConversationInfoEntity } from '../entity/info';
import { ConversationTimelineEntity } from '../entity/timeline';
import { UserInfoEntity } from '../../user/entity/info';

/**
 * 对话信息
 */
@Provide()
export class ConversationInfoService extends BaseService {
  @InjectEntityModel(ConversationInfoEntity)
  conversationInfoEntity: Repository<ConversationInfoEntity>;

  @InjectEntityModel(ConversationTimelineEntity)
  conversationTimelineEntity: Repository<ConversationTimelineEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  private async getUserPhoneHash(userId: number) {
    const user = await this.userInfoEntity.findOneBy({ id: Equal(userId) });
    if (!user?.phone) return null;
    return crypto.createHash('sha256').update(user.phone).digest('hex');
  }

  /** MySQL bigint 可能由驱动返回 string，身份判断时统一按字符串比较。 */
  private isSameUserId(left: number | string, right: number | string) {
    return String(left) === String(right);
  }

  /**
   * 当前用户既可以访问自己发起的会话，也可以访问发往其绑定手机号的会话。
   */
  private async getAccessibleConversation(
    userId: number,
    conversationId: number
  ) {
    const phoneHash = await this.getUserPhoneHash(userId);
    const where: any[] = [
      { id: Equal(conversationId), userId: Equal(userId), status: Equal(1) },
    ];
    if (phoneHash) {
      where.push({
        id: Equal(conversationId),
        receiverPhoneHash: Equal(phoneHash),
        status: Equal(1),
      });
    }
    const conversation = await this.conversationInfoEntity.findOne({ where });
    if (!conversation) throw new CoolCommException('对话不存在');
    return {
      conversation,
      viewerRole: this.isSameUserId(conversation.userId, userId)
        ? 'sender'
        : 'receiver',
    } as const;
  }

  /**
   * 获取或创建对话
   * @param userId
   * @param receiverPhoneHash
   * @param receiverPhoneMask
   */
  async getOrCreate(
    userId: number,
    receiverPhoneHash: string,
    receiverPhoneMask: string
  ) {
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
  async addTimelineItem(
    conversationId: number,
    data: Partial<ConversationTimelineEntity>
  ) {
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
  async updateLastMsg(
    conversationId: number,
    content: string,
    isReply: number
  ) {
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
  async markRead(userId: number, conversationId: number) {
    const { viewerRole } = await this.getAccessibleConversation(
      userId,
      conversationId
    );
    // unreadCount 表示发送方收到的未读回复，收件人查看时不能替发送方清零。
    if (viewerRole === 'receiver') return;
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
  async getMessages(
    userId: number,
    conversationId: number,
    page: number,
    size: number
  ) {
    const { viewerRole } = await this.getAccessibleConversation(
      userId,
      conversationId
    );
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
    if (viewerRole === 'receiver') {
      return {
        list: list.map(item => ({
          ...item,
          // 时间线方向是以会话发起人为视角保存，收件人查看时需要反转。
          direction: item.direction === 1 ? 2 : 1,
          feeAmount: null,
          smsCount: null,
          payType: null,
        })),
        total,
        page,
        size,
      };
    }
    return { list, total, page, size };
  }

  /**
   * 标记/取消标记
   * @param conversationId
   * @param isMarked
   * @param markType
   */
  async mark(
    userId: number,
    conversationId: number,
    isMarked: number,
    markType: string
  ) {
    const { viewerRole } = await this.getAccessibleConversation(
      userId,
      conversationId
    );
    if (viewerRole === 'receiver') {
      throw new CoolCommException('收到的对话暂不支持标记');
    }
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
    const phoneHash = await this.getUserPhoneHash(userId);
    const skip = (page - 1) * size;
    const where: any[] = [{ userId: Equal(userId), status: Equal(1) }];
    if (phoneHash) {
      where.push({ receiverPhoneHash: Equal(phoneHash), status: Equal(1) });
    }
    const [list, total] = await this.conversationInfoEntity.findAndCount({
      where,
      order: { lastMsgTime: 'DESC' },
      skip,
      take: size,
    });
    return {
      list: list.map(conversation => {
        const viewerRole = this.isSameUserId(conversation.userId, userId)
          ? 'sender'
          : 'receiver';
        return {
          ...conversation,
          viewerRole,
          peerLabel:
            viewerRole === 'receiver'
              ? '收到的消息'
              : conversation.receiverPhoneMask,
          // 该字段属于发送方，不能作为收件人的未读数展示。
          unreadCount: viewerRole === 'receiver' ? 0 : conversation.unreadCount,
          lastMsgIsReply:
            viewerRole === 'receiver'
              ? conversation.lastMsgIsReply === 1
                ? 0
                : 1
              : conversation.lastMsgIsReply,
        };
      }),
      total,
      page,
      size,
    };
  }
}
