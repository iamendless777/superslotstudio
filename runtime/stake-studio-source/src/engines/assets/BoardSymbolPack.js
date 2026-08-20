/**
 * Starter board art for Morpheus ways. Fills empty symbol.src only.
 * Real commissioned art stays; this pack is the swap-in from the board brief.
 */

export const MORPHEUS_BOARD_PACK_ID = 'morpheus';

export const MORPHEUS_BOARD_PACK = Object.freeze({
  H1: '/symbol-pack/morpheus/h1.png',
  H2: '/symbol-pack/morpheus/h2.png',
  M1: '/symbol-pack/morpheus/m1.png',
  M2: '/symbol-pack/morpheus/m2.png',
  L1: '/symbol-pack/morpheus/l1.png',
  L2: '/symbol-pack/morpheus/l2.png',
  L3: '/symbol-pack/morpheus/l3.png',
  W: '/symbol-pack/morpheus/wild.png',
  S: '/symbol-pack/morpheus/scatter.png',
  'Gate of Sleep': '/symbol-pack/morpheus/scatter.png',
});

export const MORPHEUS_WORLD_PACK = Object.freeze({
  background: '/symbol-pack/morpheus/background.jpg',
  foreground: '/symbol-pack/morpheus/cabinet-frame.png',
  character: '/symbol-pack/morpheus/character.png',
  reelArea: { x: 80, y: 56, width: 768, height: 512 },
  characterPlacement: { x: 1004, y: 84, width: 252, height: 540 },
});

export function boardSymbolPackFor(project) {
  const id = String(project?.id || project?.build?.stakeEngine?.gameId || '').toLowerCase();
  if (id === MORPHEUS_BOARD_PACK_ID || /morpheus/i.test(String(project?.name || ''))) {
    return MORPHEUS_BOARD_PACK;
  }
  return null;
}

export function applyBoardSymbolPack(project, { overwrite = false } = {}) {
  const pack = boardSymbolPackFor(project);
  if (!pack || !Array.isArray(project?.theme?.symbols)) {
    return { filled: 0, pack: null };
  }
  let filled = 0;
  for (const symbol of project.theme.symbols) {
    if (!symbol) continue;
    const src = pack[symbol.id] || pack[symbol.name];
    if (!src) continue;
    if (!overwrite && symbol.src) continue;
    symbol.src = src;
    filled += 1;
  }
  return { filled, pack: MORPHEUS_BOARD_PACK_ID };
}

function upsertLayer(layers, predicate, layer, { overwrite }) {
  const index = layers.findIndex(predicate);
  if (index < 0) {
    layers.push(layer);
    return true;
  }
  if (!overwrite) return false;
  const current = layers[index];
  layers[index] = { ...current, ...layer, id: current.id };
  return true;
}

export function applyMorpheusWorldPack(project, { overwrite = false } = {}) {
  if (!boardSymbolPackFor(project)) return { filled: 0, pack: null };
  project.theme ||= {};
  project.theme.cabinet ||= { layers: [], width: 1280, height: 800 };
  const cabinet = project.theme.cabinet;
  cabinet.layers ||= [];
  cabinet.width = cabinet.width || 1280;
  cabinet.height = cabinet.height || 800;
  const pack = MORPHEUS_WORLD_PACK;
  let filled = 0;
  if (upsertLayer(
    cabinet.layers,
    (layer) => layer.assetPackRole === 'background',
    {
      id: 'morpheus-background',
      name: 'Background',
      type: 'image',
      src: pack.background,
      x: 0, y: 0, width: cabinet.width, height: cabinet.height,
      opacity: 1, zIndex: 0, visible: true, locked: true,
      effects: [], blendMode: 'normal', assetPackRole: 'background',
    },
    { overwrite },
  )) filled += 1;
  if (upsertLayer(
    cabinet.layers,
    (layer) => layer.assetPackRole === 'foreground' || layer.type === 'frame',
    {
      id: 'morpheus-cabinet-frame',
      name: 'Reel frame',
      type: 'frame',
      src: pack.foreground,
      x: 0, y: 0, width: cabinet.width, height: cabinet.height,
      opacity: 1, zIndex: 20, visible: true, locked: false,
      effects: [], blendMode: 'normal', assetPackRole: 'foreground',
    },
    { overwrite },
  )) filled += 1;
  if (upsertLayer(
    cabinet.layers,
    (layer) => layer.type === 'reel-area',
    {
      id: 'morpheus-reel-area',
      name: 'Reels',
      type: 'reel-area',
      src: '',
      ...pack.reelArea,
      opacity: 1, zIndex: 2, visible: true, locked: false,
      effects: [], blendMode: 'normal',
    },
    { overwrite },
  )) filled += 1;
  project.theme.character ||= { poses: {}, placement: { ...pack.characterPlacement } };
  const character = project.theme.character;
  character.visible = character.visible !== false;
  character.zIndex = character.zIndex || 49;
  character.placement = overwrite
    ? { ...pack.characterPlacement }
    : { ...pack.characterPlacement, ...(character.placement || {}) };
  if (overwrite || !character.poses?.idle) {
    character.poses ||= {};
    character.poses.idle = pack.character;
    filled += 1;
  }
  project.theme.submission ||= {};
  if (overwrite || !project.theme.submission.background) {
    project.theme.submission.background = pack.background;
  }
  if (overwrite || !project.theme.submission.foreground) {
    project.theme.submission.foreground = pack.foreground;
  }
  return { filled, pack: MORPHEUS_BOARD_PACK_ID };
}
