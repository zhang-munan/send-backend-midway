/** 计价规则中的金额统一使用“分”，避免浮点数精度问题。 */
export type PricingRuleType = 'fixed' | 'step';

export interface MessagePricingRule {
  id: string;
  name: string;
  enabled: boolean;
  /** 生效字数范围（含边界）。maxChars 为 null 表示不设上限。 */
  minChars: number;
  maxChars: number | null;
  type: PricingRuleType;
  /** 固定价规则使用。 */
  amount?: number;
  /** 阶梯价规则使用：基础价 + 向上取整(区间内字数 / unitChars) * unitAmount。 */
  baseAmount?: number;
  unitChars?: number;
  unitAmount?: number;
}

export interface MessagePricingConfig {
  name: string;
  minimumAmount: number;
  maximumAmount: number | null;
  /** 按数组顺序匹配，第一条命中的规则生效。 */
  rules: MessagePricingRule[];
}

export interface MessagePricingQuote {
  feeAmount: number;
  billingUnits: number;
  contentLength: number;
  matchedRuleId: string;
}

export const DEFAULT_MESSAGE_PRICING_CONFIG: MessagePricingConfig = {
  name: '默认按字数阶梯计价',
  minimumAmount: 0,
  maximumAmount: null,
  rules: [
    {
      id: 'default-step',
      name: '每 10 字 1.99 元',
      enabled: true,
      minChars: 1,
      maxChars: null,
      type: 'step',
      baseAmount: 0,
      unitChars: 10,
      unitAmount: 199,
    },
  ],
};

function integer(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isInteger(result) ? result : fallback;
}

export function normalizePricingConfig(input: any): MessagePricingConfig {
  return {
    name: String(input?.name || '消息动态计价').trim().slice(0, 100),
    minimumAmount: integer(input?.minimumAmount),
    maximumAmount:
      input?.maximumAmount === null || input?.maximumAmount === undefined
        ? null
        : integer(input.maximumAmount),
    rules: Array.isArray(input?.rules)
      ? input.rules.map((rule: any, index: number) => ({
          id: String(rule?.id || `rule-${index + 1}`).slice(0, 64),
          name: String(rule?.name || `规则 ${index + 1}`).trim().slice(0, 100),
          enabled: rule?.enabled !== false,
          minChars: integer(rule?.minChars),
          maxChars:
            rule?.maxChars === null || rule?.maxChars === undefined
              ? null
              : integer(rule.maxChars),
          type: rule?.type === 'fixed' ? 'fixed' : 'step',
          amount: integer(rule?.amount),
          baseAmount: integer(rule?.baseAmount),
          unitChars: integer(rule?.unitChars),
          unitAmount: integer(rule?.unitAmount),
        }))
      : [],
  };
}

export function validatePricingConfig(config: MessagePricingConfig) {
  if (!config.name) throw new Error('请填写计价方案名称');
  if (!Number.isSafeInteger(config.minimumAmount) || config.minimumAmount < 0) {
    throw new Error('最低价格必须是大于等于 0 的整数分');
  }
  if (
    config.maximumAmount !== null &&
    (!Number.isSafeInteger(config.maximumAmount) ||
      config.maximumAmount < config.minimumAmount)
  ) {
    throw new Error('封顶价格不能低于最低价格');
  }
  const enabledRules = config.rules.filter(rule => rule.enabled);
  if (!enabledRules.length) throw new Error('至少需要启用一条计价规则');
  if (config.rules.length > 50) throw new Error('计价规则最多支持 50 条');

  config.rules.forEach((rule, index) => {
    const label = `第 ${index + 1} 条规则`;
    if (!rule.id || !rule.name) throw new Error(`${label}缺少名称或标识`);
    if (!Number.isInteger(rule.minChars) || rule.minChars < 1 || rule.minChars > 500) {
      throw new Error(`${label}的起始字数需在 1-500 之间`);
    }
    if (
      rule.maxChars !== null &&
      (!Number.isInteger(rule.maxChars) ||
        rule.maxChars < rule.minChars ||
        rule.maxChars > 500)
    ) {
      throw new Error(`${label}的结束字数需在起始字数和 500 之间`);
    }
    if (rule.type === 'fixed') {
      if (!Number.isSafeInteger(rule.amount) || Number(rule.amount) < 0) {
        throw new Error(`${label}的固定价格必须是大于等于 0 的整数分`);
      }
      return;
    }
    if (!Number.isInteger(rule.unitChars) || Number(rule.unitChars) < 1) {
      throw new Error(`${label}的每档字数必须是正整数`);
    }
    if (!Number.isSafeInteger(rule.unitAmount) || Number(rule.unitAmount) < 0) {
      throw new Error(`${label}的每档价格必须是大于等于 0 的整数分`);
    }
    if (!Number.isSafeInteger(rule.baseAmount) || Number(rule.baseAmount) < 0) {
      throw new Error(`${label}的基础价格必须是大于等于 0 的整数分`);
    }
  });

  // 消息发送限制为 500 字，发布前确保所有可发送字数都有价格。
  for (let length = 1; length <= 500; length++) {
    if (!enabledRules.some(rule => matchesRule(rule, length))) {
      throw new Error(`字数 ${length} 未匹配任何启用规则，请补齐计价范围`);
    }
  }
}

function matchesRule(rule: MessagePricingRule, length: number) {
  return (
    rule.enabled &&
    length >= rule.minChars &&
    (rule.maxChars === null || length <= rule.maxChars)
  );
}

export function calculatePricing(
  content: string,
  rawConfig: MessagePricingConfig
): MessagePricingQuote {
  const config = normalizePricingConfig(rawConfig);
  validatePricingConfig(config);
  const contentLength = Math.max(1, String(content || '').length);
  const rule = config.rules.find(item => matchesRule(item, contentLength));
  if (!rule) throw new Error('当前字数没有可用的计价规则');

  let feeAmount = 0;
  let billingUnits = 1;
  if (rule.type === 'fixed') {
    feeAmount = Number(rule.amount || 0);
  } else {
    billingUnits = Math.max(
      1,
      Math.ceil((contentLength - rule.minChars + 1) / Number(rule.unitChars))
    );
    feeAmount = Number(rule.baseAmount || 0) + billingUnits * Number(rule.unitAmount);
  }
  feeAmount = Math.max(config.minimumAmount, feeAmount);
  if (config.maximumAmount !== null) {
    feeAmount = Math.min(config.maximumAmount, feeAmount);
  }
  return {
    feeAmount,
    billingUnits,
    contentLength,
    matchedRuleId: rule.id,
  };
}

/** 兼容旧调用；未接入数据库的场景仍使用默认规则。 */
export function calculateSmsCount(content: string) {
  return calculatePricing(content, DEFAULT_MESSAGE_PRICING_CONFIG).billingUnits;
}

export function calculateSmsFee(content: string) {
  return calculatePricing(content, DEFAULT_MESSAGE_PRICING_CONFIG).feeAmount;
}
