import { CoolCommException } from '@cool-midway/core';

export const BUSINESS_TIMEZONE_OFFSET = '+08:00';

export interface NormalizedSendSchedule {
  sendType: 1 | 2;
  scheduledAt: Date | null;
}

interface NormalizeOptions {
  /** 支付成功可能晚于用户选择的时间，此时应创建为已到期任务并尽快发送。 */
  allowPast?: boolean;
  now?: Date;
}

const NAIVE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const ZONED_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})$/i;

function assertWallClockParts(
  result: Date,
  parts: string[],
  offsetMinutes: number
) {
  const [year, month, day, hour, minute, second = '0', fraction = '0'] = parts;
  const milliseconds = Number(fraction.padEnd(3, '0'));
  const check = new Date(result.getTime() + offsetMinutes * 60 * 1000);
  if (
    check.getUTCFullYear() !== Number(year) ||
    check.getUTCMonth() + 1 !== Number(month) ||
    check.getUTCDate() !== Number(day) ||
    check.getUTCHours() !== Number(hour) ||
    check.getUTCMinutes() !== Number(minute) ||
    check.getUTCSeconds() !== Number(second) ||
    check.getUTCMilliseconds() !== milliseconds
  ) {
    throw new CoolCommException('定时发送时间格式不正确');
  }
}

function parseOffsetMinutes(offset: string): number {
  if (offset.toUpperCase() === 'Z') return 0;
  const sign = offset[0] === '-' ? -1 : 1;
  const compact = offset.slice(1).replace(':', '');
  const hours = Number(compact.slice(0, 2));
  const minutes = Number(compact.slice(2, 4));
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw new CoolCommException('定时发送时间格式不正确');
  }
  return sign * (hours * 60 + minutes);
}

/**
 * 解析客户端发送时间。没有携带时区的时间按业务时区 Asia/Shanghai 解释，
 * 携带 Z 或显式偏移量的 ISO 时间按其真实时间点解释。
 */
export function parseScheduledAt(value: unknown): Date {
  if (value instanceof Date) {
    const result = new Date(value.getTime());
    if (!Number.isNaN(result.getTime())) return result;
    throw new CoolCommException('定时发送时间格式不正确');
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new CoolCommException('定时发送需设置发送时间');
  }

  const raw = value.trim();
  const naive = NAIVE_DATE_TIME.exec(raw);
  const zoned = ZONED_DATE_TIME.exec(raw.replace(' ', 'T'));
  let result: Date;

  if (naive) {
    const [, year, month, day, hour, minute, second = '0', fraction = '0'] =
      naive;
    const milliseconds = Number(fraction.padEnd(3, '0'));
    const wallClockUtc = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      milliseconds
    );
    const businessOffsetMinutes = parseOffsetMinutes(BUSINESS_TIMEZONE_OFFSET);
    result = new Date(wallClockUtc - businessOffsetMinutes * 60 * 1000);
    // Date.UTC 会自动滚动 2 月 30 日、25 点等非法输入，因此逐项反查。
    assertWallClockParts(result, naive.slice(1), businessOffsetMinutes);
  } else {
    if (!zoned) {
      throw new CoolCommException('定时发送时间格式不正确');
    }
    const iso = raw.replace(' ', 'T');
    const offsetMinutes = parseOffsetMinutes(zoned[8]);
    result = new Date(iso);
    if (!Number.isNaN(result.getTime())) {
      assertWallClockParts(result, zoned.slice(1, 8), offsetMinutes);
    }
  }

  if (Number.isNaN(result.getTime())) {
    throw new CoolCommException('定时发送时间格式不正确');
  }
  return result;
}

/** 统一并校验立即发送/定时发送参数。 */
export function normalizeSendSchedule(
  sendTypeValue: unknown,
  scheduledAtValue: unknown,
  options: NormalizeOptions = {}
): NormalizedSendSchedule {
  const rawSendType =
    sendTypeValue === undefined ||
    sendTypeValue === null ||
    sendTypeValue === ''
      ? 1
      : sendTypeValue;
  const sendType =
    typeof rawSendType === 'number'
      ? rawSendType
      : typeof rawSendType === 'string' && /^[12]$/.test(rawSendType.trim())
      ? Number(rawSendType)
      : Number.NaN;

  if (!Number.isInteger(sendType) || ![1, 2].includes(sendType)) {
    throw new CoolCommException('发送类型只能是立即发送或定时发送');
  }

  if (sendType === 1) {
    return { sendType: 1, scheduledAt: null };
  }

  const scheduledAt = parseScheduledAt(scheduledAtValue);
  const now = options.now || new Date();
  if (!options.allowPast && scheduledAt.getTime() <= now.getTime()) {
    throw new CoolCommException('定时发送时间必须晚于当前时间');
  }

  return { sendType: 2, scheduledAt };
}
