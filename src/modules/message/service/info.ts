import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MessageInfoEntity } from '../entity/info';
import { MessageReplyEntity } from '../entity/reply';
import { UserBalanceService } from '../../order/service/balance';
import { ConversationInfoService } from '../../conversation/service/info';

/**
 * 消息信息
 */
@Provide()
export class MessageInfoService extends BaseService {
  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  @InjectEntityModel(MessageReplyEntity)
  messageReplyEntity: Repository<MessageReplyEntity>;

  @Inject()
  userBalanceService: UserBalanceService;

  @Inject()
  conversationInfoService: ConversationInfoService;

  /**
   * 发送消息（需先有足够的消息配额）
   * @param userId 用户ID
   * @param params 消息参数
   */
  async sendMessage(userId: number, params: any) {
    const {
      receiverPhone,
      content,
      templateId,
      conversationId,
      isAnonymous,
      senderSignature,
      sendType,
      scheduledAt,
    } = params;

    // 验证手机号格式（11位数字）
    if (!receiverPhone || !/^1\d{10}$/.test(receiverPhone)) {
      throw new CoolCommException('手机号格式不正确，需为11位手机号');
    }

    // 验证内容长度（1-500）
    if (!content || content.length < 1 || content.length > 500) {
      throw new CoolCommException('消息内容长度需在1-500字之间');
    }

    // 定时发送必须传入定时时间
    if (sendType === 2 && !scheduledAt) {
      throw new CoolCommException('定时发送需设置发送时间');
    }

    // 检查发送频率限制
    await this.checkQuota(userId, receiverPhone);

    // 计算字数
    const contentLength = content.length;

    // 计算计费条数（70字/条）
    const smsCount = Math.ceil(contentLength / 70);

    // 检查用户消息配额（直接调用 sendMessage 时必须有足够配额）
    const balance = await this.userBalanceService.getBalance(userId);
    if (balance.messageQuota < smsCount) {
      throw new CoolCommException(
        `消息条数不足（剩余 ${balance.messageQuota} 条，本次需 ${smsCount} 条），请先购买套餐`
      );
    }

    // 计算脱敏号码
    const receiverPhoneMask =
      receiverPhone.substring(0, 3) + '****' + receiverPhone.substring(7);

    // 生成手机号哈希（SHA256）
    const receiverPhoneHash = crypto
      .createHash('sha256')
      .update(receiverPhone)
      .digest('hex');

    // 计算费用
    const feeAmount = this.calculateFee(content);

    // 创建消息记录
    const messageInfo = new MessageInfoEntity();
    messageInfo.userId = userId;
    messageInfo.templateId = templateId || null;
    messageInfo.conversationId = conversationId || null;
    messageInfo.receiverPhone = receiverPhone;
    messageInfo.receiverPhoneMask = receiverPhoneMask;
    messageInfo.receiverPhoneHash = receiverPhoneHash;
    messageInfo.content = content;
    messageInfo.contentLength = contentLength;
    messageInfo.smsCount = smsCount;
    messageInfo.isAnonymous = isAnonymous !== undefined ? isAnonymous : 1;
    messageInfo.senderSignature = senderSignature || null;
    messageInfo.sendType = sendType || 1;
    messageInfo.scheduledAt = scheduledAt || null;
    messageInfo.status = 0; // 待审核
    messageInfo.auditStatus = 0; // 待审核
    messageInfo.feeAmount = feeAmount;
    messageInfo.clientIp = params.clientIp || null;

    const savedMessage = await this.messageInfoEntity.save(messageInfo);

    await this.createConversationTimeline(
      savedMessage,
      receiverPhoneHash,
      receiverPhoneMask
    );

    // 扣减用户消息配额
    await this.userBalanceService.deductQuota(userId, smsCount, feeAmount);

    return savedMessage;
  }

  /**
   * 创建/更新对话及发出消息时间线
   */
  private async createConversationTimeline(
    message: MessageInfoEntity,
    receiverPhoneHash: string,
    receiverPhoneMask: string
  ) {
    const conversation = message.conversationId
      ? { id: message.conversationId }
      : await this.conversationInfoService.getOrCreate(
          message.userId,
          receiverPhoneHash,
          receiverPhoneMask
        );

    if (!message.conversationId) {
      message.conversationId = conversation.id;
      await this.messageInfoEntity.update(message.id, {
        conversationId: conversation.id,
      });
    }

    await this.conversationInfoService.addTimelineItem(conversation.id, {
      messageId: message.id,
      direction: 1,
      contentPreview: message.content.slice(0, 100),
      feeAmount: message.feeAmount,
    });
    await this.conversationInfoService.updateLastMsg(
      conversation.id,
      message.content.slice(0, 100),
      0
    );
  }

