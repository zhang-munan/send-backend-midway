import { BasePlugin } from '@cool-midway/plugin-cli';
import {
  OfficialAccount,
  MiniApp,
  Pay,
  OpenPlatform,
  Work,
  OpenWork,
} from 'node-easywechat';
import { IncomingMessage } from 'http';
/**
 * 微信
 */
export declare class CoolPlugin extends BasePlugin {
  /**
   * 公众号
   * @param config
   * @returns
   */
  OfficialAccount(config?: any): Promise<any>;
  /**
   * 创建请求
   * @param req
   * @returns
   */
  createRequest(req: IncomingMessage): Promise<any>;
  /**
   * 小程序
   * @param config
   * @returns
   */
  MiniApp(config?: any): Promise<any>;
  /**
   * 支付
   * @param config
   * @returns
   */
  Pay(config?: any): Promise<any>;
  /**
   * 开放平台
   * @param config
   * @returns
   */
  OpenPlatform(config?: any): Promise<any>;
  /**
   * 企业微信
   * @param config
   * @returns
   */
  Work(config?: any): Promise<any>;
  /**
   * 企业微信开放平台
   * @param config
   * @returns
   */
  OpenWork(config?: any): Promise<any>;
  /**
   * 设置缓存
   * @param app
   */
  setCache(
    app: OfficialAccount | MiniApp | Pay | OpenPlatform | Work | OpenWork,
  ): Promise<void>;
}
export declare const Plugin: typeof CoolPlugin;
