import { applyGameBlueprint, GAME_BLUEPRINTS } from '../blueprints/GameBlueprintEngine.js';
import { forgeArtBible, lockArtBible, normalizeVisualFactoryState } from '../assets/VisualAssetFactory.js';
import { normalizeProductionProfile } from '../quality/QualityDirector.js';

export const CREATIVE_DIRECTOR_FORMAT = 'stake-studio-creative-director-v1';
export const CREATIVE_CONCEPT_FORMAT = 'stake-studio-creative-concept-v1';

const WORLD_PROFILES = [
  {
    id: 'arcane-spellcraft', terms: ['wizard', 'spell', 'spellsmith', 'spellcraft', 'arcane', 'enchant', 'magic', 'rune', 'grimoire', 'alchemy'],
    nouns: ['Wizard Craft', 'Spellforge', 'Runebound', 'Living Grimoire'],
    places: ['an impossible spellsmith workshop whose rooms reconfigure around each enchantment', 'a foundry of living magic where unfinished spells become physical machines', 'a rotating archive-workshop built around a sentient arcane forge'],
    stakes: ['bind volatile magic into permanent reel seals', 'reforge unstable enchantments before the workshop overloads', 'master a living craft that strengthens every claimed reel'],
    styles: ['premium arcane workshop fantasy with tactile tools, layered soot-dark materials, luminous runic inlays, and crisp game-readable silhouettes', 'authored spellcraft fantasy with mechanical magical apparatus, hand-worked metals, glass vessels, vellum, and disciplined enchanted light'],
    palettes: [['#11151D', '#253B5A', '#2BA6A4', '#D5943C', '#E8DDC5'], ['#17141F', '#433A67', '#39B8A7', '#C98232', '#F0E5CC']],
    host: 'a master spellsmith whose tools and impossible workshop respond to every sticky enchantment',
    relic: 'an interlocking spellforge seal',
  },
  {
    id: 'frost-oath', terms: ['snow', 'frost', 'ice', 'winter', 'norse', 'valkyrie', 'viking'],
    nouns: ['Oath', 'Valkyrie', 'Frost', 'Runeblade'],
    places: ['a shattered aurora citadel', 'the last hall above the frozen void', 'a storm-bound field of oath stones'],
    stakes: ['awaken an exiled shield-host', 'break the seal on a buried war god', 'carry a fallen oath through the final storm'],
    styles: ['painterly cinematic Norse fantasy with carved silhouettes and disciplined frost detail', 'graphic mythic fantasy with faceted steel, aurora rim light, and heroic negative space'],
    palettes: [['#11182E', '#82D8E8', '#71859A', '#7757B8', '#D3AF64'], ['#071521', '#B9F0F4', '#486A89', '#8F63C9', '#E5C06B']],
    host: 'an oath-broken Valkyrie whose wings regain their runes as danger rises',
    relic: 'a split-wing oath seal',
  },
  {
    id: 'infernal-pact', terms: ['devil', 'demon', 'hell', 'infernal', 'curse', 'death', 'occult'],
    nouns: ['Pact', 'Ash', 'Doom', 'Black Seal'],
    places: ['a contract vault beneath a burning cathedral', 'the last tribunal at the mouth of the abyss', 'a black-gold casino built around a chained furnace'],
    stakes: ['turn every wager into a clause of power', 'steal back a soul one seal at a time', 'force the house demon to honor an impossible bargain'],
    styles: ['hand-painted infernal noir with carved contours, ember under-lighting, and blackened brass', 'premium occult graphic fantasy with restrained etching and violent red-gold focal light'],
    palettes: [['#0B0910', '#651B2A', '#F05A28', '#B68A3A', '#7B4DCC'], ['#10090C', '#8E2231', '#FF6A2A', '#C99B46', '#5A3A88']],
    host: 'an elegant contract keeper whose composure fractures as the pact escalates',
    relic: 'a broken pact seal',
  },
  {
    id: 'abyssal-hunt', terms: ['ocean', 'sea', 'abyss', 'kraken', 'pirate', 'underwater'],
    nouns: ['Abyss', 'Leviathan', 'Black Tide', 'Deep Crown'],
    places: ['a drowned treasury lit by a captive leviathan', 'a storm-wrecked flagship descending through the midnight sea', 'a forbidden port built inside a colossal shell'],
    stakes: ['raise the deep crown before the leviathan wakes', 'turn a sinking voyage into a raid on the abyss', 'follow a cursed compass beyond the final depth'],
    styles: ['richly painted abyssal adventure with nautical engraving accents and bioluminescent edge light', 'cinematic maritime fantasy with wet black timber, verdigris brass, and clean game-readable silhouettes'],
    palettes: [['#071B26', '#0C5360', '#3A9B8B', '#E3A943', '#D95E58'], ['#06131C', '#126879', '#52B7A5', '#F0B84D', '#A9475D']],
    host: 'a deep-sea raider marked by the same bioluminescent curse as the creature below',
    relic: 'a split compass crown',
  },
  {
    id: 'cosmic-engine', terms: ['space', 'cosmic', 'star', 'galaxy', 'alien', 'cyber', 'future'],
    nouns: ['Orbit', 'Void', 'Nova', 'Signal'],
    places: ['an abandoned star engine at the edge of mapped space', 'a black-orbit arena powered by stolen suns', 'a signal cathedral transmitting through a dead galaxy'],
    stakes: ['restart a machine that can rewrite one doomed timeline', 'harvest unstable stars before the orbit collapses', 'decode the final signal before it becomes sentient'],
    styles: ['premium graphic science fiction with cinematic volume, dark ceramic armor, and precise plasma seams', 'high-contrast cosmic illustration with monumental silhouettes and controlled ultraviolet energy'],
    palettes: [['#080B16', '#2A86D9', '#5EE7F2', '#7747D9', '#F05D6C'], ['#090A13', '#3658B8', '#78F2E4', '#984FD4', '#FF6E79']],
    host: 'a lone signal warden whose armor maps every multiplier into a new constellation',
    relic: 'a broken orbital crown',
  },
  {
    id: 'gilded-heist', terms: ['gold', 'gilded', 'heist', 'vault', 'luxury', 'mystery'],
    nouns: ['Vault', 'Crown', 'Midnight', 'Gilded'],
    places: ['a moving vault hidden inside a midnight opera house', 'a royal treasury protected by clockwork witnesses', 'a masked auction where every relic is stolen twice'],
    stakes: ['complete the impossible heist before the final bell', 'turn the vault security into the crew’s greatest weapon', 'steal a crown whose history changes with every reveal'],
    styles: ['luxurious graphic noir with art-deco geometry, lacquered shadow, and selective gold illumination', 'painterly heist fantasy with crisp silhouettes, smoked glass, and mechanical filigree'],
    palettes: [['#10121A', '#24324A', '#C99A45', '#E8D7A8', '#8E355B'], ['#0D1017', '#35425B', '#E0B55A', '#F2E4C5', '#5F9E99']],
    host: 'a masked master thief whose tools assemble into a crown-shaped machine',
    relic: 'a three-tumbler crown lock',
  },
];

