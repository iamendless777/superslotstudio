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
