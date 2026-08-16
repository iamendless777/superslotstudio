export const VISUAL_FACTORY_VERSION = 3;
export const VISUAL_REFERENCE_ROLES = Object.freeze({
  style: 'World style board',
  character: 'Character master',
  symbol: 'Symbol family master',
});
export const MAX_VISUAL_REFERENCES = 8;
export const MAX_REFERENCES_PER_REQUEST = 4;

export const ART_BIBLE_FIELDS = Object.freeze([
  ['concept', 'World thesis'],
  ['medium', 'Rendering medium'],
  ['shapeLanguage', 'Shape language'],
  ['lighting', 'Lighting contract'],
  ['materials', 'Material library'],
  ['palette', 'Palette roles'],
  ['motifs', 'Recurring motifs'],
  ['forbidden', 'Never generate'],
  ['characterIdentity', 'Character identity'],
  ['symbolGrammar', 'Symbol hierarchy'],
]);

const DIRECTION_PROFILES = [
  {
    terms: ['devil', 'demon', 'infernal', 'hell', 'occult', 'curse', 'death'],
    values: {
      medium: 'hand-painted cinematic 2D illustration with carved graphic contours and restrained etched detail',
      shapeLanguage: 'predatory hooks, tapered horns, broken circles and heavy triangular silhouettes; no soft generic blobs',
      lighting: 'hot ember key light from below, cold violet rim light, deep readable shadows around the reel window',
      materials: 'charred obsidian, aged blackened brass, cracked lacquer, smoked glass and sparse molten seams',
      palette: 'void black #0B0910, oxblood #651B2A, ember #F05A28, tarnished gold #B68A3A, spectral violet #7B4DCC',
      motifs: 'broken pact seal, asymmetric horns, three-notch tally and a thin ember fissure',
    },
  },
  {
    terms: ['ice', 'snow', 'frost', 'arctic', 'winter', 'valkyrie', 'norse'],
    values: {
      medium: 'painterly cinematic fantasy illustration with crisp carved contours and controlled frost detail',
      shapeLanguage: 'spear points, winged chevrons, faceted shields and tall heroic silhouettes',
      lighting: 'cold moonlit key, pale cyan edge light and a restrained warm aurora accent',
      materials: 'frosted steel, carved ice, pale stone, weathered leather and silver filigree',
      palette: 'polar night #11182E, glacier #82D8E8, steel #71859A, aurora violet #7757B8, oath gold #D3AF64',
      motifs: 'split wing, spearhead rune, three-cut ice facet and narrow aurora ribbon',
    },
  },
  {
    terms: ['ocean', 'sea', 'pirate', 'abyss', 'kraken', 'underwater'],
    values: {
      medium: 'richly painted adventure illustration with nautical engraving accents and clean game-readable edges',
      shapeLanguage: 'curling tentacles, compass arcs, sharp wave crests and broad treasure silhouettes',
      lighting: 'deep teal environment light, warm lantern key and sharp bioluminescent edge accents',
      materials: 'verdigris brass, wet black timber, salt-worn rope, pearl shell and dark glass',
      palette: 'abyss #071B26, deep teal #0C5360, verdigris #3A9B8B, lantern gold #E3A943, coral #D95E58',
      motifs: 'split compass rose, hooked wave, three pearl dots and a coiled tentacle tip',
    },
  },
  {
    terms: ['space', 'cosmic', 'alien', 'star', 'galaxy', 'sci-fi', 'cyber'],
    values: {
      medium: 'premium graphic science-fiction illustration with cinematic volume and precise hard-surface accents',
      shapeLanguage: 'orbital rings, clipped hexagons, blade-like fins and compact monumental silhouettes',
      lighting: 'deep-space black levels, electric cyan rim light and one controlled ultraviolet energy source',
      materials: 'dark ceramic armor, brushed titanium, smoked crystal, holographic foil and energized plasma seams',
      palette: 'space black #080B16, ion blue #2A86D9, plasma cyan #5EE7F2, ultraviolet #7747D9, signal coral #F05D6C',
      motifs: 'broken orbit, three-star alignment, clipped hexagon and narrow plasma incision',
    },
  },
];

