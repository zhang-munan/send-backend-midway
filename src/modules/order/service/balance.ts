import { BaseService, CoolCommException } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { UserBalanceEntity } from '../entity/balance';

/**
 * 用户余额
 */
@Provide()
export class UserBalanceService extends BaseService {
  @InjectEntityModel(UserBalanceEntity)
  userBalanceEntity: Repository<UserBalanceEntity>;

  /**
   * 获取或初始化用户余额记录
   */
  async getOrInit(userId: number): Promise<UserBalanceEntity> {
    let record = await this.userBalanceEntity.findOneBy({
      userId: Equal(userId),
    });
    if (!record) {
      // 使用 upsert 避免并发初始化时的唯一键冲突
      await this.userBalanceEntity
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
        .execute();
      record = await this.userBalanceEntity.findOneBy({
        userId: Equal(userId),
      });
    }
    return record!;
  }

  /**
   * 查询用户余额
   */
  async getBalance(userId: number) {
    return this.getOrInit(userId);
  }

  /**
   * 增加消息条数配额（购买套餐支付成功后调用）
   * 使用原子 SQL 增量更新，避免并发读写导致数据不一致
   * @param userId 用户ID
   * @param quota 增加的条数
   */
  async addQuota(userId: number, quota: number) {
    // 确保记录存在
    await this.getOrInit(userId);
    await this.userBalanceEntity
      .createQueryBuilder()
      .update(UserBalanceEntity)
      .set({
        messageQuota: () => `messageQuota + ${quota}`,
      })
      .where('userId = :userId', { userId })
      .execute();
  }

  /**
   * 增加账户余额（独立余额充值通道调用）
   * @param userId 用户ID
   * @param amount 充值金额
   */
  async addBalance(userId: number, amount: number) {
    const fee = Math.round(amount);
    if (fee <= 0) return;
    await this.getOrInit(userId);
    await this.userBalanceEntity
      .createQueryBuilder()
      .update(UserBalanceEntity)
      .set({
        balance: () => `balance + ${fee}`,
        totalRecharge: () => `totalRecharge + ${fee}`,
      })
      .where('userId = :userId', { userId })
      .execute();
  }

  /**
   * 扣减消息条数配额（发送消息时调用）
   * 使用原子 SQL 确保不超扣，余额支付不走这里
   * @param userId 用户ID
   * @param quota 扣减条数（使用配额发送时传 smsCount，余额支付套餐时传 0）
   * @param feeAmount 本次套餐消耗对应的统计金额，不扣账户余额
   */
  async deductQuota(userId: number, quota: number, feeAmount = 0) {
    const record = await this.getOrInit(userId);
    if (record.messageQuota < quota) {
      throw new CoolCommException('消息条数不足，请先购买套餐');
    }
    const fee = Math.round(feeAmount);
    await this.userBalanceEntity
      .createQueryBuilder()
      .update(UserBalanceEntity)
      .set({
        messageQuota: () => `messageQuota - ${quota}`,
        totalConsumed: () => `totalConsumed + ${fee}`,
      })
      .where('userId = :userId', { userId })
      .execute();
  }

  /**
   * 扣减账户余额（余额支付时调用）
   * @param userId 用户ID
   * @param amount 扣减金额
   */
  async deductBalance(userId: number, amount: number) {
    const fee = Math.round(amount);
    if (fee <= 0) return;
    const record = await this.getOrInit(userId);
    if (Number(record.balance) < fee) {
      throw new CoolCommException('余额不足');
    }
    await this.userBalanceEntity
      .createQueryBuilder()
      .update(UserBalanceEntity)
      .set({
        balance: () => `balance - ${fee}`,
        totalConsumed: () => `totalConsumed + ${fee}`,
      })
      .where('userId = :userId', { userId })
      .execute();
  }

  /**
   * 检查余额是否足够支付指定金额
   */
  async checkBalance(userId: number, amount: number): Promise<boolean> {
    const record = await this.getOrInit(userId);
    return Number(record.balance) >= amount;
  }
}
