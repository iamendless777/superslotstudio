import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createGameProject } from '../src/engines/schema.js';
import {
  artBibleFingerprint,
  addVisualReference,
  approveVisualReference,
  assignGeneratedVisual,
  compileArtDirection,
  createArtDirectionManifest,
  createVisualCorrectionPlan,
  forgeArtBible,
  getApplicableVisualReferences,
  getVisualCohesionStatus,
  getVisualFactoryTargets,
  lockArtBible,
  normalizeVisualFactoryState,
  recordVisualAnalysis,
  validateArtBible,
} from '../src/engines/assets/VisualAssetFactory.js';
import {
  buildGenerationPrompt,
  createVisualAssetFactory,
  VISUAL_MODEL,
} from '../server/visual-asset-factory.mjs';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

test('visual prompts enforce matte and composition contracts by slot', () => {
  const symbol = buildGenerationPrompt({ slot: 'symbol', target: 'W', direction: 'obsidian occult engraving', detail: 'horned coin' });
  assert.match(symbol, /#FF00FF/);
  assert.match(symbol, /thumbnail size/);
  const background = buildGenerationPrompt({ slot: 'background', direction: 'frozen cathedral' });
  assert.match(background, /opaque finished environment/);
  assert.doesNotMatch(background, /#FF00FF/);
});

test('theme forging creates a complete genre-aware art bible', () => {
  const project = createGameProject({ name: 'Frost Oath' });
  project.theme.style = 'frozen Norse dark fantasy';
  project.theme.lore = 'A fallen valkyrie escorts doomed captains through an aurora-lit battlefield.';
  const bible = forgeArtBible(project);
  assert.equal(validateArtBible(bible).valid, true);
  assert.match(bible.materials, /frosted steel/);
  assert.match(bible.shapeLanguage, /spear points/);
  assert.match(bible.forbidden, /generic casino clip-art/);
});

test('locked bible compiles a deterministic target prompt and detects later drift', () => {
  const project = createGameProject({ name: 'Lineage QA' });
  project.visualFactory.artBible = forgeArtBible(project);
  const fingerprint = lockArtBible(project);
  assert.equal(fingerprint, artBibleFingerprint(project.visualFactory.artBible));
  const selected = getVisualFactoryTargets(project).find(target => target.key === 'symbol:W');
  const compiled = compileArtDirection(project, selected);
  assert.equal(compiled.fingerprint, fingerprint);
  assert.match(compiled.text, /exclusive wild symbol/);
  assert.match(compiled.text, /locked cross-asset continuity rule/);
  project.visualFactory.artBible.lighting = 'flat midday light';
  const status = getVisualCohesionStatus(project);
  assert.equal(status.bibleDrift, true);
  assert.equal(status.ready, false);
  assert.throws(() => compileArtDirection(project, selected), /Lock the current Art Direction Bible/);
});

test('approved reference anchors route by target role and become stale after bible changes', () => {
  const project = createGameProject({ name: 'Reference QA' });
  project.visualFactory.artBible = forgeArtBible(project);
  lockArtBible(project);
  const style = addVisualReference(project, { name: 'World Board', role: 'style', src: dataUrl, width: 1200, height: 800 });
  const character = addVisualReference(project, { name: 'Hero Master', role: 'character', src: dataUrl, width: 800, height: 1200 });
  approveVisualReference(project, style.id);
  approveVisualReference(project, character.id);
  const poseTarget = getVisualFactoryTargets(project).find(target => target.key === 'characterPose:idle');
  assert.deepEqual(getApplicableVisualReferences(project, poseTarget).map(reference => reference.name), ['Hero Master', 'World Board']);
  const symbolTarget = getVisualFactoryTargets(project).find(target => target.key === 'symbol:H1');
  assert.deepEqual(getApplicableVisualReferences(project, symbolTarget).map(reference => reference.name), ['World Board']);
  project.visualFactory.artBible.materials += ', bone';
  lockArtBible(project);
  const status = getVisualCohesionStatus(project);
  assert.equal(status.ready, false);
  assert.equal(status.driftedReferences.length, 2);
  assert.deepEqual(getApplicableVisualReferences(project, poseTarget), []);
  approveVisualReference(project, character.id);
  assert.equal(getApplicableVisualReferences(project, poseTarget)[0].name, 'Hero Master');
});

test('server factory makes exactly one image request and persists safe provenance', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stake-visual-factory-'));
  let request;
  try {
    const factory = createVisualAssetFactory({
      studioHome: root,
      apiKey: 'test-key-never-logged',
      now: () => Date.parse('2026-08-02T12:00:00.000Z'),
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) };
      },
    });
    const result = await factory.generate({ projectId: 'visual_qa', slot: 'background', direction: 'premium arctic temple', quality: 'concept', coherenceFingerprint: '12abcdef' });
    const body = JSON.parse(request.options.body);
    assert.equal(request.url, 'https://api.openai.com/v1/images/generations');
    assert.equal(body.model, VISUAL_MODEL);
    assert.equal(body.n, 1);
    assert.equal(body.quality, 'low');
    assert.equal(result.dataUrl, dataUrl);
    assert.equal(result.coherenceFingerprint, '12abcdef');
    const output = join(root, 'games', 'visual_qa', result.relativePath);
    assert.ok(existsSync(output));
    assert.deepEqual(readFileSync(output), png);
    const metadata = JSON.parse(readFileSync(`${output}.json`, 'utf8'));
    assert.equal(metadata.model, VISUAL_MODEL);
    assert.equal(JSON.stringify(metadata).includes('test-key-never-logged'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('transparent slots pass through offline processing before persistence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stake-visual-alpha-'));
  let processed = 0;
  try {
    const factory = createVisualAssetFactory({
      studioHome: root, apiKey: 'test-key',
      fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) }),
      processPng: buffer => { processed++; return buffer; },
    });
    const result = await factory.generate({ projectId: 'visual_qa', slot: 'symbol', target: 'H1', direction: 'golden relic', quality: 'review' });
    assert.equal(processed, 1);
    assert.equal(result.matteRemoved, true);
    assert.equal(result.qualityProfile, 'review');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reference-guided generation uses one multipart edit request with bounded image inputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stake-visual-reference-'));
  let request;
  try {
    const factory = createVisualAssetFactory({
      studioHome: root, apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) };
      },
    });
    const references = [
      { id: 'style-1', name: 'World Board', role: 'style', src: dataUrl, imageFingerprint: '12abcdef' },
      { id: 'hero-1', name: 'Hero Master', role: 'character', src: dataUrl, imageFingerprint: '34abcdef' },
    ];
    const result = await factory.generate({ projectId: 'visual_qa', slot: 'background', direction: 'frozen citadel', quality: 'review', references });
    assert.equal(request.url, 'https://api.openai.com/v1/images/edits');
    assert.ok(request.options.body instanceof FormData);
    assert.equal(request.options.body.get('model'), VISUAL_MODEL);
    assert.equal(request.options.body.get('quality'), 'medium');
    assert.equal(request.options.body.getAll('image[]').length, 2);
    assert.equal(request.options.headers['Content-Type'], undefined);
    assert.equal(result.referenceMode, 'high-fidelity-edit');
    assert.deepEqual(result.references.map(reference => reference.id), ['style-1', 'hero-1']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('approved candidates bind to production slots and invalidate visual audit evidence', () => {
  const project = createGameProject({ name: 'Visual QA' });
  project.production.qa.visualCohesionAudit = { format: 'old-report' };
  project.production.qa.assetIntegrityVerified = true;
  const factory = normalizeVisualFactoryState(project);
  factory.latest = { slot: 'symbol', target: 'H1', dataUrl, width: 1024, height: 1024, filename: 'symbol-H1.png', coherenceFingerprint: '12abcdef' };
  const assigned = assignGeneratedVisual(project, factory.latest);
  assert.equal(assigned.slot, 'symbol');
  assert.equal(project.theme.symbols.find(symbol => symbol.name === 'H1').src, dataUrl);
  assert.equal(project.atlas.assets.find(asset => asset.name === 'H1').src, dataUrl);
  assert.equal(project.production.qa.visualCohesionAudit, null);
  assert.equal(project.production.qa.assetIntegrityVerified, false);
  assert.equal(project.visualFactory.history.length, 1);
  assert.equal('dataUrl' in project.visualFactory.history[0], false);
  assert.equal(project.visualFactory.assignments['symbol:H1'].coherenceFingerprint, '12abcdef');
  assert.ok(getVisualFactoryTargets(project).find(target => target.key === 'symbol:H1').ready);
});

test('generated candidates cannot bypass deterministic visual QA', () => {
  const project = createGameProject({ name: 'Generated Gate QA' });
  const result = {
    format: 'stake-studio-generated-visual-v1',
    slot: 'symbol', target: 'H1', dataUrl, width: 1024, height: 1024,
  };
  assert.throws(() => assignGeneratedVisual(project, result), /Run local visual QA/);
  recordVisualAnalysis(project, result, {
    format: 'stake-studio-visual-analysis-v1', score: 100, passed: true,
    blockers: [], warnings: [], checks: [], metrics: {},
  });
  assert.equal(assignGeneratedVisual(project, result).assignmentKey, 'symbol:H1');
  assert.equal(getVisualCohesionStatus(project).automatedQaPassed, 1);
});

test('failed visual checks compile a corrective prompt without spending or changing art', () => {
  const result = {
    slot: 'foreground', target: null, filename: 'foreground.png', dataUrl,
    analysis: {
      format: 'stake-studio-visual-analysis-v1', score: 65, passed: false,
      checks: [
        { id: 'center-clearance', passed: false },
        { id: 'matte-fringe', passed: false },
        { id: 'palette', passed: false },
      ],
    },
  };
  const plan = createVisualCorrectionPlan(result);
  assert.equal(plan.format, 'stake-studio-visual-correction-v1');
  assert.equal(plan.targetKey, 'foreground');
  assert.equal(plan.attempt, 1);
  assert.match(plan.direction, /central reel window transparent/);
  assert.match(plan.direction, /magenta contamination/);
  assert.match(plan.direction, /locked Art Bible palette/);
  assert.equal(result.dataUrl, dataUrl);
});

test('release manifest identifies generated assets from an older bible', () => {
  const project = createGameProject({ name: 'Drift QA' });
  project.visualFactory.artBible = forgeArtBible(project);
  const original = lockArtBible(project);
  assignGeneratedVisual(project, { slot: 'symbol', target: 'H1', dataUrl, width: 1024, height: 1024, coherenceFingerprint: original });
  project.visualFactory.artBible.materials += ', ivory';
  lockArtBible(project);
  const manifest = createArtDirectionManifest(project);
  assert.equal(manifest.status.bibleDrift, false);
  assert.deepEqual(manifest.status.driftedAssignments, ['symbol:H1']);
});

test('background assignment updates cabinet and Stake submission art together', () => {
  const project = createGameProject();
  assignGeneratedVisual(project, { slot: 'background', target: null, dataUrl, width: 1536, height: 1024 });
  assert.equal(project.theme.submission.background, dataUrl);
  assert.equal(project.theme.cabinet.layers.find(layer => layer.assetPackRole === 'background').src, dataUrl);
});
