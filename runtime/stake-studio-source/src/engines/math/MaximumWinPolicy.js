/**
 * Shared maximum-win probability policy.
 *
 * New projects may freeze an exact per-round hit rate. Legacy projects retain
 * the historical RTP-allocation model until they opt into the explicit field.
 */
export function explicitMaximumWinHitRate(math = {}) {
  const rate = Number(math.maxWinHitRate);
  return Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : null;
}

export function maximumWinHitRateForMode(math = {}, mode = {}) {
  const explicit = explicitMaximumWinHitRate(math);
  if (explicit !== null) return explicit;
  const maximum = Number(mode.maxWin ?? math.wincap) || 0;
  const cost = Number(mode.cost) || 1;
  const allocation = Math.max(0, Number(math.wincapRtp) || 0);
  return maximum > 0 ? (allocation * cost) / maximum : 0;
}

export function maximumWinRtpForMode(math = {}, mode = {}) {
  const maximum = Number(mode.maxWin ?? math.wincap) || 0;
  const cost = Number(mode.cost) || 1;
  return maximumWinHitRateForMode(math, mode) * maximum / cost;
}

export function maximumWinOddsForMode(math = {}, mode = {}) {
  const rate = maximumWinHitRateForMode(math, mode);
  return rate > 0 ? 1 / rate : Infinity;
}
