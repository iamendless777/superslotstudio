import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyHumanVisualDecision,
  getVisualExcellencePanelModel,
  renderVisualExcellenceDepartment,
} from '../src/editor/quality/QualityPanel.js';

function projectWithVisualExcellence(visualExcellence) {
  return { production: { workflow: { visualExcellence } } };
}

test('legacy projects receive a safe Visual Excellence empty state', () => {
  const model = getVisualExcellencePanelModel({ production: { workflow: {} } });
  assert.equal(model.configured, false);
  assert.deepEqual(model.roles.map(role => role.id), ['presentation', 'visual', 'motion_vfx']);
  assert.equal(model.humanSignoff.approved, false);
  assert.match(model.nextAction, /Initialize the Visual Excellence Department/);

  const html = renderVisualExcellenceDepartment({});
  assert.match(html, /Department not initialized for this project/);
  assert.match(html, /Human final visual sign-off/);
});

test('the Quality surface reads the exact department contract and preserves authority boundaries', () => {
  const project = projectWithVisualExcellence({
    format: 'stake-studio-visual-excellence-v1',
    status: 'in-production',
    roles: {
      presentation: { label: 'Visual Director', agentId: 'director-7', authority: 'review' },
      visual: { label: 'Composition & Asset Specialist', agentId: 'composition-4', authority: 'delivery' },
      motion_vfx: { label: 'Motion & VFX Specialist', agentId: 'motion-9', authority: 'delivery' },
    },
    briefs: [
      { id: 'tile-link', title: 'Tile connection choreography', type: 'tile-connections', status: 'in-production' },
      { id: 'tumble', title: 'Tumble physicality', type: 'tumble', status: 'director-approved' },
    ],
    deliveries: [
      { id: 'tile-layout', label: 'Tile anchor map', specialistRole: 'visual', status: 'accepted' },
      { id: 'tile-motion', label: 'Tile connection motion', specialistRole: 'motion_vfx', status: 'submitted' },
    ],
    reviews: [
      { id: 'review-layout', deliveryId: 'tile-layout', title: 'Anchor map review', reviewerRole: 'presentation', verdict: 'approve' },
    ],
    humanSignoff: { status: 'pending', required: true },
    nextAction: { type: 'review', briefId: 'tile-link', role: 'presentation', reason: 'Review the rendered tile-link pass.' },
  });

  const model = getVisualExcellencePanelModel(project);
  assert.equal(model.configured, true);
  assert.deepEqual(model.pendingBriefs.map(brief => brief.id), ['tile-link']);
  assert.equal(model.directorReviews[0].verdict, 'approve');
  assert.equal(model.invalidSelfApprovals.length, 0);
  assert.equal(model.humanSignoff.approved, false);
  assert.equal(model.nextAction, 'Visual Director: Review the rendered tile-link pass.');

  const html = renderVisualExcellenceDepartment(project);
  assert.match(html, /director-7/);
  assert.match(html, /composition-4/);
  assert.match(html, /motion-9/);
  assert.match(html, /1 pending/);
  assert.match(html, /Human required/);
  assert.match(html, /btnApproveVisual/);
  assert.match(html, /data-human-visual-brief/);
  assert.doesNotMatch(html, /id="btnApproveSpecialist"|data-specialist-approve/i, 'the surface must not expose specialist approval controls');
});

test('human-only controls record selected Director-approved briefs and invalidate certification', () => {
  const project = {
    production: {
      qa: { gameCertification: { status: 'complete' } },
      workflow: {
        visualExcellence: {
          format: 'stake-studio-visual-excellence-v1',
          briefs: [
            { id: 'tile-link', type: 'tile-connections', title: 'Tile links', status: 'director-approved' },
            { id: 'tumble', type: 'tumble', title: 'Tumble', status: 'director-approved' },
          ],
          humanSignoff: { status: 'required', decidedBy: '', decidedAt: null, notes: '', briefIds: [] },
        },
      },
    },
  };
  const decision = applyHumanVisualDecision(project, {
    status: 'approved', decidedBy: 'Human Reviewer', notes: 'Reviewed in Preview.', briefIds: ['tile-link', 'tumble'],
  });
  assert.equal(decision.status, 'approved');
  assert.equal(decision.decidedBy, 'Human Reviewer');
  assert.deepEqual(decision.briefIds, ['tile-link', 'tumble']);
  assert.equal(project.production.qa.gameCertification, null);
  assert.deepEqual(project.production.workflow.visualExcellence.briefs.map(brief => brief.status), ['human-approved', 'human-approved']);
  const html = renderVisualExcellenceDepartment(project);
  assert.match(html, /Signed off/);
  assert.doesNotMatch(html, /btnApproveVisual/);
});

test('specialist self-approval is surfaced as a governance conflict, never accepted silently', () => {
  const project = projectWithVisualExcellence({
    format: 'stake-studio-visual-excellence-v1',
    briefs: [],
    deliveries: [{ id: 'motion-pass', title: 'Motion pass', specialistRole: 'motion_vfx', status: 'accepted' }],
    reviews: [{ id: 'motion-review', deliveryId: 'motion-pass', reviewerRole: 'motion_vfx', verdict: 'approve' }],
    humanSignoff: { status: 'required' },
  });
  const model = getVisualExcellencePanelModel(project);
  assert.equal(model.invalidSelfApprovals.length, 1);
  assert.match(renderVisualExcellenceDepartment(project), /Approval authority conflict/);
});

test('department-provided text is escaped before it reaches the Quality surface', () => {
  const project = projectWithVisualExcellence({
    format: 'stake-studio-visual-excellence-v1',
    briefs: [{ id: 'unsafe', title: '<img src=x onerror=alert(1)>', status: 'draft' }],
    nextAction: { role: 'presentation', reason: '<script>unsafe()</script>' },
  });
  const html = renderVisualExcellenceDepartment(project);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
