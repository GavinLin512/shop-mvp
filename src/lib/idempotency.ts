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

/**
 * 從失敗 Order 的冪等鍵衍生重試鍵（DECISION.md #1 重試 key）。
 * 先剝除任何現有 :retry<N> 尾綴，再附加新的重試序號，
 * 確保 retry2 依然以原始週期為基底（如 sub_123:2026-07-01:retry2）。
 */
export function buildRetryKey(originalKey: string, retryCount: number): string {
  const base = originalKey.replace(/:retry\d+$/, '')
  return `${base}:retry${retryCount}`
}