  /**
   * 取消定时消息
   * @param userId 用户ID
   * @param messageId 消息ID
   */
  async cancelMessage(userId: number, messageId: number) {
    const message = await this.messageInfoEntity.findOneBy({
      id: Equal(messageId),
      userId: Equal(userId),
    });
    if (!message) {
      throw new CoolCommException('消息不存在');
    }
    if (message.status !== 3) {
      throw new CoolCommException('仅待发送状态的消息可取消');
    }
    message.status = 7; // 已取消
    await this.messageInfoEntity.save(message);
    return message;
  }

  /**
   * 重新发送失败消息
   * @param userId 用户ID
   * @param messageId 消息ID
   */
  async resendMessage(userId: number, messageId: number) {
    const message = await this.messageInfoEntity.findOneBy({
      id: Equal(messageId),
      userId: Equal(userId),
    });
    if (!message) {
      throw new CoolCommException('消息不存在');
    }
    if (message.status !== 6) {
      throw new CoolCommException('仅发送失败的消息可重新发送');
    }
    message.status = 3; // 待发送
    message.retryCount = (message.retryCount || 0) + 1;
    message.failReason = null;
    await this.messageInfoEntity.save(message);
    return message;
  }

  /**
   * 检查发送频率限制
   * @param userId 用户ID
   * @param receiverPhone 收件人手机号
   */
  async checkQuota(userId: number, receiverPhone: string) {
    const receiverPhoneHash = crypto
      .createHash('sha256')
      .update(receiverPhone)
      .digest('hex');

    // 查询最近1小时内该用户对同一手机号的发送次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.messageInfoEntity.count({
      where: {
        userId: Equal(userId),
        receiverPhoneHash: Equal(receiverPhoneHash),
        createTime: MoreThan(oneHourAgo) as any,
      },
    });

    // 每小时最多发送10条
    if (count >= 10) {
      throw new CoolCommException('发送过于频繁，请稍后再试');
    }
    return true;
  }

  /**
   * 计算费用
   * @param content 消息内容
   */
  calculateFee(content: string) {
    const smsCount = Math.ceil(content.length / 70);
    // 每条0.05元
    return Number((smsCount * 0.05).toFixed(2));
  }

  /**
   * 发送记录列表
   */
  async recordList(params) {
    const { page = 1, size = 10, userId, status } = params;
    const where: any = { userId: Equal(userId) };
    if (status !== undefined && status !== '') {
      where.status = Equal(status);
    }
    const [list, total] = await this.messageInfoEntity.findAndCount({
      where,
      order: { createTime: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, total, page, size };
  }

  /**
   * 消息详情
   */
  async messageDetail(userId: number, id: number) {
    const message = await this.messageInfoEntity.findOneBy({
      id: Equal(id),
      userId: Equal(userId),
    });
    if (!message) {
      throw new CoolCommException('消息不存在');
    }
    const reply = await this.messageReplyEntity.findOne({
      where: { messageId: Equal(id) },
      order: { receivedAt: 'ASC' },
    });
    return { ...message, reply: reply || null };
  }

  /**
   * 审核消息
   * @param id 消息ID
   * @param auditStatus 审核状态 1通过 2拒绝 3转人工
   * @param auditRemark 审核备注
   */
  async auditMessage(id: number, auditStatus: number, auditRemark?: string) {
    const message = await this.messageInfoEntity.findOneBy({ id: Equal(id) });
    if (!message) {
      throw new CoolCommException('消息不存在');
    }
    if (message.auditStatus !== 0) {
      throw new CoolCommException('该消息已审核');
    }

    message.auditStatus = auditStatus;
    message.auditRemark = auditRemark || null;
    message.auditedAt = new Date();

    // 审核通过后，立即发送状态设为待发送
    if (auditStatus === 1) {
      message.status = 1; // 审核通过
      // 如果是立即发送，直接设为待发送
      if (message.sendType === 1) {
        message.status = 3; // 待发送
      }
    } else if (auditStatus === 2) {
      message.status = 2; // 审核拒绝
    } else if (auditStatus === 3) {
      message.status = 0; // 转人工，保持待审核
    }

    await this.messageInfoEntity.save(message);
    return message;
  }
}
