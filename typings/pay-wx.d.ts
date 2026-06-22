import { BasePlugin } from '@cool-midway/plugin-cli';
/**
 * 微信支付
 */
export declare class CoolPlugin extends BasePlugin {
  /**
   * 生成订单号，基于时间戳+唯一字符串+随机数+可选的子ID
   * @param subId 可选，如你的订单ID, 或者用户ID的一些组合
   * @returns 订单号
   */
  createOrderNum(subId?: string): string;
  /**
   * 获得配置
   */
  getConfig(): Promise<any>;
  /**
   * 获得微信支付SDK实例
   * @param config 动态配置
   * @returns
   */
  getInstance(config?: {
    appid: string;
    mchid: string;
    key: string;
    notify_url: string;
    publicKey: string;
    privateKey: string;
    verifyPublicKey?: string;
  }): Promise<any>;
  /**
   * 获得Buffer
   * @param path
   * @returns
   */
  getBuffer(path: string): Promise<Buffer<any>>;
  /**
   * 根据给定的 URL 下载文件并返回一个 Buffer。
   * @param {string} url 文件的 URL
   * @return {Promise<Buffer>} 返回一个 Promise，解析为文件内容的 Buffer
   */
  downloadFileAsBuffer(url: any): Promise<Buffer<any>>;
  /**
   * 签名
   * @param ctx 请求上下文
   * @param config 动态配置
   * @returns
   */
  signVerify(
    ctx: any,
    config?: {
      appid: string;
      mchid: string;
      key: string;
      notify_url: string;
      publicKey: string;
      privateKey: string;
      verifyPublicKey?: string;
    },
  ): Promise<any>;
}
export declare const Plugin: typeof CoolPlugin;
