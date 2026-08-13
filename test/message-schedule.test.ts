import { MessageInfoService } from '../src/modules/message/service/info';
import {
  normalizeSendSchedule,
  parseScheduledAt,
} from '../src/modules/message/service/schedule';

describe('消息发送时间校验', () => {
  const now = new Date('2026-08-12T02:00:00.000Z'); // 上海时间 10:00

  it('立即发送会清空无关的定时时间', () => {
    expect(
      normalizeSendSchedule(1, '2026-08-13 12:00:00', { now })
    ).toEqual({ sendType: 1, scheduledAt: null });
  });

  it('将不带时区的客户端时间按上海时区解释', () => {
    expect(parseScheduledAt('2026-08-12 10:30:00').toISOString()).toBe(
      '2026-08-12T02:30:00.000Z'
    );
  });

  it('接受携带显式时区的 ISO 时间', () => {
    expect(parseScheduledAt('2026-08-12T10:30:00+08:00').toISOString()).toBe(
      '2026-08-12T02:30:00.000Z'
    );
  });

  it.each([
    [3, null, '发送类型'],
    [true, null, '发送类型'],
    [2, null, '需设置发送时间'],
    [2, '2026-02-30 10:00:00', '格式不正确'],
    [2, '2026-02-30T10:00:00+08:00', '格式不正确'],
    [2, '2026-08-12T10:00:00+15:00', '格式不正确'],
    [2, '2026-08-12 09:59:59', '必须晚于当前时间'],
  ])('拒绝非法参数 %#', (sendType, scheduledAt, message) => {
    expect(() =>
      normalizeSendSchedule(sendType, scheduledAt, { now })
    ).toThrow(message as string);
  });
});

describe('定时消息状态处理', () => {
  it.each([1, 3])('允许取消兼容状态 %s 的定时消息', async status => {
    const service = new MessageInfoService();
    const update = jest.fn(async () => ({ affected: 1 }));
    service.messageInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 10,
        userId: 2,
        sendType: 2,
        status,
      })),
      update,
    } as any;

    await expect(service.cancelMessage(2, 10)).resolves.toMatchObject({
      status: 7,
      failReason: '用户取消定时发送',
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('条件更新失败时拒绝取消已被 worker 抢占的任务', async () => {
    const service = new MessageInfoService();
    service.messageInfoEntity = {
      findOneBy: jest.fn(async () => ({
        id: 10,
        userId: 2,
        sendType: 2,
        status: 3,
      })),
      update: jest.fn(async () => ({ affected: 0 })),
    } as any;

    await expect(service.cancelMessage(2, 10)).rejects.toThrow(
      '消息已开始发送'
    );
  });

  it('失败的定时消息重新发送时改为立即待发送', async () => {
    const service = new MessageInfoService();
    const message: any = {
      id: 10,
      userId: 2,
      receiverPhone: '13800138000',
      sendType: 2,
      scheduledAt: new Date('2026-08-12T02:30:00Z'),
      status: 6,
      retryCount: 0,
      failReason: 'ADB 错误',
    };
    service.messageInfoEntity = {
      findOneBy: jest.fn(async () => message),
      save: jest.fn(async value => value),
    } as any;
    service.messageBlacklistService = {
      assertCanSend: jest.fn(),
    } as any;

    await expect(service.resendMessage(2, 10)).resolves.toMatchObject({
      status: 3,
      sendType: 1,
      scheduledAt: null,
      retryCount: 1,
      failReason: null,
    });
  });

  it('审核通过的定时消息统一进入待发送状态', async () => {
    const service = new MessageInfoService();
    const message: any = {
      id: 10,
      userId: 2,
      receiverPhone: '13800138000',
      sendType: 2,
      scheduledAt: new Date('2026-08-12T01:00:00Z'),
      status: 0,
      auditStatus: 0,
    };
    service.messageInfoEntity = {
      findOneBy: jest.fn(async () => message),
      save: jest.fn(async value => value),
    } as any;
    service.messageBlacklistService = {
      assertCanSend: jest.fn(),
    } as any;

    await expect(service.auditMessage(10, 1)).resolves.toMatchObject({
      auditStatus: 1,
      status: 3,
    });
  });
});