const FALLBACK_PROFILE = {
  medium: 'hand-painted premium 2D game illustration with cinematic volume, authored graphic contours and restrained detail',
  shapeLanguage: 'bold asymmetric silhouettes, one repeated angular cut and large readable masses; avoid generic rounded icon shapes',
  lighting: 'single dramatic key light, restrained complementary rim light and deep but readable separation around gameplay',
  materials: 'dark lacquer, aged metal, carved stone, smoked glass and one luminous accent material',
  palette: 'midnight #111522, deep accent #50358A, signal cyan #42C7D9, warm metal #C79A52, bone #E6DDC9',
  motifs: 'broken ring, three-notch mark, asymmetric crown point and one narrow luminous seam',
};

function normalized(value) { return String(value || '').trim().replace(/\s+/g, ' '); }

function stableFingerprint(value) {
  const ordered = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value;
  const input = JSON.stringify(ordered);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function directionProfile(project) {
  const source = `${project.name || ''} ${project.theme?.style || ''} ${project.theme?.lore || ''}`.toLowerCase();
  const ranked = DIRECTION_PROFILES.map((profile, index) => ({
    profile,
    index,
    score: profile.terms.reduce((score, term) => score + (source.includes(term) ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.score > 0 ? ranked[0].profile.values : FALLBACK_PROFILE;
}

export function forgeArtBible(project = {}) {
  const profile = directionProfile(project);
  const suppliedPalette = (project.theme?.colorPalette || []).filter(Boolean);
  const lore = normalized(project.theme?.lore);
  const style = normalized(project.theme?.style);
  const name = normalized(project.name) || 'Untitled Game';
  return {
    version: 1,
    concept: lore || `${name} is a singular high-stakes world where every reward visibly escalates the central fantasy.`,
    medium: style ? `${style}; ${profile.medium}` : profile.medium,
    shapeLanguage: profile.shapeLanguage,
    lighting: profile.lighting,
    materials: profile.materials,
    palette: suppliedPalette.length >= 4 ? suppliedPalette.join(', ') : profile.palette,
    motifs: profile.motifs,
    forbidden: 'generic casino clip-art, stock slot symbols, emoji styling, default gradients, photorealistic text, watermarks, UI chrome, logos, copied characters and mismatched rendering styles',
    characterIdentity: `one unmistakable adult host from ${name}; preserve the same face structure, costume construction, proportions, signature silhouette and dominant accent material across every pose`,
    symbolGrammar: 'high symbols are unique dimensional relics with the strongest material contrast; medium symbols are simpler tools or emblems; low symbols share one graphic family; wild and scatter have exclusive silhouettes visible at 96 px',
    lockedFingerprint: null,
    lockedAt: null,
  };
}

export function artBibleFingerprint(bible = {}) {
  return stableFingerprint(Object.fromEntries(ART_BIBLE_FIELDS.map(([field]) => [field, normalized(bible[field])])));
}

export function validateArtBible(bible = {}) {
  const issues = [];
  for (const [field, label] of ART_BIBLE_FIELDS) if (!normalized(bible[field])) issues.push(`${label} is empty.`);
  const paletteEntries = normalized(bible.palette).split(',').map(item => item.trim()).filter(Boolean);
  if (paletteEntries.length < 4) issues.push('Palette roles need at least four comma-separated colors.');
  if (normalized(bible.forbidden).split(',').filter(Boolean).length < 3) issues.push('Never-generate rules need at least three explicit exclusions.');
  return { valid: issues.length === 0, issues, completed: ART_BIBLE_FIELDS.length - issues.filter(issue => / is empty\.$/.test(issue)).length, total: ART_BIBLE_FIELDS.length };
}

export function lockArtBible(project) {
  const factory = normalizeVisualFactoryState(project);
  const validation = validateArtBible(factory.artBible);
  if (!validation.valid) throw new Error(validation.issues[0]);
  factory.artBible.lockedFingerprint = artBibleFingerprint(factory.artBible);
  factory.artBible.lockedAt = new Date().toISOString();
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.visualCohesionAudit = null;
  return factory.artBible.lockedFingerprint;
}

export function createVisualFactoryState(project = {}) {
  const artBible = forgeArtBible(project);
  return {
    version: VISUAL_FACTORY_VERSION,
    direction: [project.theme?.style, project.theme?.lore].filter(Boolean).join('. '),
    artBible,
    quality: 'concept',
    selectedTarget: 'background',
    detail: '',
    correctionPlan: null,
    latest: null,
    history: [],
    assignments: {},
    references: [],
    workOrder: null,
    deliveryReceipt: null,
    codexBatch: null,
  };
}

export function normalizeVisualFactoryState(project) {
  const defaults = createVisualFactoryState(project);
  project.visualFactory = { ...defaults, ...(project.visualFactory || {}) };
  project.visualFactory.version = VISUAL_FACTORY_VERSION;
  project.visualFactory.artBible = { ...defaults.artBible, ...(project.visualFactory.artBible || {}) };
  project.visualFactory.history ||= [];
  project.visualFactory.assignments ||= {};
  project.visualFactory.references ||= [];
  return project.visualFactory;
}

export function addVisualReference(project, reference) {
  const factory = normalizeVisualFactoryState(project);
  if (factory.references.length >= MAX_VISUAL_REFERENCES) throw new Error(`Reference library is limited to ${MAX_VISUAL_REFERENCES} approved-quality images.`);
  if (!Object.hasOwn(VISUAL_REFERENCE_ROLES, reference.role)) throw new Error('Choose a valid reference role.');
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(reference.src || '')) throw new Error('Reference anchors must be PNG, JPEG, or WebP images.');
  const encoded = String(reference.src).split(',')[1] || '';
  const bytes = Math.floor(encoded.length * 0.75);
  if (bytes > 12 * 1024 * 1024) throw new Error('Each reference image must be 12 MB or smaller.');
  const item = {
    id: globalThis.crypto?.randomUUID?.() || `reference-${Date.now()}-${factory.references.length}`,
    name: normalized(reference.name) || `Reference ${factory.references.length + 1}`,
    role: reference.role,
    src: reference.src,
    width: Number(reference.width) || 0,
    height: Number(reference.height) || 0,
    bytes,
    imageFingerprint: stableFingerprint(reference.src),
    approved: false,
    bibleFingerprint: null,
    addedAt: new Date().toISOString(),
  };
  factory.references.push(item);
  return item;
}

export function removeVisualReference(project, id) {
  const factory = normalizeVisualFactoryState(project);
  const index = factory.references.findIndex(reference => reference.id === id);
  if (index < 0) return false;
  factory.references.splice(index, 1);
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.visualCohesionAudit = null;
  return true;
}

export function approveVisualReference(project, id, approved = true) {
  const factory = normalizeVisualFactoryState(project);
  const reference = factory.references.find(item => item.id === id);
  if (!reference) throw new Error('Reference anchor no longer exists.');
  const validation = validateArtBible(factory.artBible);
  const currentFingerprint = artBibleFingerprint(factory.artBible);
  if (approved && (!validation.valid || factory.artBible.lockedFingerprint !== currentFingerprint)) {
    throw new Error('Lock the current Art Direction Bible before approving reference anchors.');
  }
  reference.approved = Boolean(approved);
  reference.bibleFingerprint = approved ? currentFingerprint : null;
  reference.approvedAt = approved ? new Date().toISOString() : null;
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.visualCohesionAudit = null;
  return reference;
}

export function getApplicableVisualReferences(project, selected) {
  const factory = normalizeVisualFactoryState(project);
  const current = artBibleFingerprint(factory.artBible);
  const role = selected.slot === 'characterPose' || selected.slot === 'foreground' ? 'character'
    : selected.slot === 'symbol' ? 'symbol' : 'style';
  const approved = factory.references.filter(reference => reference.approved && reference.bibleFingerprint === current);
  const generatedAnchors = getGeneratedVisualAnchors(project);
  const generated = [
    ...generatedAnchors.filter(reference => reference.role === role),
    ...generatedAnchors.filter(reference => reference.role === 'style' && role !== 'style'),
  ];
  return [
    ...approved.filter(reference => reference.role === role),
    ...approved.filter(reference => reference.role === 'style' && role !== 'style'),
    ...generated,
  ].slice(0, MAX_REFERENCES_PER_REQUEST);
}

export function getGeneratedVisualAnchors(project) {
  const factory = normalizeVisualFactoryState(project);
  const current = artBibleFingerprint(factory.artBible);
  const anchors = [];
  const add = (key, role, name, src) => {
    const assignment = factory.assignments?.[key];
    if (!assignment || assignment.coherenceFingerprint !== current || assignment.analysis?.passed !== true) return;
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(src || '')) return;
    anchors.push({
      id: `generated-${key.replace(/[^a-z0-9_-]+/gi, '-')}`,
      name,
      role,
      src,
      imageFingerprint: stableFingerprint(src),
      approved: true,
      bibleFingerprint: current,
      generatedAnchor: true,
    });
  };
  add('background', 'style', 'Generated world master', project.theme?.submission?.background);
  add('characterPose:idle', 'character', 'Generated character master', project.theme?.character?.poses?.idle);
  const symbol = (project.theme?.symbols || []).find(item => factory.assignments?.[`symbol:${item.name}`]?.analysis?.passed === true && item.src);
  if (symbol) add(`symbol:${symbol.name}`, 'symbol', `Generated symbol-family master · ${symbol.name}`, symbol.src);
  return anchors;
}

export function getVisualFactoryTargets(project) {
  const targets = [
    { key: 'background', slot: 'background', target: null, label: 'Cabinet background', ready: Boolean(project.theme?.submission?.background) },
    { key: 'foreground', slot: 'foreground', target: null, label: 'Cabinet foreground', ready: Boolean(project.theme?.submission?.foreground) },
    { key: 'providerLogo', slot: 'providerLogo', target: project.build?.stakeEngine?.providerName || 'provider', label: 'Provider logo', ready: Boolean(project.theme?.submission?.providerLogo) },
  ];
  for (const symbol of project.theme?.symbols || []) {
    targets.push({ key: `symbol:${symbol.name}`, slot: 'symbol', target: symbol.name, label: `Symbol · ${symbol.name}`, ready: Boolean(symbol.src) });
  }
  const poses = ['idle', 'winBig', 'bonusEntry', 'wincap'];
  for (const pose of poses) {
    targets.push({ key: `characterPose:${pose}`, slot: 'characterPose', target: pose, label: `Character · ${pose}`, ready: Boolean(project.theme?.character?.poses?.[pose]) });
  }
  return targets;
}

function targetDirection(project, selected) {
  if (selected.slot === 'symbol') {
    const symbol = (project.theme?.symbols || []).find(item => item.name === selected.target || item.id === selected.target);
    const special = symbol?.special?.length ? `It is the exclusive ${symbol.special.join(' and ')} symbol.` : `It belongs to the ${symbol?.tier || 'medium'} value tier.`;
    return `${special} Give it a silhouette and internal negative-space pattern distinct from every other reel symbol.`;
  }
  if (selected.slot === 'characterPose') return `This is the ${selected.target} performance beat. Preserve character anatomy, costume seams, face structure and prop scale exactly; change acting and gesture, not identity.`;
  if (selected.slot === 'background') return 'Establish the complete world and motif vocabulary here; reserve a calm, high-contrast central gameplay zone.';
  if (selected.slot === 'foreground') return 'Reuse the world materials and motifs at larger scale around the edges; never cover the central reels or core controls.';
  return 'Reduce the recurring motif into a simple, unmistakable mark that remains legible at very small tile size.';
}

export function compileArtDirection(project, selected) {
  const factory = normalizeVisualFactoryState(project);
  const bible = factory.artBible;
  const status = getVisualCohesionStatus(project);
  if (!status.ready) throw new Error(status.validation.issues[0] || 'Lock the current Art Direction Bible before generating assets.');
  const references = getApplicableVisualReferences(project, selected);
  return {
    fingerprint: status.currentFingerprint,
    references,
    text: [
      `ART BIBLE ${status.currentFingerprint}. WORLD: ${bible.concept}`,
      `MEDIUM: ${bible.medium}. SHAPES: ${bible.shapeLanguage}.`,
      `LIGHTING: ${bible.lighting}. MATERIALS: ${bible.materials}.`,
      `PALETTE: ${bible.palette}. RECURRING MOTIFS: ${bible.motifs}.`,
      `CHARACTER IDENTITY LOCK: ${bible.characterIdentity}. SYMBOL SYSTEM: ${bible.symbolGrammar}.`,
      `FORBIDDEN: ${bible.forbidden}.`,
      `ASSET-SPECIFIC CONTRACT: ${targetDirection(project, selected)}`,
      references.length ? `REFERENCE CONTRACT: ${references.map((reference, index) => `image ${index + 1} is the approved ${VISUAL_REFERENCE_ROLES[reference.role].toLowerCase()} named ${reference.name}`).join('; ')}. Preserve identity, material construction, palette relationships and authored shape language from these images without copying their framing.` : '',
      'Treat every sentence above as a locked cross-asset continuity rule, not a suggestion.',
    ].filter(Boolean).join(' '),
  };
}

export function getVisualCohesionStatus(project) {
  const factory = normalizeVisualFactoryState(project);
  const validation = validateArtBible(factory.artBible);
  const currentFingerprint = artBibleFingerprint(factory.artBible);
  const lockedFingerprint = factory.artBible.lockedFingerprint || null;
  const records = Object.values(factory.assignments || {});
  const generatedRecords = records.filter(record => record.format === 'stake-studio-generated-visual-v1');
  // Local pixel analysis has role-specific contracts for these production
  // slots. Full-frame presentation plates are intentionally opaque and are
  // certified by presentation/integrity QA instead of symbol-style analysis.
  const automatedQaSlots = new Set(['background', 'foreground', 'symbol', 'characterPose', 'providerLogo']);
  const automatedQaRecords = generatedRecords.filter(record => automatedQaSlots.has(record.slot));
  const automatedQaFailed = automatedQaRecords.filter(record => record.analysis?.format !== 'stake-studio-visual-analysis-v1' || record.analysis.passed !== true);
  const driftedAssignments = records.filter(record => record.coherenceFingerprint && record.coherenceFingerprint !== currentFingerprint);
  const approvedReferences = factory.references.filter(reference => reference.approved);
  const driftedReferences = approvedReferences.filter(reference => reference.bibleFingerprint !== currentFingerprint);
  return {
    validation,
    currentFingerprint,
    lockedFingerprint,
    locked: Boolean(lockedFingerprint),
    bibleDrift: Boolean(lockedFingerprint && lockedFingerprint !== currentFingerprint),
    driftedAssignments,
    approvedReferences: approvedReferences.length,
    driftedReferences,
    generatedAssignments: records.length,
    automatedQaPassed: automatedQaRecords.length - automatedQaFailed.length,
    automatedQaFailed,
    ready: validation.valid && Boolean(lockedFingerprint) && lockedFingerprint === currentFingerprint && driftedReferences.length === 0,
  };
}

export function recordVisualAnalysis(project, result, analysis) {
  if (!result?.dataUrl) throw new Error('A visual candidate is required for analysis.');
  if (analysis?.format !== 'stake-studio-visual-analysis-v1') throw new Error('A valid local visual QA report is required.');
  result.analysis = analysis;
  const factory = normalizeVisualFactoryState(project);
  factory.latest = result;
  return analysis;
}

const VISUAL_REPAIR_DIRECTIONS = Object.freeze({
  resolution: 'Render at the exact production dimensions with no post-upscale softness.',
  payload: 'Simplify invisible detail and avoid wasteful texture noise while preserving the focal forms.',
  alpha: 'Isolate the subject on true transparent alpha; no opaque backdrop, checkerboard, matte color, or edge-to-edge fill.',
  subject: 'Create one complete, clearly visible subject with an unmistakable silhouette.',
  'matte-fringe': 'Remove all magenta contamination, colored fringe, glow, fog, and reflected matte color from the alpha edge.',
  'opaque-canvas': 'Fill every background pixel with finished opaque environment art and leave no transparent holes.',
  framing: 'Reframe the full silhouette with deliberate transparent breathing room on every edge; do not crop extremities.',
  'center-clearance': 'Move every foreground ornament to the outer frame and leave the entire central reel window transparent and unobstructed.',
  'thumbnail-contrast': 'Increase large-scale value separation and simplify internal forms so the asset reads instantly at 96 pixels.',
  'reel-readability': 'Calm and darken the central gameplay zone; move sharp detail and brightest contrast toward the outer environment.',
  palette: 'Rebalance shadows, materials, key light, and accents toward the locked Art Bible palette without flattening natural variation.',
  'reference-continuity': 'Match the approved references more closely in dominant color mass, tonal hierarchy, material response, and silhouette language.',
});

export function createVisualCorrectionPlan(result) {
  if (result?.analysis?.format !== 'stake-studio-visual-analysis-v1') throw new Error('Run local visual QA before preparing a correction.');
  const failures = (result.analysis.checks || []).filter(item => !item.passed);
  if (!failures.length) throw new Error('This candidate has no failed visual QA checks to correct.');
  const directions = [...new Set(failures.map(item => VISUAL_REPAIR_DIRECTIONS[item.id]).filter(Boolean))];
  const targetKey = ['symbol', 'characterPose'].includes(result.slot) && result.target ? `${result.slot}:${result.target}` : result.slot;
  return {
    format: 'stake-studio-visual-correction-v1',
    attempt: Number(result.correction?.attempt || 0) + 1,
    sourceFilename: result.filename || null,
    sourceScore: result.analysis.score,
    targetKey,
    issueIds: failures.map(item => item.id),
    direction: [
      `CORRECTION PASS ${Number(result.correction?.attempt || 0) + 1}. Preserve the approved concept, identity, composition intent, and Art Bible lineage from the prior candidate.`,
      ...directions,
      'Correct only these diagnosed failures; do not introduce text, logos, UI, extra subjects, or a different rendering style.',
    ].join(' '),
  };
}

function invalidateVisualApprovals(project) {
  project.production ||= {};
  project.production.qa ||= {};
  project.production.qa.visualCohesionAudit = null;
  project.production.qa.assetIntegrityVerified = false;
}

function atlasAsset(project, name, result) {
  project.atlas ||= { assets: [], packed: null, padding: 2, maxSize: 2048 };
  project.atlas.assets ||= [];
  const value = { name, src: result.dataUrl, width: result.width, height: result.height };
  const index = project.atlas.assets.findIndex(asset => asset.name === name);
  if (index >= 0) project.atlas.assets[index] = value;
  else project.atlas.assets.push(value);
  project.atlas.packed = null;
}

export function assignGeneratedVisual(project, result) {
  if (!result?.dataUrl?.startsWith('data:image/png;base64,')) throw new Error('A generated PNG result is required.');
  if (result.format === 'stake-studio-generated-visual-v1' && result.analysis?.passed !== true) {
    const blocker = result.analysis?.blockers?.[0]?.name;
    throw new Error(blocker ? `Local visual QA blocked assignment: ${blocker}.` : 'Run local visual QA and pass every blocker before assigning generated art.');
  }
  project.theme ||= {};
  project.theme.submission ||= {};
  project.theme.symbols ||= [];
  project.theme.cabinet ||= { layers: [], width: 1280, height: 800 };
  project.theme.cabinet.layers ||= [];
  const { slot, target } = result;
  let assignmentKey = slot;
  if (slot === 'symbol') {
    const symbol = project.theme.symbols.find(item => item.name === target || item.id === target);
    if (!symbol) throw new Error(`No symbol target "${target}" exists.`);
    symbol.src = result.dataUrl;
    assignmentKey = `symbol:${symbol.name}`;
    atlasAsset(project, symbol.name, result);
  } else if (slot === 'characterPose') {
    project.theme.character ||= { poses: {}, placement: { x: 30, y: 60, width: 360, height: 620 } };
    project.theme.character.poses ||= {};
    project.theme.character.poses[target] = result.dataUrl;
    assignmentKey = `characterPose:${target}`;
    atlasAsset(project, `character-${target}`, result);
  } else if (slot === 'background' || slot === 'foreground') {
    const cabinet = project.theme.cabinet;
    const next = {
      id: globalThis.crypto?.randomUUID?.() || `visual-${Date.now()}-${slot}`,
      name: slot === 'background' ? 'Background' : 'Foreground', type: 'image', src: result.dataUrl,
      x: 0, y: 0, width: cabinet.width, height: cabinet.height, opacity: 1,
      zIndex: slot === 'background' ? 0 : 20, visible: true, locked: slot === 'background',
      effects: [], blendMode: 'normal', assetPackRole: slot,
    };
    const index = cabinet.layers.findIndex(layer => layer.assetPackRole === slot);
    if (index >= 0) next.id = cabinet.layers[index].id;
    if (index >= 0) cabinet.layers[index] = next;
    else cabinet.layers.push(next);
    project.theme.submission[slot] = result.dataUrl;
  } else if (slot === 'providerLogo') {
    project.theme.submission.providerLogo = result.dataUrl;
  } else throw new Error(`Unsupported visual slot "${slot}".`);

  const factory = normalizeVisualFactoryState(project);
  const safeRecord = Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'dataUrl' && key !== 'prompt'));
  const assignedAt = new Date().toISOString();
  factory.history = [{ ...safeRecord, assignmentKey, assignedAt }, ...factory.history].slice(0, 50);
  factory.assignments[assignmentKey] = { ...safeRecord, assignmentKey, assignedAt };
  factory.latest = { ...result, assignedAt };
  invalidateVisualApprovals(project);
  return { slot, target: target || null, assignmentKey, invalidated: ['packed texture atlas', 'visual cohesion audit', 'asset integrity approval'] };
}

export function createArtDirectionManifest(project) {
  const factory = normalizeVisualFactoryState(project);
  const status = getVisualCohesionStatus(project);
  return {
    format: 'stake-studio-art-direction-v1',
    bible: factory.artBible,
    status: {
      valid: status.validation.valid, currentFingerprint: status.currentFingerprint,
      lockedFingerprint: status.lockedFingerprint, bibleDrift: status.bibleDrift,
      generatedAssignments: status.generatedAssignments,
      driftedAssignments: status.driftedAssignments.map(item => item.assignmentKey),
      approvedReferences: status.approvedReferences,
      driftedReferences: status.driftedReferences.map(item => item.id),
      automatedQaPassed: status.automatedQaPassed,
      automatedQaFailed: status.automatedQaFailed.map(item => item.assignmentKey),
    },
    references: factory.references.map(({ src, ...reference }) => reference),
    assignments: factory.assignments,
  };
}
