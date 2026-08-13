import { MathEngine } from '../math/MathEngine.js';
import { SeededRNG } from '../math/SeededRNG.js';
import {
  PresentationDirectorRuntime,
  normalizePresentationDirector,
  validatePresentationDirector,
} from '../presentation/PresentationDirector.js';

const REPLAY_FORMAT = 'stake-studio-replay-matrix-qa-v1';
const REPLAY_SEEDS = [0x51a7e, 0x9e3779b1, 0xc0ffee];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sourceSignature(value) {
  const source = String(value || '');
  if (!/^(data:|blob:|https?:)/.test(source)) return source;
  return [source.length, source.slice(0, 28), source.slice(-40)];
}

function compactSources(value) {
  if (Array.isArray(value)) return value.map(compactSources);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? sourceSignature(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, compactSources(child)]));
}

export function getReplayFingerprint(project) {
  return hashText(JSON.stringify(canonicalize(compactSources({
    math: project.math,
    director: normalizePresentationDirector(project.presentationDirector || {}),
    animation: {
      states: project.animation?.states,
      stateAnimations: project.animation?.stateAnimations,
      runtime: project.animation?.runtime,
    },
    audio: {
      layers: project.audio?.layers,
      stingers: project.audio?.stingers,
      director: project.audio?.director,
    },
  }))));
}

function resolvedTarget(target, payload) {
  if (typeof target !== 'string' || !target.startsWith('$')) return target;
  const value = payload[target.slice(1)];
  if (Array.isArray(value)) return value.map(item => ({
    symbol: item?.symbol || '',
    amount: Number(item?.amount ?? item?.payout ?? item?.win) || 0,
    positions: item?.positions || [],
  }));
  return value ?? null;
}

function scenarioDefinitions(project) {
  const mode = project.math?.betModes?.[0]?.name || 'base';
  const symbol = project.theme?.symbols?.find(item => !(item.special || []).length)?.name || 'L1';
  const rows = project.math?.grid?.rows || [3, 3, 3, 3, 3];
  const board = rows.map(count => Array.from({ length: count || rows[0] || 3 }, () => symbol));
  const win = { symbol, payout: 5, positions: [[0, 1], [1, 1], [2, 1]] };
  const event = (name, payload = {}) => ({ event: name, payload: { mode, board, wins: [win], ...payload } });
  return [
    {
      id: 'loss', label: 'Loss recovery',
      events: [event('spinStart'), event('reveal', { wins: [], anticipation: false }), event('roundLose', { wins: [], amount: 0 })],
    },
    {
      id: 'normal-win', label: 'Normal win',
      events: [event('spinStart'), event('reveal'), event('winInfo', { amount: 5, runningAmount: 5 }), event('setWin', { amount: 5 })],
    },
    {
      id: 'big-win', label: 'Big win escalation',
      events: [event('spinStart'), event('reveal'), event('winInfo', { amount: 50, runningAmount: 50 }), event('setWin', { amount: 50 })],
    },
    {
      id: 'bonus', label: 'Bonus entry and exit',
      events: [
        event('spinStart'), event('reveal'), event('freeSpinTrigger', { amount: 18, spins: 10 }),
        event('enterBonus', { amount: 18, spins: 10 }), event('winInfo', { amount: 18, runningAmount: 18 }),
        event('setWin', { amount: 18 }), event('freeSpinEnd', { amount: 18, spins: 10 }),
      ],
    },
    {
      id: 'wincap', label: 'Maximum-win settlement',
      events: [
        event('spinStart'), event('reveal'),
        event('winInfo', { amount: Number(project.math?.wincap) || 5000, runningAmount: Number(project.math?.wincap) || 5000 }),
        event('setWin', { amount: Number(project.math?.wincap) || 5000 }),
        event('wincap', { amount: Number(project.math?.wincap) || 5000 }),
      ],
    },
  ];
}

async function presentationTrace(project, scenario) {
  const trace = [];
  const statuses = [];
  const runtime = new PresentationDirectorRuntime(project, {
    wait: async () => Promise.resolve(),
    execute: async (cue, payload, recipe) => {
      trace.push(canonicalize({
        event: recipe.event,
        cue: cue.id,
        channel: cue.channel,
        action: cue.action,
        target: resolvedTarget(cue.target, payload),
      }));
    },
  });
  for (const step of scenario.events) statuses.push((await runtime.dispatch(step.event, step.payload)).status);
  return { trace, statuses, settled: runtime.active === null };
}

