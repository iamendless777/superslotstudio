import assert from 'node:assert/strict';
import test from 'node:test';
import { CUE_BRIDGE, resolveCueBridge } from './MotionCueHost.js';

test('unknown cue warns via null instead of throwing', () => {
  assert.equal(resolveCueBridge('not.a.real.cue'), null);
  assert.throws(() => resolveCueBridge('not.a.real.cue', { strict: true }), /No bridge target/);
});

test('symbol.dropIn is not mapped to spinStart', () => {
  assert.equal(CUE_BRIDGE['symbol.dropIn'].animState, null);
});

test('reel.stop reveal is listed but rehearsal must gate presentation events', () => {
  assert.equal(CUE_BRIDGE['reel.stop'].presentationEvent, 'reveal');
});

test('win and shake never carry presentation events', () => {
  assert.equal(CUE_BRIDGE['win.pulse'].presentationEvent, null);
  assert.equal(CUE_BRIDGE['board.shake'].presentationEvent, null);
});
