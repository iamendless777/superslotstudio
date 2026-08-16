import { evaluateStakeApprovalEconomics } from '../quality/StakeApprovalProfile.js';

export class PaytableValidator {
  constructor(project) {
    this.project = project;
  }

  validate() {
    const issues = [];
    issues.push(...this.checkPayoutOrdering());
    issues.push(...this.checkDeadSymbols());
    issues.push(...this.checkScatterReachability());
    issues.push(...this.checkWildConfig());
    issues.push(...this.checkStakeCompliance());
    issues.push(...this.checkBetModes());
    issues.push(...this.checkReelStrips());
    return issues;
  }

  checkPayoutOrdering() {
    const issues = [];
    const syms = this.project.theme.symbols || [];
    const high = syms.filter(s => s.tier === 'high');
    const medium = syms.filter(s => s.tier === 'medium');
    const low = syms.filter(s => s.tier === 'low');

    for (const h of high) {
      for (const m of medium) {
        for (const count of [3, 4, 5]) {
          const hPay = h.payouts?.[count] || 0;
          const mPay = m.payouts?.[count] || 0;
          if (mPay > hPay && hPay > 0) {
            issues.push({
              severity: 'error',
              category: 'payout-ordering',
              message: `Medium "${m.name}" pays more than high "${h.name}" for ${count}-of-a-kind (${mPay} vs ${hPay})`,
            });
          }
        }
      }
    }

    for (const m of medium) {
      for (const l of low) {
        for (const count of [3, 4, 5]) {
          const mPay = m.payouts?.[count] || 0;
          const lPay = l.payouts?.[count] || 0;
          if (lPay > mPay && mPay > 0) {
            issues.push({
              severity: 'warning',
              category: 'payout-ordering',
              message: `Low "${l.name}" pays more than medium "${m.name}" for ${count}-of-a-kind (${lPay} vs ${mPay})`,
            });
          }
        }
      }
    }

    for (const sym of syms) {
      if (sym.tier === 'special') continue;
      const counts = [3, 4, 5, 6].filter(n => (sym.payouts?.[n] || 0) > 0);
      for (let i = 1; i < counts.length; i++) {
        const prev = counts[i - 1];
        const curr = counts[i];
        if (sym.payouts[curr] <= sym.payouts[prev]) {
          issues.push({ severity: 'error', category: 'payout-ordering', message: `"${sym.name}" ${curr}-of-a-kind (${sym.payouts[curr]}) should pay more than ${prev}-of-a-kind (${sym.payouts[prev]})` });
        }
      }
    }

    return issues;
  }

  checkDeadSymbols() {
    const issues = [];
    const syms = this.project.theme.symbols || [];

    for (const sym of syms) {
      if (sym.tier === 'special') {
        const hasPayout = Object.values(sym.payouts || {}).some(value => Number(value) > 0);
        const hasBehavior = (sym.special || []).length > 0;
        if (!hasPayout && !hasBehavior) {
          issues.push({ severity: 'error', category: 'dead-symbol', message: `Special symbol "${sym.name}" has no payouts or special behavior — dead symbol` });
        }
        continue;
      }
      const has3 = (sym.payouts?.[3] || 0) > 0;
      const has4 = (sym.payouts?.[4] || 0) > 0;
      const has5 = (sym.payouts?.[5] || 0) > 0;
      if (!has3 && !has4 && !has5) {
        issues.push({ severity: 'error', category: 'dead-symbol', message: `"${sym.name}" has no payouts defined — dead symbol` });
      }
    }

    return issues;
  }

  checkScatterReachability() {
    const issues = [];
    const scatters = this.project.math.specialSymbols?.scatter || [];
    const triggers = this.project.math.freespinTriggers?.basegame;

    if (scatters.length === 0 && triggers && Object.keys(triggers).length > 0) {
      issues.push({ severity: 'warning', category: 'scatter', message: 'Free spin triggers defined but no scatter symbols configured' });
    }

    if (scatters.length > 0 && (!triggers || Object.keys(triggers).length === 0)) {
      issues.push({ severity: 'warning', category: 'scatter', message: 'Scatter symbols defined but no free spin triggers configured' });
    }

    const reelStrips = this.project.math.reelStrips?.BR || [];
    if (scatters.length > 0 && reelStrips.length > 0) {
      for (const sc of scatters) {
        let reelsWithScatter = 0;
        for (let i = 0; i < reelStrips.length; i++) {
          if (reelStrips[i].includes(sc)) reelsWithScatter++;
        }
        const minTrigger = Math.min(...Object.keys(triggers || { 3: 0 }).map(Number));
        if (reelsWithScatter < minTrigger) {
          issues.push({
            severity: 'error', category: 'scatter',
            message: `Scatter "${sc}" appears on ${reelsWithScatter} reels but needs ${minTrigger} to trigger — unreachable`,
          });
        }
      }
    }

    return issues;
  }

  checkWildConfig() {
    const issues = [];
    const wilds = this.project.math.specialSymbols?.wild || [];
    const syms = this.project.theme.symbols || [];

    for (const w of wilds) {
      const sym = syms.find(s => s.name === w);
      if (!sym) {
        issues.push({ severity: 'warning', category: 'wild', message: `Wild "${w}" not found in symbol list` });
      }
    }

    return issues;
  }

  checkStakeCompliance() {
    const issues = [];
    const m = this.project.math;

    if (m.rtp < 0.92) {
      issues.push({ severity: 'error', category: 'stake', message: `RTP ${(m.rtp * 100).toFixed(1)}% below Stake minimum (92%)` });
    }
    if (m.rtp > 0.965) {
      issues.push({ severity: 'error', category: 'stake', message: `RTP ${(m.rtp * 100).toFixed(1)}% above Stake maximum (96.5%)` });
    }
    for (const message of evaluateStakeApprovalEconomics(this.project).issues) {
      issues.push({ severity: 'error', category: 'stake', message });
    }

    return issues;
  }

  checkBetModes() {
    const issues = [];
    const modes = this.project.math.betModes || [];

    if (modes.length === 0) {
      issues.push({ severity: 'error', category: 'bet-mode', message: 'No bet modes configured' });
    }

    for (const mode of modes) {
      if (mode.releaseGated !== true && mode.entryPolicy !== 'natural' && mode.cost <= 0) {
        issues.push({ severity: 'error', category: 'bet-mode', message: `Bet mode "${mode.name}" has invalid cost (${mode.cost})` });
      }
      if (mode.rtp < 0.8 || mode.rtp > 0.99) {
        issues.push({ severity: 'warning', category: 'bet-mode', message: `Bet mode "${mode.name}" RTP ${(mode.rtp * 100).toFixed(1)}% outside typical range` });
      }
    }

    return issues;
  }

  checkReelStrips() {
    const issues = [];
    const strips = this.project.math.reelStrips?.BR || [];

    if (strips.length === 0) {
      issues.push({ severity: 'info', category: 'reel-strip', message: 'No base game reel strips defined — using weighted random generation' });
      return issues;
    }

    const syms = new Set((this.project.theme.symbols || []).map(s => s.name));
    for (let i = 0; i < strips.length; i++) {
      for (const sym of strips[i]) {
        if (syms.size > 0 && !syms.has(sym)) {
          issues.push({ severity: 'warning', category: 'reel-strip', message: `Reel ${i + 1} contains unknown symbol "${sym}"` });
          break;
        }
      }
      if (strips[i].length < 10) {
        issues.push({ severity: 'warning', category: 'reel-strip', message: `Reel ${i + 1} has only ${strips[i].length} stops — may produce unnatural distributions` });
      }
    }

    return issues;
  }
}
