import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Between, Equal, In, MoreThan, Repository } from 'typeorm';
import { MessageInfoEntity } from '../entity/info';
import { MessageReplyEntity } from '../entity/reply';
import { OrderInfoService } from '../../order/service/info';
import { calculateSmsFee } from './pricing';
import { MessageBlacklistService } from './blacklist';
import { ConversationInfoService } from '../../conversation/service/info';
import { normalizeSendSchedule } from './schedule';

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
  orderInfoService: OrderInfoService;

  @Inject()
  messageBlacklistService: MessageBlacklistService;

  @Inject()
  conversationInfoService: ConversationInfoService;

  /** APP 端不返回消息记录中存储的真实号码。 */
  private toAppMessage(message: MessageInfoEntity) {
    const { receiverPhone, ...safeMessage } = message;
    return safeMessage;
  }

  /**
   * 使用套餐配额发送消息，并生成对应的套餐余额订单。
   * @param userId 用户ID
   * @param params 消息参数
   */
  async sendMessage(userId: number, params: any) {
    const sendParams = params.conversationId
      ? await this.conversationInfoService.prepareConversationSend(
          userId,
          params
        )
      : params;
    const { receiverPhone, content, sendType, scheduledAt } = sendParams;

    // 验证手机号格式（11位数字）
    if (!receiverPhone || !/^1\d{10}$/.test(receiverPhone)) {
      throw new CoolCommException('手机号格式不正确，需为11位手机号');
    }

    // 验证内容长度（1-500）
    if (!content || content.length < 1 || content.length > 500) {
      throw new CoolCommException('消息内容长度需在1-500字之间');
    }

    const schedule = normalizeSendSchedule(sendType, scheduledAt);

    // 检查发送频率限制
    await this.checkQuota(userId, receiverPhone);

    return this.orderInfoService.sendByPackageBalance(userId, {
      ...sendParams,
      ...schedule,
    });
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
    if (message.sendType !== 2) {
      throw new CoolCommException('仅定时发送的消息可取消');
    }
    if (![1, 3].includes(message.status)) {
      throw new CoolCommException('仅待发送状态的消息可取消');
    }
    // 条件更新与 Python 的 status=4 抢占互斥，避免任务开始发送后仍被取消。
    const result = await this.messageInfoEntity.update(
      {
        id: Equal(messageId),
        userId: Equal(userId),
        sendType: Equal(2),
        status: In([1, 3]),
      },
      { status: 7, failReason: '用户取消定时发送' }
    );
    if (!result.affected) {
      throw new CoolCommException('消息已开始发送，无法取消');
    }
    message.status = 7;
    message.failReason = '用户取消定时发送';
    return this.toAppMessage(message);
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
    await this.messageBlacklistService.assertCanSend(
      userId,
      message.receiverPhone
    );
    message.status = 3; // 待发送
    // “重新发送”表示现在重新入队，不再沿用已经过期的原定时时间。
    message.sendType = 1;
    message.scheduledAt = null;
    message.retryCount = (message.retryCount || 0) + 1;
    message.failReason = null;
    await this.messageInfoEntity.save(message);
    return this.toAppMessage(message);
  }

  /**
   * 检查发送频率限制
   * @param userId 用户ID
   * @param receiverPhone 收件人手机号
   */
  async checkQuota(userId: number, receiverPhone: string) {
    await this.messageBlacklistService.assertCanSend(userId, receiverPhone);
    // 查询最近1小时内该用户对同一手机号的发送次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.messageInfoEntity.count({
      where: {
        userId: Equal(userId),
        receiverPhone: Equal(receiverPhone),
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
    return calculateSmsFee(content);
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
    return {
      list: list.map(message => this.toAppMessage(message)),
      total,
      page,
      size,
    };
  }

  /**
   * 广场公开消息。只暴露审核通过的内容和回复，避免泄露手机号、用户 ID 等私密字段。
   */
  async publicList(page: number, size: number) {
    const skip = (page - 1) * size;
    const qb = this.messageInfoEntity
      .createQueryBuilder('message')
      .leftJoin(
        MessageReplyEntity,
        'reply',
        'reply.messageId = message.id AND reply.replyType = 1'
      )
      .where('message.isPublic = :isPublic', { isPublic: 1 })
      .andWhere('message.auditStatus = :auditStatus', { auditStatus: 1 })
      .select([
        'message.id AS id',
        'message.content AS content',
        'message.isAnonymous AS isAnonymous',
        'message.senderSignature AS senderSignature',
        'message.createTime AS createTime',
        'reply.replyContent AS replyContent',
        'reply.receivedAt AS replyTime',
      ])
      .orderBy('message.createTime', 'DESC')
      .skip(skip)
      .take(size);

    const [list, total] = await Promise.all([qb.getRawMany(), qb.getCount()]);
    return { list, total, page, size };
  }

  /** 首页最近动态：当前用户当日发送、收到回复与已送达消息数。 */
  async recentActivity(userId: number) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);

    const [sentCount, replyCount, deliveredCount] = await Promise.all([
      this.messageInfoEntity.count({
        where: {
          userId: Equal(userId),
          createTime: Between(start, end) as any,
        },
      }),
      this.messageReplyEntity
        .createQueryBuilder('reply')
        .innerJoin(MessageInfoEntity, 'message', 'message.id = reply.messageId')
        .where('message.userId = :userId', { userId })
        .andWhere('reply.replyType = :replyType', { replyType: 1 })
        .andWhere('reply.receivedAt BETWEEN :start AND :end', { start, end })
        .getCount(),
      this.messageInfoEntity.count({
        where: {
          userId: Equal(userId),
          status: 5,
          deliveredAt: Between(start, end) as any,
        },
      }),
    ]);

    return {
      sentCount,
      replyCount,
      deliveredCount,
      date: start.toISOString(),
    };
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
    return {
      ...this.toAppMessage(message),
      reply: reply ? { ...reply, replyPhone: null } : null,
    };
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

    // 审核通过后进入待发送；具体发送时机由 sendType/scheduledAt 决定。
    if (auditStatus === 1) {
      await this.messageBlacklistService.assertCanSend(
        message.userId,
        message.receiverPhone
      );
      Object.assign(
        message,
        normalizeSendSchedule(message.sendType, message.scheduledAt, {
          // 审核可能晚于用户选择的时间，到期后应尽快发送而不是永久卡住。
          allowPast: true,
        })
      );
      // 审核状态由 auditStatus 表达；通过后无论发送类型都统一进入待发送。
      // Python 领取时再根据 sendType/scheduledAt 判断定时任务是否到期。
      message.status = 3;
    } else if (auditStatus === 2) {
      message.status = 2; // 审核拒绝
    } else if (auditStatus === 3) {
      message.status = 0; // 转人工，保持待审核
    }

    await this.messageInfoEntity.save(message);
    return message;
  }
}
