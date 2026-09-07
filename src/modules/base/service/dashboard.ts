import { BaseService } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import * as moment from 'moment';
import { Repository } from 'typeorm';
import { AdbSmsDispatchEntity } from '../../message/entity/adb_sms_dispatch';
import { MessageInfoEntity } from '../../message/entity/info';
import { OrderInfoEntity } from '../../order/entity/info';
import { UserInfoEntity } from '../../user/entity/info';

export type DashboardRange = 'day' | 'week' | 'month' | 'year';

const MESSAGE_STATUS_NAMES = [
  '待审核',
  '审核通过',
  '审核拒绝',
  '待发送',
  '发送中',
  '已送达',
  '发送失败',
  '已取消',
];

/**
 * PC 管理端首页统计。
 *
 * 金额统一以“分”返回，避免浮点精度丢失；消息量按 smsCount（实际计费短信条数）统计。
 */
@Provide()
export class BaseDashboardService extends BaseService {
  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

  @InjectEntityModel(AdbSmsDispatchEntity)
  adbSmsDispatchEntity: Repository<AdbSmsDispatchEntity>;

  @InjectEntityModel(OrderInfoEntity)
  orderInfoEntity: Repository<OrderInfoEntity>;

  async summary() {
    const now = moment();
    const todayStart = now.clone().startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const tomorrowStart = now
      .clone()
      .add(1, 'day')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');
    const yesterdayStart = now
      .clone()
      .subtract(1, 'day')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');
    const yearStart = now.clone().startOf('year').format('YYYY-MM-DD HH:mm:ss');
    const nextYearStart = now
      .clone()
      .add(1, 'year')
      .startOf('year')
      .format('YYYY-MM-DD HH:mm:ss');

    const [
      users,
      messages,
      orders,
      hourlyRows,
      monthlyRows,
      statusRows,
      deviceRows,
    ] =
      await Promise.all([
        this.userInfoEntity
          .createQueryBuilder('user')
          .select('COUNT(*)', 'total')
          .addSelect(
            'SUM(CASE WHEN user.createTime >= :todayStart AND user.createTime < :tomorrowStart THEN 1 ELSE 0 END)',
            'today'
          )
          .addSelect(
            'SUM(CASE WHEN user.createTime >= :yesterdayStart AND user.createTime < :todayStart THEN 1 ELSE 0 END)',
            'yesterday'
          )
          .setParameters({ todayStart, tomorrowStart, yesterdayStart })
          .getRawOne(),
        this.messageInfoEntity
          .createQueryBuilder('message')
          .select('COALESCE(SUM(message.smsCount), 0)', 'total')
          .addSelect(
            'COALESCE(SUM(CASE WHEN message.createTime >= :todayStart AND message.createTime < :tomorrowStart THEN message.smsCount ELSE 0 END), 0)',
            'today'
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN message.status = 5 THEN message.smsCount ELSE 0 END), 0)',
            'delivered'
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN message.status = 6 THEN message.smsCount ELSE 0 END), 0)',
            'failed'
          )
          .setParameters({ todayStart, tomorrowStart })
          .getRawOne(),
        this.orderInfoEntity
          .createQueryBuilder('orders')
          .select(
            'SUM(CASE WHEN orders.status = 1 AND orders.payAmount > 0 AND COALESCE(orders.payMethod, 0) != 4 THEN 1 ELSE 0 END)',
            'paidCount'
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN orders.status = 1 AND COALESCE(orders.payMethod, 0) != 4 THEN orders.payAmount ELSE 0 END), 0)',
            'revenue'
          )
          .addSelect(
            'SUM(CASE WHEN orders.status = 1 AND orders.payAmount > 0 AND COALESCE(orders.payMethod, 0) != 4 AND orders.payTime >= :todayStart AND orders.payTime < :tomorrowStart THEN 1 ELSE 0 END)',
            'todayPaidCount'
          )
          .addSelect(
            'COALESCE(SUM(CASE WHEN orders.status = 1 AND COALESCE(orders.payMethod, 0) != 4 AND orders.payTime >= :todayStart AND orders.payTime < :tomorrowStart THEN orders.payAmount ELSE 0 END), 0)',
            'todayRevenue'
          )
          .setParameters({ todayStart, tomorrowStart })
          .getRawOne(),
        this.messageInfoEntity
          .createQueryBuilder('message')
          .select("DATE_FORMAT(message.createTime, '%H')", 'hour')
          .addSelect('COALESCE(SUM(message.smsCount), 0)', 'count')
          .where('message.createTime >= :todayStart')
          .andWhere('message.createTime < :tomorrowStart')
          .setParameters({ todayStart, tomorrowStart })
          .groupBy("DATE_FORMAT(message.createTime, '%H')")
          .getRawMany(),
        this.orderInfoEntity
          .createQueryBuilder('orders')
          .select("DATE_FORMAT(orders.payTime, '%m')", 'month')
          .addSelect('COUNT(*)', 'orderCount')
          .addSelect('COALESCE(SUM(orders.payAmount), 0)', 'revenue')
          .where('orders.status = 1')
          .andWhere('COALESCE(orders.payMethod, 0) != 4')
          .andWhere('orders.payTime >= :yearStart')
          .andWhere('orders.payTime < :nextYearStart')
          .setParameters({ yearStart, nextYearStart })
          .groupBy("DATE_FORMAT(orders.payTime, '%m')")
          .getRawMany(),
        this.messageInfoEntity
          .createQueryBuilder('message')
          .select('message.status', 'status')
          .addSelect('COALESCE(SUM(message.smsCount), 0)', 'count')
          .groupBy('message.status')
          .orderBy('message.status', 'ASC')
          .getRawMany(),
        this.adbSmsDispatchEntity
          .createQueryBuilder('dispatch')
          .innerJoin(
            MessageInfoEntity,
            'message',
            'message.id = dispatch.messageId'
          )
          .select('dispatch.deviceSerial', 'device')
          .addSelect('COALESCE(SUM(message.smsCount), 0)', 'count')
          .where('message.status = :deliveredStatus', { deliveredStatus: 5 })
          .groupBy('dispatch.deviceSerial')
          .orderBy('count', 'DESC')
          .addOrderBy('dispatch.deviceSerial', 'ASC')
          .getRawMany(),
      ]);

    const totalUsers = this.toNumber(users?.total);
    const todayUsers = this.toNumber(users?.today);
    const yesterdayUsers = this.toNumber(users?.yesterday);
    const delivered = this.toNumber(messages?.delivered);
    const failed = this.toNumber(messages?.failed);
    const finalized = delivered + failed;

    const hourlyMap = new Map(
      hourlyRows.map(row => [this.toNumber(row.hour), this.toNumber(row.count)])
    );
    const monthlyMap = new Map(
      monthlyRows.map(row => [
        this.toNumber(row.month),
        {
          orderCount: this.toNumber(row.orderCount),
          revenue: this.toNumber(row.revenue),
        },
      ])
    );

    return {
      users: {
        total: totalUsers,
        today: todayUsers,
        yesterday: yesterdayUsers,
        dayOverDayRate: this.changeRate(todayUsers, yesterdayUsers),
      },
      messages: {
        total: this.toNumber(messages?.total),
        today: this.toNumber(messages?.today),
        devices: deviceRows.map(row => ({
          device: String(row.device),
          count: this.toNumber(row.count),
        })),
        hourly: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          count: hourlyMap.get(hour) || 0,
        })),
      },
      orders: {
        paidCount: this.toNumber(orders?.paidCount),
        todayPaidCount: this.toNumber(orders?.todayPaidCount),
      },
      revenue: {
        total: this.toNumber(orders?.revenue),
        today: this.toNumber(orders?.todayRevenue),
      },
      delivery: {
        delivered,
        failed,
        rate: finalized
          ? Number(((delivered / finalized) * 100).toFixed(2))
          : 0,
      },
      monthly: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        orderCount: monthlyMap.get(index + 1)?.orderCount || 0,
        revenue: monthlyMap.get(index + 1)?.revenue || 0,
      })),
      messageStatuses: statusRows.map(row => ({
        status: this.toNumber(row.status),
        name: MESSAGE_STATUS_NAMES[this.toNumber(row.status)] || '未知状态',
        count: this.toNumber(row.count),
      })),
      year: now.year(),
      updatedAt: now.format('YYYY-MM-DD HH:mm:ss'),
    };
  }

  async ranking(range = 'day') {
    const normalizedRange = this.normalizeRange(range);
    const rangeUnit = normalizedRange === 'week' ? 'isoWeek' : normalizedRange;
    const startMoment = moment().startOf(rangeUnit);
    const start = startMoment.format('YYYY-MM-DD HH:mm:ss');
    const end = startMoment
      .clone()
      .add(1, normalizedRange)
      .format('YYYY-MM-DD HH:mm:ss');

    const rows = await this.orderInfoEntity
      .createQueryBuilder('orders')
      .select("COALESCE(NULLIF(orders.productName, ''), '未命名业务')", 'name')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(orders.payAmount), 0)', 'revenue')
      .addSelect('MAX(orders.payTime)', 'latestPayTime')
      .where('orders.status = 1')
      .andWhere('COALESCE(orders.payMethod, 0) != 4')
      .andWhere('orders.payTime >= :start')
      .andWhere('orders.payTime < :end')
      .setParameters({ start, end })
      .groupBy("COALESCE(NULLIF(orders.productName, ''), '未命名业务')")
      .orderBy('orderCount', 'DESC')
      .addOrderBy('revenue', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      range: normalizedRange,
      list: rows.map(row => ({
        name: row.name,
        orderCount: this.toNumber(row.orderCount),
        revenue: this.toNumber(row.revenue),
        latestPayTime: row.latestPayTime,
      })),
    };
  }

  private normalizeRange(range: string): DashboardRange {
    return ['day', 'week', 'month', 'year'].includes(range)
      ? (range as DashboardRange)
      : 'day';
  }

  private toNumber(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  private changeRate(current: number, previous: number): number | null {
    if (!previous) return null;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }
}
