import {
  cpSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statfsSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mathSDKFilesFingerprint } from '../src/engines/build/MathSDKExporter.js';
import { MORPHEUS_LUCID_WILD_VALUES } from '../src/engines/morpheus/MorpheusGameContract.js';
import { maximumWinHitRateForMode } from '../src/engines/math/MaximumWinPolicy.js';
import { persistProjectDocument, readProjectDocument } from './project-storage.mjs';

const LOG_LIMIT = 80_000;
const PROFILES = new Set(['smoke', 'draft', 'production']);

export function getMathPublisherProfile(profile = 'smoke') {
  const id = PROFILES.has(profile) ? profile : 'smoke';
  return {
    id,
    optimization: id === 'production',
    analysis: id === 'production',
    threads: id === 'smoke' ? 1 : 5,
    rustThreads: id === 'production' ? 5 : 1,
    batchSize: id === 'production' ? 5000 : id === 'smoke' ? 1000 : 5000,
    simulationCap: id === 'smoke' ? 1000 : id === 'draft' ? 25000 : null,
  };
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b) [a, b] = [b, a % b];
  return a;
}

export function getMathPublisherExecution(profileConfig, rounds = {}) {
  const counts = Object.values(rounds).map(Number).filter(value => Number.isInteger(value) && value > 0);
  let threads = Math.max(1, Math.trunc(profileConfig.threads || 1));
  while (threads > 1 && counts.some(count => count % threads !== 0)) threads -= 1;
  const perThread = counts.map(count => count / threads);
  const common = perThread.reduce((value, count) => greatestCommonDivisor(value, count), 0) || 1;
  const desiredBatch = Math.max(1, Math.trunc(profileConfig.batchSize || 1));
  const batchSize = greatestCommonDivisor(common, desiredBatch) || 1;
  return { threads, rustThreads: Math.max(1, Math.trunc(profileConfig.rustThreads || 1)), batchSize };
}

export function getProjectMathPublisherExecution(project, profileConfig, rounds = {}) {
  const containsFeatureJourneys = (project.math?.betModes || []).some(isFeatureMode);
  const simulationProfile = containsFeatureJourneys && profileConfig.id === 'production'
    ? { ...profileConfig, threads: 1 }
    : profileConfig;
  return {
    ...getMathPublisherExecution(simulationProfile, rounds),
    featureJourneySafe: containsFeatureJourneys && profileConfig.id === 'production',
  };
}

const GIB = 1024 ** 3;

function isFeatureMode(mode = {}) {
  return Boolean(mode.isBuyBonus || mode.autoCloseDisabled || mode.profile?.entry === 'freeSpins');
}

export function getMathPublisherRounds(project, profileConfig, simulations = {}) {
  return Object.fromEntries((project.math?.betModes || []).map(mode => {
    const productionDefault = isFeatureMode(mode)
      ? Number(project.build?.simulations?.bonus)
      : Number(project.build?.simulations?.base);
    const configured = Math.max(
      1,
      Number(simulations[mode.name])
        || Number(project.build?.simulations?.[mode.name])
        || productionDefault
        || 100000,
    );
    return [mode.name, profileConfig.simulationCap ? Math.min(configured, profileConfig.simulationCap) : configured];
  }));
}

export function estimateMathPublisherWorkspace(project, profileConfig, simulations = {}) {
  const rounds = getMathPublisherRounds(project, profileConfig, simulations);
  const rawBytes = (project.math?.betModes || []).reduce((sum, mode) => {
    // Free-spin books contain the full feature journey and are materially
    // larger than one-spin chance-mode books. These conservative per-book
    // estimates cover raw books, lookup tables and optimizer intermediates.
    const bytesPerBook = isFeatureMode(mode) ? 18 * 1024 : 5 * 1024;
    return sum + (rounds[mode.name] || 0) * bytesPerBook;
  }, 0);
  const workingBytes = Math.ceil(rawBytes * 1.75 + 512 * 1024 ** 2);
  return { rounds, rawBytes, workingBytes, reserveBytes: GIB, requiredFreeBytes: workingBytes + GIB };
}

