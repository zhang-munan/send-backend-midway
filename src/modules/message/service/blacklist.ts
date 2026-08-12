import { BaseService, CoolCommException } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, In, Repository } from 'typeorm';
import { ConversationInfoEntity } from '../../conversation/entity/info';
import { UserInfoEntity } from '../../user/entity/info';
import { MessageBlacklistEntity } from '../entity/blacklist';
import { MessageInfoEntity } from '../entity/info';

export const BLACKLIST_BLOCKED_MESSAGE = '对方已将你拉黑，无法继续发送短信';

/** 短信拉黑业务服务。 */
@Provide()
export class MessageBlacklistService extends BaseService {
  @InjectEntityModel(MessageBlacklistEntity)
  blacklistEntity: Repository<MessageBlacklistEntity>;

  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  @InjectEntityModel(ConversationInfoEntity)
  conversationInfoEntity: Repository<ConversationInfoEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  private sameId(left: number | string, right: number | string) {
    return String(left) === String(right);
  }

  /** 返回指定收件手机号是否已拉黑该发送账号。 */
  async isSenderBlocked(senderUserId: number, receiverPhone: string) {
    if (!receiverPhone) return false;
    const receiver = await this.userInfoEntity.findOneBy({
      phone: Equal(receiverPhone),
      status: Equal(1),
    });
    if (!receiver || this.sameId(receiver.id, senderUserId)) return false;
    return Boolean(
      await this.blacklistEntity.findOneBy({
        blockerUserId: Equal(receiver.id),
        blockedUserId: Equal(senderUserId),
        status: Equal(1),
      })
    );
  }

  async assertCanSend(senderUserId: number, receiverPhone: string) {
    if (await this.isSenderBlocked(senderUserId, receiverPhone)) {
      throw new CoolCommException(BLACKLIST_BLOCKED_MESSAGE);
    }
  }

  /** 校验当前用户确实是该会话收件人，避免越权拉黑。 */
  private async getReceiverConversation(
    userId: number,
    conversationId: number
  ) {
    const user = await this.userInfoEntity.findOneBy({
      id: Equal(userId),
      status: Equal(1),
    });
    if (!user?.phone) throw new CoolCommException('请先绑定手机号');
    const conversation = await this.conversationInfoEntity.findOneBy({
      id: Equal(conversationId),
      receiverPhone: Equal(user.phone),
      status: Equal(1),
    });
    if (!conversation || this.sameId(conversation.userId, userId)) {
      throw new CoolCommException('只能拉黑向你发送消息的用户');
    }
    return conversation;
  }

  private async deliveredCount(conversationId: number) {
    return this.messageInfoEntity.count({
      where: {
        conversationId: Equal(conversationId),
        status: Equal(5),
      },
    });
  }

  /** 会话详情页的拉黑按钮状态。 */
  async conversationState(userId: number, conversationId: number) {
    const conversation = await this.getReceiverConversation(
      userId,
      conversationId
    );
    const [deliveredMessageCount, active] = await Promise.all([
      this.deliveredCount(conversation.id),
      this.blacklistEntity.findOneBy({
        blockerUserId: Equal(userId),
        blockedUserId: Equal(conversation.userId),
        status: Equal(1),
      }),
    ]);
    return {
      // 收件人可以随时拉黑发送者；保留字段以兼容旧版客户端。
      canBlock: true,
      isBlocked: Boolean(active),
      blacklistId: active?.id || null,
      deliveredMessageCount,
      requiredMessageCount: 0,
    };
  }

  /** 拉黑并取消尚未进入设备发送阶段的待发短信。 */
  async block(userId: number, conversationId: number) {
    const conversation = await this.getReceiverConversation(
      userId,
      conversationId
    );
    const deliveredMessageCount = await this.deliveredCount(conversation.id);

    const now = new Date();
    const existing = await this.blacklistEntity.findOneBy({
      blockerUserId: Equal(userId),
      blockedUserId: Equal(conversation.userId),
    });
    let record: MessageBlacklistEntity;
    if (existing) {
      await this.blacklistEntity.update(existing.id, {
        sourceConversationId: conversation.id,
        deliveredMessageCount,
        lastMessagePreview: (conversation.lastMsgContent || '').slice(0, 100),
        blockedAt: now,
        unblockedAt: null,
        status: 1,
      });
      record = await this.blacklistEntity.findOneBy({
        id: Equal(existing.id),
      });
      if (!record) throw new CoolCommException('拉黑状态更新失败，请重试');
    } else {
      record = await this.blacklistEntity.save({
        blockerUserId: userId,
        blockedUserId: conversation.userId,
        sourceConversationId: conversation.id,
        deliveredMessageCount,
        lastMessagePreview: (conversation.lastMsgContent || '').slice(0, 100),
        blockedAt: now,
        unblockedAt: null,
        status: 1,
      });
    }

    // 发送中的任务可能已在手机上进入确认阶段，不能贸然回滚；worker 会在发送前再次校验。
    await this.messageInfoEntity.update(
      {
        userId: Equal(conversation.userId),
        receiverPhone: Equal(conversation.receiverPhone),
        status: In([0, 1, 3]),
      },
      { status: 7, failReason: '收件人已拉黑发送者，系统自动取消' }
    );
    return record;
  }

  /** 当前用户的有效拉黑列表，不暴露被拉黑账号的手机号或身份。 */
  async list(userId: number, page = 1, size = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeSize = Math.min(100, Math.max(1, Number(size) || 20));
    const [list, total] = await this.blacklistEntity.findAndCount({
      where: { blockerUserId: Equal(userId), status: Equal(1) },
      order: { blockedAt: 'DESC' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    });
    return {
      list: list.map(item => ({
        id: item.id,
        sourceConversationId: item.sourceConversationId,
        deliveredMessageCount: item.deliveredMessageCount,
        lastMessagePreview: item.lastMessagePreview,
        blockedAt: item.blockedAt,
        label: '已拉黑的消息发送者',
      })),
      total,
      page: safePage,
      size: safeSize,
    };
  }

  async unblock(userId: number, id: number) {
    const record = await this.blacklistEntity.findOneBy({
      id: Equal(id),
      blockerUserId: Equal(userId),
      status: Equal(1),
    });
    if (!record) throw new CoolCommException('拉黑记录不存在或已解除');
    await this.blacklistEntity.update(record.id, {
      status: 0,
      unblockedAt: new Date(),
    });
  }

  async adminUnblock(id: number) {
    const record = await this.blacklistEntity.findOneBy({
      id: Equal(id),
      status: Equal(1),
    });
    if (!record) throw new CoolCommException('拉黑记录不存在或已解除');
    await this.blacklistEntity.update(record.id, {
      status: 0,
      unblockedAt: new Date(),
    });
  }
}
