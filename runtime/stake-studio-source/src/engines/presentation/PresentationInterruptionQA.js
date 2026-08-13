import {
  PresentationDirectorRuntime,
  normalizePresentationDirector,
  validatePresentationDirector,
} from './PresentationDirector.js';

const QA_FORMAT = 'stake-studio-presentation-interruption-qa-v1';
const SAMPLE_PAYLOAD = { amount: 25, runningAmount: 25, wins: [], mode: 'base', spins: 10 };

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getPresentationFingerprint(project) {
  return hashText(JSON.stringify(normalizePresentationDirector(project.presentationDirector || {})));
}

function expectedExecution(recipe) {
  const cues = recipe.cues.filter(item => item.enabled).map(item => item.id);
  if (recipe.settleState) cues.push('settle');
  return cues;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return true;
    await Promise.resolve();
  }
  return predicate();
}

async function soloCase(project, recipe) {
  const executed = [];
  const runtime = new PresentationDirectorRuntime(project, {
    wait: async () => Promise.resolve(),
    execute: async (item, _payload, activeRecipe) => { executed.push(`${activeRecipe.id}:${item.id}`); },
  });
  const result = await runtime.dispatch(recipe.event, SAMPLE_PAYLOAD);
  const actual = executed.map(value => value.slice(value.indexOf(':') + 1));
  const expected = expectedExecution(recipe);
  const passed = result.status === 'completed' && JSON.stringify(actual) === JSON.stringify(expected) && runtime.active === null;
  return {
    id: `solo:${recipe.id}`, kind: 'solo', event: recipe.event, policy: recipe.interrupt, passed,
    detail: passed ? `${actual.length} cues executed in order and settled cleanly.` : `Expected ${expected.join(', ') || 'no cues'}; received ${result.status}: ${actual.join(', ') || 'none'}.`,
  };
}

async function cancelCase(project, recipe) {
  let release;
  let blocked = false;
  const runtime = new PresentationDirectorRuntime(project, {
    wait: async () => Promise.resolve(),
    execute: async () => {
      if (blocked) return;
      blocked = true;
      await new Promise(resolve => { release = resolve; });
    },
  });
  const running = runtime.dispatch(recipe.event, SAMPLE_PAYLOAD);
  const reachedCue = await waitFor(() => Boolean(release));
  runtime.cancel('qa-cancel');
  release?.();
  const result = await running;
  const passed = reachedCue && result.status === 'cancelled' && runtime.active === null;
  return {
    id: `cancel:${recipe.id}`, kind: 'cancel', event: recipe.event, policy: recipe.interrupt, passed,
    detail: passed ? 'Explicit cancellation stopped the active recipe and cleared runtime state.' : `Cancellation returned ${result.status}; active state ${runtime.active ? 'remained' : 'cleared'}.`,
  };
}

async function policyCase(project, target, recipes) {
  const predecessor = recipes.find(recipe => recipe.id !== target.id) || target;
  let release;
  let blocked = false;
  const executed = [];
  const runtime = new PresentationDirectorRuntime(project, {
    wait: async () => Promise.resolve(),
    execute: async (item, _payload, recipe) => {
      executed.push(`${recipe.id}:${item.id}`);
      if (blocked) return;
      blocked = true;
      await new Promise(resolve => { release = resolve; });
    },
  });
  const first = runtime.dispatch(predecessor.event, SAMPLE_PAYLOAD);
  const reachedCue = await waitFor(() => Boolean(release));
  const second = runtime.dispatch(target.event, SAMPLE_PAYLOAD);
  await Promise.resolve();
  const targetRanBeforeRelease = executed.some(value => value.startsWith(`${target.id}:`)) && predecessor.id !== target.id;
  release?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  let passed = reachedCue;
  let expected = '';
  if (target.interrupt === 'replace') {
    passed &&= firstResult.status === 'cancelled' && secondResult.status === 'completed';
    expected = 'cancelled the active recipe and completed the replacement';
  } else if (target.interrupt === 'queue') {
    passed &&= !targetRanBeforeRelease && firstResult.status === 'completed' && secondResult.status === 'completed';
    expected = 'waited for the active recipe, then completed in order';
  } else {
    passed &&= secondResult.status === 'ignored' && firstResult.status === 'completed';
    expected = 'ignored the new event while the active recipe completed';
  }
  return {
    id: `policy:${target.id}`, kind: 'policy', event: target.event, policy: target.interrupt, passed,
    detail: passed ? `${target.interrupt} policy ${expected}.` : `${target.interrupt} policy produced active=${firstResult.status}, incoming=${secondResult.status}.`,
  };
}

export async function runPresentationInterruptionQA(project) {
  const director = normalizePresentationDirector(project.presentationDirector || {});
  const recipes = director.recipes.filter(recipe => recipe.enabled && recipe.cues.some(item => item.enabled));
  const structuralIssues = validatePresentationDirector(project).filter(item => item.severity === 'error');
  const fingerprint = getPresentationFingerprint(project);
  let cases = [];
  if (!structuralIssues.length) {
    for (const recipe of recipes) cases.push(await soloCase(project, recipe));
    for (const recipe of recipes) cases.push(await cancelCase(project, recipe));
    for (const recipe of recipes) cases.push(await policyCase(project, recipe, recipes));
  }
  const failures = cases.filter(item => !item.passed);
  const runAt = new Date().toISOString();
  const report = {
    format: QA_FORMAT,
    fingerprint,
    runAt,
    passed: structuralIssues.length === 0 && cases.length > 0 && failures.length === 0,
    total: cases.length,
    passedCases: cases.length - failures.length,
    structuralIssues: structuralIssues.map(item => item.message),
    cases,
  };
  project.production ||= {};
  project.production.presentation ||= {};
  project.production.presentation.interruptionAudit = report;
  return report;
}

export function getPresentationInterruptionSummary(project) {
  const fingerprint = getPresentationFingerprint(project);
  const report = project.production?.presentation?.interruptionAudit || null;
  const fresh = report?.format === QA_FORMAT && report.fingerprint === fingerprint;
  return {
    fingerprint,
    storedFingerprint: report?.fingerprint || null,
    fresh,
    stale: Boolean(report) && !fresh,
    complete: Boolean(fresh && report.passed),
    total: fresh ? report.total || 0 : 0,
    passed: fresh ? report.passedCases || 0 : 0,
    failures: fresh ? (report.cases || []).filter(item => !item.passed) : [],
    structuralIssues: fresh ? report.structuralIssues || [] : [],
    runAt: fresh ? report.runAt || null : null,
  };
}
