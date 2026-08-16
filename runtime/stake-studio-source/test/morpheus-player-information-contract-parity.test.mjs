import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlayerInformationManifest } from '../src/engines/quality/PlayerInformationQA.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_LUCID_WILD_VALUES,
} from '../src/engines/morpheus/MorpheusGameContract.js';

function project() {
  return {
    id: 'morpheus_dreamfall',
    name: 'MORPHEUS: DREAMFALL',
    version: '0.0.1',
    build: { stakeEngine: { gameId: 'morpheus_dreamfall', gameName: 'MORPHEUS: DREAMFALL' } },
    theme: {
      symbols: [
        { name: 'MORPHEUS', payouts: { 3: 1 }, special: [] },
        { name: 'VEIL_WILD', payouts: { 3: 1 }, special: ['wild', 'expandingWild'] },
        { name: 'LUCID_WILD', payouts: { 3: 1 }, special: ['wild', 'multiplier'] },
        { name: 'DREAM_RIFT', payouts: {}, special: ['wildBomb'] },
        { name: 'ECHO_SPLIT', payouts: {}, special: ['split'] },
        { name: 'DAWN_PURGE', payouts: {}, special: ['royalRemover'] },
        { name: 'ONEIRIC_STAR', payouts: {}, special: ['wildStar'] },
        { name: 'MYSTERY_VEIL', payouts: {}, special: ['mystery'] },
        { name: 'MAX_MORPHEUS', payouts: { 3: 1 }, special: ['wild', 'maxWild'] },
        { name: 'RIFT_WILD', payouts: {}, special: ['wild', 'spawnOnly'] },
        { name: 'GATE_OF_SLEEP', payouts: {}, special: ['scatter'] },
      ],
    },
    math: {
      gameType: 'ways', grid: { reels: 6, rows: [4, 4, 4, 4, 4, 4] },
      rtp: 0.96, wincap: 100000, volatility: 'very-high',
      betModes: [{ name: 'base', cost: 1, rtp: 0.96, maxWin: 100000, profile: {} }],
      governedModes: { modes: [{ id: 'base', entry: 'Natural tier entry.', mechanics: [], selectable: true, releaseGated: false, costMultiplier: 1 }] },
      specialSymbols: { wild: ['VEIL_WILD', 'LUCID_WILD', 'MAX_MORPHEUS', 'RIFT_WILD'], scatter: ['GATE_OF_SLEEP'] },
      bonusMechanics: [],
      featureArchitecture: { tiers: {
        3: { id: 'veilAscent', name: 'Veil Ascent' },
        4: { id: 'lucidBlessing', name: 'Lucid Blessing' },
        5: { id: 'dreamfall', name: 'Dreamfall' },
        6: { id: 'oneiricNexus', name: 'The Oneiric Nexus' },
      } },
      freespinTriggers: { basegame: { 3: 10, 4: 10, 5: 10, 6: 10 }, freegame: { 3: 5 } },
    },
  };
}

test('Morpheus Player Information describes the frozen settlement ownership instead of generic pre-win substitutions', () => {
  const manifest = createPlayerInformationManifest(project());
  const rules = Object.fromEntries(manifest.specialRules.map(rule => [rule.key, rule.text]));
  assert.match(rules['symbol:DREAM_RIFT'], /after a positive win/);
  assert.match(rules['symbol:DREAM_RIFT'], /next tumble board/);
  assert.match(rules['symbol:DAWN_PURGE'], /show empty cells/);
  assert.match(rules['symbol:ECHO_SPLIT'], /unique contributing ECHO SPLIT cell/);
  assert.match(rules['symbol:ONEIRIC_STAR'], /announces one eligible paying family before converting/);
  assert.match(rules['symbol:MYSTERY_VEIL'], /retaining MYSTERY VEIL as its accounting identity/);
  assert.doesNotMatch(Object.values(rules).join('\n'), /before wins are evaluated|2 to the power|replaces every low-tier symbol/);
});

test('Morpheus Player Information carries Lucid values, tier-specific Dreamfall rules, exact economics and contract identity', () => {
  const manifest = createPlayerInformationManifest(project());
  const text = JSON.stringify(manifest);
  for (const value of MORPHEUS_LUCID_WILD_VALUES) assert.match(text, new RegExp(`(?:^|\\D)${value}x`));
  assert.match(text, /fifth and every later hit/i);
  assert.match(text, /Scatters cannot enter expansion or tumble refills/);
  assert.equal(manifest.triggers.filter(trigger => trigger.gameType === 'freegame').length, 1);
  assert.match(manifest.triggers.find(trigger => trigger.gameType === 'freegame').text, /Dreamfall refills exclude scatters/);
  assert.match(text, /0\.1x increments/);
  assert.match(text, /100,000x/);
  assert.match(text, /\$50,000,000/);
  assert.match(text, /\$500/);
  assert.match(text, new RegExp(MORPHEUS_CONTRACT_FINGERPRINT));
});
