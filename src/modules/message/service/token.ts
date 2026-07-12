import { Provide } from '@midwayjs/core';
import * as crypto from 'crypto';

export interface ReplyToken {
  conversationId: number;
  messageId: number;
  receiverPhone: string;
  timestamp: number;
}

/**
 * Encrypts the data embedded in a public reply link.  The token deliberately
 * contains no database state so links can be verified by every application
 * instance without sticky sessions.
 */
@Provide()
export class ReplyTokenService {
  static readonly MAX_AGE_MS = 24 * 60 * 60 * 1000;

  /** Kept as a method to make the service straightforward to configure in tests. */
  protected getSecret(): string | undefined {
    return process.env.REPLY_TOKEN_SECRET;
  }

  private getKey(): Buffer | null {
    const secret = this.getSecret();
    if (!secret) return null;
    // AES-256 requires exactly 32 bytes. Hashing also permits normal env secrets.
    return crypto.createHash('sha256').update(secret).digest();
  }

  generateReplyToken(
    conversationId: number,
    messageId: number,
    receiverPhone: string
  ): string {
    const key = this.getKey();
    if (!key) {
      throw new Error('REPLY_TOKEN_SECRET is not configured');
    }
    const payload: ReplyToken = {
      conversationId,
      messageId,
      receiverPhone,
      timestamp: Date.now(),
    };
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64url'
    );
  }

  parseReplyToken(token: string): ReplyToken | null {
    const key = this.getKey();
    if (!key || !token || typeof token !== 'string') return null;
    try {
      const raw = Buffer.from(token, 'base64url');
      // 12-byte IV + 16-byte GCM authentication tag + a non-empty payload.
      if (raw.length <= 28) return null;
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        raw.subarray(0, 12)
      );
      decipher.setAuthTag(raw.subarray(12, 28));
      const payload = JSON.parse(
        Buffer.concat([
          decipher.update(raw.subarray(28)),
          decipher.final(),
        ]).toString('utf8')
      ) as ReplyToken;
      if (
        !Number.isSafeInteger(payload.conversationId) ||
        !Number.isSafeInteger(payload.messageId) ||
        !/^1\d{10}$/.test(payload.receiverPhone) ||
        !Number.isFinite(payload.timestamp) ||
        payload.timestamp > Date.now() + 60 * 1000 ||
        Date.now() - payload.timestamp > ReplyTokenService.MAX_AGE_MS
      ) {
        return null;
      }
      return payload;
    } catch (_) {
      return null;
    }
  }
}
