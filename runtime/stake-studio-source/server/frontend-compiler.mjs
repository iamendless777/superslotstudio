import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProjectDocument } from './project-storage.mjs';
import {
  FULL_CANVAS_CABINET_MODE,
  resolvePlayerComposition,
} from '../src/editor/composition/CabinetComposition.js';
import { createPlayerInformationManifest } from '../src/engines/quality/PlayerInformationQA.js';
import { build as viteBuild } from 'vite';
import {
  createVisualEffectsState,
  validateVisualEffectsState,
  visualEffectsFingerprint,
} from '../src/engines/animation/VisualEffectRecipes.js';
import { animationRuntimeFingerprint } from '../src/engines/animation/AnimationEngine.js';
import { STANDARD_ANIMATION_STATES } from '../src/engines/animation/AnimationEngine.js';
import { generateAnimationFiles } from '../src/engines/animation/AnimationExporter.js';
import { createPresentationDirectorManifest } from '../src/engines/presentation/PresentationDirector.js';
import {
  INTENSITY_PROFILES,
  MOTION_PROFILE_FACTORS,
  TILE_CONNECTION_PHASES,
  TILE_CONNECTION_TIMING,
  TUMBLE_PHASES,
  TUMBLE_TIMING,
} from '../src/engines/presentation/visual-excellence/index.js';
import {
  MORPHEUS_DREAMFALL_RENDER_PROFILE,
  MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallRenderProfile.js';
import {
  MORPHEUS_DREAMFALL_CABINET_PROFILE,
} from '../src/engines/presentation/morpheus/MorpheusDreamfallCabinetProfile.js';
import {
  MORPHEUS_NEXUS_CABINET_PROFILE,
} from '../src/engines/presentation/morpheus/MorpheusNexusCabinetProfile.js';
import {
  MORPHEUS_CONTRACT_FINGERPRINT,
  MORPHEUS_EVENT_SCHEMA_VERSION,
  MORPHEUS_MAX_WIN_MULTIPLIER,
  MORPHEUS_MODE_REGISTRY,
} from '../src/engines/morpheus/MorpheusGameContract.js';
import {
  createExactMaxTerminationProofTrace,
  createMysteryStarDreamfallProofTrace,
  createTricksterGridSettlementProofTrace,
  createLucidFamilyMultiplierProofTrace,
  createVeilAscentUpgradeProofTrace,
  createPredeterminedGeneratorProofTrace,
  createNightmareReliquaryProofTrace,
} from '../src/engines/morpheus/MorpheusEffectProofTraces.js';
import {
  createMorpheusPortableFrontendEvidence,
} from '../src/engines/quality/morpheus/MorpheusPortableFrontendQA.js';
import {
  auditMorpheusProjectContract,
  createMorpheusGovernedModesManifest,
} from '../src/engines/morpheus/MorpheusProjectContract.js';
import {
  recordMorpheusAssetOrchestrationEvidence,
} from '../src/engines/quality/morpheus/MorpheusAssetOrchestrationEvidence.js';

export const FRONTEND_COMPILER_VERSION = 13;
const SERVER_ROOT = dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = join(SERVER_ROOT, '..');
const PUBLIC_ROOT = join(STUDIO_ROOT, 'public');
const TEMPLATE_ROOT = join(SERVER_ROOT, 'frontend-template');
const VISUAL_EFFECTS_ENTRY = join(SERVER_ROOT, 'frontend-runtime', 'visual-effects-entry.js');
const SPINE_ENTRY = join(SERVER_ROOT, 'frontend-runtime', 'spine-entry.js');
const MORPHEUS_AUTHORITATIVE_ENTRY = join(SERVER_ROOT, 'frontend-runtime', 'morpheus-authoritative-entry.js');
const TEMPLATE_FILES = ['index.html', 'styles.css', 'stake-runtime.js', 'game-app.js'];

const safeId = value => {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  if (!id) throw new Error('A project id is required.');
  return id;
};

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
function projectBackground(project) {
  const layers = project.theme?.cabinet?.layers || [];
  return layers.find(layer => layer.role === 'background' && layer.src)?.src
    || layers.find(layer => layer.src)?.src || '';
}

function projectCabinetLayers(project) {
  return (project.theme?.cabinet?.layers || [])
    .filter(layer => layer?.src && layer.visible !== false && layer.assetPackRole !== 'background')
    .map(layer => ({
      id: layer.id || layer.name || `cabinet-layer-${layer.zIndex || 0}`,
      role: layer.assetPackRole || layer.type || 'cabinet',
      src: layer.src,
      x: Number(layer.x) || 0,
      y: Number(layer.y) || 0,
      width: Number(layer.width) || Number(project.theme?.cabinet?.width) || 1280,
      height: Number(layer.height) || Number(project.theme?.cabinet?.height) || 800,
      opacity: Math.max(0, Math.min(1, Number(layer.opacity ?? 1))),
      zIndex: Number(layer.zIndex) || 0,
      blendMode: layer.blendMode || 'normal',
    }));
}

function projectReelArea(project) {
  const cabinet = project.theme?.cabinet || {};
  const layer = (cabinet.layers || []).find(item => item?.type === 'reel-area' && item.visible !== false);
  if (!layer) return null;
  return {
    x: Number(layer.x) || 0,
    y: Number(layer.y) || 0,
    width: Math.max(1, Number(layer.width) || Number(cabinet.width) || 1280),
    height: Math.max(1, Number(layer.height) || Number(cabinet.height) || 800),
  };
}

function projectEnvironmentAssets(project) {
  return Object.fromEntries(Object.entries(project.theme?.environmentAssets || {})
    .filter(([, asset]) => asset?.src && asset.visible !== false)
    .map(([id, asset]) => [id, {
      id,
      src: asset.src,
      x: Number(asset.x) || 0,
      y: Number(asset.y) || 0,
      width: Number(asset.width) || 1,
      height: Number(asset.height) || 1,
      opacity: Math.max(0, Math.min(1, Number(asset.opacity ?? 1))),
      zIndex: Number(asset.zIndex) || 2,
      blendMode: asset.blendMode || 'normal',
    }]));
}

function assertPortableAsset(source, label) {
  const value = String(source || '');
  if (/^https?:\/\//i.test(value) || /^\/\//.test(value)) {
    throw new Error(`${label} uses an external URL. Import the asset into StakeStudio so the compiled frontend is self-contained.`);
  }
}

function compactAudioAsset(asset, { loop = false } = {}) {
  if (!asset || typeof asset !== 'object') return null;
  return {
    src: String(asset.src || ''),
    loop: asset.loop == null ? loop : Boolean(asset.loop),
    volume: Math.max(0, Math.min(1.25, Number(asset.volume ?? 1) || 0)),
  };
}

function createFrontendAudioConfig(project) {
  const source = project.audio || {};
  const soundscapeEnabled = source.soundscapeEnabled !== false;
  const layers = soundscapeEnabled
    ? Object.fromEntries(Object.entries(source.layers || {})
      .map(([key, asset]) => [key, compactAudioAsset(asset, { loop: true })])
      .filter(([, asset]) => asset?.src))
    : {};
  const stingers = Object.fromEntries(Object.entries(source.stingers || {}).map(([key, value]) => {
    const assets = (Array.isArray(value) ? value : [value]).map(asset => compactAudioAsset(asset)).filter(asset => asset?.src);
    return [key, assets];
  }).filter(([, assets]) => assets.length));
  for (const [key, asset] of Object.entries(layers)) assertPortableAsset(asset.src, `Audio layer ${key}`);
  for (const [key, assets] of Object.entries(stingers)) {
    for (const asset of assets) assertPortableAsset(asset.src, `Audio stinger ${key}`);
  }
  return {
    enabled: Boolean(source.director?.enabled !== false && (Object.keys(layers).length || Object.keys(stingers).length)),
    soundscapeEnabled,
    director: source.director || {},
    layers,
    stingers,
  };
}

function createMorpheusPresentationCatalog(project) {
  const audioCueAssets = Object.fromEntries(Object.entries(project.audio?.stingers || {}).map(([cueId, value]) => {
    const asset = (Array.isArray(value) ? value : [value]).find(item => item?.src);
    return [cueId, asset ? {
      factory: asset.factory ? {
        packId: asset.factory.packId || null,
        fingerprint: asset.factory.fingerprint || null,
        sourceFingerprint: asset.factory.sourceFingerprint || null,
        approvalStatus: asset.factory.approvalStatus || null,
      } : null,
    } : null];
  }));
  return {
    motionAssetIds: (project.animation?.visualEffects?.motionAssets || []).map(asset => asset.id).filter(Boolean),
    presentationAssetKeys: Object.keys(project.theme?.presentationAssets || {}),
    characterStates: [...STANDARD_ANIMATION_STATES],
    audioCueIds: Object.keys(project.audio?.stingers || {}),
    audioCueAssets,
  };
}

export function createFrontendConfig(project) {
  const playerInformation = createPlayerInformationManifest(project);
  const grid = project.math?.grid || { reels: 5, rows: [3, 3, 3, 3, 3] };
  const themeSymbols = new Map((project.theme?.symbols || []).map(symbol => [symbol.name, symbol]));
  const symbols = playerInformation.symbols.map(symbol => ({
    ...symbol,
    motionProfile: themeSymbols.get(symbol.name)?.motionProfile || null,
    motionAssetId: themeSymbols.get(symbol.name)?.motionAssetId || null,
    motionOverlay: themeSymbols.get(symbol.name)?.motionOverlay || null,
  }));
  const betModes = playerInformation.modes;
  const gameId = project.build?.stakeEngine?.gameId || safeId(project.name);
  const morpheusExpectedModeIds = Object.keys(MORPHEUS_MODE_REGISTRY);
  const morpheusSelectableModeIds = Object.values(MORPHEUS_MODE_REGISTRY)
    .filter(mode => mode.entryPolicy === 'selectable' && Number(mode.costMultiplier) > 0)
    .map(mode => mode.id);
  const configuredModeIds = betModes.map(mode => mode.name);
  const governedModes = gameId === 'morpheus_dreamfall'
    ? (project.math?.governedModes || createMorpheusGovernedModesManifest())
    : null;
  const morpheusProjectContract = gameId === 'morpheus_dreamfall'
    ? auditMorpheusProjectContract({ ...project, math: { ...project.math, governedModes } })
    : null;
  const morpheusProductionIssues = gameId === 'morpheus_dreamfall' ? [
    ...(Number(project.math?.wincap) === MORPHEUS_MAX_WIN_MULTIPLIER
      ? [] : [`Saved production wincap is ${Number(project.math?.wincap) || 0}x; approved contract requires ${MORPHEUS_MAX_WIN_MULTIPLIER}x.`]),
    ...(JSON.stringify(configuredModeIds) === JSON.stringify(morpheusSelectableModeIds)
      ? [] : [`Saved selectable modes are ${configuredModeIds.join(', ') || '(none)'}; approved selectable modes are ${morpheusSelectableModeIds.join(', ')}.`]),
  ] : [];
  const rows = Array.isArray(grid.rows) ? grid.rows : Array(Number(grid.reels) || 5).fill(Number(grid.rows) || 3);
  // The initial cabinet should feel like a real base-game stop, not a catalogue
  // that forces every rare feature symbol and motion atlas onto the critical
  // loading path. Full symbol coverage remains available in Game Info and in
  // generated rounds.
  const previewSymbols = symbols.slice(0, Math.min(7, symbols.length));
  const previewBoard = Array.from({ length: Number(grid.reels) || 5 }, (_, reel) => Array.from({ length: rows[reel] || rows[0] || 3 }, (_, row) => ({ name: previewSymbols[(reel * 3 + row) % Math.max(1, previewSymbols.length)]?.name || '?' })));
  for (const symbol of symbols) assertPortableAsset(symbol.src, `Symbol ${symbol.name}`);
  assertPortableAsset(projectBackground(project), 'Cabinet background');
  const cabinetLayers = projectCabinetLayers(project);
  const reelArea = projectReelArea(project);
  const environmentAssets = projectEnvironmentAssets(project);
  for (const layer of cabinetLayers) assertPortableAsset(layer.src, `Cabinet layer ${layer.id}`);
  for (const asset of Object.values(environmentAssets)) assertPortableAsset(asset.src, `Environment asset ${asset.id}`);
  const visualEffects = createVisualEffectsState(project.animation?.visualEffects || {});
  const presentationAssets = { ...(project.theme?.presentationAssets || {}) };
  for (const [key, source] of Object.entries(presentationAssets)) assertPortableAsset(source, `Presentation ${key}`);
  const audio = createFrontendAudioConfig(project);
  const spinButtonAsset = project.theme?.presentationEffects?.spinButtonAsset || '';
  assertPortableAsset(spinButtonAsset, 'Spin button');
  const composition = resolvePlayerComposition(project, { projectId: gameId, worldActive: true });
  const authoredControls = project.theme?.playerInterface?.controls || {};
  const resolvedControls = composition.hud.art || {};
  const controlAssets = {
    spinButtonAsset: authoredControls.spin || spinButtonAsset || resolvedControls.spin || '/assets/morpheus-spin-control-v1.png',
    menu: authoredControls.menu || resolvedControls.menu || '/assets/morpheus-control-menu-v1.png',
    bonus: authoredControls.bonus || resolvedControls.bonus || '/assets/morpheus-control-bonus-v1.png',
    autoplay: authoredControls.autoplay || resolvedControls.autoplay || '/assets/morpheus-control-autoplay-v1.png',
    turbo: authoredControls.turbo || resolvedControls.turbo || '/assets/morpheus-control-turbo-v1.png',
    sound: authoredControls.sound || resolvedControls.sound || '/assets/morpheus-control-sound-v1.png',
    info: authoredControls.info || resolvedControls.info || '/assets/morpheus-control-info-v1.png',
    decrease: authoredControls.betDown || resolvedControls.betDown || '/assets/morpheus-control-minus-v1.png',
    increase: authoredControls.betUp || resolvedControls.betUp || '/assets/morpheus-control-plus-v1.png',
    modeCard: '/assets/morpheus-mode-card-v1.png',
  };
  for (const [key, source] of Object.entries(controlAssets)) assertPortableAsset(source, `Control ${key}`);
  const visualEffectIssues = validateVisualEffectsState(visualEffects).filter(issue => issue.severity === 'error');
  if (visualEffectIssues.length) throw new Error(visualEffectIssues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
  return {
    format: 'stake-studio-frontend-config-v7',
    compilerVersion: FRONTEND_COMPILER_VERSION,
    gameId,
    version: project.version || '0.0.1',
    name: playerInformation.identity.name,
    providerName: playerInformation.identity.providerName,
    teamName: playerInformation.identity.teamName,
    rtp: Number(project.math?.rtp) || 0,
    wincap: Number(project.math?.wincap) || 0,
    grid: { reels: Number(grid.reels) || 5, rows },
    palette: [...(project.theme?.colorPalette || [])],
    background: projectBackground(project),
    cabinetLayers,
    reelArea,
    environmentAssets,
    cabinetSize: {
      width: Number(project.theme?.cabinet?.width) || 1280,
      height: Number(project.theme?.cabinet?.height) || 800,
    },
    compositionMode: composition.mode,
    symbols,
    betModes,
    governedModes,
    featureArchitecture: project.math?.featureArchitecture || null,
    renderProfiles: gameId === 'morpheus_dreamfall' ? {
      morpheusDreamfall: {
        ...MORPHEUS_DREAMFALL_RENDER_PROFILE,
        format: MORPHEUS_DREAMFALL_RENDER_PROFILE_FORMAT,
        activation: {
          modeIds: ['dreamfall'],
          mechanicIds: ['dreamfallReelGrowth', 'expandingReels'],
          eventTypes: ['expandReelHeight'],
        },
        cabinet: composition.featureOverlay ? {
          ...MORPHEUS_DREAMFALL_CABINET_PROFILE,
          activation: { ...MORPHEUS_DREAMFALL_CABINET_PROFILE.activation },
          id: composition.featureOverlay.id || MORPHEUS_DREAMFALL_CABINET_PROFILE.id,
          asset: {
            ...MORPHEUS_DREAMFALL_CABINET_PROFILE.asset,
            src: composition.featureOverlay.src,
            x: composition.featureOverlay.x,
            y: composition.featureOverlay.y,
            width: composition.featureOverlay.width,
            height: composition.featureOverlay.height,
            opacity: composition.featureOverlay.opacity ?? 1,
            zIndex: composition.featureOverlay.zIndex ?? 38,
            blendMode: composition.featureOverlay.blendMode || 'normal',
          },
          safeOpening: { ...(composition.featureOverlay.safeOpening || MORPHEUS_DREAMFALL_CABINET_PROFILE.safeOpening) },
          reelBay: { ...(composition.featureOverlay.reelBay || MORPHEUS_DREAMFALL_CABINET_PROFILE.reelBay) },
          hudBoundaryY: composition.featureOverlay.hudBoundaryY ?? MORPHEUS_DREAMFALL_CABINET_PROFILE.hudBoundaryY,
          replacesBaseForeground: composition.featureOverlay.replacesBaseForeground !== false,
        } : null,
      },
      morpheusNexus: {
        format: 'morpheus-nexus-cabinet-profile-v1',
        activation: { modeIds: ['oneiric_nexus'] },
        cabinet: composition.nexusOverlay ? {
          ...MORPHEUS_NEXUS_CABINET_PROFILE,
          asset: {
            ...MORPHEUS_NEXUS_CABINET_PROFILE.asset,
            src: composition.nexusOverlay.src,
            zIndex: composition.nexusOverlay.zIndex ?? 38,
          },
        } : MORPHEUS_NEXUS_CABINET_PROFILE,
      },
    } : {},
    authoritativeRuntime: gameId === 'morpheus_dreamfall' ? {
      enabled: true,
      format: 'morpheus-portable-authoritative-runtime-v1',
      contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
      eventSchemaVersion: MORPHEUS_EVENT_SCHEMA_VERSION,
      runtimeFile: 'morpheus-authoritative-runtime.js',
      qaFile: 'morpheus-authoritative-qa.json',
      routeIds: ['predeterminedGeneratorDeclarations', 'nightmareReliquaryDeclarations', 'lucidFamilyMultiplierSettlement', 'tricksterGridSettlement', 'mysteryStarDreamfallTumble', 'exactMaxTermination'],
      presentationCatalog: createMorpheusPresentationCatalog(project),
      productionContractParity: {
        passed: morpheusProductionIssues.length === 0 && morpheusProjectContract.passed,
        configuredWincap: Number(project.math?.wincap) || 0,
        requiredWincap: MORPHEUS_MAX_WIN_MULTIPLIER,
        configuredModeIds,
        requiredModeIds: morpheusExpectedModeIds,
        governedModeIds: (governedModes?.modes || []).map(mode => mode.id),
        selectableModeIds: configuredModeIds,
        issues: [...morpheusProductionIssues, ...morpheusProjectContract.issues],
      },
      verification: null,
    } : { enabled: false },
    playerInformation,
    visualEffects: {
      ...visualEffects,
      fingerprint: visualEffectsFingerprint(visualEffects),
    },
    presentationEffects: project.theme?.presentationEffects || {},
    presentationAssets,
    presentationDirector: createPresentationDirectorManifest(project),
    visualChoreography: {
      format: 'stake-studio-portable-visual-choreography-v1',
      intensityProfiles: INTENSITY_PROFILES,
      motionProfiles: MOTION_PROFILE_FACTORS,
      sequences: {
        tileConnection: { phases: TILE_CONNECTION_PHASES, ...TILE_CONNECTION_TIMING },
        tumble: { phases: TUMBLE_PHASES, ...TUMBLE_TIMING },
      },
    },
    audio,
    controls: controlAssets,
    playerInterface: {
      hud: {
        x: composition.hud.x,
        y: composition.hud.y,
        width: composition.hud.width,
        height: composition.hud.height,
        zIndex: composition.hud.zIndex,
        visible: composition.hud.visible,
        // A saved reel window plus cabinet artwork is already an authored
        // composition even when the HUD uses the studio's resolved defaults.
        // Keep every resolved layer on the same cabinet plane in that case.
        authored: composition.mode === FULL_CANVAS_CABINET_MODE,
      },
    },
    animation: {
      configured: Object.keys(project.animation?.stateAnimations || {}).length > 0
        || Object.values(project.animation?.states || {}).some(state => (state.layers || []).length > 0),
      enabled: false,
      manifest: 'animation/runtime.json',
      fingerprint: animationRuntimeFingerprint(project),
      motion: {
        environment: project.animation?.environment || null,
        particles: project.animation?.particles || [],
      },
    },
    rules: {
      summary: playerInformation.summary,
      mechanics: playerInformation.mechanics.map(mechanic => mechanic.description),
      triggers: playerInformation.triggers.map(trigger => trigger.text),
      special: playerInformation.specialRules.map(rule => rule.text),
      controls: playerInformation.controls,
      disclaimer: playerInformation.disclaimer,
    },
    previewBoard,
    previewEvents: [
      { index: 0, type: 'reveal', board: previewBoard, paddingPositions: [], gameType: 'basegame', anticipation: [] },
      { index: 1, type: 'winInfo', amount: 2500, wins: [{ symbol: symbols[0]?.name || '?', win: 2500, positions: [{ reel: 0, row: 1 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }] }] },
      { index: 2, type: 'setTotalWin', amount: 2500 },
      { index: 3, type: 'finalWin', amount: 2500 },
    ],
  };
}

function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, value);
  renameSync(temp, path);
}

