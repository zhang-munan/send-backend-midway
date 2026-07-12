import { ReplyTokenService } from '../src/modules/message/service/token';
import { MessageSmsService } from '../src/modules/message/service/sms';

describe('ReplyTokenService', () => {
  const service = new ReplyTokenService();
  const originalSecret = process.env.REPLY_TOKEN_SECRET;

  beforeEach(() => {
    process.env.REPLY_TOKEN_SECRET = 'test-reply-token-secret';
  });

  afterAll(() => {
    process.env.REPLY_TOKEN_SECRET = originalSecret;
  });

  it('encrypts and parses reply data', () => {
    const token = service.generateReplyToken(12, 34, '13800138000');
    expect(service.parseReplyToken(token)).toMatchObject({
      conversationId: 12,
      messageId: 34,
      receiverPhone: '13800138000',
    });
  });

  it('rejects a tampered token', () => {
    const token = service.generateReplyToken(12, 34, '13800138000');
    expect(service.parseReplyToken(`${token.slice(0, -1)}A`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = Date.now;
    Date.now = () => now() - ReplyTokenService.MAX_AGE_MS - 1;
    const token = service.generateReplyToken(12, 34, '13800138000');
    Date.now = now;
    expect(service.parseReplyToken(token)).toBeNull();
  });

  it('adds a reply link whose token identifies the message', () => {
    process.env.REPLY_MINIPROGRAM_URL = 'https://mp.weixin.qq.com/s/reply';
    const smsService = new MessageSmsService();
    smsService.replyTokenService = service;
    const content = smsService.buildSmsContent(
      '13800138000',
      '你好',
      12,
      34
    );
    const token = new URL(content.slice(content.indexOf('https://'))).searchParams.get(
      'token'
    );
    expect(content).toContain('点击回复：https://mp.weixin.qq.com/s/reply?token=');
    expect(service.parseReplyToken(token)).toMatchObject({
      conversationId: 12,
      messageId: 34,
    });
  });
});
