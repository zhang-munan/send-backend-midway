import { BaseService, CoolCommException } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { ControlPricingConfigEntity } from '../../control/entity/pricing_config';
import {
  calculatePricing,
  DEFAULT_MESSAGE_PRICING_CONFIG,
  MessagePricingConfig,
  normalizePricingConfig,
  validatePricingConfig,
} from './pricing';

@Provide()
export class MessagePricingService extends BaseService {
  @InjectEntityModel(ControlPricingConfigEntity)
  pricingConfigEntity: Repository<ControlPricingConfigEntity>;

  async getActive() {
    const entity = await this.pricingConfigEntity.findOne({
      where: { isActive: Equal(1) },
      order: { version: 'DESC' },
    });
    return entity
      ? { version: entity.version, config: normalizePricingConfig(entity.config), entity }
      : { version: 0, config: DEFAULT_MESSAGE_PRICING_CONFIG, entity: null };
  }

  async quote(content: string) {
    const active = await this.getActive();
    return { ...calculatePricing(content, active.config), pricingVersion: active.version };
  }

  preview(content: string, input: any) {
    try {
      const config = normalizePricingConfig(input);
      return calculatePricing(content, config);
    } catch (error) {
      throw new CoolCommException(error instanceof Error ? error.message : '计价规则不合法');
    }
  }

  async publish(input: any, operator: any, reason: string) {
    let config: MessagePricingConfig;
    try {
      config = normalizePricingConfig(input);
      validatePricingConfig(config);
    } catch (error) {
      throw new CoolCommException(error instanceof Error ? error.message : '计价规则不合法');
    }

    return this.pricingConfigEntity.manager.transaction(async manager => {
      const repository = manager.getRepository(ControlPricingConfigEntity);
      const current = await repository.findOne({
        where: { isActive: Equal(1) },
        order: { version: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (current) await repository.update({ isActive: Equal(1) }, { isActive: 0 });
      return repository.save(
        repository.create({
          version: Number(current?.version || 0) + 1,
          isActive: 1,
          name: config.name,
          config,
          operatorId: Number(operator.userId),
          operatorName: String(operator.username || operator.userId),
          reason,
        })
      );
    });
  }
}