const FALLBACK_WORLD = {
  id: 'mythic-dark', terms: [], nouns: ['Rift', 'Crown', 'Last Oath', 'Ascendant'],
  places: ['a forbidden kingdom built around a living relic', 'the last arena between a ruined world and its rebirth', 'a hidden citadel that wakes only for impossible wagers'],
  stakes: ['master a relic that grows more dangerous with every victory', 'restore a fallen power through visible stages of transformation', 'survive a ritual whose rules change as the reward climbs'],
  styles: ['hand-painted premium dark fantasy with authored graphic contours and cinematic volume', 'bold mythic illustration with asymmetric silhouettes, carved materials, and one luminous accent system'],
  palettes: [['#111522', '#50358A', '#42C7D9', '#C79A52', '#E6DDC9'], ['#0C111B', '#6A355E', '#36B8BC', '#D6A84E', '#DCD3C0']],
  host: 'a marked guardian whose silhouette and power visibly transform with the feature state',
  relic: 'a broken three-notch crown',
};

const BLUEPRINT_DIRECTIONS = {
  rapid_ways: {
    hook: 'Short, readable cascade chains keep the next meaningful event close without flattening the volatility.',
    signature: (world, relic) => `On the fourth cascade, ${relic} snaps into alignment and tears open ${world}, changing the entire cabinet for one decisive beat.`,
    differences: (host, relic) => [`Every cascade restores one visible piece of ${relic}; the fourth has a unique silhouette and sound.`, `${capitalize(host)} reacts to chain depth instead of replaying a generic win animation.`],
  },
  multiplier_arena: {
    hook: 'A persistent multiplier turns every cascade into visible pressure, giving the player a simple reason to chase one more connection.',
    signature: (world, relic) => `At 10×, ${relic} becomes the arena itself: ${world} rotates into a dangerous second lighting state while the music drops to a heartbeat.`,
    differences: (host, relic) => [`The global multiplier physically assembles ${relic}, with authored visual milestones at 3×, 5×, 10×, and 25×.`, `${capitalize(host)} changes stance, lighting, and vocal intensity at the same multiplier milestones.`],
  },
  wild_forge: {
    hook: 'A single wild can forge a whole reel, making the feature readable before the payout count begins.',
    signature: (world, relic) => `The wild strikes ${relic} through a full reel; the symbols fuse into one vertical artifact before ${world} answers with a shockwave.`,
    differences: (host, relic) => [`Expanding wilds are staged as the construction of ${relic}, not a generic gold overlay.`, `${capitalize(host)} performs the forge action with synchronized impact, camera, and positional audio cues.`],
  },
  cascade_colossus: {
    hook: 'Long cascade chains awaken a character and environment together, making extreme volatility feel like an unfolding confrontation.',
    signature: (world, relic) => `At the danger threshold, ${world} splits behind ${relic}; the host enters a corrective hero pose while every remaining multiplier burns into the final drop.`,
    differences: (host, relic) => [`Cascade depth drives three authored cabinet states centered on ${relic}, not a color filter.`, `${capitalize(host)} uses dedicated anticipation, threshold, and wincap poses with joint-safe corrective art.`],
  },
};

