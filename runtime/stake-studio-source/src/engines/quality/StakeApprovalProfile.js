export const STAKE_APPROVAL_PROFILES = Object.freeze({
  'stake-two-star': Object.freeze({
    id: 'stake-two-star',
    maximumPayoutMultiplier: 25_000,
    maximumTotalExposureUsd: 10_000_000,
    maximumCostMultiplier: 1_000,
  }),
  'stake-three-star': Object.freeze({
    id: 'stake-three-star',
    maximumPayoutMultiplier: 100_000,
    maximumTotalExposureUsd: 50_000_000,
    maximumCostMultiplier: 1_500,
  }),
});

export function resolveStakeApprovalProfile(project = {}) {
  return STAKE_APPROVAL_PROFILES[project.production?.standard] || STAKE_APPROVAL_PROFILES['stake-two-star'];
}

export function evaluateStakeApprovalEconomics(project = {}) {
  const profile = resolveStakeApprovalProfile(project);
  const maximumPayoutMultiplier = Number(project.math?.wincap) || 0;
  const maximumBaseBetUsd = maximumPayoutMultiplier > 0
    ? profile.maximumTotalExposureUsd / maximumPayoutMultiplier
    : 0;
  const selectableModes = (project.math?.betModes || []).filter(mode => mode.releaseGated !== true && mode.entryPolicy !== 'natural');
  const issues = [];
  if (maximumPayoutMultiplier > profile.maximumPayoutMultiplier) {
    issues.push(`Win cap ${maximumPayoutMultiplier}x exceeds ${profile.id} maximum ${profile.maximumPayoutMultiplier}x.`);
  }
  for (const mode of selectableModes) {
    const cost = Number(mode.cost);
    if (!(cost > 0)) issues.push(`Selectable mode "${mode.name}" requires a positive approved cost.`);
    else if (cost > profile.maximumCostMultiplier) issues.push(`Mode "${mode.name}" cost ${cost}x exceeds ${profile.id} maximum ${profile.maximumCostMultiplier}x.`);
  }
  return Object.freeze({
    profile,
    maximumPayoutMultiplier,
    maximumBaseBetUsd,
    issues: Object.freeze(issues),
    passed: issues.length === 0,
  });
}
