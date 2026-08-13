import {
  MORPHEUS_WORLD_BOARD_CONTRACT,
  createWorldBoardGeometry,
} from './WorldBoardRendererSpike.js';

export const WORST_CASE_RUNTIME_SPIKE_FORMAT = 'stake-studio-worst-case-runtime-spike-v1';

export const WORST_CASE_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1973, height: 902 }),
  mobile: Object.freeze({ width: 667, height: 375 }),
  mini: Object.freeze({ width: 400, height: 250 }),
});

export const WORST_CASE_LOAD = Object.freeze({
  cells: 48,
  symbolFlipbooks: 48,
  positionMarkers: 48,
  ambientFlipbooks: 7,
  particles: 120,
  filterPasses: 4,
  hudNodes: 40,
  spineObjects: 10,
  renderSurfaces: 2,
});

export const WORST_CASE_BUDGETS = Object.freeze({
  initialBundleBytes: 8 * 1024 * 1024,
  textureMemoryBytes: 96 * 1024 * 1024,
  sceneObjects: 360,
  filterPasses: 4,
  minimumSymbolPixels: 32,
  minimumControlPixels: 44,
});

const DESIGN = Object.freeze({
  width: 1280,
  height: 800,
  boardWidth: 576,
  boardHeight: 496,
  boardX: 360,
  hudHeight: 176,
  reelGap: 4,
});

const DEFAULT_RESOURCES = Object.freeze({
  // Current compiled first-frame shell and audited decoded textures establish a
  // real baseline; the effect reserve deliberately adds headroom for the 6x8
  // signature slice instead of pretending reserved cells are free.
  initialBundleBytes: 6_702_987,
  decodedTextureBytes: 42_272_512,
  effectAtlasReserveBytes: 16 * 1024 * 1024,
});

const round = value => Math.round(value * 1e6) / 1e6;

