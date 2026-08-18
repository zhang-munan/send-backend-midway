import { BaseService, CoolCommException } from '@cool-midway/core';
import { Inject, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import * as moment from 'moment';
import { Equal, In, Repository } from 'typeorm';
import { OrderInfoEntity } from '../../order/entity/info';
import { UserBalanceEntity } from '../../order/entity/balance';
import {
  ORDER_STATUS,
  REFUND_STATUS,
  OrderInfoService,
} from '../../order/service/info';
import { UserInfoEntity } from '../../user/entity/info';
import { appendControlRemark } from '../../base/utils/control-remark';
import { ControlAuditLogEntity } from '../entity/audit';

export const CONTROL_ACTION = {
  FORCE_REFUND: 'force_refund',
  ORDER_STATUS: 'order_status',
  USER_BENEFIT: 'user_benefit',
};

@Provide()
export class ControlWorkspaceService extends BaseService {
  @InjectEntityModel(ControlAuditLogEntity)
  auditEntity: Repository<ControlAuditLogEntity>;

  @InjectEntityModel(OrderInfoEntity)
  orderEntity: Repository<OrderInfoEntity>;

  @InjectEntityModel(UserInfoEntity)
  userEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(UserBalanceEntity)
  balanceEntity: Repository<UserBalanceEntity>;

  @Inject()
  orderInfoService: OrderInfoService;

  async summary() {
    await this.syncPendingRefundAudits();
    const monthStart = moment().startOf('month').format('YYYY-MM-DD HH:mm:ss');
    const thirtyDaysAgo = moment()
      .subtract(30, 'days')
      .format('YYYY-MM-DD HH:mm:ss');
    const [pendingRefunds, auditStats] = await Promise.all([
      this.orderEntity
        .createQueryBuilder('orders')
        .select(
          'SUM(CASE WHEN orders.refundStatus IN (1, 4, 5) THEN 1 ELSE 0 END)',
          'count'
        )
        .getRawOne(),
      this.auditEntity
        .createQueryBuilder('audit')
        .select(
          'SUM(CASE WHEN audit.createTime >= :monthStart THEN 1 ELSE 0 END)',
          'monthCount'
        )
        .addSelect(
          'COUNT(DISTINCT CASE WHEN audit.createTime >= :thirtyDaysAgo THEN audit.targetUserId END)',
          'affectedUsers'
        )
        .addSelect(
          'SUM(CASE WHEN audit.createTime >= :thirtyDaysAgo THEN 1 ELSE 0 END)',
          'recentTotal'
        )
        .addSelect(
          'SUM(CASE WHEN audit.createTime >= :thirtyDaysAgo AND audit.status = 2 THEN 1 ELSE 0 END)',
          'recentFailed'
        )
        .setParameters({ monthStart, thirtyDaysAgo })
        .getRawOne(),
    ]);
    const recentTotal = Number(auditStats?.recentTotal || 0);
    const recentFailed = Number(auditStats?.recentFailed || 0);
    return {
      pendingSpecialItems: Number(pendingRefunds?.count || 0),
      monthOperationCount: Number(auditStats?.monthCount || 0),
      affectedUserCount: Number(auditStats?.affectedUsers || 0),
      safetyScore: recentTotal
        ? Math.max(0, Math.round(100 - (recentFailed / recentTotal) * 100))
        : 100,
      updatedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
    };
  }

  async auditList(page = 1, size = 20) {
    await this.syncPendingRefundAudits();
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedSize = Math.min(100, Math.max(1, Number(size) || 20));
    const query = this.auditEntity
      .createQueryBuilder('audit')
      .leftJoin(UserInfoEntity, 'user', 'audit.targetUserId = user.id')
      .leftJoin(OrderInfoEntity, 'orders', 'audit.targetOrderId = orders.id')
      .select('audit.*')
      .addSelect('user.nickName', 'targetUserName')
      .addSelect('user.phone', 'targetUserPhone')
      .addSelect('orders.orderNo', 'targetOrderNo')
      .orderBy('audit.id', 'DESC')
      .skip((normalizedPage - 1) * normalizedSize)
      .take(normalizedSize);
    const [list, total] = await Promise.all([
      query.getRawMany(),
      this.auditEntity.count(),
    ]);
    return { list, total, page: normalizedPage, size: normalizedSize };
  }

  async searchUsers(keyword: string) {
    const value = String(keyword || '').trim();
    if (!value) return [];
    const query = this.userEntity
      .createQueryBuilder('user')
      .leftJoin(UserBalanceEntity, 'balance', 'balance.userId = user.id')
      .select([
        'user.id AS id',
        'user.nickName AS nickName',
        'user.phone AS phone',
        'user.avatarUrl AS avatarUrl',
        'user.status AS status',
        'COALESCE(balance.balance, 0) AS balance',
        'COALESCE(balance.messageQuota, 0) AS messageQuota',
      ])
      .where('user.nickName LIKE :keyword OR user.phone LIKE :keyword', {
        keyword: `%${value}%`,
      });
    if (/^\d+$/.test(value)) query.orWhere('user.id = :id', { id: value });
    return query.orderBy('user.id', 'DESC').limit(20).getRawMany();
  }

  async searchOrders(keyword: string, userId?: number, mode = 'all') {
    const value = String(keyword || '').trim();
    const query = this.orderEntity
      .createQueryBuilder('orders')
      .leftJoin(UserInfoEntity, 'user', 'orders.userId = user.id')
      .select('orders.*')
      .addSelect('user.nickName', 'userNickName')
      .addSelect('user.phone', 'userPhone');
    if (userId) query.andWhere('orders.userId = :userId', { userId });
    if (value) {
      query.andWhere(
        '(orders.orderNo LIKE :keyword OR orders.productName LIKE :keyword)',
        { keyword: `%${value}%` }
      );
    }
    if (mode === 'refund') {
      query
        .andWhere('orders.status = :paid', { paid: ORDER_STATUS.PAID })
        .andWhere('orders.payAmount > 0')
        .andWhere('orders.refundStatus NOT IN (:...refundStatuses)', {
          refundStatuses: [REFUND_STATUS.PROCESSING, REFUND_STATUS.REFUNDED],
        });
    }
    return query.orderBy('orders.createTime', 'DESC').limit(30).getRawMany();
  }

  async forceRefund(params: any, operator: any, ip?: string) {
    const orderId = Number(params.orderId);
    const order = await this.orderEntity.findOneBy({ id: Equal(orderId) });
    if (!order) throw new CoolCommException('订单不存在');
    if (params.userId && Number(params.userId) !== Number(order.userId)) {
      throw new CoolCommException('订单不属于所选用户');
    }
    const audit = await this.createAudit({
      actionType: CONTROL_ACTION.FORCE_REFUND,
      actionName: '强制退款',
      operator,
      targetUserId: order.userId,
      targetOrderId: order.id,
      reason: params.reason,
      beforeData: this.orderSnapshot(order),
      ip,
    });
    try {
      const result = await this.orderInfoService.forceRefund(
        order.id,
        params.reason,
        operator.userId,
        operator.username
      );
      await this.finishAudit(
        audit.id,
        result.refundStatus === REFUND_STATUS.REFUNDED ? 1 : 0,
        this.orderSnapshot(result)
      );
      return result;
    } catch (error) {
      await this.finishAudit(audit.id, 2, null, this.errorMessage(error));
      throw error;
    }
  }

  async repairOrderStatus(params: any, operator: any, ip?: string) {
    const orderId = Number(params.orderId);
    const targetStatus = Number(params.targetStatus);
    const reason = this.validateReason(params.reason);
    if (![0, 1, 2, 3].includes(targetStatus)) {
      throw new CoolCommException('目标订单状态不合法');
    }
    const order = await this.orderEntity.findOneBy({ id: Equal(orderId) });
    if (!order) throw new CoolCommException('订单不存在');
    if (params.userId && Number(params.userId) !== Number(order.userId)) {
      throw new CoolCommException('订单不属于所选用户');
    }
    if (targetStatus === Number(order.status)) {
      throw new CoolCommException('订单已经是目标状态');
    }
    this.validateOrderRepair(order, targetStatus);
    const audit = await this.createAudit({
      actionType: CONTROL_ACTION.ORDER_STATUS,
      actionName: '订单状态修复',
      operator,
      targetUserId: order.userId,
      targetOrderId: order.id,
      reason,
      beforeData: this.orderSnapshot(order),
      ip,
    });
    try {
      const result = await this.orderEntity.manager.transaction(
        async manager => {
          const repository = manager.getRepository(OrderInfoEntity);
          const locked = await repository.findOne({
            where: { id: Equal(orderId) },
            lock: { mode: 'pessimistic_write' },
          });
          if (!locked || locked.status !== order.status) {
            throw new CoolCommException('订单状态已变化，请刷新后重试');
          }
          await repository.update(orderId, {
            status: targetStatus,
            remark: appendControlRemark(
              locked.remark,
              reason,
              operator.username
            ),
          });
          return repository.findOneBy({ id: Equal(orderId) });
        }
      );
      await this.finishAudit(audit.id, 1, this.orderSnapshot(result));
      return result;
    } catch (error) {
      await this.finishAudit(audit.id, 2, null, this.errorMessage(error));
      throw error;
    }
  }

  async adjustUserBenefit(params: any, operator: any, ip?: string) {
    const userId = Number(params.userId);
    const balanceDelta = Math.round(Number(params.balanceDelta || 0));
    const quotaDelta = Math.trunc(Number(params.quotaDelta || 0));
    const reason = this.validateReason(params.reason);
    if (!userId) throw new CoolCommException('请选择目标用户');
    if (
      !Number.isSafeInteger(balanceDelta) ||
      !Number.isSafeInteger(quotaDelta)
    ) {
      throw new CoolCommException('权益调整数值不合法');
    }
    if (balanceDelta === 0 && quotaDelta === 0) {
      throw new CoolCommException('余额和消息次数至少调整一项');
    }
    if (Math.abs(balanceDelta) > 100000000 || Math.abs(quotaDelta) > 1000000) {
      throw new CoolCommException('单次调整数值超过安全上限');
    }
    const user = await this.userEntity.findOneBy({ id: Equal(userId) });
    if (!user) throw new CoolCommException('用户不存在');
    await this.ensureBalance(userId);
    const before = await this.balanceEntity.findOneBy({
      userId: Equal(userId),
    });
    const audit = await this.createAudit({
      actionType: CONTROL_ACTION.USER_BENEFIT,
      actionName: '用户权益调整',
      operator,
      targetUserId: userId,
      reason,
      beforeData: this.balanceSnapshot(before),
      ip,
    });
    try {
      const result = await this.balanceEntity.manager.transaction(
        async manager => {
          const repository = manager.getRepository(UserBalanceEntity);
          const locked = await repository.findOne({
            where: { userId: Equal(userId) },
            lock: { mode: 'pessimistic_write' },
          });
          if (!locked) {
            throw new CoolCommException('用户权益记录不存在，请刷新后重试');
          }
          const nextBalance = Number(locked.balance) + balanceDelta;
          const nextQuota = Number(locked.messageQuota) + quotaDelta;
          if (nextBalance < 0)
            throw new CoolCommException('调整后账户余额不能小于0');
          if (nextQuota < 0)
            throw new CoolCommException('调整后消息次数不能小于0');
          const updateResult = await repository.update(
            { userId: Equal(userId) },
            {
              balance: nextBalance,
              messageQuota: nextQuota,
            }
          );
          if (!updateResult.affected) {
            throw new CoolCommException('用户权益记录已变化，请刷新后重试');
          }
          return repository.findOneBy({ userId: Equal(userId) });
        }
      );
      await this.finishAudit(audit.id, 1, this.balanceSnapshot(result));
      return result;
    } catch (error) {
      await this.finishAudit(audit.id, 2, null, this.errorMessage(error));
      throw error;
    }
  }

  private validateOrderRepair(order: OrderInfoEntity, targetStatus: number) {
    if (
      targetStatus === ORDER_STATUS.PAID &&
      (!order.payTime || !order.tradeNo)
    ) {
      throw new CoolCommException('缺少支付时间或支付流水，不能修复为已支付');
    }
    if (
      targetStatus === ORDER_STATUS.PAID &&
      order.refundStatus === REFUND_STATUS.REFUNDED
    ) {
      throw new CoolCommException('订单已完成退款，不能修复为已支付');
    }
    if (
      targetStatus === ORDER_STATUS.REFUNDED &&
      (order.refundStatus !== REFUND_STATUS.REFUNDED || !order.refundTime)
    ) {
      throw new CoolCommException('退款尚未完成，不能修复为已退款');
    }
    if (
      [ORDER_STATUS.PENDING, ORDER_STATUS.CLOSED].includes(targetStatus) &&
      (order.payTime ||
        order.tradeNo ||
        order.refundTime ||
        order.refundStatus === REFUND_STATUS.REFUNDED)
    ) {
      throw new CoolCommException(
        '订单已有支付或退款事实，不能修复为待支付/已关闭'
      );
    }
  }

  private async createAudit(data: any) {
    const reason = this.validateReason(data.reason);
    return this.auditEntity.save(
      this.auditEntity.create({
        actionType: data.actionType,
        actionName: data.actionName,
        operatorId: Number(data.operator.userId),
        operatorName: String(data.operator.username || data.operator.userId),
        targetUserId: data.targetUserId || null,
        targetOrderId: data.targetOrderId || null,
        reason,
        beforeData: data.beforeData || null,
        afterData: null,
        status: 0,
        errorMessage: null,
        ip: data.ip || null,
      })
    );
  }

  private async finishAudit(
    id: number,
    status: number,
    afterData?: any,
    error?: string
  ) {
    await this.auditEntity.update(id, {
      status,
      afterData: afterData || null,
      errorMessage: error ? error.slice(0, 500) : null,
    });
  }

  private async ensureBalance(userId: number) {
    await this.balanceEntity
      .createQueryBuilder()
      .insert()
      .into(UserBalanceEntity)
      .values({
        userId,
        balance: 0,
        messageQuota: 0,
        totalRecharge: 0,
        totalConsumed: 0,
      })
      .orIgnore()
      // INSERT IGNORE 命中已有记录时没有新的自增 ID，禁止 TypeORM 回填实体，
      // 否则会抛出 "Cannot update entity because entity id is not set"。
      .updateEntity(false)
      .execute();
  }

  /** 将异步微信退款的最终订单状态回写到控制台审计日志。 */
  private async syncPendingRefundAudits() {
    const pending = await this.auditEntity.find({
      where: {
        actionType: CONTROL_ACTION.FORCE_REFUND,
        status: 0,
      },
      order: { id: 'ASC' },
      take: 100,
    });
    const orderIds = pending
      .map(item => Number(item.targetOrderId))
      .filter(Boolean);
    if (!orderIds.length) return;
    const orders = await this.orderEntity.findBy({ id: In(orderIds) });
    const orderMap = new Map(orders.map(order => [Number(order.id), order]));
    await Promise.all(
      pending.map(async audit => {
        const order = orderMap.get(Number(audit.targetOrderId));
        if (!order) return;
        if (order.refundStatus === REFUND_STATUS.REFUNDED) {
          await this.finishAudit(audit.id, 1, this.orderSnapshot(order));
        } else if (order.refundStatus === REFUND_STATUS.FAILED) {
          await this.finishAudit(
            audit.id,
            2,
            this.orderSnapshot(order),
            order.refundRejectReason || '退款失败'
          );
        }
      })
    );
  }

  private validateReason(value: string) {
    const reason = String(value || '').trim();
    if (reason.length < 10 || reason.length > 200) {
      throw new CoolCommException('操作原因需填写10-200个字');
    }
    return reason;
  }

  private orderSnapshot(order: OrderInfoEntity) {
    if (!order) return null;
    return {
      id: order.id,
      orderNo: order.orderNo,
      userId: order.userId,
      status: order.status,
      payAmount: Number(order.payAmount),
      payMethod: order.payMethod,
      refundStatus: order.refundStatus,
      refundAmount: Number(order.refundAmount || 0),
      refundNo: order.refundNo,
      isForceRefund: Number(order.isForceRefund || 0),
    };
  }

  private balanceSnapshot(balance: UserBalanceEntity) {
    if (!balance) return null;
    return {
      userId: balance.userId,
      balance: Number(balance.balance),
      messageQuota: Number(balance.messageQuota),
    };
  }

  private errorMessage(error: any) {
    return String(
      error?.message || error?.response?.body?.message || '操作失败'
    );
  }
}
