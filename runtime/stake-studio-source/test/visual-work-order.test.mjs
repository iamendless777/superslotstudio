import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameProject } from '../src/engines/schema.js';
import { forgeArtBible, lockArtBible } from '../src/engines/assets/VisualAssetFactory.js';
import {
  VISUAL_PROVIDER_CONTRACT,
  VISUAL_WORK_ORDER_FORMAT,
  createVisualWorkOrder,
  getVisualWorkOrderStatus,
} from '../src/engines/assets/VisualWorkOrder.js';

function directedProject() {
  const project = createGameProject({ name: 'Frost Oath' });
  project.theme.style = 'premium frozen dark fantasy';
  project.theme.lore = 'A valkyrie judges a doomed captain beneath a fractured aurora.';
  project.build.stakeEngine.providerName = 'Northstar Games';
  project.visualFactory.artBible = forgeArtBible(project);
  lockArtBible(project);
  return project;
}

test('free visual work order is a complete provider-neutral production contract', () => {
  const project = directedProject();
  const before = JSON.stringify(project.theme);
  const order = createVisualWorkOrder(project, { quality: 'review', maxAttempts: 2 });

  assert.equal(order.format, VISUAL_WORK_ORDER_FORMAT);
  assert.equal(order.provider.active, 'codex-handoff');
  assert.equal(VISUAL_PROVIDER_CONTRACT.adapters.find(adapter => adapter.id === 'openai-api').availability, 'optional');
  assert.equal(order.items.length, 3 + project.theme.symbols.length + 4);
  assert.equal(order.productionOrder.length, order.items.length);
  assert.deepEqual(order.productionOrder.slice(0, 3), ['background', 'characterPose:idle', 'symbol:H1']);
  assert.equal(order.items.find(item => item.key === 'background').output.filename, 'background.png');
  assert.equal(order.items.find(item => item.key === 'background').output.transparent, false);
  assert.equal(order.items.find(item => item.key === 'foreground').output.transparent, true);
  assert.equal(order.items.find(item => item.key === 'characterPose:winBig').output.filename, 'character_win_big.png');
  assert.equal(order.items.find(item => item.key === 'symbol:H1').output.filename, 'h1.png');
  assert.match(order.items[0].prompt, /exactly 1536x1024 pixels/);
  assert.deepEqual(order.items.find(item => item.key === 'symbol:H2').requiredGeneratedReferences, ['background', 'symbol:H1']);
  assert.match(order.delivery.instructions, /exact output filenames/);
  assert.equal(JSON.stringify(project.theme), before);
  assert.equal(getVisualWorkOrderStatus(project).current, true);
});

test('work order becomes stale when its locked visual lineage changes', () => {
  const project = directedProject();
  createVisualWorkOrder(project);
  project.visualFactory.artBible.materials += ', carved bone';
  const status = getVisualWorkOrderStatus(project);
  assert.equal(status.stale, true);
  assert.match(status.reason, /Art Direction Bible changed/);
});

test('work order refuses an unlocked visual direction', () => {
  const project = createGameProject({ name: 'Unlocked' });
  assert.throws(() => createVisualWorkOrder(project), /Lock the Art Direction Bible/);
});

test('protected decisions and existing art never enter the free generation queue', () => {
  const project = directedProject();
  project.build.stakeEngine.providerName = '';
  project.theme.submission ||= {};
  project.theme.submission.background = 'data:image/png;base64,existing';
  const order = createVisualWorkOrder(project);
  assert.equal(order.items.find(item => item.key === 'background').action, 'preserve');
  assert.equal(order.items.find(item => item.key === 'providerLogo').action, 'hold');
  assert.equal(order.productionOrder.includes('background'), false);
  assert.equal(order.productionOrder.includes('providerLogo'), false);
  const protectedFingerprint = order.fingerprint;
  project.build.stakeEngine.providerName = 'Northstar Games';
  const stale = getVisualWorkOrderStatus(project);
  assert.equal(stale.stale, true);
  assert.match(stale.reason, /production decisions changed/);
  const unprotectedOrder = createVisualWorkOrder(project, { replan: true });
  assert.notEqual(unprotectedOrder.fingerprint, protectedFingerprint);
});