function stableHash(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function normalizeViewport(name, input) {
  const width = Number(input?.width);
  const height = Number(input?.height);
  if (!(width > 0) || !(height > 0)) throw new RangeError(`${name} viewport must have positive dimensions.`);
  return { name, width, height };
}

function scaledRectangle(rect, scale, offsetX, offsetY) {
  const value = {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
  return { ...value, right: value.x + value.width, bottom: value.y + value.height };
}

/**
 * Deterministically allocate an eight-row board and the persistent HUD inside
 * each target viewport. Growth never participates in the calculation: every
 * frame uses the final eight-row world, which guarantees constant cell size.
 */
export function calculateWorstCaseViewportLayout(name, input, options = {}) {
  const viewport = normalizeViewport(name, input);
  const scale = Math.min(1, viewport.width / DESIGN.width, viewport.height / DESIGN.height);
  const stageWidth = DESIGN.width * scale;
  const stageHeight = DESIGN.height * scale;
  const stageX = (viewport.width - stageWidth) / 2;
  const stageY = (viewport.height - stageHeight) / 2;
  const hudHeight = Math.max(WORST_CASE_BUDGETS.minimumControlPixels, DESIGN.hudHeight * scale);
  const availableBoardHeight = Math.max(1, stageHeight - hudHeight);
  const scaledGap = DESIGN.reelGap * scale;
  const desiredBoardWidth = DESIGN.boardWidth * scale;
  const minimumWidth = WORST_CASE_BUDGETS.minimumSymbolPixels * MORPHEUS_WORLD_BOARD_CONTRACT.reels
    + scaledGap * (MORPHEUS_WORLD_BOARD_CONTRACT.reels - 1);
  const boardWidth = Math.min(stageWidth, Math.max(desiredBoardWidth, minimumWidth));
  const prospectiveCellWidth = (boardWidth - scaledGap * 5) / 6;
  const squareWorldHeight = prospectiveCellWidth * MORPHEUS_WORLD_BOARD_CONTRACT.worldRows;
  const boardHeight = Math.min(availableBoardHeight, squareWorldHeight);
  const boardX = stageX + (stageWidth - boardWidth) / 2;
  const boardY = stageY + availableBoardHeight - boardHeight;
  const hud = {
    x: stageX,
    y: stageY + stageHeight - hudHeight,
    width: stageWidth,
    height: hudHeight,
  };
  hud.right = hud.x + hud.width;
  hud.bottom = hud.y + hud.height;
  const geometry = createWorldBoardGeometry({
    x: boardX,
    y: boardY,
    width: boardWidth,
    height: boardHeight,
    gap: scaledGap,
    reelHeights: MORPHEUS_WORLD_BOARD_CONTRACT.initialReelRows,
  });
  const fullGeometry = createWorldBoardGeometry({
    x: boardX,
    y: boardY,
    width: boardWidth,
    height: boardHeight,
    gap: scaledGap,
    reelHeights: Array(6).fill(8),
  });
  const stage = scaledRectangle({ x: 0, y: 0, width: DESIGN.width, height: DESIGN.height }, scale, stageX, stageY);
  const within = rect => rect.x >= viewport.width * -1e-9 && rect.y >= viewport.height * -1e-9
    && rect.right <= viewport.width * (1 + 1e-9) && rect.bottom <= viewport.height * (1 + 1e-9);
  const symbolFloorPass = fullGeometry.cell.width >= WORST_CASE_BUDGETS.minimumSymbolPixels
    && fullGeometry.cell.height >= WORST_CASE_BUDGETS.minimumSymbolPixels;
  const result = {
    viewport,
    stageScale: round(scale),
    stage,
    board: fullGeometry.world,
    hud,
    initialMasks: geometry.reels.map(reel => reel.mask),
    fullMasks: fullGeometry.reels.map(reel => reel.mask),
    cell: { width: round(fullGeometry.cell.width), height: round(fullGeometry.cell.height) },
    coordinateCells: fullGeometry.cells.length,
    fixedWorldAcrossGrowth: geometry.world.width === fullGeometry.world.width
      && geometry.world.height === fullGeometry.world.height,
    layoutFits: within(stage) && within(fullGeometry.world) && within(hud),
    controlFloorPass: hudHeight >= WORST_CASE_BUDGETS.minimumControlPixels,
    symbolFloorPass,
    readability: symbolFloorPass ? 'general-floor-passed' : 'authored-compact-proof-required',
  };
  result.risks = [
    !result.layoutFits ? 'stage, board, or HUD exceeds the viewport safe area' : null,
    !result.controlFloorPass ? 'persistent HUD cannot preserve a 44px primary control' : null,
    !result.symbolFloorPass
      ? `eight-row cells are ${result.cell.width.toFixed(1)}x${result.cell.height.toFixed(1)}px; compact authored-symbol legibility must be proven`
      : null,
  ].filter(Boolean);
  return result;
}

export function calculateWorstCaseResources(viewport, options = {}) {
  const load = { ...WORST_CASE_LOAD, ...(options.load || {}) };
  const budgets = { ...WORST_CASE_BUDGETS, ...(options.budgets || {}) };
  const resources = { ...DEFAULT_RESOURCES, ...(options.resources || {}) };
  if (load.cells !== MORPHEUS_WORLD_BOARD_CONTRACT.reels * MORPHEUS_WORLD_BOARD_CONTRACT.worldRows) {
    throw new RangeError('Worst-case runtime proof must cover all 48 world cells.');
  }
  const surfaceBytes = viewport.width * viewport.height * 4 * load.renderSurfaces;
  const textureMemoryBytes = resources.decodedTextureBytes + resources.effectAtlasReserveBytes + surfaceBytes;
  const sceneObjects = load.cells + load.symbolFlipbooks + load.positionMarkers
    + load.ambientFlipbooks + load.particles + load.hudNodes + load.spineObjects;
  const checks = {
    initialBundle: resources.initialBundleBytes <= budgets.initialBundleBytes,
    textureMemory: textureMemoryBytes <= budgets.textureMemoryBytes,
    sceneObjects: sceneObjects <= budgets.sceneObjects,
    filterPasses: load.filterPasses <= budgets.filterPasses,
  };
  return {
    load,
    budgets,
    resources: {
      ...resources,
      surfaceBytes,
      textureMemoryBytes,
      sceneObjects,
    },
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function runWorstCaseRuntimeSpike(options = {}) {
  const viewportInputs = options.viewports || WORST_CASE_VIEWPORTS;
  const layouts = Object.entries(viewportInputs).map(([name, viewport]) => (
    calculateWorstCaseViewportLayout(name, viewport, options)
  ));
  const resources = layouts.map(layout => ({
    viewport: layout.viewport.name,
    ...calculateWorstCaseResources(layout.viewport, options),
  }));
  const evidence = {
    viewports: layouts.length,
    coordinateCells: MORPHEUS_WORLD_BOARD_CONTRACT.reels * MORPHEUS_WORLD_BOARD_CONTRACT.worldRows,
    layoutFits: layouts.every(layout => layout.layoutFits),
    fixedWorldAcrossGrowth: layouts.every(layout => layout.fixedWorldAcrossGrowth),
    resourceBudgets: resources.every(resource => resource.passed),
    generalSymbolFloor: layouts.every(layout => layout.symbolFloorPass),
    compactProofRequired: layouts.filter(layout => !layout.symbolFloorPass).map(layout => layout.viewport.name),
  };
  const report = {
    format: WORST_CASE_RUNTIME_SPIKE_FORMAT,
    status: evidence.layoutFits && evidence.fixedWorldAcrossGrowth && evidence.resourceBudgets
      ? evidence.generalSymbolFloor ? 'proven' : 'proven-with-compact-legibility-risk'
      : 'failed',
    contract: MORPHEUS_WORLD_BOARD_CONTRACT,
    load: { ...WORST_CASE_LOAD, ...(options.load || {}) },
    layouts,
    resources,
    evidence,
  };
  report.fingerprint = stableHash(report);
  return report;
}