const DATA_ASSET_EXTENSIONS = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
});

function decodeDataAsset(source) {
  if (!String(source || '').startsWith('data:')) return null;
  const comma = source.indexOf(',');
  if (comma < 0) throw new Error('Embedded frontend asset has an invalid data URL.');
  const metadata = source.slice(5, comma).split(';');
  const mime = metadata[0] || 'application/octet-stream';
  const payload = source.slice(comma + 1);
  return {
    mime,
    bytes: metadata.includes('base64') ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload)),
  };
}

function decodeProjectAsset(source, { projectRoot, projectId } = {}) {
  if (!projectRoot || !projectId || typeof source !== 'string') return null;
  let pathname;
  try {
    pathname = new URL(source, 'http://127.0.0.1').pathname;
  } catch {
    return null;
  }
  const match = pathname.match(/^\/__stake_studio\/projects\/([a-zA-Z0-9_-]+)\/assets\/(.+)$/);
  if (!match || safeId(match[1]) !== projectId) return null;
  const segments = decodeURIComponent(match[2]).split('/').filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..')) return null;
  const assetPath = join(projectRoot, 'assets', ...segments);
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    throw new Error(`Local project asset does not exist: ${segments.join('/')}`);
  }
  const extension = segments.at(-1).split('.').at(-1).toLowerCase();
  const mime = Object.entries(DATA_ASSET_EXTENSIONS).find(([, value]) => value === extension)?.[0]
    || 'application/octet-stream';
  return { mime, bytes: readFileSync(assetPath) };
}

