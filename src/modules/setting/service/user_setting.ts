import { BaseService } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, Repository } from 'typeorm';
import { SettingUserEntity } from '../entity/user_setting';

/**
 * 用户设置
 */
@Provide()
export class SettingUserService extends BaseService {
  @InjectEntityModel(SettingUserEntity)
  settingUserEntity: Repository<SettingUserEntity>;

  /**
   * 获取用户设置，不存在则初始化默认值
   */
  async getSetting(userId: number): Promise<SettingUserEntity> {
    let setting = await this.settingUserEntity.findOneBy({
      userId: Equal(userId),
    });
    if (!setting) {
      setting = this.settingUserEntity.create({ userId });
      await this.settingUserEntity.save(setting);
    }
    return setting;
  }

  /**
   * 更新用户设置
   */
  async updateSetting(userId: number, params: Partial<SettingUserEntity>) {
    const setting = await this.getSetting(userId);
    const allowed: (keyof SettingUserEntity)[] = [
      'notifySendResult',
      'notifyReply',
      'notifyActivity',
      'defaultAnonymous',
    ];
    const update: Partial<SettingUserEntity> = {};
    for (const key of allowed) {
      if (params[key] !== undefined) {
        (update as any)[key] = params[key];
      }
    }
    await this.settingUserEntity.update({ id: Equal(setting.id) }, update);
    return this.getSetting(userId);
  }
}
