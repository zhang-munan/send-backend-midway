import { BaseService, CoolCommException } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { SettingSmsConfigEntity } from '../entity/sms_config';

/**
 * 短信通道配置服务
 * 支持多通道路由：主通道优先，失败后自动降级到备用通道
 */
@Provide()
export class SettingSmsConfigService extends BaseService {
  @InjectEntityModel(SettingSmsConfigEntity)
  smsConfigEntity: Repository<SettingSmsConfigEntity>;

  /**
   * 获取当前可用的主通道
   * 若无主通道则返回第一个启用的备用通道
   */
  async getPrimaryChannel(): Promise<SettingSmsConfigEntity> {
    const primary = await this.smsConfigEntity.findOne({
      where: { isPrimary: Equal(1), isActive: Equal(1) },
    });
    if (primary) return primary;

    const fallback = await this.smsConfigEntity.findOne({
      where: { isActive: Equal(1) },
    });
    if (!fallback)
      throw new CoolCommException('暂无可用的短信通道，请先配置并启用通道');
    return fallback;
  }

  /**
   * 获取所有启用的备用通道（排除主通道）
   */
  async getBackupChannels(): Promise<SettingSmsConfigEntity[]> {
    return this.smsConfigEntity.find({
      where: { isPrimary: Equal(0), isActive: Equal(1) },
    });
  }

  /**
   * 设置指定通道为主通道（同时取消其他通道的主通道状态）
   */
  async setPrimary(id: number): Promise<void> {
    const config = await this.smsConfigEntity.findOne({
      where: { id: Equal(id) },
    });
    if (!config) throw new CoolCommException('通道不存在');
    if (!config.isActive)
      throw new CoolCommException('请先启用该通道再设为主通道');

    await this.smsConfigEntity.update({}, { isPrimary: 0 });
    await this.smsConfigEntity.update({ id: Equal(id) }, { isPrimary: 1 });
  }

  /**
   * 切换通道启用状态
   */
  async toggleActive(id: number): Promise<{ isActive: number }> {
    const config = await this.smsConfigEntity.findOne({
      where: { id: Equal(id) },
    });
    if (!config) throw new CoolCommException('通道不存在');

    const newStatus = config.isActive === 1 ? 0 : 1;

    // 禁用主通道时同步清除主通道标记
    const update: Partial<SettingSmsConfigEntity> = { isActive: newStatus };
    if (newStatus === 0 && config.isPrimary === 1) {
      update.isPrimary = 0;
    }

    await this.smsConfigEntity.update({ id: Equal(id) }, update);
    return { isActive: newStatus };
  }

  /**
   * 检查指定通道今日发送量是否已达上限（依赖外部传入的已发送数量）
   */
  checkDailyLimit(config: SettingSmsConfigEntity, sentToday: number): boolean {
    return sentToday < config.dailyLimit;
  }
}
