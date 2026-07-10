import { BasePlugin } from '@cool-midway/plugin-cli';
/**
 * 腾讯云短信
 */
export declare class CoolPlugin extends BasePlugin {
  /**
   * 发送
   * @param phone 手机号数组 最多不要超过200个手机号
   * @param params 参数数组 短信模板参数 例如 ["1234", "5"]
   * @param config 配置 signName 签名 template 模板 options 其他配置
   * @returns 发送结果
   */
  send(
    phone: string[],
    params: string[],
    config?: {
      signName: string;
      template: string;
      countryCode?: string;
      options?: {
        [key: string]: any;
      };
    },
  ): Promise<any>;
}
export declare const Plugin: typeof CoolPlugin;