function decodePublicAsset(source) {
  const value = String(source || '');
  if (!value.startsWith('/assets/')) return null;
  const relative = value.slice(1).split('/').filter(Boolean);
  if (!relative.length || relative.some(segment => segment === '.' || segment === '..')) return null;
  const assetPath = join(PUBLIC_ROOT, ...relative);
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) return null;
  const extension = relative.at(-1).split('.').at(-1).toLowerCase();
  const mime = Object.entries(DATA_ASSET_EXTENSIONS).find(([, value]) => value === extension)?.[0]
    || 'application/octet-stream';
  return { mime, bytes: readFileSync(assetPath) };
}

function walkFiles(root, relative = '') {
  const directory = relative ? join(root, ...relative.split('/')) : root;
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap(name => {
    const path = relative ? `${relative}/${name}` : name;
    const absolute = join(root, ...path.split('/'));
    return statSync(absolute).isDirectory() ? walkFiles(root, path) : [path];
  });
}

export function inventoryFrontendSourceAssets(projectRoot, semanticLineage = [], additionalPackagedLineage = []) {
  const assetRoot = join(resolve(projectRoot), 'assets');
  const semanticBySha = new Map();
  const semanticTokens = [];
  const token = value => String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const asset of [...(semanticLineage || []), ...(additionalPackagedLineage || [])]) {
    if (!semanticBySha.has(asset.sha256)) semanticBySha.set(asset.sha256, []);
    semanticBySha.get(asset.sha256).push(asset.id);
    if (!['symbol', 'cabinet', 'world', 'foreground', 'feature-cabinet-foreground', 'character', 'presentation', 'control'].includes(asset.role)) continue;
    for (const part of String(asset.id || '').split('.').slice(1)) {
      const value = token(part);
      const minimumLength = asset.role === 'symbol' ? 3 : 4;
      if (value.length >= minimumLength) semanticTokens.push({ id: asset.id, token: value });
      if (['cabinet', 'world', 'foreground', 'feature-cabinet-foreground'].includes(asset.role)) {
        for (const word of String(part).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 5)) {
          semanticTokens.push({ id: asset.id, token: word });
        }
      }
    }
  }
  const files = walkFiles(assetRoot).map(relativePath => {
    const absolute = join(assetRoot, ...relativePath.split('/'));
    const bytes = readFileSync(absolute);
    const digest = sha256(bytes);
    const contentSemanticIds = [...(semanticBySha.get(digest) || [])].sort();
    const baseToken = token(relativePath.split('/').at(-1).replace(/-v\d+(?=\.[^.]+$)/i, '').replace(/\.[^.]+$/, ''));
    const namedSemanticIds = semanticTokens
      .filter(entry => baseToken === entry.token || baseToken.includes(entry.token) || entry.token.includes(baseToken))
      .sort((left, right) => right.token.length - left.token.length || left.id.localeCompare(right.id))
      .filter((entry, index, matches) => !index || entry.token.length === matches[0].token.length)
      .map(entry => entry.id);
    const semanticIds = [...new Set([...contentSemanticIds, ...namedSemanticIds])].sort();
    const category = relativePath.split('/')[0] || 'asset';
    const status = contentSemanticIds.length
      ? 'content-bound'
      : category === 'visual' && namedSemanticIds.length
        ? 'owned-source-master'
        : category === 'runtime' && namedSemanticIds.length
          ? 'stale-runtime-derivative'
          : 'unbound';
    return {
      path: `assets/${relativePath}`,
      lifecycle: relativePath.startsWith('visual/') ? 'source-master' : 'runtime-derivative',
      category,
      bytes: bytes.length,
      sha256: digest,
      semanticIds,
      status,
    };
  });
  return {
    format: 'stake-studio-source-asset-inventory-v1',
    root: 'assets',
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    contentBoundFileCount: files.filter(file => file.status === 'content-bound').length,
    ownedSourceMasterCount: files.filter(file => file.status === 'owned-source-master').length,
    staleRuntimeDerivativeCount: files.filter(file => file.status === 'stale-runtime-derivative').length,
    unboundFileCount: files.filter(file => file.status === 'unbound').length,
    files,
  };
}

