#!/usr/bin/env node
/**
 * StakeStudio MCP server.
 *
 * Exposes the studio's design and math operations as tools so Claude Code can
 * drive them directly. Operates on project files under <home>/games/<id>/project.json
 * and imports the studio's own engines, so simulation and export here use exactly
 * the same code paths the UI does — no reimplementation to drift out of sync.
 *
 * Speaks MCP over stdio as newline-delimited JSON-RPC 2.0.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(HERE, '..');
const HOME = resolve(process.env.STAKE_STUDIO_HOME || join(STUDIO, '..'));
const GAMES = join(HOME, 'games');
const BRIDGE_URL = (process.env.STAKE_STUDIO_URL
  || (process.env.STAKE_STUDIO_AGENT === '1' || process.env.PORT === '3001'
    ? 'http://127.0.0.1:3001'
    : 'http://127.0.0.1:3000')).replace(/\/$/, '');

const { createGameProject, generateDefaultReelStrips } = await import(join(STUDIO, 'src/engines/schema.js'));
const { persistProjectDocument, readProjectDocument } = await import(join(STUDIO, 'server/project-storage.mjs'));
const { MathEngine } = await import(join(STUDIO, 'src/engines/math/MathEngine.js'));
const { SeededRNG } = await import(join(STUDIO, 'src/engines/math/SeededRNG.js'));
const { MathSDKExporter } = await import(join(STUDIO, 'src/engines/build/MathSDKExporter.js'));
const { BuildEngine } = await import(join(STUDIO, 'src/engines/build/BuildEngine.js'));
const { applyGameBlueprint, GAME_BLUEPRINTS } = await import(join(STUDIO, 'src/engines/blueprints/GameBlueprintEngine.js'));
const { calibratePrototypeMath, getMathCalibrationStatus } = await import(join(STUDIO, 'src/engines/math/MathAutopilot.js'));
const { GAME_TYPES, BONUS_MECHANICS, getCompatibleMechanics } = await import(join(STUDIO, 'src/mechanics/registry.js'));
const {
  claimAgentJob,
  completeAgentJob,
  createAgentJob,
  ensureProductionWorkflow,
  failAgentJob,
  getFlagshipWorkflowSummary,
  heartbeatAgentJob,
  listAgentJobs,
  normalizeProductionWorkflow,
  recordSpecialtyAgentHandoff,
  recoverStaleAgentJobLeases,
  setProductionTrack,
  updateAgentJob,
  upsertSpecialtyAgentWorkItem,
} = await import(join(STUDIO, 'src/engines/factory/FlagshipWorkflow.js'));
const {
  createVisualExcellenceJobPlan,
  getVisualExcellenceSummary,
  normalizeVisualExcellenceDepartment,
  recordHumanVisualSignoff,
  recordVisualDirectorReview,
  recordVisualExcellenceDelivery,
  upsertVisualSequenceBrief,
} = await import(join(STUDIO, 'src/engines/factory/VisualExcellenceDepartment.js'));
const {
  getFlagshipScenarioLabSummary,
  runFlagshipScenario,
  upsertFlagshipScenario,
} = await import(join(STUDIO, 'src/engines/quality/FlagshipScenarioLab.js'));

// ---------- project storage ----------

const slug = s => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
const projectPath = id => join(GAMES, id, 'project.json');

function listProjects() {
  if (!existsSync(GAMES)) return [];
  return readdirSync(GAMES, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(projectPath(d.name)))
    .map(d => d.name);
}

function loadProject(id) {
  const p = projectPath(id);
  if (!existsSync(p)) {
    throw new Error(`No project "${id}". Available: ${listProjects().join(', ') || '(none)'} — create one with create_project.`);
  }
  return readProjectDocument(p).project;
}

function saveProject(id, project) {
  persistProjectDocument(projectPath(id), project);
}

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function bridgeJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BRIDGE_URL}/__stake_studio${path}`, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
      signal: AbortSignal.timeout(options.timeout || 5000),
    });
  } catch (error) {
    throw new Error(`StakeStudio is not reachable at ${BRIDGE_URL}. Open the StakeStudio app first. (${error.message})`);
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || `StakeStudio bridge returned HTTP ${response.status}.`);
  return body;
}

async function studioCommand(command, args = {}, timeoutMs = 15000) {
  const queued = await bridgeJson('/commands', {
    method: 'POST',
    body: JSON.stringify({ command, arguments: args }),
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(150);
    const response = await fetch(`${BRIDGE_URL}/__stake_studio/command-results/${queued.id}`, {
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    if (!response || response.status === 404) continue;
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || `Command result returned HTTP ${response.status}.`);
    if (!result.ok) throw new Error(result.error || `StakeStudio command "${command}" failed.`);
    return result.result;
  }
  throw new Error(`StakeStudio did not complete "${command}" within ${timeoutMs}ms. Keep the app open and visible, then try again.`);
}

async function sharedFrameContent(context = {}) {
  let metadata = await bridgeJson('/frame-meta');
  if (metadata.stale && context.command !== 'capture_view') {
    await studioCommand('capture_view', {}, 45000);
    metadata = await bridgeJson('/frame-meta');
  }
  const [response, freshMetadata] = await Promise.all([
    fetch(`${BRIDGE_URL}/__stake_studio/frame`, { signal: AbortSignal.timeout(5000) }).catch(error => {
      throw new Error(`Could not read the shared StakeStudio frame: ${error.message}`);
    }),
    Promise.resolve(metadata),
  ]);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Shared frame returned HTTP ${response.status}.`);
  }
  const data = Buffer.from(await response.arrayBuffer()).toString('base64');
  return {
    _content: [
      { type: 'text', text: JSON.stringify({ ...context, frame: freshMetadata }, null, 2) },
      { type: 'image', data, mimeType: 'image/png' },
    ],
  };
}

function morpheusSignatureCaptureContent(result = {}) {
  const sanitized = JSON.parse(JSON.stringify(result, (key, value) => (
    ['data', 'pngBase64'].includes(key) ? undefined : value
  )));
  const report = result.report || result;
  const frames = [];
  for (const run of report.viewportRuns || []) {
    for (const checkpoint of run.checkpoints || []) if (checkpoint.frame) frames.push(checkpoint.frame);
    if (run.maxGrowth?.frame) frames.push(run.maxGrowth.frame);
  }
  for (const resource of result.resources || []) frames.push(resource);
  const unique = [...new Map(frames.filter(frame => frame?.resourceUri)
    .map(frame => [frame.resourceUri, frame])).values()];
  return {
    _content: [
      { type: 'text', text: JSON.stringify({ command: 'run_morpheus_signature_capture_audit', result: sanitized }, null, 2) },
      ...unique.map(frame => ({
        type: 'resource_link',
        uri: frame.resourceUri,
        name: `${frame.viewport || 'preview'} · ${frame.checkpointId || 'checkpoint'}`,
        title: `Morpheus signature capture ${frame.checkpointId || ''}`.trim(),
        description: `${frame.width || '?'}×${frame.height || '?'} PNG · SHA-256 ${frame.sha256 || 'missing'}`,
        mimeType: 'image/png',
        size: Number(frame.bytes) || undefined,
      })),
    ],
  };
}

function morpheusEffectRouteCaptureContent(result = {}) {
  const sanitized = JSON.parse(JSON.stringify(result, (key, value) => (
    ['data', 'pngBase64'].includes(key) ? undefined : value
  )));
  const frames = [...new Map((result.resources || []).filter(frame => frame?.resourceUri)
    .map(frame => [frame.resourceUri, frame])).values()];
  return {
    _content: [
      { type: 'text', text: JSON.stringify({ command: 'run_morpheus_effect_route_capture_audit', result: sanitized }, null, 2) },
      ...frames.map(frame => ({
        type: 'resource_link',
        uri: frame.resourceUri,
        name: `${frame.viewport || 'preview'} · ${frame.checkpointId || 'checkpoint'}`,
        title: `Morpheus effect route ${frame.checkpointId || ''}`.trim(),
        description: `${frame.width || '?'}×${frame.height || '?'} PNG · SHA-256 ${frame.sha256 || 'missing'}`,
        mimeType: 'image/png',
        size: Number(frame.bytes) || undefined,
      })),
    ],
  };
}

function codexVisualTaskContent(context = {}) {
  const task = context.task || context.next?.task || null;
  const references = task?.references || [];
  const cleanTask = task ? {
    ...task,
    references: references.map(({ dataUrl, ...reference }) => reference),
  } : null;
  const cleanNext = context.next ? { ...context.next, task: cleanTask } : undefined;
  const cleanFactory = context.factory ? {
    ...context.factory,
    visualTask: context.factory.visualTask ? cleanTask : context.factory.visualTask,
  } : undefined;
  const textContext = context.next
    ? { ...context, next: cleanNext, ...(cleanFactory ? { factory: cleanFactory } : {}) }
    : { ...context, task: cleanTask, ...(cleanFactory ? { factory: cleanFactory } : {}) };
  const content = [{ type: 'text', text: JSON.stringify(textContext, null, 2) }];
  for (const reference of references) {
    const match = String(reference.dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) continue;
    content.push({ type: 'text', text: `Required visual reference: ${reference.name} (${reference.role})` });
    content.push({ type: 'image', data: match[2], mimeType: `image/${match[1].toLowerCase()}` });
  }
  return { _content: content };
}

/** Compact view — never emits base64 art or audio. */
function summarise(project, id) {
  const m = project.math;
  return {
    id, name: project.name,
    gameType: m.gameType, grid: m.grid,
    rtpTarget: m.rtp, wincap: m.wincap, volatility: m.volatility,
    symbols: (project.theme.symbols || []).map(s => ({
      name: s.name, tier: s.tier, payouts: s.payouts, special: s.special || [],
    })),
    specialSymbols: m.specialSymbols,
    bonusMechanics: m.bonusMechanics || [],
    mechanicConfig: m.mechanicConfig || {},
    freespinTriggers: m.freespinTriggers,
    betModes: (m.betModes || []).map(b => ({ name: b.name, cost: b.cost, rtp: b.rtp, maxWin: b.maxWin })),
    reelStripLengths: (m.reelStrips?.BR || []).map(s => s.length),
    productionTrack: project.production?.workflow?.track || 'blueprint',
    stakeEngine: project.build?.stakeEngine,
  };
}