function directoryBytes(path) {
  if (!existsSync(path)) return 0;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce((total, name) => total + directoryBytes(join(path, name)), 0);
}

function safeId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('A project id is required.');
  return id;
}

function readJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2));
  renameSync(temp, path);
}

function fileSha256(path) {
  const digest = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(path, 'r');
  try {
    for (let bytes = readSync(descriptor, buffer, 0, buffer.length, null); bytes > 0;
      bytes = readSync(descriptor, buffer, 0, buffer.length, null)) {
      digest.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest('hex');
}

export function synchronizeMathConfigHashes(library) {
  const configs = join(library, 'configs');
  const publish = join(library, 'publish_files');
  const forces = join(library, 'forces');
  const configPath = join(configs, 'config.json');
  const config = readJson(configPath);
  if (!config) throw new Error('Official math output is missing configs/config.json.');

  const refresh = (entry, path, label) => {
    if (!entry?.file || !existsSync(path)) throw new Error(`Official math output is missing ${label}.`);
    entry.sha256 = fileSha256(path);
  };
  const frontendPath = join(configs, `config_fe_${config.gameID}.json`);
  refresh(config.frontendConfig, frontendPath, `frontend config for ${config.gameID}`);
  refresh(config.standardForceFile, join(forces, config.standardForceFile?.file || ''), 'standard force file');
  for (const shelf of config.bookShelfConfig || []) {
    for (const table of shelf.tables || []) refresh(table, join(publish, table.file || ''), `lookup table for ${shelf.name}`);
    refresh(shelf.booksFile, join(publish, shelf.booksFile?.file || ''), `book file for ${shelf.name}`);
    refresh(shelf.forceFile, join(forces, shelf.forceFile?.file || ''), `force file for ${shelf.name}`);
  }
  atomicJson(configPath, config);
  return config;
}

export function updateMathPublishProject(path, job, report) {
  const project = readProjectDocument(path, null).project;
  if (!project) throw new Error(`Project ${job.projectId} disappeared before publisher completion.`);
  const modeNames = report.modes.map(mode => mode.name);
  const targetValues = (project.math?.betModes || []).map(mode => Number(mode.rtp ?? project.math.rtp));
  const targetRtp = targetValues.length && targetValues.every(value => value === targetValues[0]) ? targetValues[0] : null;
  const rtpAligned = report.modes.every(mode => Number.isFinite(mode.delta) && Math.abs(mode.delta) <= 1e-8);
  project.build ||= {};
  project.build.mathPublish = {
    version: 1,
    profile: job.profile,
    jobId: job.id,
    totalBooks: report.totalBooks,
    modes: modeNames,
    targetRtp,
    modeReports: report.modes,
    rtpAligned,
    officialVerification: job.profile === 'production' && rtpAligned,
    fullStreamIntegrity: report.fullStreamIntegrity === true,
    modeContractChecks: Array.isArray(report.modeContractChecks) ? report.modeContractChecks : [],
    contractFingerprint: job.contractFingerprint || null,
    sdkExitCode: 0,
    generatedAt: new Date().toISOString(),
  };
  const morpheusReleaseVerified = (
    project.build?.stakeEngine?.gameId === 'morpheus_dreamfall'
    && job.profile === 'production'
    && rtpAligned
    && report.fullStreamIntegrity === true
    && report.morpheusProductionMath?.passed === true
  );
  if (morpheusReleaseVerified) {
    const multiplierSymbols = project.math?.mechanicConfig?.multiplierSymbols;
    if (!multiplierSymbols) throw new Error('Morpheus production verification cannot promote a missing Lucid weight configuration.');
    multiplierSymbols.valueWeightStatus = 'production-optimized';
    multiplierSymbols.productionOptimizationEvidence = {
      format: 'morpheus-lucid-production-optimization-evidence-v1',
      jobId: job.id,
      contractFingerprint: job.contractFingerprint || null,
      generatedAt: project.build.mathPublish.generatedAt,
      fullStreamIntegrity: true,
      exactRtp: true,
      modes: report.modes.map(mode => ({
        name: mode.name,
        exactRtp: mode.exactRtp,
        lucidValueWeights: mode.lucidValueWeights,
      })),
    };
  }
  persistProjectDocument(path, project);
  return project.build.mathPublish;
}

export function attachMathTailAnalysis(report, stats = {}) {
  const limits = { prob5k: 1e-2, prob10k: 0.5e-2, etl40b: 0.9, etl10k: 0.8, cvar: 800 };
  return {
    ...report,
    modes: (report.modes || []).map(mode => {
      const raw = stats?.[mode.name];
      const cost = Number(mode.cost);
      if (!raw || !(cost > 0)) return mode;
      const sdkRaw = Object.fromEntries(Object.keys(limits).map(key => [key, Number(raw[key] || 0)]));
      const sdkAdvisories = Object.entries(limits)
        .filter(([key, limit]) => sdkRaw[key] > limit)
        .map(([metric, limit]) => ({ metric, value: sdkRaw[metric], limit }));
      return {
        ...mode,
        tailAnalysis: {
          source: 'official-math-sdk/stats_summary.json',
          blocking: false,
          thresholdBasis: 'The SDK warning table uses raw base-bet payout units for every mode; cost-normalized values are included for paid-mode review.',
          sdkRaw,
          costNormalized: {
            etl40b: sdkRaw.etl40b / cost,
            etl10k: sdkRaw.etl10k / cost,
            cvar: sdkRaw.cvar / cost,
          },
          sdkAdvisories,
        },
      };
    }),
  };
}

export function validatePublishedModeContracts(project, report) {
  const modes = project.math?.betModes || [];
  const reports = new Map((report.modes || []).map(mode => [mode.name, mode]));
  const referenceMode = modes.find(mode => mode.name === 'base')
    || modes.find(mode => (
      (mode.profile?.entry || 'base') === 'base'
      && mode.profile?.triggerFreeSpins !== false
      && !(Number(mode.profile?.scatterWeightMultiplier) > 1)
    ));
  if (!referenceMode) return [];
  const referenceChance = Number(reports.get(referenceMode.name)?.criteriaProbability?.freegame);
  const checks = [];
  for (const mode of modes) {
    const boost = Number(mode.profile?.scatterWeightMultiplier) || 1;
    const isNaturalFeatureMode = (mode.profile?.entry || 'base') === 'base' && mode.profile?.triggerFreeSpins !== false;
    if (!isNaturalFeatureMode || boost <= 1) continue;
    const actualChance = Number(reports.get(mode.name)?.criteriaProbability?.freegame);
    if (!Number.isFinite(referenceChance) || !Number.isFinite(actualChance) || actualChance <= referenceChance * 5) {
      throw new Error(
        `Production mode contract failed: ${mode.name} promises increased feature entry, `
        + `but its weighted freegame probability ${Number.isFinite(actualChance) ? actualChance : 'is unavailable'} `
        + `is not more than 5x ${referenceMode.name} ${Number.isFinite(referenceChance) ? referenceChance : 'unavailable'}.`,
      );
    }
    checks.push({ mode: mode.name, contract: 'more-than-five-times-feature-entry', referenceMode: referenceMode.name, referenceChance, actualChance, ratio: actualChance / referenceChance, declaredBoost: boost });
  }
  return checks;
}

export function validateMorpheusPublishedMath(project, report) {
  if (project.build?.stakeEngine?.gameId !== 'morpheus_dreamfall') return { applicable: false, passed: true, checks: [] };
  const reports = new Map((report.modes || []).map(mode => [mode.name, mode]));
  const checks = [];
  const fail = message => { throw new Error(`Morpheus production math failed: ${message}`); };
  const add = (mode, contract, evidence) => checks.push({ mode, contract, evidence });
  const observedLucid = { basegame: new Set(), freegame: new Set() };
  for (const mode of project.math?.betModes || []) {
    const published = reports.get(mode.name);
    if (!published) fail(`missing published mode ${mode.name}.`);
    if (Math.abs(Number(published.exactRtp) - 0.96) > 1e-8) fail(`${mode.name} does not settle at exactly 96.00% RTP.`);
    if (Number(published.maxPayout) !== 100_000) fail(`${mode.name} does not contain the exact 100,000x MAX outcome.`);
    if (Number(published.ordinaryMaxPayout) > 99_999.9) fail(`${mode.name} has an ordinary outcome above 99,999.9x.`);
    if (Number(published.wincapCausality?.missingVisibleMaxWeight) !== 0
      || !(Number(published.wincapCausality?.visibleMaxWeight) > 0)) {
      fail(`${mode.name} has a positive-weight MAX criterion without visible MAX_MORPHEUS causality.`);
    }
    const expectedProbability = maximumWinHitRateForMode(project.math, mode);
    const actualProbability = Number(published.criteriaProbability?.wincap);
    if (Math.abs(actualProbability - expectedProbability) > 1e-12) {
      fail(`${mode.name} MAX probability ${actualProbability} differs from governed ${expectedProbability}.`);
    }
    if (Math.abs(Number(published.criteriaRtp?.wincap) - 0.01) > 1e-12) {
      fail(`${mode.name} MAX criterion does not contribute exactly 1.00% RTP.`);
    }
    const tail = published.finalLutTail || {};
    if (Number(tail.nonZeroProbability) <= 0.05) fail(`${mode.name} non-zero hit rate is not above 1 in 20.`);
    if (Number(tail.standardDeviation) < 0.6 || Number(tail.standardDeviation) > 60) fail(`${mode.name} cost-normalized standard deviation is outside 0.6–60.`);
    if (Number(tail.probabilityAtLeast5000) > 0.01 || Number(tail.probabilityAtLeast10000) > 0.005) {
      fail(`${mode.name} exceeds scaled 5,000x/10,000x probability limits.`);
    }
    const base = Number(mode.cost) === 1;
    const etl40 = Number(base ? tail.expectedTailLossAt40BetsRaw : tail.expectedTailLossAt40BetsCostNormalized);
    const etl10k = Number(base ? tail.expectedTailLossAt10000Raw : tail.expectedTailLossAt10000CostNormalized);
    const cvar = Number(base ? tail.cvarUpperPointOnePercentRaw : tail.cvarUpperPointOnePercentCostNormalized);
    if (etl40 > 0.9 || etl10k > 0.8 || cvar > 800) fail(`${mode.name} exceeds ${base ? 'raw' : 'cost-normalized'} three-star tail limits.`);
    for (const gameType of ['basegame', 'freegame']) {
      for (const [value, weight] of Object.entries(published.lucidValueWeights?.[gameType] || {})) {
        if (Number(weight) > 0) observedLucid[gameType].add(Number(value));
      }
    }
    add(mode.name, 'exact-cost-aware-100000x-tail', { exactRtp: published.exactRtp, maxProbability: actualProbability, maxRtp: published.criteriaRtp?.wincap, tail });
  }
  for (const gameType of ['basegame', 'freegame']) {
    const missing = MORPHEUS_LUCID_WILD_VALUES.filter(value => !observedLucid[gameType].has(value));
    if (missing.length) fail(`${gameType} final LUTs have no positive-weight evidence for LUCID_WILD values ${missing.join(', ')}.`);
    add(gameType, 'full-lucid-ladder-positive-weight', { values: [...observedLucid[gameType]].sort((a, b) => a - b) });
  }
  return { applicable: true, passed: true, checks };
}

export function generateReviewerReplayEventCatalog(library, project, python) {
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const generator = join(serverDir, 'generate_reviewer_replay_catalog.py');
  const policies = Object.fromEntries((project.math?.betModes || []).map(mode => [mode.name, {
    entry: mode.profile?.entry || 'base',
    triggerFreeSpins: mode.profile?.triggerFreeSpins !== false,
  }]));
  const generated = spawnSync(python, [generator, library, JSON.stringify(policies)], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const lines = String(generated.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  let catalog = null;
  for (let index = lines.length - 1; index >= 0; index--) {
    try { catalog = JSON.parse(lines[index]); break; } catch { /* keep looking */ }
  }
  if (generated.status !== 0 || !catalog?.complete) {
    throw new Error(catalog?.error || generated.stderr || 'Reviewer replay event catalog generation failed.');
  }
  atomicJson(join(library, 'reviewer-replay-event-catalog.json'), catalog);
  return catalog;
}

function appendLog(job, chunk) {
  job.log = `${job.log}${String(chunk)}`.slice(-LOG_LIMIT);
  job.updatedAt = new Date().toISOString();
}

function modeEnvName(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function createMathPublisher({ studioHome }) {
  const home = resolve(studioHome);
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const gamesDir = join(home, 'games');
  const sdkRoot = realpathSync(join(home, 'reference', 'math-sdk'));
  const sdkGames = join(sdkRoot, 'games');
  const python = join(sdkRoot, 'env', 'bin', 'python');
  const verifier = join(serverDir, 'verify_math_publish.py');
  const aligner = join(serverDir, 'align_math_publish.py');
  const officialVerifier = join(serverDir, 'refresh_official_math_verification.py');
  const workspaceRoot = join(home, 'build', 'math-sdk-workspaces');
  const jobs = new Map();

  if (!existsSync(python)) throw new Error('The official math-sdk Python environment is not installed.');

  function prepareWorkspace(projectId, files) {
    const id = safeId(projectId);
    const prefix = `games/${id}/`;
    const entries = Object.entries(files || {});
    if (!entries.length) throw new Error('Generated math-sdk files are required.');
    for (const [relative, contents] of entries) {
      if (!relative.startsWith(prefix) || relative.includes('..') || typeof contents !== 'string') {
        throw new Error(`Unsafe generated file entry: ${relative}.`);
      }
    }

    mkdirSync(workspaceRoot, { recursive: true });
    const workspace = join(workspaceRoot, id);
    const incoming = `${workspace}.incoming-${Date.now()}`;
    mkdirSync(incoming, { recursive: true });
    for (const [relative, contents] of entries) {
      const target = join(incoming, relative.slice(prefix.length));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    atomicJson(join(incoming, '.stake-studio-managed.json'), {
      format: 'stake-studio-math-workspace-v1', projectId: id, preparedAt: new Date().toISOString(),
    });

    if (existsSync(workspace)) {
      const backup = `${workspace}.previous`;
      if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
      renameSync(workspace, backup);
    }
    renameSync(incoming, workspace);

    const officialPath = join(sdkGames, id);
    if (existsSync(officialPath)) {
      const stat = lstatSync(officialPath);
      if (!stat.isSymbolicLink() || realpathSync(officialPath) !== realpathSync(workspace)) {
        throw new Error(`Official math-sdk already contains an unmanaged games/${id}; StakeStudio refused to overwrite it.`);
      }
    } else {
      symlinkSync(workspace, officialPath, 'dir');
    }
    return { id, workspace, officialPath };
  }

  function existingWorkspace(projectId, files) {
    const id = safeId(projectId);
    const workspace = join(workspaceRoot, id);
    const marker = readJson(join(workspace, '.stake-studio-managed.json'));
    if (marker?.format !== 'stake-studio-math-workspace-v1' || marker?.projectId !== id) {
      throw new Error(`Existing games/${id} workspace is not managed by StakeStudio; recovery refused.`);
    }
    const officialPath = join(sdkGames, id);
    if (!existsSync(officialPath) || !lstatSync(officialPath).isSymbolicLink()
      || realpathSync(officialPath) !== realpathSync(workspace)) {
      throw new Error(`Official math-sdk games/${id} is not linked to the managed recovery workspace.`);
    }
    // A recovery run deliberately preserves the expensive library/books, but
    // it must execute the current generated contract. Otherwise an identity-
    // only or source-only correction can be falsely stamped with the new
    // fingerprint while the SDK actually ran stale Python and reel files.
    const prefix = `games/${id}/`;
    const entries = Object.entries(files || {});
    if (!entries.length) throw new Error('Generated math-sdk files are required for recovery.');
    for (const [relative, contents] of entries) {
      if (!relative.startsWith(prefix) || relative.includes('..') || typeof contents !== 'string') {
        throw new Error(`Unsafe generated recovery file entry: ${relative}.`);
      }
      const local = relative.slice(prefix.length);
      if (local === 'library' || local.startsWith('library/')) {
        throw new Error(`Recovery cannot replace published library data: ${relative}.`);
      }
      const target = join(workspace, local);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    atomicJson(join(workspace, '.stake-studio-managed.json'), {
      ...marker,
      recoveredAt: new Date().toISOString(),
    });
    return { id, workspace, officialPath };
  }

  function stageAndVerify(job, project) {
    const library = join(job.workspace, 'library');
    const publishFiles = join(library, 'publish_files');
    if (!existsSync(publishFiles)) throw new Error('The official SDK completed without producing library/publish_files.');
    const projectDir = join(gamesDir, job.projectId);
    const staged = join(projectDir, `math-publish.incoming-${Date.now()}`);
    cpSync(library, staged, { recursive: true });

    const targets = Object.fromEntries((project.math?.betModes || []).map(mode => [mode.name, mode.rtp ?? project.math.rtp]));
    const checked = spawnSync(python, [verifier, join(staged, 'publish_files'), JSON.stringify(targets)], {
      cwd: sdkRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const rawReport = readJsonFromOutput(checked.stdout);
    if (checked.status !== 0 || !rawReport?.valid) throw new Error(rawReport?.error || checked.stderr || 'Full-stream math verification failed.');
    const report = attachMathTailAnalysis(rawReport, readJson(join(staged, 'stats_summary.json'), {}));
    return { staged, projectDir, report };
  }

  function promoteStaged(job, staged) {
    const destination = join(staged.projectDir, 'math-publish');
    if (existsSync(destination)) {
      const backup = join(staged.projectDir, 'math-publish.previous');
      if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
      renameSync(destination, backup);
    }
    renameSync(staged.staged, destination);
    appendLog(job, `\nVerified math publish promoted to ${destination}.\n`);
    return destination;
  }

  function alignExactRtp(job, project) {
    const targets = Object.fromEntries((project.math?.betModes || []).map(mode => [mode.name, mode.rtp ?? project.math.rtp]));
    const criteria = project.math?.maxWinCalibrationPolicy === 'separate-criterion-v1'
      ? Object.fromEntries((project.math?.betModes || []).map(mode => [mode.name, {
        name: 'wincap',
        payoutMultiplier: project.math.wincap,
        rtp: Number(project.math.wincapRtp || 0),
      }]))
      : {};
    job.phase = 'exact-rtp-alignment';
    const aligned = spawnSync(python, [
      aligner,
      join(job.workspace, 'library', 'publish_files'),
      JSON.stringify(targets),
      JSON.stringify(criteria),
    ], {
      cwd: sdkRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const report = readJsonFromOutput(aligned.stdout);
    if (aligned.status !== 0 || !report?.valid) {
      throw new Error(report?.error || aligned.stderr || 'Exact RTP alignment failed.');
    }
    appendLog(job, `\nExact integer LUT alignment complete: ${JSON.stringify(report.modes)}\n`);
    return report;
  }

  function runOfficialVerification(job) {
    job.phase = 'official-final-verification';
    const verified = spawnSync(python, [officialVerifier, job.projectId], {
      cwd: sdkRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const report = readJsonFromOutput(verified.stdout);
    if (verified.status !== 0 || !report?.valid) {
      throw new Error(verified.stderr || verified.stdout || 'Official final-LUT verification failed.');
    }
    appendLog(job, `\nOfficial final-LUT verification complete: ${JSON.stringify(report)}\n`);
    return report;
  }

  function syncOfficialVerificationArtifacts(job, staged) {
    const library = join(job.workspace, 'library');
    const stats = join(library, 'stats_summary.json');
    if (existsSync(stats)) cpSync(stats, join(staged.staged, 'stats_summary.json'));
    const configs = join(library, 'configs');
    for (const mode of staged.report.modes || []) {
      const sidecar = join(configs, `books_${mode.name}.verification.json`);
      if (existsSync(sidecar)) cpSync(sidecar, join(staged.staged, 'configs', `books_${mode.name}.verification.json`));
    }
    staged.report = attachMathTailAnalysis(staged.report, readJson(stats, {}));
  }

  function readJsonFromOutput(output) {
    const lines = String(output || '').trim().split(/\r?\n/).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index--) {
      try { return JSON.parse(lines[index]); } catch { /* keep looking */ }
    }
    return null;
  }

  function updateProject(job, report) {
    const path = join(gamesDir, job.projectId, 'project.json');
    return updateMathPublishProject(path, job, report);
  }

  function start({ projectId, files, profile = 'smoke', simulations = {}, resumeExisting = false }) {
    const profileConfig = getMathPublisherProfile(profile);
    const selectedProfile = profileConfig.id;
    const safeProjectId = safeId(projectId);
    const active = [...jobs.values()].find(job => (
      job.projectId === safeProjectId && job.status === 'running'
    ));
    if (active) return publicJob(active);
    const projectPath = join(gamesDir, safeProjectId, 'project.json');
    const project = readProjectDocument(projectPath, null).project;
    if (!project) throw new Error(`No saved project ${safeProjectId}. Save the project before publishing math.`);
    const storage = resumeExisting
      ? (() => {
        const workspace = join(workspaceRoot, safeProjectId);
        const stagingBytes = Math.ceil(directoryBytes(join(workspace, 'library')) * 1.1);
        return { rounds: {}, rawBytes: 0, workingBytes: stagingBytes, reserveBytes: GIB, requiredFreeBytes: stagingBytes + GIB };
      })()
      : estimateMathPublisherWorkspace(project, profileConfig, simulations);
    const execution = getProjectMathPublisherExecution(project, profileConfig, storage.rounds);
    const disk = statfsSync(home);
    const availableBytes = Number(disk.bavail) * Number(disk.bsize);
    if (availableBytes < storage.requiredFreeBytes) {
      throw new Error(
        `Math Publisher needs about ${(storage.requiredFreeBytes / GIB).toFixed(1)} GB free for the ${selectedProfile} run, `
        + `including a 1 GB safety reserve; ${(availableBytes / GIB).toFixed(1)} GB is currently available. `
        + 'Free storage or lower the simulation profile before starting.',
      );
    }
    const prepared = resumeExisting ? existingWorkspace(safeProjectId, files) : prepareWorkspace(safeProjectId, files);
    const contractFingerprint = mathSDKFilesFingerprint(files);
    const id = `math-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const job = {
      id, projectId: prepared.id, profile: selectedProfile, status: 'running', phase: 'official-sdk',
      createdAt: now, updatedAt: now, workspace: prepared.workspace, log: '', result: null, child: null,
      execution, contractFingerprint, resumeExisting: Boolean(resumeExisting),
    };
    jobs.set(id, job);

    const env = {
      ...process.env,
      STAKE_STUDIO_RUN_SIMS: resumeExisting ? '0' : '1',
      STAKE_STUDIO_RUN_OPTIMIZATION: !resumeExisting && profileConfig.optimization ? '1' : '0',
      // Analysis is deliberately deferred until exact alignment and the
      // independent full-stream gate have validated the optimized LUTs.
      STAKE_STUDIO_RUN_ANALYSIS: '0',
      STAKE_STUDIO_UPLOAD_DATA: '0',
      STAKE_STUDIO_NUM_THREADS: String(execution.threads),
      STAKE_STUDIO_RUST_THREADS: String(execution.rustThreads),
      STAKE_STUDIO_BATCH_SIZE: String(execution.batchSize),
      STAKE_STUDIO_STRATIFIED_SUPPORT: profileConfig.id === 'production' ? '1' : '0',
    };
    for (const [mode, rounds] of Object.entries(storage.rounds)) {
      env[`STAKE_STUDIO_SIMS_${modeEnvName(mode)}`] = String(rounds);
    }

    const child = spawn(python, [join(prepared.officialPath, 'run.py')], {
      cwd: sdkRoot,
      env,
      detached: process.platform !== 'win32',
    });
    job.child = child;
    appendLog(job, `StakeStudio Math Publisher ${selectedProfile} job ${id}\n`);
    child.stdout.on('data', chunk => appendLog(job, chunk));
    child.stderr.on('data', chunk => appendLog(job, chunk));
    child.on('error', error => {
      job.status = 'failed';
      job.phase = 'failed';
      job.error = error.message;
      appendLog(job, `\n${error.stack || error.message}\n`);
    });
    child.on('close', code => {
      job.child = null;
      job.exitCode = code;
      if (job.status === 'cancelled') return;
      if (code !== 0) {
        job.status = 'failed';
        job.phase = 'failed';
        job.error = `Official math-sdk exited with code ${code}.`;
        job.updatedAt = new Date().toISOString();
        return;
      }
      try {
        alignExactRtp(job, project);
        synchronizeMathConfigHashes(join(job.workspace, 'library'));
        job.phase = 'full-stream-verification';
        const staged = stageAndVerify(job, project);
        const offTarget = staged.report.modes.filter(mode => !Number.isFinite(mode.delta) || Math.abs(mode.delta) > 1e-8);
        if (selectedProfile === 'production' && offTarget.length) {
          const detail = offTarget.map(mode => `${mode.name} ${(mode.exactRtp * 100).toFixed(8)}% (target ${(mode.declaredRtp * 100).toFixed(8)}%)`).join(', ');
          throw new Error(`Production LUT RTP is not exactly aligned after optimization: ${detail}.`);
        }
        if (selectedProfile === 'production') {
          staged.report.modeContractChecks = validatePublishedModeContracts(project, staged.report);
          staged.report.morpheusProductionMath = validateMorpheusPublishedMath(project, staged.report);
          staged.report.officialFinalVerification = runOfficialVerification(job);
          syncOfficialVerificationArtifacts(job, staged);
        }
        staged.report.reviewerReplayEventCatalog = generateReviewerReplayEventCatalog(staged.staged, project, python);
        promoteStaged(job, staged);
        const mathPublish = updateProject(job, staged.report);
        job.status = 'completed';
        job.phase = selectedProfile === 'production' ? 'release-verified' : 'draft-verified';
        job.result = { verification: staged.report, mathPublish };
      } catch (error) {
        job.status = 'failed';
        job.phase = 'failed';
        job.error = error.message;
        appendLog(job, `\n${error.stack || error.message}\n`);
      }
      job.updatedAt = new Date().toISOString();
    });
    return publicJob(job);
  }

  function publicJob(job) {
    if (!job) return null;
    const { child, workspace, ...value } = job;
    return value;
  }

  function get(id) { return publicJob(jobs.get(String(id))); }

  function cancel(id) {
    const job = jobs.get(String(id));
    if (!job) return null;
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.phase = 'cancelled';
      job.updatedAt = new Date().toISOString();
      try {
        if (process.platform !== 'win32' && job.child?.pid) process.kill(-job.child.pid, 'SIGTERM');
        else job.child?.kill('SIGTERM');
      } catch {
        job.child?.kill('SIGTERM');
      }
    }
    return publicJob(job);
  }

  return { start, get, cancel };
}
