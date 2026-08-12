import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, InjectClient, Provide } from '@midwayjs/core';
import { CachingFactory, MidwayCache } from '@midwayjs/cache-manager';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MessageInfoEntity } from '../entity/info';
import { MessageReplyEntity } from '../entity/reply';
import { ConversationInfoService } from '../../conversation/service/info';
import { ReplyToken, ReplyTokenService } from './token';

@Provide()
export class MessageReplyService extends BaseService {
  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  @InjectEntityModel(MessageReplyEntity)
  messageReplyEntity: Repository<MessageReplyEntity>;

  @Inject()
  replyTokenService: ReplyTokenService;

  @Inject()
  conversationInfoService: ConversationInfoService;

  @InjectClient(CachingFactory, 'default')
  midwayCache: MidwayCache;

  async getReplyInfo(token: string) {
    const tokenData = this.replyTokenService.parseReplyToken(token);
    if (!tokenData) throw new CoolCommException('链接已过期或无效', 400);
    const message = await this.getTokenMessage(tokenData);
    return {
      content: message.content,
      sendTime: message.deliveredAt,
      senderSignature: message.senderSignature,
    };
  }

  async sendReply(params: {
    token: string;
    content: string;
    replyPhone?: string;
    ip?: string;
  }) {
    const tokenData = this.replyTokenService.parseReplyToken(params.token);
    if (!tokenData) throw new CoolCommException('回复链接已过期或无效', 400);
    const content = this.validateContent(params.content);
    // A caller must not use the optional field to attribute a reply to another phone.
    if (params.replyPhone && params.replyPhone !== tokenData.receiverPhone) {
      throw new CoolCommException('回复手机号与链接不匹配', 400);
    }
    await this.checkQuota('token', params.token);
    if (params.ip) await this.checkQuota('ip', params.ip, 60);
    const message = await this.getTokenMessage(tokenData);

    const reply = await this.messageReplyEntity.save({
      messageId: tokenData.messageId,
      conversationId: tokenData.conversationId,
      replyContent: content,
      replyPhone: tokenData.receiverPhone,
      replyType: 1,
      isRead: 0,
      receivedAt: new Date(),
    });
    const messageDirection =
      await this.conversationInfoService.getSenderDirection(
        tokenData.conversationId,
        message.userId
      );
    const replyDirection = messageDirection === 1 ? 2 : 1;
    await this.conversationInfoService.updateLastMsg(
      tokenData.conversationId,
      content.slice(0, 100),
      replyDirection === 2 ? 1 : 0
    );
    if (replyDirection === 2) {
      await this.conversationInfoService.incrementUnread(
        tokenData.conversationId
      );
    }
    await this.conversationInfoService.addTimelineItem(
      tokenData.conversationId,
      {
        replyId: reply.id,
        direction: replyDirection,
        contentPreview: content.slice(0, 100),
      }
    );
    return reply;
  }

  private async getTokenMessage(tokenData: ReplyToken) {
    const message = await this.messageInfoEntity.findOneBy({
      id: Equal(tokenData.messageId),
      conversationId: Equal(tokenData.conversationId),
      receiverPhone: Equal(tokenData.receiverPhone),
    });
    if (!message) throw new CoolCommException('消息不存在或链接无效', 404);
    return message;
  }

  private validateContent(content: string) {
    const value = typeof content === 'string' ? content.trim() : '';
    if (!value || value.length > 500) {
      throw new CoolCommException('回复内容需在1-500字之间', 400);
    }
    // This is a baseline sanitation check. Integrate the platform moderation
    // provider here when one is configured; this project has none at present.
    if (new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]').test(value)) {
      throw new CoolCommException('回复内容包含非法字符', 400);
    }
    return value;
  }

  private async checkQuota(scope: 'token' | 'ip', identity: string, max = 10) {
    const digest = crypto.createHash('sha256').update(identity).digest('hex');
    const key = `message:reply:${scope}:${digest}`;
    const count = Number((await this.midwayCache.get(key)) || 0);
    if (count >= max)
      throw new CoolCommException('回复过于频繁，请稍后再试', 429);
    await this.midwayCache.set(key, count + 1, 60 * 60 * 1000);
  }
}