function simulate(project, rounds, seed, modeName = 'base') {
  const rng = new SeededRNG(seed);
  const rand = () => rng.random();
  const eng = new MathEngine(project);
  const mode = (project.math?.betModes || []).find(item => item.name === modeName)
    || project.math?.betModes?.[0];
  if (!mode) throw new Error('Run simulation requires at least one configured wager mode.');
  let paid = 0, wagered = 0, hits = 0, caps = 0, casc = 0, bonusSpins = 0, max = 0;
  let mean = 0, m2 = 0;
  const dist = { zero: 0, sub2: 0, to10: 0, to50: 0, to200: 0, over200: 0 };

  for (let i = 0; i < rounds; i++) {
    const round = eng.resolveRound(rand, mode.name);
    const value = round.normalizedWin;
    paid += round.totalWin;
    wagered += round.wager;
    casc += round.spins.reduce((sum, spin) => sum + spin.cascades, 0);
    bonusSpins += round.freeSpinsPlayed;
    if (round.wincapHit) caps++;
    if (round.totalWin > 0) hits++;
    if (value > max) max = value;
    const delta = value - mean;
    mean += delta / (i + 1);
    m2 += delta * (value - mean);
    if (value === 0) dist.zero++;
    else if (value < 2) dist.sub2++;
    else if (value < 10) dist.to10++;
    else if (value < 50) dist.to50++;
    else if (value < 200) dist.to200++;
    else dist.over200++;
  }

  const rtp = paid / wagered;
  const sd = Math.sqrt(m2 / rounds);
  return {
    rounds, seed, mode: mode.name,
    rtp: +(rtp * 100).toFixed(3) + '%', rtpDecimal: +rtp.toFixed(6),
    targetRtp: mode.rtp ?? project.math.rtp,
    deltaFromTarget: +((rtp - (mode.rtp ?? project.math.rtp)) * 100).toFixed(3) + '%',
    hitRate: +(hits / rounds * 100).toFixed(2) + '%',
    avgWin: +(hits ? (paid / wagered) * rounds / hits : 0).toFixed(3),
    maxWin: +max.toFixed(2), stdDev: +sd.toFixed(3),
    avgCascades: +(casc / rounds).toFixed(3), avgBonusSpins: +(bonusSpins / rounds).toFixed(3), wincapHits: caps,
    distribution: dist,
  };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Move the project RTP and carry any bet mode that was tracking it along.
 * math-sdk asserts the optimizer's criteria split sums to the BetMode rtp, so a
 * project retuned without its modes exports a game the optimizer rejects.
 */
function setProjectRtp(project, rtp) {
  const old = project.math.rtp;
  project.math.rtp = rtp;
  for (const bm of project.math.betModes || []) {
    if (bm.rtp === undefined || Math.abs(bm.rtp - old) < 1e-9) bm.rtp = rtp;
  }
}

// ---------- tools ----------

const idProp = { id: { type: 'string', description: 'Project id (folder name under games/)' } };

const TOOLS = [
  { name: 'get_studio_state', description: 'Read the live StakeStudio UI state: active panel, open project, viewport, preview status, and connection health.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'capture_studio_view', description: 'Capture and return a fresh PNG of the exact StakeStudio window the user is looking at. Requires the StakeStudio app to be open.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'get_studio_errors', description: 'Read browser errors, rejected promises, asset failures, and bridge diagnostics reported by the live StakeStudio UI.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'open_project_in_studio', description: 'Open a saved shared project in the live StakeStudio UI.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'close_project_in_studio', description: 'Close the current shared project without deleting it and return StakeStudio to its clean home screen.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'select_studio_panel', description: 'Switch the live StakeStudio UI to a panel and return a fresh shared frame.',
    inputSchema: { type: 'object', properties: {
      panel: { type: 'string', enum: ['cabinet', 'config', 'reelstrips', 'simulate', 'preview', 'audio', 'atlas', 'spine', 'quality', 'build'] },
    }, required: ['panel'] } },

  { name: 'repair_and_certify', description: 'Apply deterministic safe repairs, compile the Stake frontend, run every browser-measured QA audit, and return the final certificate repair queue with a fresh shared frame.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'plan_visual_pack', description: 'Create a resumable, continuity-safe production order for every required visual asset without making a paid image request, then return a fresh shared frame.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'prepare_visual_work_order', description: 'Prepare and return the complete free Codex/art-tool handoff: locked Art Bible, dependency order, exact PNG filenames and dimensions, prompts, reference routing, and acceptance gates. Makes no image or paid API request.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'ingest_visual_delivery', description: 'Scan the project visual-delivery folder, process exact work-order PNGs in dependency order, run deterministic local visual QA, assign only passing files, and return a fresh shared frame. Makes no paid API request.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'start_codex_visual_batch', description: 'Start or restart the current project’s free sequential Codex visual batch. The controller exposes only one dependency-safe task at a time and never calls a paid API.',
    inputSchema: { type: 'object', properties: {
      force: { type: 'boolean', description: 'Restart batch bookkeeping from the current work order while preserving already assigned art.' },
      maxAttemptsPerTask: { type: 'integer', minimum: 1, maximum: 5, description: 'Stop for review after this many measured QA failures on one asset. Defaults to 3.' },
    }, required: [] } },

  { name: 'start_codex_visual_autopilot', description: 'Start a resumable no-paid-API art session and return its first dependency-safe task. Continue generating and submitting returned tasks in the same run until the batch completes or StakeStudio stops at a measured QA safety limit.',
    inputSchema: { type: 'object', properties: {
      force: { type: 'boolean', description: 'Restart session bookkeeping while preserving already accepted production art.' },
      maxAttemptsPerTask: { type: 'integer', minimum: 1, maximum: 5, description: 'Stop for human review after this many rejected attempts on one asset. Defaults to 3.' },
    }, required: [] } },

  { name: 'get_next_codex_visual_task', description: 'Return the next dependency-safe visual task, exact generation prompt, output contract, and required master images. Generate exactly one PNG with image generation, then call submit_codex_visual_asset.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'submit_codex_visual_asset', description: 'Submit one generated PNG for the current Codex visual task. StakeStudio writes it to the bounded inbox, runs deterministic local QA, assigns only a passing result, and returns the next task with its master references.',
    inputSchema: { type: 'object', properties: {
      filename: { type: 'string', description: 'Exact output filename from get_next_codex_visual_task.' },
      pngBase64: { type: 'string', description: 'Base64 PNG bytes, with or without a data:image/png;base64, prefix.' },
    }, required: ['filename', 'pngBase64'] } },

  { name: 'produce_visual_batch', description: 'Explicitly authorize and run a bounded paid visual-production batch. Each request generates one image, runs local QA, applies measured corrections within the configured attempt limit, and autosaves passing assignments.',
    inputSchema: { type: 'object', properties: {
      maxRequests: { type: 'integer', minimum: 1, maximum: 10, description: 'Hard paid-request ceiling for this call. Defaults to 1.' },
    }, required: [] } },

  { name: 'run_game_factory', description: 'Start or resume the saved Game Factory mission-control run. It stops at creative or visual checkpoints before expensive downstream work and returns the current checkpoint with a fresh shared frame.',
    inputSchema: { type: 'object', properties: {
      profile: { type: 'string', enum: ['prototype', 'review', 'release'], description: 'Prototype is cheapest, review is the daily build, and release enables production math.' },
    }, required: ['profile'] } },

  { name: 'launch_game_factory_project', description: 'Create a brand-new game from one bounded brief. Blueprint track compiles an executable catalog foundation; Flagship track opens contract, capability, architecture, spike, and vertical-slice gates before production. Refuses to overwrite and makes no paid API request.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string', description: 'Unique game/project name.' },
      premise: { type: 'string', description: 'Concrete world, character, conflict, and fantasy premise.' },
      providerName: { type: 'string', description: 'Real provider identity. StakeStudio will not invent this.' },
      tone: { type: 'string', enum: ['cinematic', 'brutal', 'mysterious', 'triumphant', 'playful', 'luxurious'] },
      blueprintId: { type: 'string', enum: ['rapid_ways', 'multiplier_arena', 'sticky_reel_forge', 'wild_forge', 'cascade_colossus'], description: 'Optional executable factory blueprint or Flagship inspiration. If omitted, the offline director chooses deterministically.' },
      productionTrack: { type: 'string', enum: ['blueprint', 'flagship'], description: 'Blueprint is the fast catalog path. Flagship preserves bespoke mechanics through contract-first proof gates.' },
      conceptIndex: { type: 'integer', minimum: 0, maximum: 2, description: 'Choose one of the three deterministic directions. Defaults to 0.' },
      seed: { type: 'string', description: 'Optional reproducibility seed.' },
      profile: { type: 'string', enum: ['prototype', 'review', 'release'], description: 'Review is the normal daily studio build.' },
    }, required: ['name', 'premise', 'providerName', 'profile'] } },

  { name: 'get_game_factory_status', description: 'Read the saved Game Factory stage, blockers, and current free Codex visual task without starting a new run.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'cancel_game_factory', description: 'Cancel a running or awaiting Game Factory run while preserving completed artifacts and checkpoint evidence.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'set_preview_viewport', description: 'Open Preview and switch its viewport size.',
    inputSchema: { type: 'object', properties: {
      viewport: { type: 'string', enum: ['desktop', 'mobile', 'mini'] },
    }, required: ['viewport'] } },

  { name: 'set_preview_mode', description: 'Open Preview and select one configured wager or feature mode without browser automation.',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', description: 'Configured wager mode name.' },
    }, required: ['mode'] } },

  { name: 'run_preview_replay_audit', description: 'Rehearse deterministic loss, win, big-win, bonus, wincap, and seeded replay journeys in the live Preview and save the evidence.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'run_preview_layout_audit', description: 'Measure desktop, mobile, and mini Preview layouts and save fresh safe-zone evidence.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'run_preview_performance_audit', description: 'Profile the live Preview across desktop, mobile, and mini viewports and save frame-time and memory evidence.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'run_audio_mastering_audit', description: 'Decode and measure the current project audio pack, cue synchronization, and ducking configuration, then save fresh mastering evidence.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'run_morpheus_signature_capture_audit', description: 'Run the authoritative Morpheus Dreamfall Gate 7 signature through desktop, mobile, mini, and mini 8-row capture checkpoints; archive immutable PNG evidence and return the evaluated report and capture resources.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'run_morpheus_effect_route_capture_audit', description: 'Run or resume the governed Morpheus effect-route matrix. Optionally run one route/motion/viewport shard; every passing shard is persisted immediately and skipped on resume.',
    inputSchema: { type: 'object', properties: {
      routeId: { type: 'string', enum: ['predeterminedGeneratorDeclarations', 'nightmareReliquaryDeclarations', 'lucidFamilyMultiplierSettlement', 'veilAscentUpgrade', 'tricksterGridSettlement', 'mysteryStarDreamfallTumble', 'exactMaxTermination'] },
      motionMode: { type: 'string', enum: ['normal', 'fast', 'reduced', 'none'] },
      viewport: { type: 'string', enum: ['desktop', 'mobile', 'mini'] },
      resume: { type: 'boolean', description: 'Reuse passing shards from the current matching draft. Defaults to true.' },
    }, required: [] } },

  { name: 'play_morpheus_effect_proof_route', description: 'Play a governed Morpheus mixed-effect or exact-100,000x terminal proof route in the live Preview. Returns semantic, asset-coverage, acknowledgement, and production-readiness evidence with a fresh shared frame.',
    inputSchema: { type: 'object', properties: {
      routeId: { type: 'string', enum: ['predeterminedGeneratorDeclarations', 'nightmareReliquaryDeclarations', 'lucidFamilyMultiplierSettlement', 'veilAscentUpgrade', 'tricksterGridSettlement', 'mysteryStarDreamfallTumble', 'exactMaxTermination'] },
      motion: { type: 'string', enum: ['normal', 'fast', 'reduced', 'none'] },
      viewport: { type: 'string', enum: ['desktop', 'mobile', 'mini'] },
    }, required: ['routeId'] } },

  { name: 'install_morpheus_effect_audio_pack', description: 'Generate and install the seven deterministic Morpheus specialty effect cues, with collision, priority, ducking, provenance, and replaceable-foundation metadata. Does not modify game math.',
    inputSchema: { type: 'object', properties: {
      seed: { type: 'integer', description: 'Deterministic synthesis seed. Defaults to 110811.' },
    }, required: [] } },

  { name: 'audition_morpheus_effect_audio_pack', description: 'Audition the installed Morpheus Mystery, Star, Dreamfall, and MAX specialty cues in causal order through the live Audio Director.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'spin_preview', description: 'Run one spin in the live Preview, wait for animation completion, and return the result. A fresh shared frame is captured afterward.',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', description: 'Optional configured mode to select immediately before the spin.' },
    }, required: [] } },

  { name: 'play_published_reviewer_replay', description: 'Play one provenance-bound final-LUT reviewer book through the live Preview without changing its balance. Uses verified production books, not the local design simulator, and captures a fresh shared frame.',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', description: 'Configured wager mode name.' },
      category: { type: 'string', enum: ['loss', 'normalWin', 'bigWin', 'wincap', 'bonusTrigger'] },
    }, required: ['mode', 'category'] } },

  { name: 'run_studio_simulation', description: 'Run the Simulation panel visibly, wait for completion, and return the results with a fresh shared frame.',
    inputSchema: { type: 'object', properties: {
      rounds: { type: 'integer', description: 'Default is the panel setting; maximum 2,000,000.' },
      seed: { type: 'integer' },
    }, required: [] } },

  { name: 'list_projects', description: 'List game projects in the studio home.',
    inputSchema: { type: 'object', properties: {}, required: [] } },

  { name: 'create_project', description: 'Create a new game project from a game type.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string' },
      gameType: { type: 'string', description: 'One of: ' + Object.keys(GAME_TYPES).join(', ') },
    }, required: ['name'] } },

  { name: 'get_project', description: 'Read a project design: grid, RTP target, wincap, symbols and payouts, special symbols, mechanics, triggers, bet modes. Art/audio omitted.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'get_production_workflow', description: 'Read the project production track, Flagship proof gates, fidelity ledger, and governed specialty-agent work.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'set_production_track', description: 'Select Blueprint or Flagship production. Switching tracks archives the previous factory run and never changes game math or assets.',
    inputSchema: { type: 'object', properties: {
      ...idProp, track: { type: 'string', enum: ['blueprint', 'flagship'] },
    }, required: ['id', 'track'] } },

  { name: 'update_flagship_workflow', description: 'Update one approved Flagship workflow section without touching math, art, audio, or frontend output. Use for contract-first planning and specialist handoffs.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      section: { type: 'string', enum: ['vision', 'research', 'mechanicContract', 'capabilityReview', 'architecture', 'feasibilitySpikes', 'verticalSlice', 'fidelityLedger', 'agentCoordination'] },
      value: { type: 'object', description: 'Complete or partial section values to merge into the existing contract.' },
    }, required: ['id', 'section', 'value'] } },

  { name: 'upsert_specialty_agent_work', description: 'Create or update one bounded specialty-agent work item. Rejects conflicting active writers for the same artifact.',
    inputSchema: { type: 'object', properties: {
      ...idProp, workId: { type: 'string' }, owner: { type: 'string', enum: ['orchestrator', 'creative', 'mechanic', 'math', 'protocol', 'frontend', 'presentation', 'visual', 'audio', 'information', 'qa'] },
      artifact: { type: 'string' }, stage: { type: 'string' }, status: { type: 'string' },
      dependencies: { type: 'array', items: { type: 'string' } }, deliverables: { type: 'array', items: { type: 'string' } },
      acceptance: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'workId', 'owner', 'artifact'] } },

  { name: 'record_specialty_agent_handoff', description: 'Record a proposed, accepted, or rejected handoff between specialty lanes. Accepted handoffs require a typed contract and evidence.',
    inputSchema: { type: 'object', properties: {
      ...idProp, handoffId: { type: 'string' }, workItemId: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
      status: { type: 'string', enum: ['proposed', 'accepted', 'rejected'] },
      contract: { type: 'array', items: { type: 'string' } }, evidence: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'workItemId', 'to', 'status'] } },

  { name: 'create_agent_job', description: 'Create one bounded externally executed agent job with a specialty lane, one exclusively owned artifact, dependencies, deliverables, and acceptance criteria. StakeStudio records coordination only; it does not launch models or commands.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, owner: { type: 'string', enum: ['orchestrator', 'creative', 'mechanic', 'math', 'protocol', 'frontend', 'presentation', 'visual', 'audio', 'information', 'qa'] },
      artifact: { type: 'string' }, stage: { type: 'string' }, dependencies: { type: 'array', items: { type: 'string' }, maxItems: 50 },
      deliverables: { type: 'array', items: { type: 'string' }, maxItems: 50 }, acceptance: { type: 'array', items: { type: 'string' }, maxItems: 50 },
    }, required: ['id', 'jobId', 'owner', 'artifact'] } },

  { name: 'list_agent_jobs', description: 'List StakeStudio agent jobs with dependency readiness and lease state. Expired leases are recovered before the list is returned.',
    inputSchema: { type: 'object', properties: {
      ...idProp, owner: { type: 'string' }, status: { type: 'string' }, availableOnly: { type: 'boolean' },
    }, required: ['id'] } },

  { name: 'claim_agent_job', description: 'Claim one dependency-ready agent job for an independently running agent. Returns a lease token required by heartbeat, update, completion, and failure tools.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, agentId: { type: 'string' }, role: { type: 'string', enum: ['orchestrator', 'creative', 'mechanic', 'math', 'protocol', 'frontend', 'presentation', 'visual', 'audio', 'information', 'qa'] },
      leaseSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
    }, required: ['id', 'jobId', 'agentId', 'role'] } },

  { name: 'heartbeat_agent_job', description: 'Renew a claimed agent-job lease and mark the job in progress. Requires the exact claimant ID and lease token.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, agentId: { type: 'string' }, leaseToken: { type: 'string' },
      leaseSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
    }, required: ['id', 'jobId', 'agentId', 'leaseToken'] } },

  { name: 'update_agent_job', description: 'Record bounded progress, evidence, and a history note on a claimed agent job without changing its ownership or dependencies.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, agentId: { type: 'string' }, leaseToken: { type: 'string' }, progress: { type: 'string' }, note: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' }, maxItems: 100 },
    }, required: ['id', 'jobId', 'agentId', 'leaseToken'] } },

  { name: 'complete_agent_job', description: 'Complete a claimed agent job, release its artifact lease, and retain completion evidence. At least one evidence item must exist on the job.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, agentId: { type: 'string' }, leaseToken: { type: 'string' }, result: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' }, maxItems: 100 },
    }, required: ['id', 'jobId', 'agentId', 'leaseToken'] } },

  { name: 'fail_agent_job', description: 'Fail a claimed agent job with a concrete reason, release its artifact lease, and retain diagnostic evidence.',
    inputSchema: { type: 'object', properties: {
      ...idProp, jobId: { type: 'string' }, agentId: { type: 'string' }, leaseToken: { type: 'string' }, reason: { type: 'string' },
      evidence: { type: 'array', items: { type: 'string' }, maxItems: 100 },
    }, required: ['id', 'jobId', 'agentId', 'leaseToken', 'reason'] } },

  { name: 'recover_stale_agent_jobs', description: 'Release expired agent-job leases so dependency-ready jobs can be claimed again. This never launches or kills an agent process.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'get_visual_excellence_department', description: 'Read the governed Visual Excellence Department: Director, Composition, Motion/VFX, independent QA, briefs, deliveries, reviews, and required human sign-off.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'upsert_visual_sequence_brief', description: 'Create or update a machine-readable Visual Director brief for tile connections or tumble choreography. Optionally creates the dependency-ordered leased agent jobs; it never launches models or commands.',
    inputSchema: { type: 'object', properties: {
      ...idProp, brief: { type: 'object' }, createJobs: { type: 'boolean', description: 'Create the governed leased job plan for this brief. Defaults to true.' },
    }, required: ['id', 'brief'] } },

  { name: 'record_visual_specialist_delivery', description: 'Record one separately owned Visual Excellence delivery and its evidence. Accepted delivery records require evidence and cannot conflict with another active writer.',
    inputSchema: { type: 'object', properties: {
      ...idProp, deliveryId: { type: 'string' }, briefId: { type: 'string' },
      owner: { type: 'string', enum: ['visual', 'motion_vfx', 'protocol', 'frontend', 'audio', 'qa'] },
      artifact: { type: 'string' }, status: { type: 'string', enum: ['planned', 'submitted', 'accepted', 'rejected'] },
      evidence: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'briefId', 'owner', 'artifact', 'status'] } },

  { name: 'record_visual_director_review', description: 'Record the Visual Director review after accepted Protocol, Composition, Motion/VFX, Frontend, independent QA, and any required Audio evidence exist. Approval requires rendered evidence.',
    inputSchema: { type: 'object', properties: {
      ...idProp, reviewId: { type: 'string' }, briefId: { type: 'string' },
      verdict: { type: 'string', enum: ['pending', 'approve', 'revise', 'block'] },
      evidence: { type: 'array', items: { type: 'string' } }, corrections: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'briefId', 'verdict'] } },

  { name: 'record_human_visual_signoff', description: 'Record the human owner’s final approval or rejection for Director-approved visual briefs. This is the final visual authority and becomes a certification gate once governed visual work exists.',
    inputSchema: { type: 'object', properties: {
      ...idProp, status: { type: 'string', enum: ['approved', 'rejected'] }, decidedBy: { type: 'string' },
      briefIds: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
    }, required: ['id', 'status', 'decidedBy', 'briefIds'] } },

  { name: 'upsert_flagship_scenario', description: 'Create or update a deterministic Flagship proof scenario for one mode, mechanic, interaction, promise, edge case, or release example.',
    inputSchema: { type: 'object', properties: {
      ...idProp, scenarioId: { type: 'string' }, label: { type: 'string' }, mode: { type: 'string' }, seed: { type: 'integer' },
      kind: { type: 'string', enum: ['signature', 'mechanic', 'interaction', 'edge', 'failure', 'release'] },
      mechanics: { type: 'array', items: { type: 'string' } }, promises: { type: 'array', items: { type: 'string' } },
      expected: { type: 'object' }, notes: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'scenarioId', 'mode'] } },

  { name: 'run_flagship_scenario', description: 'Run one saved seeded scenario through the authoritative local MathEngine and return its event/state timeline and expectation failures.',
    inputSchema: { type: 'object', properties: { ...idProp, scenarioId: { type: 'string' } }, required: ['id', 'scenarioId'] } },

  { name: 'update_math', description: 'Change top-level math settings. Only pass fields you want changed. Changing grid or gameType regenerates reel strips.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      gameType: { type: 'string' }, reels: { type: 'integer' },
      rows: { type: 'array', items: { type: 'integer' } },
      rtp: { type: 'number', description: 'Decimal, e.g. 0.965' },
      wincap: { type: 'number' }, volatility: { type: 'string' },
    }, required: ['id'] } },

  { name: 'set_symbol', description: 'Create or update a symbol: tier, payouts by match count, special flags.',
    inputSchema: { type: 'object', properties: {
      ...idProp, name: { type: 'string' }, tier: { type: 'string' },
      payouts: { type: 'object', description: 'e.g. {"3":1.0,"4":4.0,"5":20.0}' },
      special: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'name'] } },

  { name: 'remove_symbol', description: 'Delete a symbol by name.',
    inputSchema: { type: 'object', properties: { ...idProp, name: { type: 'string' } }, required: ['id', 'name'] } },

  { name: 'list_mechanics', description: 'Bonus mechanics compatible with this project\'s game type, with their config fields and defaults.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'set_mechanics', description: 'Enable/disable bonus mechanics and set their config.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      enable: { type: 'array', items: { type: 'string' } },
      disable: { type: 'array', items: { type: 'string' } },
      config: { type: 'object', description: 'e.g. {"cascades":{"maxCascades":5}}' },
    }, required: ['id'] } },

  { name: 'set_freespin_triggers', description: 'Set free spins awarded per scatter count.',
    inputSchema: { type: 'object', properties: {
      ...idProp, basegame: { type: 'object' }, freegame: { type: 'object' },
    }, required: ['id'] } },

  { name: 'get_reel_strips', description: 'Read reel strips as per-reel symbol counts and lengths.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'set_reel_strip', description: 'Replace one reel strip by composition (symbol -> count). Shapes hit rate and volatility.',
    inputSchema: { type: 'object', properties: {
      ...idProp, reel: { type: 'integer' }, counts: { type: 'object' },
    }, required: ['id', 'reel', 'counts'] } },

  { name: 'regenerate_reel_strips', description: 'Rebuild all strips from the symbol set with default weighting.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'apply_blueprint', description: 'Compile one factory blueprint into a saved project while preserving theme, art, audio, Spine, and provider settings.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      blueprintId: { type: 'string', enum: Object.keys(GAME_BLUEPRINTS), description: 'Factory blueprint id.' },
    }, required: ['id', 'blueprintId'] } },

  { name: 'run_simulation', description: 'Seeded Monte Carlo against the current design. Returns RTP, hit rate, avg/max win, std dev, cascades, wincap hits, win distribution.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      rounds: { type: 'integer', description: 'Default 50000; 200000+ for a confident RTP.' },
      seed: { type: 'integer' },
      mode: { type: 'string', description: 'Configured wager mode name. Defaults to base.' },
    }, required: ['id'] } },

  { name: 'calibrate_local_math', description: 'Run deterministic local Math Autopilot for every wager mode. Adjusts mode-specific multipliers, preserves the symbol-pay hierarchy, saves statistical evidence, and never claims official release verification.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      rounds: { type: 'integer', description: 'Deterministic rounds per mode. Default 25000.' },
      force: { type: 'boolean', description: 'Re-run even when current evidence is fresh.' },
    }, required: ['id'] } },

  { name: 'tune_rtp_to_target', description: 'Legacy global payout scaler for manual diagnostics. Prefer calibrate_local_math so symbol hierarchy is preserved and wager modes are calibrated independently.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      target: { type: 'number', description: 'Decimal RTP. Defaults to the project target.' },
      rounds: { type: 'integer', description: 'Simulation size per pass. Default 100000.' },
      mode: { type: 'string', description: 'Configured wager mode to diagnose. Defaults to base.' },
    }, required: ['id'] } },

  { name: 'validate', description: 'Release-readiness validation: declared Stake limits, paytable structure, production completeness, and deterministic simulated RTP.',
    inputSchema: { type: 'object', properties: idProp, required: ['id'] } },

  { name: 'export_math_sdk', description: 'Write a math-sdk-conformant games/<game_id>/ folder to disk. Returns the paths written.',
    inputSchema: { type: 'object', properties: {
      ...idProp,
      outDir: { type: 'string', description: 'Destination root. Defaults to the studio home, producing <home>/games/<game_id>/.' },
    }, required: ['id'] } },
];

