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
  GATE_OF_SLEEP: '/symbol-pack/morpheus/scatter.png',
  VEIL_WILD: '/symbol-pack/morpheus/veil-wild.png',
  'Veil Wild': '/symbol-pack/morpheus/veil-wild.png',
  LUCID_WILD: '/symbol-pack/morpheus/lucid-wild.png',
  'Lucid Wild': '/symbol-pack/morpheus/lucid-wild.png',
  DREAM_RIFT: '/symbol-pack/morpheus/dream-rift.png',
  'Dream Rift': '/symbol-pack/morpheus/dream-rift.png',
  GOLDEN_RIFT: '/symbol-pack/morpheus/golden-rift.png',
  'Golden Rift': '/symbol-pack/morpheus/golden-rift.png',
  ECHO_SPLIT: '/symbol-pack/morpheus/echo-split.png',
  'Echo Split': '/symbol-pack/morpheus/echo-split.png',
  DAWN_PURGE: '/symbol-pack/morpheus/dawn-purge.png',
  'Dawn Purge': '/symbol-pack/morpheus/dawn-purge.png',
  ONEIRIC_STAR: '/symbol-pack/morpheus/oneiric-star.png',
  'Oneiric Star': '/symbol-pack/morpheus/oneiric-star.png',
  MYSTERY_VEIL: '/symbol-pack/morpheus/mystery-veil.png',
  'Mystery Veil': '/symbol-pack/morpheus/mystery-veil.png',
  MAX_MORPHEUS: '/symbol-pack/morpheus/max-morpheus.png',
  'Max Morpheus': '/symbol-pack/morpheus/max-morpheus.png',
  RIFT_WILD: '/symbol-pack/morpheus/wild.png',
});

export const MORPHEUS_SPECIAL_DEFS = Object.freeze([
  { id: 'VEIL_WILD', name: 'Veil Wild', special: ['wild', 'expandingWild'] },
  { id: 'LUCID_WILD', name: 'Lucid Wild', special: ['wild', 'multiplier'] },
  { id: 'DREAM_RIFT', name: 'Dream Rift', special: ['wildBomb'] },
  { id: 'GOLDEN_RIFT', name: 'Golden Rift', special: ['wildBomb', 'goldWildBomb'] },
  { id: 'ECHO_SPLIT', name: 'Echo Split', special: ['split'] },
  { id: 'DAWN_PURGE', name: 'Dawn Purge', special: ['royalRemover'] },
  { id: 'ONEIRIC_STAR', name: 'Oneiric Star', special: ['wildStar'] },
  { id: 'MYSTERY_VEIL', name: 'Mystery Veil', special: ['mystery'] },
  { id: 'MAX_MORPHEUS', name: 'Max Morpheus', special: ['wild', 'maxWild'] },
]);

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

const STRIP_SPECIALS = Object.freeze([
  'VEIL_WILD',
  'LUCID_WILD',
  'DREAM_RIFT',
  'ECHO_SPLIT',
  'DAWN_PURGE',
  'ONEIRIC_STAR',
  'MYSTERY_VEIL',
  'GOLDEN_RIFT',
]);

const STRIP_SPECIALS_BY_REEL = Object.freeze([
  ['VEIL_WILD'],
  ['LUCID_WILD', 'DREAM_RIFT'],
  ['ECHO_SPLIT'],
  ['DAWN_PURGE', 'GOLDEN_RIFT'],
  ['ONEIRIC_STAR'],
  ['MYSTERY_VEIL', 'DREAM_RIFT'],
]);

function injectStripSpecials(strip, extras) {
  const next = Array.isArray(strip) ? [...strip] : [];
  if (!next.length) return extras.slice();
  let filled = 0;
  extras.forEach((id, index) => {
    if (next.includes(id)) return;
    const at = Math.min(next.length, Math.floor((index + 1) * (next.length / (extras.length + 1))));
    next.splice(at, 0, id);
    filled += 1;
  });
  return { strip: next, filled };
}

export function ensureMorpheusSpecials(project, { overwrite = false } = {}) {
  if (!boardSymbolPackFor(project)) return { added: 0, filled: 0 };
  project.theme ||= {};
  project.theme.symbols ||= [];
  let added = 0;
  for (const def of MORPHEUS_SPECIAL_DEFS) {
    const current = project.theme.symbols.find((symbol) => (
      symbol?.id === def.id || symbol?.name === def.id || symbol?.name === def.name
    ));
    if (!current) {
      project.theme.symbols.push({
        id: def.id,
        name: def.name,
        tier: 'special',
        src: '',
        payouts: {},
        special: [...def.special],
      });
      added += 1;
      continue;
    }
    current.special ||= [];
    for (const flag of def.special) {
      if (!current.special.includes(flag)) current.special.push(flag);
    }
  }
  const filled = applyBoardSymbolPack(project, { overwrite }).filled;
  const math = project.math ||= {};
  const specials = math.specialSymbols ||= { wild: [], scatter: [] };
  specials.wild = [...new Set([...(specials.wild || []), 'W', 'VEIL_WILD', 'LUCID_WILD', 'Veil Wild', 'Lucid Wild', 'MAX_MORPHEUS', 'Max Morpheus', 'RIFT_WILD'])];
  specials.scatter = [...new Set([...(specials.scatter || []), 'Gate of Sleep', 'GATE_OF_SLEEP', 'S'])];
  specials.multiplier = [...new Set([...(specials.multiplier || []), 'LUCID_WILD', 'Lucid Wild'])];
  math.bonusMechanics = [...new Set([...(math.bonusMechanics || []), 'cascades', 'expandingWilds', 'multiplierSymbols'])];
  math.mechanicConfig ||= {};
  math.mechanicConfig.multiplierSymbols ||= {};
  if (!math.mechanicConfig.multiplierSymbols.values) {
    const weights = { 2: 8, 3: 6, 5: 4, 7: 3, 10: 2, 25: 1, 50: 1, 100: 1, 200: 1, 500: 1, 1000: 1 };
    math.mechanicConfig.multiplierSymbols.values = { basegame: { ...weights }, freegame: { ...weights } };
  }
  let stripFilled = 0;
  const strips = math.reelStrips || {};
  for (const setName of Object.keys(strips)) {
    const reels = strips[setName];
    if (!Array.isArray(reels)) continue;
    reels.forEach((reel, index) => {
      const extras = STRIP_SPECIALS_BY_REEL[index % STRIP_SPECIALS_BY_REEL.length];
      const result = injectStripSpecials(reel, extras);
      if (result.filled) {
        reels[index] = result.strip;
        stripFilled += result.filled;
      }
    });
  }
  return { added, filled, stripFilled, specials: STRIP_SPECIALS };
}
