import { ILogger, Inject, Logger, Provide } from '@midwayjs/core';
import axios from 'axios';
import { createHash } from 'crypto';
import { BaseSysParamService } from '../../base/service/sys/param';

/** 智享 API 统一返回结构 */
interface ZthyResponse {
  code: number;
  msg: string;
  msgId?: string;
  [key: string]: any;
}

const API_BASE = 'https://api-shss.zthysms.com';

/**
 * 智享（智享无线）短信服务。
 *
 * 配置存放在系统参数 zthySmsConfig（后台「参数配置」维护）：
 * {
 *   "username": "MLJXHY",
 *   "password": "明文密码（发送前本地做 MD5 二次加密）",
 *   "signature": "【签名】或签名ID",
 *   "loginTpId": 验证码模板ID,
 *   "noticeTpId": 告知短信模板ID,
 *   "noticeVars": {"count": "变量名"}  // 可选
 * }

 */
@Provide()
export class ZthySmsService {
  @Inject()
  baseSysParamService: BaseSysParamService;

  @Logger()
  logger: ILogger;

  private md5(input: string) {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }

  /** 智享鉴权密码：md5(md5(password) + tKey)，tKey 为东八区时间戳（秒）。 */
  private signPassword(rawPassword: string, tKey: number) {
    return this.md5(this.md5(rawPassword) + String(tKey));
  }

  /**
   * tKey 为当前 Unix 时间戳（秒）。Unix 时间戳与时区无关，
   * 「东八区时间戳」只是服务方按北京自然日限流的表述，无需换算。
   */
  private tKey() {
    return Math.floor(Date.now() / 1000);
  }

  private async config(): Promise<{
    username: string;
    password: string;
    signature: string;
    loginTpId: string;
    noticeTpId: string;
    noticeVars?: Record<string, string>;
  }> {
    const value = await this.baseSysParamService.dataByKey('zthySmsConfig');
    if (!value?.username || !value?.password) {
      throw new Error('智享短信参数 zthySmsConfig 未配置');
    }
    return value;
  }

  /**
   * 统一请求入口。
   * @param path 接口路径，如 /v2/sendSmsTp
   * @param body 业务参数（username/password/tKey 由本方法注入）
   */
  private async request(
    path: string,
    body: Record<string, any>
  ): Promise<ZthyResponse> {
    const conf = await this.config();
    const tKey = this.tKey();
    const payload = {
      username: conf.username,
      password: this.signPassword(conf.password, tKey),
      tKey,
      ...body,
    };
    const response = await axios.post(`${API_BASE}${path}`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const data = response.data as ZthyResponse;
    if (!data || typeof data.code !== 'number') {
      throw new Error('智享接口返回异常: ' + JSON.stringify(data).slice(0, 200));
    }
    return data;
  }

  /** 查询余额（也可用于上线前验证账号连通性）。 */
  async queryBalance(): Promise<number> {
    const data = await this.request('/v2/balance', {});
    if (data.code !== 200) {
      throw new Error(`智享余额查询失败 ${data.code}: ${data.msg}`);
    }
    return data.sumSms;
  }

  /**
   * 解析签名：配置里可以直接填签名串（如【帮你说出口】），也可以填签名ID。
   * 发送接口要求传签名串，所以 ID 会自动换算。结果缓存 10 分钟。
   */
  async resolveSignature(configured: string): Promise<string> {
    const trimmed = String(configured || '').trim();
    // 已经是签名串（含【】）或空则直接返回
    if (!trimmed || trimmed.includes('【')) return trimmed;

    // 纯数字视为签名ID
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`智享签名配置无效: ${trimmed}`);
    }
    const signatureId = Number(trimmed);

    const cached = this.signatureCache.get(signatureId);
    if (cached && cached.expiredAt > Date.now()) return cached.sign;

    const data = await this.request('/sms/v1/sign/list', {
      status: 2,
      page: 1,
      size: 100,
    });
    if (data.code !== 200) {
      throw new Error(`智享签名列表查询失败 ${data.code}: ${data.msg}`);
    }
    const hit = (data.signList || []).find(
      (item: any) => Number(item.signatureId) === signatureId
    );
    if (!hit) {
      throw new Error(`智享签名 ${signatureId} 不存在或未审核通过`);
    }
    const sign = String(hit.sign || '');
    if (!sign) throw new Error(`智享签名 ${signatureId} 返回签名为空`);

    this.signatureCache.set(signatureId, {
      sign,
      expiredAt: Date.now() + 10 * 60 * 1000,
    });
    return sign;
  }

  private signatureCache = new Map<number, { sign: string; expiredAt: number }>();

  /** 模板短信发送。 */
  private async sendTemplate(
    tpId: string,
    phone: string,
    vars: Record<string, string> | null,
    extend?: string
  ) {
    const conf = await this.config();
    if (!tpId) throw new Error('智享模板ID未配置');
    const signature = await this.resolveSignature(conf.signature);
    const record: Record<string, any> = { mobile: phone };
    if (vars) record.tpContent = vars;
    this.logger.info(
      `[智享诊断] 调用发送模板 tpId=${tpId} ` +
        `phone=${phone.slice(0, 3)}****${phone.slice(-4)} ` +
        `vars=${JSON.stringify(vars)} signature=${signature}`
    );
    const data = await this.request('/v2/sendSmsTp', {
      signature,
      tpId: Number(tpId),
      extend,
      records: [record],
    });
    this.logger.info(
      `[智享诊断] 发送响应 code=${data.code} msg=${data.msg} msgId=${data.msgId} ` +
        `invalidList=${JSON.stringify(data.invalidList ?? [])}`
    );
    if (data.code !== 200) {
      throw new Error(`智享短信发送失败 ${data.code}: ${data.msg}`);
    }
    if (Array.isArray(data.invalidList) && data.invalidList.length > 0) {
      throw new Error('智享返回无效变量: ' + JSON.stringify(data.invalidList));
    }
    return data.msgId || null;
  }

  /** 发送登录验证码。 */
  async sendLoginCode(phone: string, code: string) {
    const conf = await this.config();
    // 模板 905342 的变量名为 valid_code（见 /sms/v2/template/query 返回的 paramJson）
    return this.sendTemplate(conf.loginTpId, phone, { valid_code: code });
  }

  /** 发送收件人告知短信。 */
  async sendRecipientNotice(phone: string, triggerCount: number) {
    const conf = await this.config();
    // 模板 905343 的变量为 phone（接收方手机号后4位尾号，paramLength=4）。
    // noticeVars.count 为旧模板遗留，已不再使用。
    const vars: Record<string, string> = {
      phone: phone.slice(-4),
    };
    return this.sendTemplate(conf.noticeTpId, phone, vars);
  }

  /** 添加平台侧黑名单（退订）。 */
  async addBlacklist(mobiles: string) {
    const data = await this.request('/sms/v1/blackNumber/add', { mobiles });
    if (data.code !== 200) {
      throw new Error(`智享黑名单添加失败 ${data.code}: ${data.msg}`);
    }
    return true;
  }
}
