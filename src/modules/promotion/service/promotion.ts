import { BaseService, CoolCommException } from '@cool-midway/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Provide } from '@midwayjs/core';
import { EntityManager, Equal, In, LessThanOrEqual, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PromotionConfigEntity } from '../entity/config';
import { PromotionAmbassadorEntity } from '../entity/ambassador';
import { PromotionReferralEntity } from '../entity/referral';
import { PromotionCommissionEntity } from '../entity/commission';
import { PromotionLedgerEntity } from '../entity/ledger';
import { PromotionWithdrawalEntity } from '../entity/withdrawal';
import { UserInfoEntity } from '../../user/entity/info';
import { UserBalanceEntity } from '../../order/entity/balance';
import { OrderInfoEntity } from '../../order/entity/info';
import { SettingDocEntity } from '../../setting/entity/doc';

export const COMMISSION_STATUS = { PENDING: 0, SETTLED: 1, REVERSED: 2 };
export const WITHDRAWAL_STATUS = {
  PENDING: 0,
  PROCESSING: 1,
  PAID: 2,
  REJECTED: 3,
  CANCELLED: 4,
};

const DEFAULT_CONFIG = {
  enabled: 1,
  referralRewardQuota: 2,
  commissionRateBps: 5000,
  settlementDays: 7,
  bindWindowHours: 24,
  minWithdrawAmount: 1000,
  maxWithdrawAmount: 500000,
  withdrawFeeRateBps: 0,
};

@Provide()
export class PromotionService extends BaseService {
  @InjectEntityModel(PromotionConfigEntity)
  configRepository: Repository<PromotionConfigEntity>;

  @InjectEntityModel(PromotionAmbassadorEntity)
  ambassadorRepository: Repository<PromotionAmbassadorEntity>;

  @InjectEntityModel(PromotionReferralEntity)
  referralRepository: Repository<PromotionReferralEntity>;

  @InjectEntityModel(PromotionCommissionEntity)
  commissionRepository: Repository<PromotionCommissionEntity>;

  @InjectEntityModel(PromotionLedgerEntity)
  ledgerRepository: Repository<PromotionLedgerEntity>;

  @InjectEntityModel(PromotionWithdrawalEntity)
  withdrawalRepository: Repository<PromotionWithdrawalEntity>;

  @InjectEntityModel(UserInfoEntity)
  userRepository: Repository<UserInfoEntity>;

  @InjectEntityModel(OrderInfoEntity)
  orderRepository: Repository<OrderInfoEntity>;

  @InjectEntityModel(SettingDocEntity)
  docRepository: Repository<SettingDocEntity>;

  async getConfig(): Promise<PromotionConfigEntity> {
    let config = await this.configRepository.findOneBy({ id: Equal(1) });
    if (!config) {
      config = await this.configRepository.save(
        this.configRepository.create({ id: 1, ...DEFAULT_CONFIG })
      );
    }
    return config;
  }

  async getSettings() {
    const [config, rules] = await Promise.all([
      this.getConfig(),
      this.docRepository.findOneBy({ docKey: Equal('ambassador_rules') }),
    ]);
    return {
      ...config,
      rulesTitle: rules?.title || '推广大使规则',
      rulesContent: rules?.content || '',
      rulesStatus: rules?.status ?? 1,
    };
  }

  async saveSettings(data: any) {
    const config = this.validateConfig(data);
    await this.configRepository.save({ id: 1, ...config });
    const existing = await this.docRepository.findOneBy({
      docKey: Equal('ambassador_rules'),
    });
    const rulesContent = String(data.rulesContent || '').trim();
    if (!rulesContent) throw new CoolCommException('推广规则内容不能为空');
    await this.docRepository.save({
      ...(existing || {}),
      docKey: 'ambassador_rules',
      title: String(data.rulesTitle || '推广大使规则').slice(0, 100),
      content: rulesContent,
      status: Number(data.rulesStatus) === 0 ? 0 : 1,
    });
    return this.getSettings();
  }

