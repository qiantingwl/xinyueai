/** 上游美元成本（micros）按汇率折算为结算币种 micros，并夹在数据库可存范围内。 */
export function localizedCostMicros(usdMicros: number, exchangeRateMicros: number) {
  return Math.min(2_000_000_000, Math.ceil(usdMicros * exchangeRateMicros / 1_000_000))
}