async function callTool(name, a = {}) {
  if (name === 'get_studio_state') {
    const [health, state, frame] = await Promise.all([
      bridgeJson('/health'),
      bridgeJson('/state'),
      bridgeJson('/frame-meta'),
    ]);
    const lastSeen = Date.parse(state.receivedAt || state.publishedAt || 0);
    return {
      live: Number.isFinite(lastSeen) && Date.now() - lastSeen < 10000,
      lastSeenMsAgo: Number.isFinite(lastSeen) ? Date.now() - lastSeen : null,
      state,
      frame,
      service: { url: BRIDGE_URL, studioHome: health.studioHome },
    };
  }

  if (name === 'capture_studio_view') {
    // Full-resolution production projects can need more than 20 seconds to
    // render, encode, archive, and publish a fresh shared frame. Keep this
    // above the browser capture deadline so a successful capture is not
    // reported as a timeout at the connector boundary.
    const result = await studioCommand('capture_view', {}, 45000);
    const state = await bridgeJson('/state');
    return sharedFrameContent({ command: 'capture_view', result, state });
  }

  if (name === 'get_studio_errors') {
    return await bridgeJson('/errors');
  }

  if (name === 'open_project_in_studio') {
    return await studioCommand('open_project', { id: a.id });
  }

  if (name === 'close_project_in_studio') {
    const result = await studioCommand('close_project', {}, 20000);
    return sharedFrameContent({ command: 'close_project', result });
  }

  if (name === 'select_studio_panel') {
    const result = await studioCommand('select_panel', { panel: a.panel }, 20000);
    return sharedFrameContent({ command: 'select_panel', result });
  }

  if (name === 'repair_and_certify') {
    const result = await studioCommand('repair_and_certify', {}, 90000);
    return sharedFrameContent({ command: 'repair_and_certify', result });
  }

  if (name === 'plan_visual_pack') {
    const result = await studioCommand('plan_visual_pack', {}, 30000);
    return sharedFrameContent({ command: 'plan_visual_pack', result });
  }

  if (name === 'prepare_visual_work_order') {
    const result = await studioCommand('prepare_visual_work_order', {}, 30000);
    return sharedFrameContent({ command: 'prepare_visual_work_order', result });
  }

  if (name === 'ingest_visual_delivery') {
    const result = await studioCommand('ingest_visual_delivery', {}, 300000);
    return sharedFrameContent({ command: 'ingest_visual_delivery', result });
  }

  if (name === 'start_codex_visual_batch') {
    const result = await studioCommand('start_codex_visual_batch', { force: a.force === true, mode: 'manual', maxAttemptsPerTask: a.maxAttemptsPerTask }, 30000);
    return sharedFrameContent({ command: 'start_codex_visual_batch', result });
  }

  if (name === 'start_codex_visual_autopilot') {
    const session = await studioCommand('start_codex_visual_batch', { force: a.force === true, mode: 'autopilot', maxAttemptsPerTask: a.maxAttemptsPerTask }, 30000);
    const next = await studioCommand('next_codex_visual_task', {}, 30000);
    return codexVisualTaskContent({ command: 'start_codex_visual_autopilot', session, ...next });
  }

  if (name === 'get_next_codex_visual_task') {
    const result = await studioCommand('next_codex_visual_task', {}, 30000);
    return codexVisualTaskContent({ command: 'get_next_codex_visual_task', ...result });
  }

  if (name === 'submit_codex_visual_asset') {
    const state = await bridgeJson('/state');
    const id = state.projectId;
    if (!id) throw new Error('Open the target project in StakeStudio before submitting Codex art.');
    const project = loadProject(id);
    const fingerprint = project.visualFactory?.workOrder?.fingerprint;
    if (!fingerprint) throw new Error('Prepare the visual work order before submitting Codex art.');
    const submission = await bridgeJson(`/projects/${encodeURIComponent(id)}/visual-delivery`, {
      method: 'POST',
      timeout: 30000,
      body: JSON.stringify({ filename: a.filename, pngBase64: a.pngBase64, workOrderFingerprint: fingerprint }),
    });
    const ingest = await studioCommand('ingest_visual_delivery', { codexFilename: a.filename }, 300000);
    const batch = await studioCommand('codex_visual_batch_status', {}, 30000);
    const next = ['blocked', 'stale'].includes(batch.status)
      ? { task: null, batch }
      : await studioCommand('next_codex_visual_task', {}, 30000);
    let factory = null;
    if (!next.task) {
      const saved = loadProject(id).build?.factoryRun;
      if (saved?.status === 'awaiting-input' && saved.resumeStage === 'visual') {
        factory = await studioCommand('run_factory', { profile: saved.profile || 'prototype' }, 300000);
      }
    }
    return codexVisualTaskContent({ command: 'submit_codex_visual_asset', submission, ingest, next, factory });
  }

  if (name === 'produce_visual_batch') {
    const result = await studioCommand('produce_visual_batch', { maxRequests: a.maxRequests }, 300000);
    return sharedFrameContent({ command: 'produce_visual_batch', result });
  }

  if (name === 'run_game_factory') {
    const result = await studioCommand('run_factory', { profile: a.profile }, 300000);
    return result?.visualTask
      ? codexVisualTaskContent({ command: 'run_game_factory', task: result.visualTask, factory: result })
      : sharedFrameContent({ command: 'run_game_factory', result });
  }

  if (name === 'launch_game_factory_project') {
    const result = await studioCommand('launch_factory_project', a, 300000);
    return result?.factory?.visualTask
      ? codexVisualTaskContent({ command: 'launch_game_factory_project', task: result.factory.visualTask, launch: result.launch, factory: result.factory })
      : sharedFrameContent({ command: 'launch_game_factory_project', result });
  }

  if (name === 'get_game_factory_status') {
    const result = await studioCommand('get_factory_status', {}, 30000);
    return result?.visualTask
      ? codexVisualTaskContent({ command: 'get_game_factory_status', task: result.visualTask, factory: result })
      : sharedFrameContent({ command: 'get_game_factory_status', result });
  }

  if (name === 'cancel_game_factory') {
    const result = await studioCommand('cancel_factory', {}, 30000);
    return sharedFrameContent({ command: 'cancel_game_factory', result });
  }

  if (name === 'set_preview_viewport') {
    const result = await studioCommand('set_preview_viewport', { viewport: a.viewport }, 20000);
    return sharedFrameContent({ command: 'set_preview_viewport', result });
  }

  if (name === 'set_preview_mode') {
    const result = await studioCommand('set_preview_mode', { mode: a.mode }, 20000);
    return sharedFrameContent({ command: 'set_preview_mode', result });
  }

  if (name === 'run_preview_replay_audit') {
    const result = await studioCommand('run_replay_matrix_audit', {}, 90000);
    return sharedFrameContent({ command: 'run_replay_matrix_audit', result });
  }

  if (name === 'run_preview_layout_audit') {
    const result = await studioCommand('run_viewport_layout_audit', {}, 90000);
    return sharedFrameContent({ command: 'run_viewport_layout_audit', result });
  }

  if (name === 'run_preview_performance_audit') {
    const result = await studioCommand('profile_preview', {}, 90000);
    return sharedFrameContent({ command: 'profile_preview', result });
  }

  if (name === 'run_audio_mastering_audit') {
    const result = await studioCommand('run_audio_mastering_audit', {}, 90000);
    return sharedFrameContent({ command: 'run_audio_mastering_audit', result });
  }

  if (name === 'run_morpheus_signature_capture_audit') {
    const result = await studioCommand('run_morpheus_signature_capture_audit', {}, 240000);
    return morpheusSignatureCaptureContent(result);
  }

  if (name === 'run_morpheus_effect_route_capture_audit') {
    const result = await studioCommand('run_morpheus_effect_route_capture_audit', {
      routeId: a.routeId,
      motionMode: a.motionMode,
      viewport: a.viewport,
      resume: a.resume,
    }, a.routeId ? 180000 : 900000);
    return morpheusEffectRouteCaptureContent(result);
  }

  if (name === 'play_morpheus_effect_proof_route') {
    const result = await studioCommand('play_morpheus_effect_proof_route', {
      routeId: a.routeId,
      motion: a.motion,
      viewport: a.viewport,
    }, 160000);
    return sharedFrameContent({ command: 'play_morpheus_effect_proof_route', result });
  }

  if (name === 'install_morpheus_effect_audio_pack') {
    const result = await studioCommand('install_morpheus_effect_audio_pack', { seed: a.seed }, 90000);
    return sharedFrameContent({ command: 'install_morpheus_effect_audio_pack', result });
  }

  if (name === 'audition_morpheus_effect_audio_pack') {
    const result = await studioCommand('audition_morpheus_effect_audio_pack', {}, 90000);
    return sharedFrameContent({ command: 'audition_morpheus_effect_audio_pack', result });
  }

  if (name === 'spin_preview') {
    if (a.mode) await studioCommand('set_preview_mode', { mode: a.mode }, 20000);
    const result = await studioCommand('spin_preview', {}, 160000);
    return sharedFrameContent({ command: 'spin_preview', result });
  }

  if (name === 'play_published_reviewer_replay') {
    const result = await studioCommand('play_published_reviewer_replay', {
      mode: a.mode,
      category: a.category,
    }, 160000);
    return sharedFrameContent({ command: 'play_published_reviewer_replay', result });
  }

  if (name === 'run_studio_simulation') {
    const result = await studioCommand('run_studio_simulation', { rounds: a.rounds, seed: a.seed }, 35000);
    return sharedFrameContent({ command: 'run_studio_simulation', result });
  }

  if (name === 'list_projects') {
    return { projects: listProjects(), gamesDir: GAMES };
  }

  if (name === 'create_project') {
    const gameType = a.gameType && GAME_TYPES[a.gameType] ? a.gameType : 'ways';
    const t = GAME_TYPES[gameType];
    const project = createGameProject({
      name: a.name,
      math: {
        gameType,
        grid: { reels: t.defaults.reels, rows: [...t.defaults.rows] },
        rtp: 0.965, wincap: 5000, volatility: 'high',
        betModes: [{ name: 'base', cost: 1.0, rtp: 0.965, maxWin: 5000, autoCloseDisabled: false, isFeature: true, isBuyBonus: false, distributions: [] }],
        specialSymbols: { wild: ['W'], scatter: ['S'] },
        bonusMechanics: [], mechanicConfig: {},
        freespinTriggers: { basegame: { 3: 10, 4: 15, 5: 20 } },
        reelStrips: {}, distributions: [],
      },
    });
    const id = slug(a.name);
    project.build.stakeEngine.gameId = id;
    saveProject(id, project);
    return { created: id, path: projectPath(id), summary: summarise(project, id) };
  }

  const id = a.id;
  const project = loadProject(id);
  const m = project.math;

  switch (name) {
    case 'get_project':
      return summarise(project, id);

    case 'get_production_workflow': {
      const workflow = ensureProductionWorkflow(project);
      return { id, workflow, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'set_production_track': {
      const workflow = setProductionTrack(project, a.track);
      saveProject(id, project);
      return { id, track: workflow.track, workflow, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'update_flagship_workflow': {
      const allowed = new Set(['vision', 'research', 'mechanicContract', 'capabilityReview', 'architecture', 'feasibilitySpikes', 'verticalSlice', 'fidelityLedger', 'agentCoordination']);
      if (!allowed.has(a.section)) throw new Error(`Unsupported Flagship workflow section "${a.section}".`);
      setProductionTrack(project, 'flagship');
      const workflow = ensureProductionWorkflow(project, 'flagship');
      workflow[a.section] = { ...(workflow[a.section] || {}), ...(a.value || {}) };
      project.production.workflow = normalizeProductionWorkflow(workflow, 'flagship');
      project.production.workflow.updatedAt = new Date().toISOString();
      project.production.qa ||= {};
      project.production.qa.gameCertification = null;
      saveProject(id, project);
      return { id, section: a.section, workflow: project.production.workflow, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'upsert_specialty_agent_work': {
      setProductionTrack(project, 'flagship');
      const item = upsertSpecialtyAgentWorkItem(project, {
        id: a.workId, owner: a.owner, artifact: a.artifact, stage: a.stage, status: a.status,
        dependencies: a.dependencies, deliverables: a.deliverables, acceptance: a.acceptance, evidence: a.evidence,
      });
      saveProject(id, project);
      return { id, item, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'record_specialty_agent_handoff': {
      setProductionTrack(project, 'flagship');
      const handoff = recordSpecialtyAgentHandoff(project, {
        id: a.handoffId, workItemId: a.workItemId, from: a.from, to: a.to, status: a.status,
        contract: a.contract, evidence: a.evidence,
      });
      saveProject(id, project);
      return { id, handoff, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'create_agent_job': {
      setProductionTrack(project, 'flagship');
      const job = createAgentJob(project, {
        id: a.jobId, owner: a.owner, artifact: a.artifact, stage: a.stage,
        dependencies: a.dependencies, deliverables: a.deliverables, acceptance: a.acceptance,
      });
      saveProject(id, project);
      return { id, job, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'list_agent_jobs': {
      const result = listAgentJobs(project, { owner: a.owner, status: a.status, availableOnly: a.availableOnly });
      if (result.recovered.length) saveProject(id, project);
      return { id, ...result, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'claim_agent_job': {
      const job = claimAgentJob(project, {
        jobId: a.jobId, agentId: a.agentId, role: a.role, leaseSeconds: a.leaseSeconds,
      });
      saveProject(id, project);
      return { id, job, leaseToken: job.lease.token, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'heartbeat_agent_job': {
      const job = heartbeatAgentJob(project, {
        jobId: a.jobId, agentId: a.agentId, leaseToken: a.leaseToken, leaseSeconds: a.leaseSeconds,
      });
      saveProject(id, project);
      return { id, job, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'update_agent_job': {
      const job = updateAgentJob(project, {
        jobId: a.jobId, agentId: a.agentId, leaseToken: a.leaseToken,
        progress: a.progress, note: a.note, evidence: a.evidence,
      });
      saveProject(id, project);
      return { id, job, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'complete_agent_job': {
      const job = completeAgentJob(project, {
        jobId: a.jobId, agentId: a.agentId, leaseToken: a.leaseToken,
        result: a.result, evidence: a.evidence,
      });
      saveProject(id, project);
      return { id, job, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'fail_agent_job': {
      const job = failAgentJob(project, {
        jobId: a.jobId, agentId: a.agentId, leaseToken: a.leaseToken,
        reason: a.reason, evidence: a.evidence,
      });
      saveProject(id, project);
      return { id, job, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'recover_stale_agent_jobs': {
      const recovery = recoverStaleAgentJobLeases(project);
      if (recovery.recovered.length) saveProject(id, project);
      return { id, ...recovery, jobs: listAgentJobs(project).jobs, summary: getFlagshipWorkflowSummary(project) };
    }

    case 'get_visual_excellence_department': {
      const workflow = ensureProductionWorkflow(project);
      return {
        id,
        department: workflow.visualExcellence,
        summary: getVisualExcellenceSummary(workflow.visualExcellence),
      };
    }

    case 'upsert_visual_sequence_brief': {
      setProductionTrack(project, 'flagship');
      const workflow = ensureProductionWorkflow(project, 'flagship');
      workflow.visualExcellence = upsertVisualSequenceBrief(workflow.visualExcellence, a.brief);
      const brief = workflow.visualExcellence.briefs.find(item => item.id === String(a.brief?.id || '').trim());
      const jobs = [];
      if (a.createJobs !== false) {
        for (const job of createVisualExcellenceJobPlan(brief)) {
          const existing = workflow.agentCoordination.workItems.find(item => item.id === job.id);
          jobs.push(existing || createAgentJob(project, job));
        }
      }
      workflow.updatedAt = new Date().toISOString();
      project.production.qa ||= {};
      project.production.qa.gameCertification = null;
      saveProject(id, project);
      return {
        id, brief, jobs,
        department: workflow.visualExcellence,
        summary: getVisualExcellenceSummary(workflow.visualExcellence),
      };
    }

    case 'record_visual_specialist_delivery': {
      const workflow = ensureProductionWorkflow(project, 'flagship');
      workflow.visualExcellence = recordVisualExcellenceDelivery(workflow.visualExcellence, {
        id: a.deliveryId, briefId: a.briefId, owner: a.owner, artifact: a.artifact,
        status: a.status, evidence: a.evidence,
      });
      workflow.updatedAt = new Date().toISOString();
      project.production.qa ||= {};
      project.production.qa.gameCertification = null;
      saveProject(id, project);
      return { id, department: workflow.visualExcellence, summary: getVisualExcellenceSummary(workflow.visualExcellence) };
    }

    case 'record_visual_director_review': {
      const workflow = ensureProductionWorkflow(project, 'flagship');
      workflow.visualExcellence = recordVisualDirectorReview(workflow.visualExcellence, {
        id: a.reviewId, briefId: a.briefId, verdict: a.verdict,
        evidence: a.evidence, corrections: a.corrections,
      });
      workflow.updatedAt = new Date().toISOString();
      project.production.qa ||= {};
      project.production.qa.gameCertification = null;
      saveProject(id, project);
      return { id, department: workflow.visualExcellence, summary: getVisualExcellenceSummary(workflow.visualExcellence) };
    }

    case 'record_human_visual_signoff': {
      const workflow = ensureProductionWorkflow(project, 'flagship');
      workflow.visualExcellence = recordHumanVisualSignoff(workflow.visualExcellence, {
        status: a.status, decidedBy: a.decidedBy, briefIds: a.briefIds, notes: a.notes,
      });
      workflow.updatedAt = new Date().toISOString();
      project.production.qa ||= {};
      project.production.qa.gameCertification = null;
      saveProject(id, project);
      return { id, department: workflow.visualExcellence, summary: getVisualExcellenceSummary(workflow.visualExcellence) };
    }

    case 'upsert_flagship_scenario': {
      setProductionTrack(project, 'flagship');
      const scenario = upsertFlagshipScenario(project, {
        id: a.scenarioId, label: a.label, mode: a.mode, seed: a.seed, kind: a.kind,
        mechanics: a.mechanics, promises: a.promises, expected: a.expected, notes: a.notes,
      });
      saveProject(id, project);
      return { id, scenario, summary: getFlagshipScenarioLabSummary(project) };
    }

    case 'run_flagship_scenario': {
      const run = runFlagshipScenario(project, a.scenarioId);
      saveProject(id, project);
      return { id, run, summary: getFlagshipScenarioLabSummary(project) };
    }

    case 'list_mechanics':
      return {
        gameType: m.gameType,
        compatible: getCompatibleMechanics(m.gameType).map(x => ({
          key: x.key, name: x.name, description: x.description, configFields: x.configFields || {},
        })),
        enabled: m.bonusMechanics || [],
      };

    case 'update_math': {
      const ch = {};
      if (a.gameType && GAME_TYPES[a.gameType]) { m.gameType = a.gameType; ch.gameType = a.gameType; }
      if (a.reels) { m.grid.reels = a.reels; if (!a.rows) m.grid.rows = Array(a.reels).fill(m.grid.rows[0] || 3); ch.reels = a.reels; }
      if (a.rows) { m.grid.rows = a.rows; ch.rows = a.rows; }
      if (a.rtp !== undefined) { setProjectRtp(project, a.rtp); ch.rtp = a.rtp; ch.betModesRetargeted = true; }
      if (a.wincap !== undefined) { m.wincap = a.wincap; ch.wincap = a.wincap; }
      if (a.volatility) { m.volatility = a.volatility; ch.volatility = a.volatility; }
      if (ch.reels || ch.rows || ch.gameType) {
        m.reelStrips = { BR: generateDefaultReelStrips(project) };
        ch.reelStripsRegenerated = true;
      }
      saveProject(id, project);
      return { updated: ch, grid: m.grid };
    }

    case 'set_symbol': {
      const syms = project.theme.symbols;
      let s = syms.find(x => x.name === a.name);
      if (!s) { s = { id: a.name, name: a.name, tier: a.tier || 'low', src: '', payouts: {}, special: [] }; syms.push(s); }
      if (a.tier) s.tier = a.tier;
      if (a.payouts) { s.payouts = {}; for (const [k, v] of Object.entries(a.payouts)) s.payouts[Number(k)] = Number(v); }
      if (a.special) {
        s.special = a.special;
        for (const flag of ['wild', 'scatter', 'multiplier']) {
          if (!m.specialSymbols[flag]) m.specialSymbols[flag] = [];
          const list = m.specialSymbols[flag];
          const at = list.indexOf(s.name);
          if (a.special.includes(flag) && at === -1) list.push(s.name);
          if (!a.special.includes(flag) && at !== -1) list.splice(at, 1);
        }
      }
      saveProject(id, project);
      return { symbol: { name: s.name, tier: s.tier, payouts: s.payouts, special: s.special } };
    }

    case 'remove_symbol': {
      const syms = project.theme.symbols;
      const i = syms.findIndex(x => x.name === a.name);
      if (i === -1) return { error: `No symbol "${a.name}".` };
      syms.splice(i, 1);
      for (const f of Object.keys(m.specialSymbols || {})) {
        m.specialSymbols[f] = (m.specialSymbols[f] || []).filter(n => n !== a.name);
      }
      saveProject(id, project);
      return { removed: a.name, remaining: syms.map(s => s.name) };
    }

    case 'set_mechanics': {
      if (!m.bonusMechanics) m.bonusMechanics = [];
      if (!m.mechanicConfig) m.mechanicConfig = {};
      const unknown = [];
      for (const k of a.enable || []) {
        if (!BONUS_MECHANICS[k]) { unknown.push(k); continue; }
        if (!m.bonusMechanics.includes(k)) m.bonusMechanics.push(k);
        if (!m.mechanicConfig[k]) {
          m.mechanicConfig[k] = {};
          for (const [fk, fd] of Object.entries(BONUS_MECHANICS[k].configFields || {})) m.mechanicConfig[k][fk] = fd.default;
        }
      }
      for (const k of a.disable || []) m.bonusMechanics = m.bonusMechanics.filter(x => x !== k);
      for (const [k, cfg] of Object.entries(a.config || {})) {
        if (!BONUS_MECHANICS[k]) { unknown.push(k); continue; }
        m.mechanicConfig[k] = { ...(m.mechanicConfig[k] || {}), ...cfg };
      }
      saveProject(id, project);
      return { enabled: m.bonusMechanics, config: m.mechanicConfig, ...(unknown.length ? { unknownMechanics: unknown } : {}) };
    }

    case 'set_freespin_triggers': {
      if (!m.freespinTriggers) m.freespinTriggers = {};
      if (a.basegame) m.freespinTriggers.basegame = a.basegame;
      if (a.freegame) m.freespinTriggers.freegame = a.freegame;
      saveProject(id, project);
      return { freespinTriggers: m.freespinTriggers };
    }

    case 'get_reel_strips': {
      const strips = m.reelStrips?.BR || [];
      return { reels: strips.length, strips: strips.map((s, i) => {
        const c = {}; for (const x of s) c[x] = (c[x] || 0) + 1;
        return { reel: i, length: s.length, counts: c };
      }) };
    }

    case 'set_reel_strip': {
      if (!m.reelStrips?.BR) m.reelStrips = { BR: generateDefaultReelStrips(project) };
      const strips = m.reelStrips.BR;
      if (a.reel < 0 || a.reel >= strips.length) return { error: `Reel ${a.reel} out of range (0-${strips.length - 1}).` };
      const known = new Set((project.theme.symbols || []).map(s => s.name));
      const bad = Object.keys(a.counts).filter(n => !known.has(n));
      if (bad.length) return { error: `Unknown symbols: ${bad.join(', ')}. Known: ${[...known].join(', ')}` };
      const strip = [];
      for (const [sym, n] of Object.entries(a.counts)) for (let i = 0; i < Number(n); i++) strip.push(sym);
      if (!strip.length) return { error: 'Counts produced an empty strip.' };
      strips[a.reel] = shuffle(strip);
      saveProject(id, project);
      return { reel: a.reel, length: strip.length, counts: a.counts };
    }

    case 'regenerate_reel_strips': {
      m.reelStrips = { BR: generateDefaultReelStrips(project) };
      saveProject(id, project);
      return { regenerated: true, lengths: m.reelStrips.BR.map(s => s.length) };
    }

    case 'apply_blueprint': {
      const result = applyGameBlueprint(project, a.blueprintId);
      saveProject(id, project);
      return { applied: result.blueprint, preserved: result.preserved, invalidated: result.invalidated };
    }

    case 'run_simulation':
      return simulate(project, Math.min(Math.max(a.rounds || 50000, 1000), 2000000), a.seed ?? SeededRNG.generateSeed(), a.mode || 'base');

    case 'calibrate_local_math': {
      const calibration = calibratePrototypeMath(project, {
        rounds: Math.min(Math.max(a.rounds || 25000, 5000), 100000),
        force: a.force === true,
      });
      saveProject(id, project);
      return {
        format: calibration.format,
        fingerprint: calibration.fingerprint,
        reused: calibration.reused === true,
        rounds: calibration.rounds,
        modes: calibration.modes.map(mode => ({
          name: mode.name,
          realizedRtp: mode.realizedRtp,
          declaredRtp: mode.declaredRtp,
          hitRate: mode.hitRate,
          aligned: mode.aligned,
          factorField: mode.factorField,
          calibratedFactor: mode.calibratedFactor,
        })),
        status: getMathCalibrationStatus(project),
      };
    }

    case 'tune_rtp_to_target': {
      const target = a.target ?? m.rtp;
      const rounds = Math.min(Math.max(a.rounds || 100000, 10000), 1000000);
      const seed = SeededRNG.generateSeed();
      const before = simulate(project, rounds, seed, a.mode || 'base');
      if (before.rtpDecimal <= 0) {
        return { error: 'Simulated RTP is zero — the paytable pays nothing, so scaling cannot reach a target.' };
      }
      const k = target / before.rtpDecimal;
      for (const s of project.theme.symbols) {
        for (const key of Object.keys(s.payouts || {})) s.payouts[key] = +(s.payouts[key] * k).toFixed(6);
      }
      setProjectRtp(project, target);
      saveProject(id, project);
      const after = simulate(project, rounds, seed, a.mode || 'base');
      return {
        target, scaleApplied: +k.toFixed(6),
        before: { rtp: before.rtp, hitRate: before.hitRate },
        after: { rtp: after.rtp, hitRate: after.hitRate, stdDev: after.stdDev, maxWin: after.maxWin },
        note: 'Payout scaling is linear in RTP and leaves hit rate unchanged. Volatility is shaped by reel strips, not by this.',
      };
    }

    case 'validate': {
      const be = new BuildEngine(project);
      const { PaytableValidator } = await import(join(STUDIO, 'src/engines/math/PaytableValidator.js'));
      const paytableIssues = new PaytableValidator(project).validate();
      const readiness = be.validateReadiness({ rounds: 50000 });
      return {
        stakeCompliance: be.validate(),
        paytableIssues,
        readiness: {
          ...readiness,
          valid: readiness.valid && !paytableIssues.some(issue => issue.severity === 'error'),
        },
        note: 'Readiness includes a deterministic 50,000-round RTP gate. Run run_simulation with 200,000+ rounds for final confidence.',
      };
    }

    case 'export_math_sdk': {
      const files = new MathSDKExporter(project).generateFiles();
      // Default under build/ so the exported tree stays clean of project.json
      // and can be copied into math-sdk wholesale.
      const root = a.outDir || join(HOME, 'build');
      const written = [];
      for (const [rel, content] of Object.entries(files)) {
        const full = join(root, rel);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
        written.push(full);
      }
      return {
        gameId: Object.keys(files)[0].split('/')[1],
        written,
        next: `Copy into math-sdk:  cp -R ${join(root, 'games', Object.keys(files)[0].split('/')[1])} <math-sdk>/games/`,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- MCP transport ----------

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

export async function handleMcpMessage(req) {
  const { id, method, params } = req || {};
  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'stakestudio', version: '1.0.0' },
        },
      };
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }
    if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments || {});
      const isError = !!(result && result.error);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: result?._content || [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError,
        },
      };
    }
    if (id !== undefined) {
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (err) {
    if (id !== undefined) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ error: String(err?.message || err) }, null, 2) }],
          isError: true,
        },
      };
    }
  }
  return null;
}

const isStdioMain = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || '');
if (isStdioMain) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      Promise.resolve()
        .then(() => JSON.parse(line))
        .then(handleMcpMessage)
        .then((reply) => { if (reply) send(reply); })
        .catch(() => {});
    }
  });
}