export function stageFrontendAssets(frontendConfig, staged, written, projectContext = {}) {
  const stagedByHash = new Map();
  const semanticAssets = [];
  const store = (source, category, semanticId = '', role = category) => {
    const decoded = decodeDataAsset(source) || decodeProjectAsset(source, projectContext) || decodePublicAsset(source);
    if (!decoded) return source;
    const digest = sha256(decoded.bytes);
    let path = stagedByHash.get(digest);
    if (!path) {
      const extension = DATA_ASSET_EXTENSIONS[decoded.mime] || 'bin';
      path = `assets/${category}/${digest.slice(0, 24)}.${extension}`;
      const outputPath = join(staged, ...path.split('/'));
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, decoded.bytes);
      written.push({ path, bytes: decoded.bytes.length, sha256: digest });
      stagedByHash.set(digest, path);
    }
    if (semanticId) semanticAssets.push({
      id: semanticId,
      role,
      category,
      path,
      sha256: digest,
      bytes: decoded.bytes.length,
    });
    return path;
  };

  frontendConfig.background = store(frontendConfig.background, 'cabinet', 'cabinet.background', 'world');
  for (const layer of frontendConfig.cabinetLayers || []) {
    layer.src = store(layer.src, 'cabinet', `cabinet.${layer.id}`, layer.role || 'foreground');
  }
  if (frontendConfig.renderProfiles?.morpheusDreamfall?.cabinet?.asset?.src) {
    frontendConfig.renderProfiles.morpheusDreamfall.cabinet.asset.src = store(
      frontendConfig.renderProfiles.morpheusDreamfall.cabinet.asset.src,
      'cabinet',
      'cabinet.morpheus-dreamfall-scene-matte-v1',
      'feature-cabinet-scene',
    );
  }
  if (frontendConfig.renderProfiles?.morpheusNexus?.cabinet?.asset?.src) {
    frontendConfig.renderProfiles.morpheusNexus.cabinet.asset.src = store(
      frontendConfig.renderProfiles.morpheusNexus.cabinet.asset.src,
      'cabinet',
      'cabinet.morpheus-nexus-scene-matte-v1',
      'feature-cabinet-scene',
    );
  }
  for (const [id, asset] of Object.entries(frontendConfig.environmentAssets || {})) {
    asset.src = store(asset.src, 'environment', `environment.${id}`, 'environment');
  }
  for (const [key, source] of Object.entries(frontendConfig.controls || {})) {
    if (source) frontendConfig.controls[key] = store(source, 'ui', `control.${key}`, 'control');
  }
  for (const symbol of frontendConfig.symbols || []) {
    symbol.src = store(symbol.src, 'symbols', `symbol.${symbol.name}`, 'symbol');
  }
  for (const symbol of frontendConfig.playerInformation?.symbols || []) {
    symbol.src = store(symbol.src, 'symbols');
  }
  for (const asset of frontendConfig.visualEffects?.motionAssets || []) {
    asset.src = store(asset.src, 'motion', `motion.${asset.id}`, 'motion');
  }
  for (const [key, source] of Object.entries(frontendConfig.presentationAssets || {})) {
    if (source) frontendConfig.presentationAssets[key] = store(source, 'presentation', `presentation.${key}`, 'presentation');
  }
  for (const [id, asset] of Object.entries(frontendConfig.audio?.layers || {})) {
    asset.src = store(asset.src, 'audio', `audio.layer.${id}`, 'audio-layer');
  }
  for (const [id, assets] of Object.entries(frontendConfig.audio?.stingers || {})) {
    for (let index = 0; index < assets.length; index++) {
      assets[index].src = store(assets[index].src, 'audio', `audio.stinger.${id}.${index}`, 'audio-cue');
    }
  }
  const files = written.filter(file => file.path.startsWith('assets/'));
  return {
    strategy: 'hashed-files',
    fileCount: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    lineage: {
      format: 'stake-studio-frontend-asset-lineage-v1',
      assets: semanticAssets.sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function getInitialFrontendFiles(frontendConfig) {
  const files = new Set([...TEMPLATE_FILES, 'game-config.json']);
  if (frontendConfig.background) files.add(frontendConfig.background);
  for (const layer of frontendConfig.cabinetLayers || []) if (layer.src) files.add(layer.src);
  for (const asset of Object.values(frontendConfig.environmentAssets || {})) if (asset.src) files.add(asset.src);
  for (const [key, source] of Object.entries(frontendConfig.controls || {})) {
    // Mode-card art is only used after the player opens the mode-selection
    // modal. Keep it packaged, but let the browser fetch it on that explicit
    // interaction instead of charging a large decorative texture to first paint.
    if (source && key !== 'modeCard') files.add(source);
  }
  const symbols = new Map((frontendConfig.symbols || []).map(symbol => [symbol.name, symbol]));
  for (const reel of frontendConfig.previewBoard || []) {
    for (const item of reel || []) {
      const name = typeof item === 'string' ? item : item?.name;
      const source = symbols.get(name)?.src;
      if (source) files.add(source);
    }
  }
  return [...files];
}

export async function compileFrontendProject({ studioHome, projectId }) {
  const home = resolve(studioHome);
  const id = safeId(projectId);
  const projectPath = join(home, 'games', id, 'project.json');
  if (!existsSync(projectPath)) throw new Error(`No saved project ${id}.`);
  const project = readProjectDocument(projectPath).project;
  const root = join(home, 'games', id);
  const destination = join(root, 'frontend');
  const staged = join(root, `.frontend-${process.pid}-${Date.now()}`);
  const backup = join(root, '.frontend-previous');
  mkdirSync(staged, { recursive: true });

  const written = [];
  try {
    const templateCacheKey = `${FRONTEND_COMPILER_VERSION}-${sha256(Buffer.concat(
      TEMPLATE_FILES.filter(name => name !== 'index.html').map(name => readFileSync(join(TEMPLATE_ROOT, name))),
    )).slice(0, 12)}`;
    for (const name of TEMPLATE_FILES) {
      let contents = readFileSync(join(TEMPLATE_ROOT, name));
      if (name === 'index.html') {
        contents = Buffer.from(contents.toString('utf8').replaceAll(
          '__STAKE_STUDIO_FRONTEND_VERSION__',
          templateCacheKey,
        ));
      }
      writeFileSync(join(staged, name), contents);
      written.push({ path: name, bytes: contents.length, sha256: sha256(contents) });
    }
    const frontendConfig = createFrontendConfig(project);
    const enabledBindings = frontendConfig.visualEffects.bindings.filter(binding => binding.enabled !== false);
    const hasVisualRuntime = enabledBindings.length > 0
      || frontendConfig.visualEffects.motionAssets.length > 0
      || Boolean(frontendConfig.presentationEffects?.motionGraphics?.enabled)
      || Boolean(frontendConfig.presentationEffects?.livingEnergy?.enabled);
    const animationFiles = generateAnimationFiles(project);
    const hasSpineRuntime = Boolean(animationFiles['animation/runtime.json']);
    const hasMorpheusAuthoritativeRuntime = frontendConfig.authoritativeRuntime?.enabled === true;
    frontendConfig.animation.enabled = hasSpineRuntime;
    const packagedAssets = stageFrontendAssets(frontendConfig, staged, written, {
      projectRoot: root,
      projectId: id,
    });
    frontendConfig.assetLineage = packagedAssets.lineage;
    const additionalPackagedLineage = [];
    if (hasSpineRuntime) {
      for (const [path, value] of Object.entries(animationFiles)) {
        const contents = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
        const outputPath = join(staged, ...path.split('/'));
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, contents);
        const digest = sha256(contents);
        written.push({ path, bytes: contents.length, sha256: digest });
        const pose = path.match(/^animation\/spine\/[^/]+\/morpheus-(idle|bonus-entry|win-big|wincap)-v1\.png$/)?.[1];
        if (pose) additionalPackagedLineage.push({
          id: `character.${pose}`,
          role: 'character',
          category: 'animation',
          path,
          sha256: digest,
          bytes: contents.length,
        });
      }
      await viteBuild({
        configFile: false,
        publicDir: false,
        logLevel: 'silent',
        build: {
          outDir: staged,
          emptyOutDir: false,
          target: 'es2020',
          minify: 'esbuild',
          sourcemap: false,
          lib: { entry: SPINE_ENTRY, formats: ['es'], fileName: () => 'spine-runtime.js' },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      });
      const contents = readFileSync(join(staged, 'spine-runtime.js'));
      written.push({ path: 'spine-runtime.js', bytes: contents.length, sha256: sha256(contents) });
    }
    if (hasVisualRuntime) {
      await viteBuild({
        configFile: false,
        publicDir: false,
        logLevel: 'silent',
        build: {
          outDir: staged,
          emptyOutDir: false,
          target: 'es2020',
          minify: 'esbuild',
          sourcemap: false,
          lib: { entry: VISUAL_EFFECTS_ENTRY, formats: ['es'], fileName: () => 'visual-effects-runtime.js' },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      });
      const contents = readFileSync(join(staged, 'visual-effects-runtime.js'));
      written.push({ path: 'visual-effects-runtime.js', bytes: contents.length, sha256: sha256(contents) });
    }
    if (hasMorpheusAuthoritativeRuntime) {
      await viteBuild({
        configFile: false,
        publicDir: false,
        logLevel: 'silent',
        build: {
          outDir: staged,
          emptyOutDir: false,
          target: 'es2020',
          minify: 'esbuild',
          sourcemap: false,
          lib: { entry: MORPHEUS_AUTHORITATIVE_ENTRY, formats: ['es'], fileName: () => 'morpheus-authoritative-runtime.js' },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      });
      const runtimePath = join(staged, 'morpheus-authoritative-runtime.js');
      const contents = readFileSync(runtimePath);
      const bundleSha256 = sha256(contents);
      written.push({ path: 'morpheus-authoritative-runtime.js', bytes: contents.length, sha256: bundleSha256 });
      const portable = await import(`${pathToFileURL(runtimePath).href}?compiled=${bundleSha256}`);
      frontendConfig.authoritativeRuntime.verification = createMorpheusPortableFrontendEvidence({
        runProjection: portable.runMorpheusPortableProjection,
        bundleSha256,
        runtimeFile: 'morpheus-authoritative-runtime.js',
        catalog: frontendConfig.authoritativeRuntime.presentationCatalog,
      });
      if (!frontendConfig.authoritativeRuntime.verification.passed) {
        throw new Error(frontendConfig.authoritativeRuntime.verification.issues.join('\n'));
      }
      const qaBook = Buffer.from(`${JSON.stringify({
        format: 'morpheus-portable-authoritative-qa-book-v1',
        contractFingerprint: MORPHEUS_CONTRACT_FINGERPRINT,
        routes: {
          predeterminedGeneratorDeclarations: createPredeterminedGeneratorProofTrace(),
          nightmareReliquaryDeclarations: createNightmareReliquaryProofTrace(),
          lucidFamilyMultiplierSettlement: createLucidFamilyMultiplierProofTrace(),
          veilAscentUpgrade: createVeilAscentUpgradeProofTrace(),
          tricksterGridSettlement: createTricksterGridSettlementProofTrace(),
          mysteryStarDreamfallTumble: createMysteryStarDreamfallProofTrace(),
          exactMaxTermination: createExactMaxTerminationProofTrace(),
        },
      }, null, 2)}\n`);
      writeFileSync(join(staged, 'morpheus-authoritative-qa.json'), qaBook);
      written.push({ path: 'morpheus-authoritative-qa.json', bytes: qaBook.length, sha256: sha256(qaBook) });
    }
    packagedAssets.lineage.assets.push(...additionalPackagedLineage);
    packagedAssets.lineage.assets.sort((left, right) => left.id.localeCompare(right.id));
    packagedAssets.sourceInventory = inventoryFrontendSourceAssets(
      root,
      packagedAssets.lineage.assets,
    );
    const config = Buffer.from(`${JSON.stringify(frontendConfig, null, 2)}\n`);
    writeFileSync(join(staged, 'game-config.json'), config);
    written.push({ path: 'game-config.json', bytes: config.length, sha256: sha256(config) });
    const initialFiles = getInitialFrontendFiles(frontendConfig);
    const initialFileSet = new Set(initialFiles);
    const initialBytes = written.reduce((sum, file) => sum + (initialFileSet.has(file.path) ? file.bytes : 0), 0);
    const manifest = Buffer.from(`${JSON.stringify({
      format: 'stake-studio-frontend-manifest-v1', compilerVersion: FRONTEND_COMPILER_VERSION,
      gameId: id, entry: 'index.html', files: written,
      assetLineage: packagedAssets.lineage,
      initialLoad: { files: initialFiles, bytes: initialBytes, strategy: 'first-frame-shell-v1' },
      generatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    writeFileSync(join(staged, 'frontend-manifest.json'), manifest);
    written.push({ path: 'frontend-manifest.json', bytes: manifest.length, sha256: sha256(manifest) });

    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
    if (existsSync(destination)) renameSync(destination, backup);
    renameSync(staged, destination);

    project.build ||= {};
    project.build.frontend = {
      version: FRONTEND_COMPILER_VERSION,
      entry: 'frontend/index.html',
      files: written.map(file => file.path),
      manifest: written,
      totalBytes: written.reduce((sum, file) => sum + file.bytes, 0),
      initialFiles,
      initialBytes,
      capabilities: {
        walletLifecycle: true,
        replay: true,
        jurisdiction: true,
        serverOwnedBalance: true,
        responsive: true,
        visualEffects: hasVisualRuntime,
        spineAnimation: hasSpineRuntime,
        presentationDirector: Boolean(frontendConfig.presentationDirector?.recipes?.length),
        authoredAudio: Boolean(frontendConfig.audio?.enabled),
        authoritativeMorpheusEvents: hasMorpheusAuthoritativeRuntime,
      },
      verification: {
        source: 'local-official-contract',
        apiAmountMultiplier: 1_000_000,
        replaySessionless: true,
        endRoundEndpoint: '/wallet/end-round',
        balanceAuthority: 'server-only',
        viewports: ['desktop', 'mobile', 'mini'],
        visualEffects: {
          runtime: hasVisualRuntime ? 'pixi-v8-procedural-v1' : 'not-configured',
          fingerprint: frontendConfig.visualEffects.fingerprint,
          recipeCount: frontendConfig.visualEffects.recipes.length,
          bindingCount: enabledBindings.length,
          runtimeBundled: hasVisualRuntime,
          spineAdapter: hasSpineRuntime,
        },
        presentation: {
          directorVersion: frontendConfig.presentationDirector?.version || 0,
          recipeCount: frontendConfig.presentationDirector?.recipes?.filter(recipe => recipe.enabled !== false).length || 0,
          authoredAssetCount: Object.values(frontendConfig.presentationAssets || {}).filter(Boolean).length,
          audioLayerCount: Object.keys(frontendConfig.audio?.layers || {}).length,
          audioStingerCount: Object.values(frontendConfig.audio?.stingers || {}).reduce((sum, assets) => sum + assets.length, 0),
        },
        morpheusAuthoritativeRuntime: hasMorpheusAuthoritativeRuntime
          ? frontendConfig.authoritativeRuntime.verification
          : { enabled: false },
        morpheusProductionContractParity: hasMorpheusAuthoritativeRuntime
          ? frontendConfig.authoritativeRuntime.productionContractParity
          : { applicable: false },
        assetPackaging: {
          ...packagedAssets,
          configBytes: config.length,
          initialBytes,
          deferredBytes: written.reduce((sum, file) => sum + file.bytes, 0) - initialBytes,
          warmup: 'post-first-paint-idle',
        },
        spine: {
          runtime: hasSpineRuntime ? 'spine-pixi-v8-4.3' : 'not-configured',
          fingerprint: frontendConfig.animation.fingerprint,
          runtimeBundled: hasSpineRuntime,
          manifestBundled: hasSpineRuntime,
          assetCount: hasSpineRuntime ? JSON.parse(String(animationFiles['animation/runtime.json'])).assets.length : 0,
          binarySupported: true,
        },
      },
      generatedAt: new Date().toISOString(),
    };
    if (id === 'morpheus_dreamfall') recordMorpheusAssetOrchestrationEvidence(project);
    writeAtomic(projectPath, `${JSON.stringify(project, null, 2)}\n`);
    return { projectId: id, root: destination, ...project.build.frontend };
  } catch (error) {
    if (existsSync(staged)) rmSync(staged, { recursive: true, force: true });
    throw error;
  }
}

export function inspectFrontend(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(name => statSync(join(root, name)).isFile()).sort();
}
