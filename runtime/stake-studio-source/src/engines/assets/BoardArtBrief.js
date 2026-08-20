/**
 * Live board art brief for the loaded project.
 * Ways games commission these slots — not the cluster-hex Ruby/Sapphire recipe.
 */

export function boardWinType(project) {
  const type = String(
    project?.math?.gameType
    || project?.math?.winType
    || project?.blueprint?.winType
    || 'ways',
  ).toLowerCase();
  return type === 'cluster' ? 'cluster' : 'ways';
}

export function boardGridLabel(project) {
  const reels = Number(project?.math?.grid?.reels) || 0;
  const rows = project?.math?.grid?.rows?.[0]
    || project?.math?.grid?.rows
    || project?.math?.grid?.rowCount
    || 0;
  return `${reels}x${rows}`;
}

export function boardSlotGuidance(role, winType) {
  if (role === 'wild') return 'Wild badge must read under tumble and sticky morph.';
  if (role === 'scatter') return 'Scatter must read at a glance for 3/4/5/6-tier entry.';
  if (role === 'special') return 'Feature/collect — distinct from pays; keep silhouette clear in tumble.';
  if (role === 'high') return 'Hero symbol; strongest silhouette on the 6×4 ways board.';
  if (winType === 'cluster') return 'Readable cluster gem; clear at 5-connected pays.';
  return 'Readable at symbol size; pays as adjacent-ways 3-kind, not a cluster blob.';
}

export function slimBoardArtBrief(brief) {
  return {
    ...brief,
    slots: (brief.slots || []).map((slot) => ({
      symbolId: slot.symbolId,
      label: slot.label,
      role: slot.role,
      status: slot.status,
      guidance: slot.guidance,
      hasArt: Boolean(slot.artKey),
    })),
  };
}

export function buildLiveBoardArtBrief(project, { symbolSize = null, missingNames = null } = {}) {
  const winType = boardWinType(project);
  const gaps = missingNames instanceof Set
    ? missingNames
    : new Set(
      (project?.theme?.symbols || [])
        .filter((symbol) => symbol && !symbol.special?.includes?.('empty') && !symbol.src)
        .map((symbol) => symbol.name || symbol.id),
    );
  let regular = 0;
  const slots = (project?.theme?.symbols || [])
    .filter((symbol) => symbol && !symbol.special?.includes?.('empty'))
    .map((symbol) => {
      const name = symbol.name || symbol.id || 'symbol';
      const special = symbol.special || [];
      let role = 'low';
      if (special.includes('wild') || /wild/i.test(name)) role = 'wild';
      else if (special.includes('scatter') || /scatter|gate/i.test(name)) role = 'scatter';
      else if (special.includes('bonus') || /rift|star|mystery|purge|split/i.test(name)) role = 'special';
      else if (regular++ === 0) role = 'high';
      return {
        symbolId: symbol.id || name,
        label: name,
        role,
        artKey: symbol.src || null,
        status: gaps.has(name) ? 'missing' : 'assigned',
        guidance: boardSlotGuidance(role, winType),
      };
    });
  return {
    gameId: project?.id || 'preview',
    title: project?.name || project?.id || 'Loaded project',
    grid: boardGridLabel(project),
    winType,
    motion: winType === 'cluster'
      ? 'Cluster tumble. Min 5 to pay; rehearsal pops 3+ 4-connected.'
      : 'Adjacent-ways 6×4 like Waylanders Forge. Min 3-kind left-to-right, then tumble. Swap art; keep motion.',
    symbolSize,
    slots,
    missingCount: slots.filter((slot) => slot.status === 'missing').length,
    readyToCommission: slots.length > 0,
    recipe: 'board',
    note: winType === 'cluster'
      ? 'Commission this cluster board. Do not paste a ways 6×4 brief here.'
      : 'Commission this ways board. Do not use the cluster-hex Ruby/Sapphire recipe.',
  };
}
