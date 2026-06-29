/**
 * 決定性冪等鍵生成器
 *
 * 格式規則（見 DECISION.md #1）：
 *   首單  : sub_<id>:cycle0
 *   週期  : sub_<id>:<YYYY-MM-DD>
 *   重試  : sub_<id>:<cycle>:retry<N>
 *
 * cycle 參數直接決定後綴，呼叫端負責傳正確格式。
 */
export function buildOrderKey(subscriptionId: string, cycle: string): string {
  return `${subscriptionId}:${cycle}`
}
