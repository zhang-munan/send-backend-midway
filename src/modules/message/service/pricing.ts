/** 按次支付计费规则：每 10 字为一条，不足一条按一条计。金额单位：分。 */
export const SMS_CHARS_PER_SEGMENT = 10;
export const SMS_FEE_PER_SEGMENT = 199;

export function calculateSmsCount(content: string) {
  return Math.max(1, Math.ceil((content?.length || 0) / SMS_CHARS_PER_SEGMENT));
}

export function calculateSmsFee(content: string) {
  return calculateSmsCount(content) * SMS_FEE_PER_SEGMENT;
}