async function presentationCase(project, scenario) {
  const first = await presentationTrace(project, scenario);
  const second = await presentationTrace(project, scenario);
  const invalidStatus = first.statuses.find(status => status !== 'completed') || second.statuses.find(status => status !== 'completed');
  const identical = JSON.stringify(first) === JSON.stringify(second);
  const passed = !invalidStatus && identical && first.settled && first.trace.length > 0;
  return {
    id: `presentation:${scenario.id}`,
    kind: 'presentation',
    label: scenario.label,
    passed,
    traceHash: hashText(JSON.stringify(first.trace)),
    events: scenario.events.length,
    cues: first.trace.length,
    detail: passed
      ? `${scenario.events.length} events produced ${first.trace.length} identical cues and a clean settled state.`
      : invalidStatus ? `A required presentation event returned ${invalidStatus}.` : 'Repeated presentation traces did not match or settle cleanly.',
  };
}

function mathCase(project, mode, seed, index) {
  const engine = new MathEngine(project);
  const firstRng = new SeededRNG(seed);
  const secondRng = new SeededRNG(seed);
  const first = canonicalize(engine.resolveRound(() => firstRng.random(), mode.name));
  const second = canonicalize(engine.resolveRound(() => secondRng.random(), mode.name));
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return {
    id: `math:${mode.name}:${index + 1}`,
    kind: 'math',
    label: `${mode.name} seed ${seed >>> 0}`,
    passed: identical,
    seed: seed >>> 0,
    mode: mode.name,
    outcomeHash: hashText(JSON.stringify(first)),
    totalWin: Number(first.totalWin) || 0,
    freeSpins: Number(first.freeSpinsPlayed) || 0,
    wincapHit: Boolean(first.wincapHit),
    detail: identical ? 'Repeated seeded rounds produced an identical complete outcome.' : 'The same seed produced different round data.',
  };
}

export async function runReplayMatrixQA(project) {
  const fingerprint = getReplayFingerprint(project);
  const structuralIssues = validatePresentationDirector(project)
    .filter(item => item.severity === 'error')
    .map(item => item.message);
  const scenarios = scenarioDefinitions(project);
  const enabledEvents = new Set(normalizePresentationDirector(project.presentationDirector || {}).recipes
    .filter(recipe => recipe.enabled && recipe.cues.some(cue => cue.enabled))
    .map(recipe => recipe.event));
  const requiredEvents = new Set(scenarios.flatMap(scenario => scenario.events.map(step => step.event)));
  for (const event of requiredEvents) {
    if (!enabledEvents.has(event)) structuralIssues.push(`Replay matrix requires a mapped "${event}" presentation recipe.`);
  }
  const cases = [];
  if (!structuralIssues.length) {
    for (const scenario of scenarios) cases.push(await presentationCase(project, scenario));
    const modes = project.math?.betModes?.length ? project.math.betModes : [{ name: 'base' }];
    for (const [modeIndex, mode] of modes.entries()) {
      REPLAY_SEEDS.forEach((seed, seedIndex) => cases.push(mathCase(project, mode, (seed + modeIndex * 7919) >>> 0, seedIndex)));
    }
  }
  const failures = cases.filter(item => !item.passed);
  const presentationCases = cases.filter(item => item.kind === 'presentation');
  const mathCases = cases.filter(item => item.kind === 'math');
  const report = {
    format: REPLAY_FORMAT,
    fingerprint,
    runAt: new Date().toISOString(),
    passed: structuralIssues.length === 0 && presentationCases.length === 5 && mathCases.length > 0 && failures.length === 0,
    total: cases.length,
    passedCases: cases.length - failures.length,
    presentationCases: presentationCases.length,
    mathCases: mathCases.length,
    structuralIssues,
    cases,
  };
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.replayAudit = report;
  return report;
}

export function getReplayMatrixSummary(project) {
  const fingerprint = getReplayFingerprint(project);
  const report = project.production?.qa?.replayAudit || null;
  const fresh = report?.format === REPLAY_FORMAT && report.fingerprint === fingerprint;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && report.passed),
    total: fresh ? report.total || 0 : 0,
    passed: fresh ? report.passedCases || 0 : 0,
    presentationCases: fresh ? report.presentationCases || 0 : 0,
    mathCases: fresh ? report.mathCases || 0 : 0,
    failures: fresh ? (report.cases || []).filter(item => !item.passed) : [],
    structuralIssues: fresh ? report.structuralIssues || [] : [],
    runAt: fresh ? report.runAt || null : null,
  };
}