const ARCANE_STICKY_REELS_DIRECTION = {
  hook: 'Whole reels can be claimed by multiplier seals during the feature; each claimed reel stays visibly enchanted and makes later wins more valuable.',
  signature: (_world, relic) => `The final unclaimed reel accepts ${relic}; every bound reel locks into one working machine, and the impossible workshop fully awakens for the feature climax.`,
  differences: (host, relic) => [`Each claimed reel has a persistent authored state for its current multiplier, and upgrades visibly reforge ${relic} instead of replacing it with a generic overlay.`, `${capitalize(host)} reacts to newly claimed reels and multiplier upgrades, while temporary reel power is unmistakably cleared before the next spin.`],
};

const TONE_LABELS = {
  cinematic: 'cinematic and serious', brutal: 'brutal and high-impact', mysterious: 'mysterious and restrained',
  triumphant: 'triumphant and heroic', playful: 'stylized and mischievous', luxurious: 'luxurious and controlled',
};

const clone = value => JSON.parse(JSON.stringify(value));
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const capitalize = value => `${clean(value).charAt(0).toUpperCase()}${clean(value).slice(1)}`;

function fingerprint(value) {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function seededOrder(values, seed) {
  return [...values].map((value, index) => ({ value, score: fingerprint(`${seed}:${index}:${value.id || value}`) }))
    .sort((left, right) => left.score.localeCompare(right.score)).map(item => item.value);
}

function selectWorld(text) {
  const source = ` ${clean(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const ranked = WORLD_PROFILES.map((profile, index) => ({
    profile,
    index,
    score: profile.terms.reduce((sum, term) => {
      const normalizedTerm = clean(term).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      return sum + (source.includes(` ${normalizedTerm} `) ? 1 : 0);
    }, 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.score ? ranked[0].profile : FALLBACK_WORLD;
}

function createTitle(world, premise, index, seed) {
  const nouns = seededOrder(world.nouns, `${seed}:titles:${clean(premise)}`);
  const first = nouns[index % nouns.length];
  const second = nouns[(index + 1) % nouns.length];
  if (index === 0) return `${first} ${second}`;
  if (index === 1) return `${first}: ${second} Unbound`;
  return `${first} of the ${second}`;
}

export function createCreativeDirectorState() {
  return {
    format: CREATIVE_DIRECTOR_FORMAT,
    version: 1,
    provider: 'offline',
    providers: {
      offline: { enabled: true, configured: true, adapter: 'local-deterministic', cost: 'none' },
      openai: { enabled: false, configured: false, adapter: 'optional-api', model: null },
    },
    brief: { premise: '', tone: 'cinematic', audience: 'adult slot players', providerName: '', seed: 'studio-one', blueprintId: '' },
    candidates: [],
    selectedId: null,
    applied: null,
    history: [],
  };
}

export function normalizeCreativeDirectorState(project = {}) {
  const base = createCreativeDirectorState();
  const incoming = project.creativeDirector || {};
  project.creativeDirector = {
    ...base,
    ...incoming,
    provider: incoming.provider || 'offline',
    providers: {
      offline: { ...base.providers.offline, ...(incoming.providers?.offline || {}) },
      openai: { ...base.providers.openai, ...(incoming.providers?.openai || {}) },
      ...Object.fromEntries(Object.entries(incoming.providers || {}).filter(([id]) => !['offline', 'openai'].includes(id))),
    },
    brief: { ...base.brief, ...(incoming.brief || {}) },
    candidates: Array.isArray(incoming.candidates) ? incoming.candidates : [],
    history: Array.isArray(incoming.history) ? incoming.history : [],
  };
  return project.creativeDirector;
}

export function getCreativeProviderStatus(project = {}) {
  const state = normalizeCreativeDirectorState(project);
  return Object.entries(state.providers).map(([id, provider]) => ({
    id,
    label: id === 'offline' ? 'Offline engine' : id === 'openai' ? 'OpenAI provider' : provider.label || id,
    active: state.provider === id && provider.enabled === true,
    enabled: provider.enabled === true,
    configured: provider.configured === true,
    adapter: provider.adapter || null,
    cost: provider.cost || (id === 'offline' ? 'none' : 'provider billing'),
    status: provider.enabled ? (provider.configured ? 'ready' : 'configuration required') : 'available later · disabled',
  }));
}

export function validateCreativeConcept(concept = {}) {
  const issues = [];
  if (concept.format !== CREATIVE_CONCEPT_FORMAT) issues.push('Concept format is not supported.');
  for (const field of ['id', 'title', 'tagline', 'playerHook', 'signatureMoment', 'style', 'lore', 'blueprintId']) {
    if (!clean(concept[field])) issues.push(`${field} is required.`);
  }
  if (!GAME_BLUEPRINTS[concept.blueprintId]) issues.push('Concept blueprint is not in this studio catalog.');
  if (!Array.isArray(concept.differentiators) || concept.differentiators.filter(clean).length < 2) issues.push('At least two concrete differentiators are required.');
  if (!Array.isArray(concept.colorPalette) || concept.colorPalette.length < 4) issues.push('At least four palette colors are required.');
  return { valid: issues.length === 0, issues };
}

export function generateOfflineConcepts(project = {}, input = {}) {
  const state = normalizeCreativeDirectorState(project);
  const brief = {
    premise: clean(input.premise ?? state.brief.premise ?? project.theme?.lore ?? project.name),
    tone: clean(input.tone ?? state.brief.tone) || 'cinematic',
    audience: clean(input.audience ?? state.brief.audience) || 'adult slot players',
    providerName: clean(input.providerName ?? state.brief.providerName ?? project.build?.stakeEngine?.providerName),
    seed: clean(input.seed ?? state.brief.seed) || 'studio-one',
    blueprintId: clean(input.blueprintId ?? state.brief.blueprintId),
  };
  if (!brief.premise) throw new Error('Give the director a premise, fantasy, or world to build from.');
  if (brief.blueprintId && !GAME_BLUEPRINTS[brief.blueprintId]) throw new Error(`Unknown game blueprint "${brief.blueprintId}".`);
  const world = selectWorld(`${brief.premise} ${project.name || ''}`);
  const premiseSentence = brief.premise.replace(/[.!?]+$/, '');
  const seededBlueprints = seededOrder(Object.keys(GAME_BLUEPRINTS), `${brief.seed}:${brief.premise}:${brief.tone}`);
  const blueprintIds = brief.blueprintId
    ? [brief.blueprintId, ...seededBlueprints.filter(id => id !== brief.blueprintId)].slice(0, 3)
    : seededBlueprints.slice(0, 3);
  const candidates = blueprintIds.map((blueprintId, index) => {
    const blueprint = GAME_BLUEPRINTS[blueprintId];
    const direction = blueprintId === 'sticky_reel_forge'
      ? ARCANE_STICKY_REELS_DIRECTION
      : world.id === 'arcane-spellcraft' && blueprintId === 'multiplier_arena'
      ? ARCANE_STICKY_REELS_DIRECTION
      : BLUEPRINT_DIRECTIONS[blueprintId];
    const place = seededOrder(world.places, `${brief.seed}:place:${index}`)[0];
    const stakes = seededOrder(world.stakes, `${brief.seed}:stakes:${index}`)[0];
    const style = world.styles[index % world.styles.length];
    const palette = world.palettes[index % world.palettes.length];
    const title = createTitle(world, brief.premise, index, brief.seed);
    const core = {
      format: CREATIVE_CONCEPT_FORMAT,
      version: 1,
      title,
      tagline: `${stakes[0].toUpperCase()}${stakes.slice(1)} — one ${blueprint.family.toLowerCase()} feature at a time.`,
      playerHook: direction.hook,
      signatureMoment: direction.signature(place, world.relic),
      differentiators: direction.differences(world.host, world.relic),
      style: `${style}; ${TONE_LABELS[brief.tone] || brief.tone} direction`,
      lore: `${premiseSentence}. In ${place}, players ${stakes}. ${world.host[0].toUpperCase()}${world.host.slice(1)} anchors every escalation and keeps the fantasy legible during play.`,
      colorPalette: [...palette],
      blueprintId,
      blueprintName: blueprint.name,
      blueprintSummary: blueprint.summary,
      characterRole: world.host,
      symbolSystem: `A family of relics derived from ${world.relic}; high symbols use complete forms, lows use fragments, and wild/scatter keep exclusive silhouettes.`,
      providerName: brief.providerName,
      source: { provider: 'offline', adapter: 'local-deterministic', cost: 'none' },
    };
    core.id = `offline-${fingerprint(core)}`;
    core.fingerprint = fingerprint(core);
    return core;
  });
  state.provider = 'offline';
  state.brief = brief;
  state.candidates = candidates;
  state.selectedId = null;
  state.lastGeneratedAt = new Date().toISOString();
  return candidates;
}

export function applyCreativeConcept(project = {}, conceptOrId, options = {}) {
  const state = normalizeCreativeDirectorState(project);
  const concept = typeof conceptOrId === 'string' ? state.candidates.find(item => item.id === conceptOrId) : conceptOrId;
  if (!concept) throw new Error('Choose a generated concept before greenlighting it.');
  const validation = validateCreativeConcept(concept);
  if (!validation.valid) throw new Error(validation.issues[0]);

  const currentFactory = normalizeVisualFactoryState(project);
  const hasVisualWork = Object.keys(currentFactory.assignments || {}).length > 0 || (currentFactory.references || []).some(item => item.approved);
  if (hasVisualWork && options.replaceVisualDirection !== true) {
    throw new Error('This project already has generated or approved visual work. Start a new project or explicitly approve replacing its visual direction.');
  }

  const compileBlueprint = options.compileBlueprint !== false;
  const renameProject = options.renameProject === true;
  const result = compileBlueprint ? applyGameBlueprint(project, concept.blueprintId) : null;
  if (renameProject) project.name = concept.title;
  project.theme ||= {};
  project.theme.style = concept.style;
  project.theme.lore = concept.lore;
  project.theme.colorPalette = [...concept.colorPalette];
  project.production = normalizeProductionProfile(project.production);
  project.production.creative = {
    ...project.production.creative,
    coreHook: concept.playerHook,
    signatureMoment: concept.signatureMoment,
    differentiators: [...concept.differentiators],
  };
  project.production.qa.gameCertification = null;
  project.production.qa.repairRun = null;
  project.build ||= {};
  project.build.stakeEngine ||= {};
  const providerName = clean(options.providerName ?? concept.providerName);
  if (providerName) project.build.stakeEngine.providerName = providerName;

  project.visualFactory = null;
  const visualFactory = normalizeVisualFactoryState(project);
  visualFactory.artBible = forgeArtBible(project);
  const artBibleFingerprint = lockArtBible(project);

  state.selectedId = concept.id;
  state.applied = {
    conceptId: concept.id,
    fingerprint: concept.fingerprint,
    source: clone(concept.source),
    blueprintId: compileBlueprint ? concept.blueprintId : project.blueprint?.id || null,
    artBibleFingerprint,
    appliedAt: new Date().toISOString(),
  };
  state.history.unshift(clone(state.applied));
  state.history = state.history.slice(0, 20);
  return {
    concept: clone(concept),
    blueprint: result?.blueprint || null,
    artBibleFingerprint,
    providerNameApplied: Boolean(providerName),
    preserved: ['audio files', 'Spine assets', 'provider identity when no new value was supplied'],
  };
}
