import { BaseService } from '@cool-midway/core';
import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Equal, In, Repository } from 'typeorm';
import { SettingUserEntity } from '../entity/user_setting';
import { UserInfoEntity } from '../../user/entity/info';
import { MessageInfoEntity } from '../../message/entity/info';

/**
 * 用户设置
 */
@Provide()
export class SettingUserService extends BaseService {
  @InjectEntityModel(SettingUserEntity)
  settingUserEntity: Repository<SettingUserEntity>;

  @InjectEntityModel(UserInfoEntity)
  userInfoEntity: Repository<UserInfoEntity>;

  @InjectEntityModel(MessageInfoEntity)
  messageInfoEntity: Repository<MessageInfoEntity>;

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
      'blockAllSms',
    ];
    const update: Partial<SettingUserEntity> = {};
    for (const key of allowed) {
      if (params[key] !== undefined) {
        (update as any)[key] = params[key];
      }
    }
    await this.settingUserEntity.update({ id: Equal(setting.id) }, update);

    if (Number(update.blockAllSms) === 1) {
      const user = await this.userInfoEntity.findOneBy({ id: Equal(userId) });
      if (user?.phone) {
        await this.messageInfoEntity.update(
          {
            receiverPhone: Equal(user.phone),
            status: In([0, 1, 3]),
          },
          {
            status: 7,
            failReason: '收件人已屏蔽所有短信，系统自动取消',
          }
        );
      }
    }
    return this.getSetting(userId);
  }

  /**
   * 按手机号开启全局短信屏蔽。
   *
   * 告知短信只发给未注册手机号，因此腾讯云上行退订回调到达时可能还没有
   * user_info。这里幂等创建与手机号登录一致的占位账号，使 blockAllSms 仍然
   * 使用手机端设置页对应的 setting_user 字段；用户以后登录后可自行解除。
   */
  async blockAllSmsByPhone(phone: string) {
    let user = await this.userInfoEntity.findOneBy({ phone: Equal(phone) });
    if (!user) {
      try {
        await this.userInfoEntity.insert({
          phone,
          unionid: phone,
          loginType: 2,
          nickName: phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
        });
      } catch (error) {
        // 腾讯云可能重试同一回调，并发插入会命中 phone 唯一键；重新读取即可。
      }
      user = await this.userInfoEntity.findOneBy({ phone: Equal(phone) });
    }
    if (!user) throw new Error('无法为退订手机号建立用户设置');
    return this.updateSetting(user.id, { blockAllSms: 1 });
  }
}