  private validateConfig(data: any) {
    const numberInRange = (key: string, min: number, max: number) => {
      const value = Math.round(Number(data[key]));
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new CoolCommException(`${key} 配置不合法`);
      }
      return value;
    };
    const config = {
      enabled: Number(data.enabled) === 0 ? 0 : 1,
      referralRewardQuota: numberInRange('referralRewardQuota', 0, 100),
      commissionRateBps: numberInRange('commissionRateBps', 0, 10000),
      settlementDays: numberInRange('settlementDays', 0, 365),
      bindWindowHours: numberInRange('bindWindowHours', 1, 720),
      minWithdrawAmount: numberInRange('minWithdrawAmount', 1, 100000000),
      maxWithdrawAmount: numberInRange('maxWithdrawAmount', 1, 100000000),
      withdrawFeeRateBps: numberInRange('withdrawFeeRateBps', 0, 10000),
    };
    if (config.maxWithdrawAmount < config.minWithdrawAmount) {
      throw new CoolCommException('单笔最高提现金额不能低于最低提现金额');
    }
    return config;
  }

  async applyAmbassador(userId: number) {
    const config = await this.getConfig();
    if (!config.enabled) throw new CoolCommException('推广大使计划暂未开放');
    const user = await this.userRepository.findOneBy({
      id: Equal(userId),
      status: Equal(1),
    });
    if (!user?.phone) throw new CoolCommException('请先绑定手机号再申请');
    const existing = await this.ambassadorRepository.findOneBy({
      userId: Equal(userId),
    });
    if (existing) return existing;

    const rules = await this.docRepository.findOneBy({
      docKey: Equal('ambassador_rules'),
      status: Equal(1),
    });
    if (!rules) throw new CoolCommException('推广规则尚未配置或未启用');
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await this.ambassadorRepository.save(
          this.ambassadorRepository.create({
            userId,
            promotionCode: await this.generatePromotionCode(),
            status: 1,
            agreedAt: new Date(),
            agreedRulesVersion: String(rules.updateTime || rules.id),
          })
        );
      } catch (error: any) {
        if (
          !String(error?.message || '')
            .toLowerCase()
            .includes('duplicate')
        )
          throw error;
      }
    }
    throw new CoolCommException('推广码生成失败，请稍后重试');
  }

  async setAmbassadorStatus(id: number, status: number) {
    if (![0, 1].includes(status)) throw new CoolCommException('状态不合法');
    const account = await this.ambassadorRepository.findOneBy({
      id: Equal(id),
    });
    if (!account) throw new CoolCommException('推广大使账户不存在');
    await this.ambassadorRepository.update(id, { status });
  }

  private async generatePromotionCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'YY';
    for (let i = 0; i < 8; i++)
      code += alphabet[crypto.randomInt(alphabet.length)];
    return code;
  }

  async bindReferral(userId: number, rawCode?: string) {
    const promotionCode = String(rawCode || '')
      .trim()
      .toUpperCase();
    if (!promotionCode) return null;
    const config = await this.getConfig();
    if (!config.enabled) throw new CoolCommException('推广活动暂未开放');
    const ambassador = await this.ambassadorRepository.findOneBy({
      promotionCode: Equal(promotionCode),
      status: Equal(1),
    });
    if (!ambassador) throw new CoolCommException('推广码不存在或已失效');
    if (ambassador.userId === userId)
      throw new CoolCommException('不能绑定自己的推广码');

    const user = await this.userRepository.findOneBy({ id: Equal(userId) });
    if (!user) throw new CoolCommException('用户不存在');
    const createdAt = new Date(user.createTime).getTime();
    if (
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > Number(config.bindWindowHours) * 3600000
    ) {
      throw new CoolCommException('推广码仅限新注册用户填写');
    }
    const paidOrderCount = await this.orderRepository.countBy({
      userId: Equal(userId),
      status: Equal(1),
    });
    if (paidOrderCount > 0)
      throw new CoolCommException('已产生消费的账号不能再绑定推广码');

    try {
      return await this.referralRepository.manager.transaction(
        async manager => {
          const referralRepo = manager.getRepository(PromotionReferralEntity);
          const existing = await referralRepo.findOneBy({
            referredUserId: Equal(userId),
          });
          if (existing) {
            if (existing.ambassadorId === ambassador.id) return existing;
            throw new CoolCommException('该账号已绑定其他推广码，不能更换');
          }
          const referral = await referralRepo.save(
            referralRepo.create({
              ambassadorId: ambassador.id,
              referredUserId: userId,
              promotionCode,
              rewardQuota: Number(config.referralRewardQuota),
              rewardGranted: 1,
              boundAt: new Date(),
            })
          );
          await manager
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
            .updateEntity(false)
            .execute();
          if (Number(config.referralRewardQuota) > 0) {
            await manager
              .createQueryBuilder()
              .update(UserBalanceEntity)
              .set({
                messageQuota: () =>
                  `messageQuota + ${Number(config.referralRewardQuota)}`,
              })
              .where('userId = :userId', { userId })
              .execute();
          }
          await manager
            .createQueryBuilder()
            .update(PromotionAmbassadorEntity)
            .set({ totalReferrals: () => 'totalReferrals + 1' })
            .where('id = :id', { id: ambassador.id })
            .execute();
          return referral;
        }
      );
    } catch (error: any) {
      // 同一登录请求并发到达时，唯一键保证只发放一次；后到请求按幂等成功处理。
      if (
        String(error?.message || '')
          .toLowerCase()
          .includes('duplicate')
      ) {
        const existing = await this.referralRepository.findOneBy({
          referredUserId: Equal(userId),
        });
        if (existing?.ambassadorId === ambassador.id) return existing;
      }
      throw error;
    }
  }

  /** 支付成功后幂等记录佣金。只统计真实第三方现金收入。 */
  async recordPaidOrder(orderId: number) {
    const order = await this.orderRepository.findOneBy({
      id: Equal(orderId),
      status: Equal(1),
    });
    if (
      !order ||
      ![1, 2].includes(Number(order.payMethod)) ||
      Number(order.payAmount) <= 0
    )
      return null;
    const referral = await this.referralRepository.findOneBy({
      referredUserId: Equal(order.userId),
    });
    if (!referral) return null;
    const ambassador = await this.ambassadorRepository.findOneBy({
      id: Equal(referral.ambassadorId),
      status: Equal(1),
    });
    if (!ambassador) return null;
    const existing = await this.commissionRepository.findOneBy({
      orderId: Equal(order.id),
    });
    if (existing) return existing;
    const config = await this.getConfig();
    const amount = Math.floor(
      (Number(order.payAmount) * Number(config.commissionRateBps)) / 10000
    );
    if (amount <= 0) return null;
    const availableAt = new Date(order.payTime || new Date());
    availableAt.setDate(availableAt.getDate() + Number(config.settlementDays));
    await this.commissionRepository
      .createQueryBuilder()
      .insert()
      .into(PromotionCommissionEntity)
      .values({
        ambassadorId: ambassador.id,
        referredUserId: order.userId,
        orderId: order.id,
        orderNo: order.orderNo,
        sourceAmount: Number(order.payAmount),
        commissionRateBps: Number(config.commissionRateBps),
        commissionAmount: amount,
        status: COMMISSION_STATUS.PENDING,
        availableAt,
      })
      .orIgnore()
      .execute();
    return this.commissionRepository.findOneBy({ orderId: Equal(order.id) });
  }

  /** 定时补偿支付回调与佣金入账之间的瞬时失败，并推进到期佣金。 */
  async reconcile(limit = 200) {
    const missingOrders = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin(PromotionReferralEntity, 'r', 'r.referredUserId = o.userId')
      .innerJoin(
        PromotionAmbassadorEntity,
        'a',
        'a.id = r.ambassadorId AND a.status = 1'
      )
      .leftJoin(PromotionCommissionEntity, 'c', 'c.orderId = o.id')
      .select('o.id', 'id')
      .where(
        'o.status = 1 AND o.payMethod IN (1, 2) AND o.payAmount > 0 AND c.id IS NULL'
      )
      .orderBy('o.id', 'ASC')
      .limit(limit)
      .getRawMany();
    for (const item of missingOrders)
      await this.recordPaidOrder(Number(item.id));

    const dueAccounts = await this.commissionRepository
      .createQueryBuilder('c')
      .select('DISTINCT c.ambassadorId', 'ambassadorId')
      .where('c.status = :status AND c.availableAt <= :now', {
        status: COMMISSION_STATUS.PENDING,
        now: new Date(),
      })
      .limit(limit)
      .getRawMany();
    for (const item of dueAccounts)
      await this.settleDueCommissions(Number(item.ambassadorId));
    return {
      commissionsCreated: missingOrders.length,
      accountsSettled: dueAccounts.length,
    };
  }

  async settleDueCommissions(ambassadorId: number) {
    await this.commissionRepository.manager.transaction(async manager => {
      const commissions = await manager
        .getRepository(PromotionCommissionEntity)
        .find({
          where: {
            ambassadorId: Equal(ambassadorId),
            status: Equal(COMMISSION_STATUS.PENDING),
            availableAt: LessThanOrEqual(new Date()),
          },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
      if (!commissions.length) return;
      const ambassador = await manager
        .getRepository(PromotionAmbassadorEntity)
        .findOne({
          where: { id: Equal(ambassadorId) },
          lock: { mode: 'pessimistic_write' },
        });
      if (!ambassador) return;
      for (const commission of commissions) {
        const amount = Number(commission.commissionAmount);
        ambassador.availableBalance =
          Number(ambassador.availableBalance) + amount;
        ambassador.totalCommission =
          Number(ambassador.totalCommission) + amount;
        await manager
          .getRepository(PromotionCommissionEntity)
          .update(commission.id, {
            status: COMMISSION_STATUS.SETTLED,
            settledAt: new Date(),
          });
        await this.appendLedger(
          manager,
          ambassador,
          1,
          amount,
          0,
          'commission',
          commission.id,
          `订单 ${commission.orderNo} 佣金结算`
        );
      }
      await manager.getRepository(PromotionAmbassadorEntity).save(ambassador);
    });
  }

  async reverseCommissionForOrder(
    orderId: number,
    reason: string,
    transactionManager?: EntityManager
  ) {
    const execute = async (manager: EntityManager) => {
      const commission = await manager
        .getRepository(PromotionCommissionEntity)
        .findOne({
          where: { orderId: Equal(orderId) },
          lock: { mode: 'pessimistic_write' },
        });
      if (!commission || commission.status === COMMISSION_STATUS.REVERSED)
        return;
      if (commission.status === COMMISSION_STATUS.SETTLED) {
        const ambassador = await manager
          .getRepository(PromotionAmbassadorEntity)
          .findOne({
            where: { id: Equal(commission.ambassadorId) },
            lock: { mode: 'pessimistic_write' },
          });
        if (ambassador) {
          const amount = Number(commission.commissionAmount);
          ambassador.availableBalance =
            Number(ambassador.availableBalance) - amount;
          ambassador.totalCommission = Math.max(
            Number(ambassador.totalCommission) - amount,
            0
          );
          await this.appendLedger(
            manager,
            ambassador,
            5,
            -amount,
            0,
            'commission',
            commission.id,
            reason
          );
          await manager
            .getRepository(PromotionAmbassadorEntity)
            .save(ambassador);
        }
      }
      await manager
        .getRepository(PromotionCommissionEntity)
        .update(commission.id, {
          status: COMMISSION_STATUS.REVERSED,
          reversedAt: new Date(),
          reverseReason: reason.slice(0, 200),
        });
    };
    if (transactionManager) return execute(transactionManager);
    return this.commissionRepository.manager.transaction(execute);
  }

  async overview(userId: number) {
    const ambassador = await this.ambassadorRepository.findOneBy({
      userId: Equal(userId),
    });
    const config = await this.getConfig();
    if (!ambassador)
      return { isAmbassador: false, config: this.publicConfig(config) };
    await this.settleDueCommissions(ambassador.id);
    const fresh = await this.ambassadorRepository.findOneBy({
      id: Equal(ambassador.id),
    });
    const pending = await this.commissionRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.commissionAmount), 0)', 'amount')
      .where('c.ambassadorId = :ambassadorId AND c.status = :status', {
        ambassadorId: ambassador.id,
        status: COMMISSION_STATUS.PENDING,
      })
      .getRawOne();
    return {
      isAmbassador: true,
      ambassador: fresh,
      pendingBalance: Number(pending?.amount || 0),
      config: this.publicConfig(config),
    };
  }

  private publicConfig(config: PromotionConfigEntity) {
    return {
      enabled: config.enabled,
      referralRewardQuota: config.referralRewardQuota,
      commissionRateBps: config.commissionRateBps,
      settlementDays: config.settlementDays,
      bindWindowHours: config.bindWindowHours,
      minWithdrawAmount: config.minWithdrawAmount,
      maxWithdrawAmount: config.maxWithdrawAmount,
      withdrawFeeRateBps: config.withdrawFeeRateBps,
    };
  }

  async commissionList(userId: number, page = 1, size = 20) {
    const ambassador = await this.requireAmbassador(userId);
    await this.settleDueCommissions(ambassador.id);
    const [list, total] = await this.commissionRepository.findAndCount({
      where: { ambassadorId: Equal(ambassador.id) },
      order: { createTime: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { list, pagination: { page, size, total } };
  }

  async referralList(userId: number, page = 1, size = 20) {
    const ambassador = await this.requireAmbassador(userId);
    const [list, total] = await this.referralRepository.findAndCount({
      where: { ambassadorId: Equal(ambassador.id) },
      order: { createTime: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    const users = list.length
      ? await this.userRepository.findBy({
          id: In(list.map(item => Number(item.referredUserId))),
        })
      : [];
    const userMap = new Map(users.map(user => [Number(user.id), user]));
    return {
      list: list.map(item => {
        const user = userMap.get(Number(item.referredUserId));
        return {
          ...item,
          referredUserName: user?.nickName || '新用户',
          referredUserPhone: this.maskAccount(user?.phone || ''),
        };
      }),
      pagination: { page, size, total },
    };
  }

  async withdrawalList(userId: number, page = 1, size = 20) {
    const ambassador = await this.requireAmbassador(userId);
    const [list, total] = await this.withdrawalRepository.findAndCount({
      where: { ambassadorId: Equal(ambassador.id) },
      order: { createTime: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return {
      list: list.map(item => ({
        ...item,
        accountNo: this.maskAccount(item.accountNo),
      })),
      pagination: { page, size, total },
    };
  }

  async applyWithdrawal(userId: number, data: any) {
    const ambassador = await this.requireAmbassador(userId);
    await this.settleDueCommissions(ambassador.id);
    const amount = Math.round(Number(data.amount));
    const method = Number(data.withdrawMethod);
    const accountName = String(data.accountName || '').trim();
    const accountNo = String(data.accountNo || '').trim();
    if (![1, 2, 3].includes(method))
      throw new CoolCommException('请选择正确的提现方式');
    if (accountName.length < 2 || accountName.length > 50)
      throw new CoolCommException('请填写真实收款人姓名');
    if (accountNo.length < 4 || accountNo.length > 120)
      throw new CoolCommException('请填写正确的收款账号');
    const config = await this.getConfig();
    if (
      amount < Number(config.minWithdrawAmount) ||
      amount > Number(config.maxWithdrawAmount)
    )
      throw new CoolCommException('提现金额不在允许范围内');
    return this.withdrawalRepository.manager.transaction(async manager => {
      const account = await manager
        .getRepository(PromotionAmbassadorEntity)
        .findOne({
          where: { id: Equal(ambassador.id), status: Equal(1) },
          lock: { mode: 'pessimistic_write' },
        });
      if (!account || Number(account.availableBalance) < amount)
        throw new CoolCommException('可提现余额不足');
      const feeAmount = Math.floor(
        (amount * Number(config.withdrawFeeRateBps)) / 10000
      );
      const withdrawal = await manager
        .getRepository(PromotionWithdrawalEntity)
        .save({
          ambassadorId: account.id,
          userId,
          withdrawalNo: this.generateWithdrawalNo(),
          amount,
          feeAmount,
          actualAmount: amount - feeAmount,
          withdrawMethod: method,
          accountName,
          accountNo,
          bankName:
            method === 3
              ? String(data.bankName || '')
                  .trim()
                  .slice(0, 100)
              : null,
          status: WITHDRAWAL_STATUS.PENDING,
        });
      account.availableBalance = Number(account.availableBalance) - amount;
      account.frozenBalance = Number(account.frozenBalance) + amount;
      await this.appendLedger(
        manager,
        account,
        2,
        -amount,
        amount,
        'withdrawal',
        withdrawal.id,
        `提现申请 ${withdrawal.withdrawalNo}`
      );
      await manager.getRepository(PromotionAmbassadorEntity).save(account);
      return { ...withdrawal, accountNo: this.maskAccount(accountNo) };
    });
  }

  async cancelWithdrawal(userId: number, id: number) {
    const ambassador = await this.requireAmbassador(userId);
    return this.withdrawalRepository.manager.transaction(async manager => {
      const withdrawal = await manager
        .getRepository(PromotionWithdrawalEntity)
        .findOne({
          where: { id: Equal(id), ambassadorId: Equal(ambassador.id) },
          lock: { mode: 'pessimistic_write' },
        });
      if (!withdrawal || withdrawal.status !== WITHDRAWAL_STATUS.PENDING)
        throw new CoolCommException('该提现申请不能取消');
      const account = await manager
        .getRepository(PromotionAmbassadorEntity)
        .findOne({
          where: { id: Equal(ambassador.id) },
          lock: { mode: 'pessimistic_write' },
        });
      account.availableBalance =
        Number(account.availableBalance) + Number(withdrawal.amount);
      account.frozenBalance = Math.max(
        Number(account.frozenBalance) - Number(withdrawal.amount),
        0
      );
      withdrawal.status = WITHDRAWAL_STATUS.CANCELLED;
      withdrawal.auditRemark = '用户主动取消';
      await this.appendLedger(
        manager,
        account,
        3,
        Number(withdrawal.amount),
        -Number(withdrawal.amount),
        'withdrawal',
        withdrawal.id,
        '提现申请取消，资金退回'
      );
      await manager.getRepository(PromotionAmbassadorEntity).save(account);
      await manager.getRepository(PromotionWithdrawalEntity).save(withdrawal);
    });
  }

  async auditWithdrawal(
    id: number,
    action: string,
    adminUserId: number,
    data: any
  ) {
    if (!['approve', 'reject', 'paid'].includes(action))
      throw new CoolCommException('不支持的审核操作');
    return this.withdrawalRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(PromotionWithdrawalEntity);
      const withdrawal = await repo.findOne({
        where: { id: Equal(id) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!withdrawal) throw new CoolCommException('提现记录不存在');
      const account = await manager
        .getRepository(PromotionAmbassadorEntity)
        .findOne({
          where: { id: Equal(withdrawal.ambassadorId) },
          lock: { mode: 'pessimistic_write' },
        });
      if (action === 'approve') {
        if (withdrawal.status !== WITHDRAWAL_STATUS.PENDING)
          throw new CoolCommException('只有待审核申请可以通过');
        withdrawal.status = WITHDRAWAL_STATUS.PROCESSING;
        withdrawal.auditTime = new Date();
        withdrawal.auditUserId = adminUserId;
        withdrawal.auditRemark =
          String(data.remark || '').slice(0, 200) || null;
      } else if (action === 'reject') {
        if (
          ![WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING].includes(
            withdrawal.status
          )
        )
          throw new CoolCommException('当前状态不能驳回');
        const remark = String(data.remark || '').trim();
        if (remark.length < 2) throw new CoolCommException('请填写驳回原因');
        account.availableBalance =
          Number(account.availableBalance) + Number(withdrawal.amount);
        account.frozenBalance = Math.max(
          Number(account.frozenBalance) - Number(withdrawal.amount),
          0
        );
        withdrawal.status = WITHDRAWAL_STATUS.REJECTED;
        withdrawal.auditTime = new Date();
        withdrawal.auditUserId = adminUserId;
        withdrawal.auditRemark = remark.slice(0, 200);
        await this.appendLedger(
          manager,
          account,
          3,
          Number(withdrawal.amount),
          -Number(withdrawal.amount),
          'withdrawal',
          withdrawal.id,
          `提现驳回：${remark}`
        );
        await manager.getRepository(PromotionAmbassadorEntity).save(account);
      } else {
        if (withdrawal.status !== WITHDRAWAL_STATUS.PROCESSING)
          throw new CoolCommException('只有打款中的申请可以确认到账');
        const tradeNo = String(data.paymentTradeNo || '').trim();
        if (tradeNo.length < 4) throw new CoolCommException('请填写打款流水号');
        account.frozenBalance = Math.max(
          Number(account.frozenBalance) - Number(withdrawal.amount),
          0
        );
        account.totalWithdrawn =
          Number(account.totalWithdrawn) + Number(withdrawal.amount);
        withdrawal.status = WITHDRAWAL_STATUS.PAID;
        withdrawal.paidAt = new Date();
        withdrawal.paymentTradeNo = tradeNo.slice(0, 100);
        withdrawal.auditRemark =
          String(data.remark || withdrawal.auditRemark || '').slice(0, 200) ||
          null;
        await this.appendLedger(
          manager,
          account,
          4,
          0,
          -Number(withdrawal.amount),
          'withdrawal',
          withdrawal.id,
          `提现已打款：${tradeNo}`
        );
        await manager.getRepository(PromotionAmbassadorEntity).save(account);
      }
      await repo.save(withdrawal);
      return withdrawal;
    });
  }

  private async requireAmbassador(userId: number) {
    const ambassador = await this.ambassadorRepository.findOneBy({
      userId: Equal(userId),
      status: Equal(1),
    });
    if (!ambassador) throw new CoolCommException('您还不是推广大使');
    return ambassador;
  }

  private async appendLedger(
    manager: EntityManager,
    ambassador: PromotionAmbassadorEntity,
    entryType: number,
    availableChange: number,
    frozenChange: number,
    bizType: string,
    bizId: number,
    remark: string
  ) {
    await manager.getRepository(PromotionLedgerEntity).save({
      ambassadorId: ambassador.id,
      entryType,
      availableChange,
      frozenChange,
      availableAfter: Number(ambassador.availableBalance),
      frozenAfter: Number(ambassador.frozenBalance),
      bizType,
      bizId,
      remark,
    });
  }

  private generateWithdrawalNo() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}${String(now.getDate()).padStart(2, '0')}`;
    return `TX${date}${Date.now().toString().slice(-8)}${crypto.randomInt(
      100,
      1000
    )}`;
  }

  private maskAccount(value: string) {
    if (!value) return '';
    if (value.length <= 7) return `${value.slice(0, 1)}***${value.slice(-1)}`;
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }
}
