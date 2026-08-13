import { BONUS_MECHANICS, GAME_TYPES } from '../../mechanics/registry.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_LUCID_WILD_VALUES,
  MORPHEUS_MAX_BASE_BET_USD,
  MORPHEUS_MAX_TOTAL_EXPOSURE_USD,
  MORPHEUS_MAX_WIN_MULTIPLIER,
} from '../morpheus/MorpheusGameContract.js';

export const PLAYER_INFORMATION_FORMAT = 'stake-studio-player-information-qa-v1';

const LEGAL_DISCLOSURES = Object.freeze([
  'Malfunction voids all wins and plays.',
  'A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds.',
  'The expected return is calculated over many plays.',
  'The game display is not representative of any physical device and is for illustrative purposes only.',
  'Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser.',
]);

const hashText = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const clone = value => JSON.parse(JSON.stringify(value));
const title = value => String(value || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

function modeDescription(mode, project) {
  const profile = mode.profile || {};
  const entry = profile.entry || (mode.isBuyBonus ? 'freeSpins' : 'base');
  if (entry === 'freeSpins') {
    const tier = title(profile.featureTier || mode.name);
    const architecture = Object.values(project.math?.featureArchitecture?.tiers || {})
      .find(item => item.id === profile.featureTier);
    const behavior = {
      progressiveSymbolUpgrade: 'winning combinations fill a permanent symbol-upgrade meter',
      persistentSymbolMultipliers: 'winning symbol multipliers persist and double',
      winningCascadeReelExpansion: 'winning cascades grow eligible reels',
      persistentPositionMultiplierGrid: 'winning positions charge persistent multipliers',
    }[architecture?.mechanic] || title(architecture?.mechanic || 'configured feature');
    return `${mode.isBuyBonus ? 'Instantly triggers' : 'Plays'} ${profile.freeSpins || 10} ${tier} free spins, where ${behavior}; retriggers are ${profile.retriggers === false ? 'disabled' : 'enabled'}.`;
  }
  const modifiers = [];
  if (Number(profile.scatterWeightMultiplier) > 1) modifiers.push(`${Number(profile.scatterWeightMultiplier)}x scatter-board selection weighting`);
  if (Number(profile.specialSymbolBoost) > 1) modifiers.push(`${Number(profile.specialSymbolBoost)}x special-symbol board selection weighting`);
  const setup = modifiers.length ? modifiers.join(' and ') : 'standard reel selection';
  return `${title(mode.name)} uses ${setup}; natural free spins are ${profile.triggerFreeSpins === false ? 'disabled' : 'enabled'}.`;
}

const isMorpheus = project => (project.build?.stakeEngine?.gameId || project.id) === 'morpheus_dreamfall';

function morpheusModeDescription(mode, project) {
  const governed = (project.math?.governedModes?.modes || []).find(item => item.id === mode.name);
  const access = governed?.entry || modeDescription(mode, project);
  return `${access} This selectable mode costs ${Number(mode.cost)}x, has ${
    (100 * Number(mode.rtp ?? project.math?.rtp)).toFixed(2)
  }% RTP, and a ${Number(mode.maxWin ?? project.math?.wincap).toLocaleString()}x maximum win.`;
}

function winSystem(project) {
  const math = project.math || {};
  const grid = math.grid || {};
  const rows = Array.isArray(grid.rows) ? grid.rows : [];
  const type = GAME_TYPES[math.gameType];
  const ways = rows.reduce((total, count) => total * Number(count || 0), 1);
  const labels = {
    lines: `${Object.keys(math.paylines || {}).length || 'Fixed'} Lines`,
    ways: `${rows.reduce((ways, count) => ways * Number(count || 0), 1).toLocaleString()} Ways`,
    ways5x4: `${rows.reduce((ways, count) => ways * Number(count || 0), 1).toLocaleString()} Ways`,
    ways5x5: `${rows.reduce((ways, count) => ways * Number(count || 0), 1).toLocaleString()} Ways`,
    waysLarge: `${rows.reduce((ways, count) => ways * Number(count || 0), 1).toLocaleString()} Ways`,
    megaways: 'Megaways',
    cluster: 'Cluster Pays',
    scatter: 'Pay Anywhere',
    holdAndSpin: 'Hold & Spin',
    grid: 'Grid Pays',
  };
  return {
    key: math.gameType || '',
    label: labels[math.gameType] || title(math.gameType || 'slot'),
    description: ['ways', 'ways5x4', 'ways5x5', 'waysLarge'].includes(math.gameType)
      ? `Adjacent matching symbols pay from left to right across ${ways.toLocaleString()} active ways. No fixed paylines are used.`
      : type?.description || '',
  };
}

function specialRules(project, symbols) {
  const configured = project.math?.specialSymbols || {};
  const byRole = role => [...new Set([
    ...(configured[role] || []),
    ...symbols.filter(symbol => symbol.special.includes(role)).map(symbol => symbol.name),
  ])];
  const rules = [];
  const wilds = byRole('wild');
  const scatters = byRole('scatter');
  if (wilds.length) rules.push({ key: 'wild', name: wilds.map(title).join(', '), text: `${wilds.map(title).join(', ')} substitute for paying symbols unless a feature explicitly states otherwise; they do not substitute for scatter symbols.` });
  if (scatters.length) rules.push({ key: 'scatter', name: scatters.map(title).join(', '), text: `${scatters.map(title).join(', ')} are scatter symbols and award configured features according to the trigger table.` });
  const morpheusDescriptions = isMorpheus(project) ? {
    expandingWild: 'lands visibly and, after a positive win, expands downward for the next tumble board, stopping before the first wild or protected special; the blocker and every cell below it remain unchanged.',
    multiplier: `acts as a wild and applies its authoritative value to the current displayed settlement only when it contributes. Possible values are ${MORPHEUS_LUCID_WILD_VALUES.join('x, ')}x.`,
    wildBomb: 'lands visibly and, after a positive win, converts its contained up-to-2x2 footprint into RIFT WILDS for the next tumble board.',
    goldWildBomb: 'lands visibly and, after a positive win, converts its contained up-to-3x3 footprint into RIFT WILDS for the next tumble board.',
    split: 'doubles the current displayed ways contribution once for each unique contributing ECHO SPLIT cell; noncontributing Echoes do nothing, and the exact ways before and after are shown.',
    royalRemover: 'lands visibly and, after a positive win, removes low-tier symbols to show empty cells; the following tumble performs one restricted refill that excludes low-tier symbols.',
    wildStar: 'lands visibly and, after a positive win, announces one eligible paying family before converting all authoritative copies of that family, plus itself, into RIFT WILDS for the next tumble board.',
    maxWild: `awards exactly ${MORPHEUS_MAX_WIN_MULTIPLIER.toLocaleString()}x only when visibly contributing, then terminates the round. Ordinary outcomes stop at 99,999.9x.`,
    mystery: 'lands visibly and, after a positive win, makes every Mystery reveal the same paying family for the next tumble board while retaining MYSTERY VEIL as its accounting identity.',
    spawnOnly: 'does not land from normal reel strips and appears only through an authoritative special transformation.',
  } : null;
  const descriptions = morpheusDescriptions || {
    expandingWild: 'expands downward from its landing position to the bottom of its reel before wins are evaluated.',
    multiplier: 'acts as a wild and applies its rolled multiplier only when it contributes to the winning combination.',
    wildBomb: 'turns the up-to-2×2 block beginning at its position into spawned wilds before wins are evaluated.',
    goldWildBomb: 'turns the up-to-3×3 block beginning at its position into spawned wilds before wins are evaluated.',
    split: 'doubles every contributing reel in a winning combination, multiplying an N-reel win by 2 to the power of N.',
    royalRemover: 'replaces every low-tier symbol and itself with non-low paying symbols before wins are evaluated.',
    wildStar: 'selects one paying symbol already present and turns every instance of it, plus itself, into spawned wilds.',
    maxWild: 'awards the configured maximum win only when it participates in a winning combination.',
    mystery: 'makes every Mystery symbol on the board reveal the same randomly selected paying symbol.',
    spawnOnly: 'does not land from the normal reel strips and appears only as the result of another symbol effect.',
  };
  for (const symbol of symbols) {
    const behaviors = symbol.special.filter(flag => descriptions[flag]).map(flag => descriptions[flag]);
    if (!behaviors.length) continue;
    rules.push({ key: `symbol:${symbol.name}`, name: symbol.label, text: `${symbol.label} ${behaviors.join(' ')}` });
  }
  return rules;
}

function featureArchitectureMechanics(project) {
  if (isMorpheus(project)) {
    const tiers = project.math?.featureArchitecture?.tiers || {};
    const tier = (count, key, description) => ({
      key: `featureTier:${tiers[count]?.id || key}`,
      name: tiers[count]?.name || title(key),
      description,
    });
    return [
      tier('3', 'veilAscent', '3 GATE OF SLEEP scatter symbols award 10 Veil Ascent free spins. Each unique contributing paying-family position advances its persistent family bar once per positive 0.1x-quantized resolution, regardless of ways multiplicity. At the configured threshold, the lowest active family upgrades to a random available higher family; progress overflow and upgrades persist.'),
      tier('4', 'lucidBlessing', '4 GATE OF SLEEP scatter symbols award 10 Lucid Blessing free spins. Each paying family begins at 1x and doubles after that family forms a positive settled connection; wild families are excluded. Exactly 3 bonus scatters add 5 spins.'),
      tier('5', 'dreamfall', '5 GATE OF SLEEP scatter symbols award 10 Dreamfall free spins. Every positive settled winning connection grows one random non-maxed reel by one row from 4 to 8 before the next tumble. Scatters cannot enter expansion or tumble refills. The fifth and every later hit in one tumble chain add exactly 1 free spin.'),
      tier('6', 'oneiricNexus', '6 GATE OF SLEEP scatter symbols award 10 Oneiric Nexus free spins. Every position begins at 1x. A win uses 1 plus the sum of each unique contributing cell value above 1x; after the positive settlement, those cells double once up to 1024x. Exactly 3 bonus scatters add 5 spins.'),
    ];
  }
  const descriptions = {
    progressiveSymbolUpgrade: 'Winning combinations fill the upgrade meter. At each configured threshold, the next paying symbol permanently upgrades for the rest of the feature.',
    persistentSymbolMultipliers: 'Each paying symbol that wins doubles its persistent multiplier for later wins in the feature.',
    winningCascadeReelExpansion: 'Each winning combination grows one eligible reel by one row, up to the configured maximum, before the cascade continues.',
    persistentPositionMultiplierGrid: 'Every position touched by a win doubles its stored multiplier; later wins add the charged values of their contributing positions.',
  };
  return Object.entries(project.math?.featureArchitecture?.tiers || {}).map(([scatterCount, tier]) => ({
    key: `featureTier:${tier.id}`,
    name: tier.name || title(tier.id),
    description: `${scatterCount} scatter symbols award ${Number(tier.spins) || 10} free spins. ${descriptions[tier.mechanic] || title(tier.mechanic)} Retriggers follow the configured free-game trigger table.`,
  }));
}

export function createPlayerInformationManifest(project) {
  const math = project.math || {};
  const providerName = String(project.build?.stakeEngine?.providerName || '').trim();
  const symbols = (project.theme?.symbols || []).map(symbol => ({
    name: String(symbol.name || symbol.id || '').trim(),
    label: title(symbol.name || symbol.id),
    tier: symbol.tier || 'standard',
    src: symbol.src || '',
    payouts: clone(symbol.payouts || {}),
    special: [...(symbol.special || [])],
  }));
  const modes = (math.betModes || []).map(mode => ({
    name: String(mode.name || '').trim(),
    label: title(mode.name || 'base'),
    cost: Number(mode.cost),
    rtp: Number(mode.rtp ?? math.rtp),
    maxWin: Number(mode.maxWin ?? math.wincap),
    autoCloseDisabled: Boolean(mode.autoCloseDisabled),
    isFeature: Boolean(mode.isFeature),
    isBuyBonus: Boolean(mode.isBuyBonus),
    settlementMultiplier: Number(mode.profile?.multiplier) || 1,
    freeSpinSettlementMultiplier: Number(mode.profile?.freeSpinMultiplier || mode.profile?.multiplier) || 1,
    description: isMorpheus(project) ? morpheusModeDescription(mode, project) : modeDescription(mode, project),
  }));
  const governedModes = (math.governedModes?.modes || []).map(mode => ({
    name: mode.id,
    label: title(mode.id),
    entryPolicy: mode.entryPolicy,
    selectable: Boolean(mode.selectable),
    releaseGated: Boolean(mode.releaseGated),
    cost: mode.costMultiplier,
    priceClassMultiplier: mode.priceClassMultiplier ?? null,
    description: mode.entry,
    mechanics: [...(mode.mechanics || [])],
  }));
  const mechanics = (math.bonusMechanics || []).map(key => ({
    key,
    name: BONUS_MECHANICS[key]?.name || title(key),
    description: BONUS_MECHANICS[key]?.description || '',
  })).concat(featureArchitectureMechanics(project));
  const triggers = [];
  for (const [gameType, counts] of Object.entries(math.freespinTriggers || {})) {
    for (const [count, spins] of Object.entries(counts || {}).sort(([left], [right]) => Number(left) - Number(right))) {
      if (isMorpheus(project) && gameType === 'freegame' && Number(count) !== 3) continue;
      triggers.push({ gameType, count: Number(count), spins: Number(spins), text: `${count} scatter symbols in ${gameType} award ${spins} free spins.` });
    }
  }
  if (isMorpheus(project)) {
    const freegame = triggers.find(trigger => trigger.gameType === 'freegame' && trigger.count === 3);
    if (freegame) freegame.text = 'Exactly 3 GATE OF SLEEP scatter symbols add 5 spins in Veil Ascent, Lucid Blessing, and Oneiric Nexus. Dreamfall refills exclude scatters and extend only through its fifth-and-later tumble-hit awards.';
  }
  const disclosures = [...LEGAL_DISCLOSURES];
  if (isMorpheus(project)) {
    disclosures.push(`Morpheus contract ${MORPHEUS_CONTRACT_FINGERPRINT}: all non-zero wins settle in 0.1x increments; zero-quantized results cannot advance persistent mechanics.`);
    disclosures.push(`Maximum win is exactly ${MORPHEUS_MAX_WIN_MULTIPLIER.toLocaleString()}x under the three-star profile, with maximum total exposure ${MORPHEUS_MAX_TOTAL_EXPOSURE_USD.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} and maximum base bet ${MORPHEUS_MAX_BASE_BET_USD.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}.`);
    disclosures.push(`Board-changing Mystery, Star, Rift, Veil and Dawn reactions occur only after a positive settled win and affect the following tumble board; LUCID WILD and contributing ECHO SPLIT affect the current displayed settlement.`);
  }
  disclosures.push(`TM and © ${new Date().getUTCFullYear()} Stake Engine.`);
  if (providerName) disclosures.push(`Game content © ${providerName}. Powered by Stake Engine.`);
  return {
    format: 'stake-studio-player-information-v1',
    identity: {
      gameId: project.build?.stakeEngine?.gameId || '',
      name: String(project.build?.stakeEngine?.gameName || project.name || '').trim(),
      version: String(project.version || '').trim(),
      providerName,
      teamName: String(project.build?.stakeEngine?.teamName || '').trim(),
    },
    summary: project.theme?.lore || `${project.name || 'This game'} is a ${math.gameType || 'slot'} game. Matching symbols award the payouts shown below. Every play is independent.`,
    winSystem: winSystem(project),
    rtp: Number(math.rtp),
    wincap: Number(math.wincap),
    volatility: String(math.volatility || ''),
    symbols,
    modes,
    governedModes,
    mechanics,
    triggers,
    specialRules: specialRules(project, symbols),
    controls: 'Use Menu for sound, fast play, and Game Info. Use Bonus or the mode chip to select a game mode, −/+ to change play amount, Spin to start or stop autoplay, Auto to choose a limited autoplay count, and Fast to toggle fast play. Spacebar and fullscreen are available only when jurisdiction settings allow them.',
    disclosures,
    disclaimer: disclosures.join(' '),
  };
}

export function getPlayerInformationFingerprint(project) {
  const manifest = createPlayerInformationManifest(project);
  const compact = {
    ...manifest,
    symbols: manifest.symbols.map(symbol => ({
      ...symbol,
      src: symbol.src ? [symbol.src.length, symbol.src.slice(0, 24), symbol.src.slice(-32)] : '',
    })),
  };
  return hashText(JSON.stringify(compact));
}

export function evaluatePlayerInformation(project) {
  const manifest = createPlayerInformationManifest(project);
  const issues = [];
  if (!manifest.identity.name) issues.push('Game name is missing.');
  if (!manifest.identity.gameId) issues.push('Stake game ID is missing.');
  if (!manifest.identity.providerName) issues.push('Provider name is missing.');
  if (!GAME_TYPES[manifest.winSystem.key] || !manifest.winSystem.description) issues.push(`Win-system explanation is missing for ${manifest.winSystem.key || 'the selected game type'}.`);
  if (!(manifest.rtp > 0 && manifest.rtp < 1)) issues.push('RTP must be a decimal between 0 and 1.');
  if (!(manifest.wincap > 0)) issues.push('Maximum win must be greater than zero.');
  if (!manifest.volatility) issues.push('Volatility is missing.');
  if (!manifest.modes.length) issues.push('At least one wager mode is required.');
  const modeNames = new Set();
  for (const mode of manifest.modes) {
    if (!mode.name) issues.push('A wager mode has no name.');
    if (modeNames.has(mode.name)) issues.push(`Wager mode ${mode.name} is duplicated.`);
    modeNames.add(mode.name);
    if (!(mode.cost > 0)) issues.push(`${mode.label || 'A wager mode'} has an invalid cost.`);
    if (!(mode.rtp > 0 && mode.rtp < 1)) issues.push(`${mode.label || 'A wager mode'} has an invalid RTP.`);
    if (!(mode.maxWin > 0)) issues.push(`${mode.label || 'A wager mode'} has no maximum win.`);
    if (!mode.description) issues.push(`${mode.label || 'A wager mode'} has no player-facing description.`);
  }
  const paidSymbols = manifest.symbols.filter(symbol => Object.values(symbol.payouts).some(value => Number(value) > 0));
  if (!paidSymbols.length) issues.push('No paying symbols are documented.');
  for (const symbol of paidSymbols) {
    if (!symbol.name) issues.push('A paying symbol has no name.');
    if (Object.entries(symbol.payouts).some(([count, payout]) => !(Number(count) > 0 && Number(payout) > 0))) issues.push(`${symbol.label || 'A symbol'} has an invalid payout entry.`);
  }
  for (const mechanic of manifest.mechanics) if (!mechanic.description) issues.push(`${mechanic.name} has no registered player-facing explanation.`);
  const scatterConfigured = manifest.specialRules.some(rule => rule.key === 'scatter');
  const freeSpinMode = manifest.modes.some(mode => mode.isBuyBonus || mode.isFeature);
  if ((scatterConfigured || freeSpinMode) && !manifest.triggers.length && !manifest.modes.some(mode => mode.isBuyBonus)) issues.push('A scatter or feature mode is configured without a documented entry trigger.');
  if (LEGAL_DISCLOSURES.some(disclosure => !manifest.disclaimer.includes(disclosure))) issues.push('Mandatory malfunction, connection, RTP, display, or server-settlement disclosure is missing.');
  return { passed: issues.length === 0, issues: [...new Set(issues)], manifest };
}

export function recordPlayerInformationQA(project) {
  project.production ||= {};
  project.production.qa ||= {};
  const evaluation = evaluatePlayerInformation(project);
  project.production.qa.playerInformationAudit = {
    format: PLAYER_INFORMATION_FORMAT,
    fingerprint: getPlayerInformationFingerprint(project),
    runAt: new Date().toISOString(),
    passed: evaluation.passed,
    issues: evaluation.issues,
    symbolCount: evaluation.manifest.symbols.length,
    modeCount: evaluation.manifest.modes.length,
    mechanicCount: evaluation.manifest.mechanics.length,
    triggerCount: evaluation.manifest.triggers.length,
    disclosureCount: evaluation.manifest.disclosures.length,
  };
  return getPlayerInformationSummary(project);
}

export function getPlayerInformationSummary(project) {
  const fingerprint = getPlayerInformationFingerprint(project);
  const report = project.production?.qa?.playerInformationAudit || null;
  const fresh = report?.format === PLAYER_INFORMATION_FORMAT && report.fingerprint === fingerprint;
  const evaluation = fresh ? evaluatePlayerInformation(project) : null;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && evaluation?.passed),
    issues: evaluation?.issues || [],
    manifest: evaluation?.manifest || createPlayerInformationManifest(project),
    runAt: fresh ? report.runAt || null : null,
  };
}
