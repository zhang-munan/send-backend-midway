import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { ConversationInfoEntity } from '../entity/info';
import { ConversationTimelineEntity } from '../entity/timeline';
import { UserInfoEntity } from '../../user/entity/info';
import { MessageInfoEntity } from '../../message/entity/info';

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

  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  private async getUserPhone(userId: number) {
    const user = await this.userInfoEntity.findOneBy({ id: Equal(userId) });
    return user?.phone || null;
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
    const phone = await this.getUserPhone(userId);
    const where: any[] = [
      { id: Equal(conversationId), userId: Equal(userId), status: Equal(1) },
    ];
    if (phone) {
      where.push({
        id: Equal(conversationId),
        receiverPhone: Equal(phone),
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
   * 收件人回复会话时的服务端上下文。
   *
   * 匿名会话只返回“匿名用户”给客户端，真实手机号只在服务端用于投递；
   * 同时要求当前用户必须是原会话收件人，避免伪造 conversationId 获取号码。
   */
  async getReplyContext(userId: number, conversationId: number) {
    const { conversation, viewerRole } = await this.getAccessibleConversation(
      userId,
      conversationId
    );
    if (viewerRole !== 'receiver') {
      throw new CoolCommException('只有消息收件人可以回复该对话');
    }

    const [sender, firstMessage] = await Promise.all([
      this.userInfoEntity.findOneBy({ id: Equal(conversation.userId) }),
      this.messageInfoEntity.findOne({
        where: {
          conversationId: Equal(conversationId),
          userId: Equal(conversation.userId),
        },
        order: { createTime: 'ASC' },
      }),
    ]);
    if (!sender?.phone) {
      throw new CoolCommException('对方暂时无法接收回复');
    }

    // 缺少历史消息时按匿名处理，默认不向客户端暴露发送者手机号。
    const isPeerAnonymous = firstMessage?.isAnonymous !== 0;
    return {
      conversationId: conversation.id,
      receiverPhone: sender.phone,
      receiverPhoneDisplay: isPeerAnonymous ? '匿名用户' : sender.phone,
      isPeerAnonymous,
    };
  }

  /**
   * 原发送者继续发送时使用的上下文。
   *
   * 只允许会话发起人读取收件号码；发送时服务端仍会根据 conversationId
   * 再次锁定号码，避免客户端篡改收件人。
   */
  async getSendContext(userId: number, conversationId: number) {
    const { conversation, viewerRole } = await this.getAccessibleConversation(
      userId,
      conversationId
    );
    if (viewerRole !== 'sender') {
      throw new CoolCommException('只有消息发送者可以继续发送该对话');
    }
    return {
      conversationId: conversation.id,
      receiverPhone: conversation.receiverPhone,
    };
  }

  /** 发送前解析并锁定回复参数，调用方不得信任客户端传入的手机号和匿名状态。 */
  async prepareReplySend(userId: number, params: any) {
    const context = await this.getReplyContext(userId, params.conversationId);
    return {
      ...params,
      receiverPhone: context.receiverPhone,
      isAnonymous: 0,
      conversationId: context.conversationId,
      isConversationReply: true,
    };
  }

  /**
   * 校验带 conversationId 的发送请求，并根据当前用户角色锁定真实收件号码。
   * 原发起人可继续发送；原收件人走强制实名回复。
   */
  async prepareConversationSend(userId: number, params: any) {
    const { conversation, viewerRole } = await this.getAccessibleConversation(
      userId,
      params.conversationId
    );
    if (viewerRole === 'receiver') {
      return this.prepareReplySend(userId, params);
    }
    return {
      ...params,
      receiverPhone: conversation.receiverPhone,
      conversationId: conversation.id,
      isConversationReply: false,
    };
  }

  /** 获取某个发送用户在指定会话时间线中的方向（以原会话发起人为视角）。 */
  async getSenderDirection(conversationId: number, senderUserId: number) {
    const conversation = await this.conversationInfoEntity.findOneBy({
      id: Equal(conversationId),
      status: Equal(1),
    });
    if (!conversation) throw new CoolCommException('对话不存在');
    return this.isSameUserId(conversation.userId, senderUserId) ? 1 : 2;
  }

  /**
   * 获取或创建对话
   * @param userId
   * @param receiverPhone
   * @param receiverPhoneMask
   */
  async getOrCreate(
    userId: number,
    receiverPhone: string,
    receiverPhoneMask: string
  ) {
    let conversation = await this.conversationInfoEntity.findOneBy({
      userId: Equal(userId),
      receiverPhone,
      status: Equal(1),
    });
    if (!conversation) {
      conversation = await this.conversationInfoEntity.save({
        userId,
        receiverPhone,
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
    const phone = await this.getUserPhone(userId);
    const skip = (page - 1) * size;
    const where: any[] = [{ userId: Equal(userId), status: Equal(1) }];
    if (phone) {
      where.push({ receiverPhone: Equal(phone), status: Equal(1) });
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
