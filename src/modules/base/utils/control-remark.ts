/**
 * 在有限长度的业务备注中追加总控制台来源，并优先完整保留最新操作标识。
 */
export function appendControlRemark(
  oldRemark: string,
  reason: string,
  operator: string,
  maxLength = 200
) {
  const line = `[总控制台:${operator}] ${reason}`.slice(0, maxLength);
  if (!oldRemark) return line;
  const oldLength = maxLength - line.length - 1;
  if (oldLength <= 0) return line;
  return `${String(oldRemark).slice(-oldLength)}\n${line}`;
}
