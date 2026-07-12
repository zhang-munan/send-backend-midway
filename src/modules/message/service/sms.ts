import { Inject, Provide } from '@midwayjs/core';
import { CoolCommException } from '@cool-midway/core';
import { ReplyTokenService } from './token';

/**
 * Outbound message SMS composer. The actual gateway adapter is intentionally
 * injected by the deployment because installed SMS plugins use different APIs.
 */
@Provide()
export class MessageSmsService {
  @Inject()
  replyTokenService: ReplyTokenService;

  buildSmsContent(
    phone: string,
    content: string,
    conversationId: number,
    messageId: number
  ) {
    const token = this.replyTokenService.generateReplyToken(
      conversationId,
      messageId,
      phone
    );
    const baseUrl = process.env.REPLY_MINIPROGRAM_URL;
    if (!baseUrl) throw new CoolCommException('REPLY_MINIPROGRAM_URL 未配置');
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${content} 点击回复：${baseUrl}${separator}token=${encodeURIComponent(
      token
    )}`;
  }
}
