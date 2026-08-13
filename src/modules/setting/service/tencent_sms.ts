import { Inject, Provide } from '@midwayjs/core';
import { PluginService } from '../../plugin/service/info';
import { BaseSysParamService } from '../../base/service/sys/param';

type SmsScene = 'login' | 'recipientNotice';

interface SceneConfig {
  signName?: string;
  template?: string;
  params?: string[];
}

/** 统一封装 sms-tx，并从后台参数 smsTxTemplates 读取两类模板路由。 */
@Provide()
export class TencentSmsService {
  @Inject()
  pluginService: PluginService;

  @Inject()
  baseSysParamService: BaseSysParamService;

  private async sceneConfig(scene: SmsScene): Promise<SceneConfig> {
    const value = await this.baseSysParamService.dataByKey('smsTxTemplates');
    return value?.[scene] || {};
  }

  private interpolate(
    params: string[] | undefined,
    values: Record<string, string>
  ) {
    return (params || []).map(item =>
      String(item).replace(/\{\{(\w+)\}\}/g, (_all, key) => values[key] ?? '')
    );
  }

  private validateResult(result: any) {
    const response = result?.Response || result;
    const statuses = response?.SendStatusSet;
    if (Array.isArray(statuses)) {
      const failed = statuses.find(item => item?.Code && item.Code !== 'Ok');
      if (failed) throw new Error(failed.Message || failed.Code);
    }
    return (
      statuses?.[0]?.SerialNo ||
      statuses?.[0]?.MessageId ||
      response?.RequestId ||
      result?.RequestId ||
      null
    );
  }

  private async send(scene: SmsScene, phone: string, params: string[]) {
    const config = await this.sceneConfig(scene);
    if (!config.signName || !config.template) {
      throw new Error(`腾讯云短信场景 ${scene} 尚未配置签名或模板`);
    }
    const overrides = { signName: config.signName, template: config.template };
    const result = await this.pluginService.invoke(
      'sms-tx',
      'send',
      [phone],
      params,
      overrides
    );
    return this.validateResult(result);
  }

  async sendLoginCode(phone: string, code: string) {
    const config = await this.sceneConfig('login');
    const params = config.params?.length
      ? this.interpolate(config.params, { code })
      : [code];
    return this.send('login', phone, params);
  }

  async sendRecipientNotice(phone: string, triggerCount: number) {
    const config = await this.sceneConfig('recipientNotice');
    const params = this.interpolate(config.params, {
      count: String(triggerCount),
    });
    return this.send('recipientNotice', phone, params);
  }
}
