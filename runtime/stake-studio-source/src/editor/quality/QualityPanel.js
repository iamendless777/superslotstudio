import {
  QualityDirector,
  QUALITY_CATEGORIES,
  applyProfessionalDefaults,
  normalizeProductionProfile,
} from '../../engines/quality/QualityDirector.js';
import { getProjectSpineMotionReview } from '../../engines/animation/SpineMotionReview.js';
import { getProjectRigCertificationSummary } from '../../engines/quality/RigCertificationQA.js';
import { getVisualCohesionQASummary } from '../../engines/quality/VisualCohesionQA.js';
import { getGameCertificationSummary } from '../../engines/quality/GameCertificationQA.js';
import {
  applyCreativeConcept,
  generateOfflineConcepts,
  getCreativeProviderStatus,
  normalizeCreativeDirectorState,
} from '../../engines/creative/CreativeDirector.js';
import { recordHumanVisualSignoff } from '../../engines/factory/VisualExcellenceDepartment.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const visualList = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
const visualText = value => String(value ?? '').trim();
const visualStatus = value => visualText(value).toLowerCase().replace(/[\s_]+/g, '-');
const visualStatusComplete = value => [
  'accepted', 'approve', 'approved', 'complete', 'completed', 'closed', 'director-approved', 'human-approved',
].includes(visualStatus(value));

const VISUAL_EXCELLENCE_ROLES = Object.freeze([
  Object.freeze({
    id: 'presentation', aliases: ['presentation', 'visual_director', 'visual-director', 'director'],
    label: 'Visual Director', responsibility: 'Directs hierarchy, choreography, intensity and rendered review.',
  }),
  Object.freeze({
    id: 'visual', aliases: ['visual', 'composition', 'composition_asset', 'composition-asset'],
    label: 'Composition & Asset Specialist', responsibility: 'Owns placement, anchors, layers, masks and responsive composition.',
  }),
  Object.freeze({
    id: 'motion_vfx', aliases: ['motion_vfx', 'motion-vfx', 'motion', 'vfx'],
    label: 'Motion & VFX Specialist', responsibility: 'Owns animation, interactions, tumble motion, impact and recovery.',
  }),
]);

function visualRoleRecord(department, role) {
  const roles = department?.roles;
  if (Array.isArray(roles)) {
    return roles.find(item => role.aliases.includes(visualStatus(item?.id || item?.role || item?.owner))) || {};
  }
  if (roles && typeof roles === 'object') {
    const key = Object.keys(roles).find(item => role.aliases.includes(visualStatus(item)));
    return key ? roles[key] : {};
  }
  return {};
}

function visualItemLabel(item, fallback) {
  return visualText(item?.label || item?.title || item?.name || item?.objective || item?.id) || fallback;
}

function visualItemStatus(item, fallback = 'pending') {
  return visualStatus(item?.status || item?.verdict || item?.state || fallback) || fallback;
}

function visualStatusTone(value) {
  const status = visualStatus(value);
  if (visualStatusComplete(status)) return 'complete';
  if (['block', 'blocked', 'failed', 'rejected', 'revise', 'revision-required', 'changes-requested'].includes(status)) return 'blocked';
  if (['claimed', 'in-progress', 'rendered', 'submitted', 'in-review', 'ready-for-review', 'reviewing'].includes(status)) return 'active';
  return 'pending';
}

function visualNextAction(department, { configured, pendingBriefs, deliveries, directorReviews, humanSignoff }) {
  const explicit = department?.nextAction;
  const explicitText = visualText(typeof explicit === 'object'
    ? explicit.reason || explicit.label || explicit.description || explicit.action || explicit.message || explicit.type
    : explicit);
  if (explicitText) {
    const role = visualText(explicit?.role);
    const label = VISUAL_EXCELLENCE_ROLES.find(item => item.aliases.includes(visualStatus(role)))?.label || role;
    return label ? `${label}: ${explicitText}` : explicitText;
  }
  if (!configured) return 'Initialize the Visual Excellence Department for this project.';
  if (pendingBriefs.length) return `Visual Director: resolve or assign “${visualItemLabel(pendingBriefs[0], 'the next visual brief')}”.`;
  const openDelivery = deliveries.find(item => !visualStatusComplete(visualItemStatus(item)));
  if (openDelivery) return `${visualItemLabel(openDelivery, 'Specialist delivery')}: finish the assigned specialist delivery.`;
  const reviewedDeliveryIds = new Set(directorReviews
    .filter(item => visualStatusComplete(visualItemStatus(item)))
    .map(item => visualText(item.deliveryId || item.delivery || item.workItemId)).filter(Boolean));
  const unreviewed = deliveries.find(item => {
    const id = visualText(item.id || item.deliveryId || item.workItemId);
    return visualStatusComplete(visualItemStatus(item)) && (!id || !reviewedDeliveryIds.has(id));
  });
  if (unreviewed) return `Visual Director: review “${visualItemLabel(unreviewed, 'the specialist delivery')}” in rendered Preview.`;
  if (!humanSignoff.approved) return 'Human final visual sign-off is required after Director approval.';
  return 'Visual department work is approved; preserve Preview and export parity.';
}

export function getVisualExcellencePanelModel(project = {}) {
  const department = project?.production?.workflow?.visualExcellence;
  const configured = Boolean(department && typeof department === 'object' && (
    department.format || department.version || department.enabled === true || department.status
    || department.roles || department.briefs || department.visualBriefs || department.deliveries
    || department.reviews || department.directorReviews
  ));
  const briefs = visualList(department?.briefs || department?.visualBriefs);
  const pendingBriefs = briefs.filter(item => !visualStatusComplete(visualItemStatus(item)) && visualItemStatus(item) !== 'cancelled');
  const deliveries = visualList(department?.deliveries || department?.specialistDeliveries);
  const directorReviews = visualList(department?.directorReviews || department?.reviews);
  const rawHumanSignoff = department?.humanSignoff ?? department?.humanApproval ?? department?.finalSignoff ?? {};
  const humanStatus = typeof rawHumanSignoff === 'boolean'
    ? (rawHumanSignoff ? 'approved' : 'pending')
    : visualItemStatus(rawHumanSignoff, 'pending');
  const humanSignoff = {
    required: typeof rawHumanSignoff === 'object' ? rawHumanSignoff.required !== false : true,
    approved: humanStatus === 'approved' || humanStatus === 'accepted' || rawHumanSignoff?.approved === true,
    status: humanStatus,
    by: visualText(rawHumanSignoff?.decidedBy || rawHumanSignoff?.by || rawHumanSignoff?.approvedBy),
  };
  const roles = VISUAL_EXCELLENCE_ROLES.map((role, index) => {
    const record = visualRoleRecord(department, role);
    return {
      ...role,
      level: index === 0 ? 'director' : 'specialist',
      status: visualItemStatus(record, configured ? 'ready' : 'not-initialized'),
      assignee: visualText(record.assignee || record.agentId || record.agent || record.holder),
    };
  });
  const invalidSelfApprovals = directorReviews.filter(review => {
    if (!['accept', 'accepted', 'approve', 'approved'].includes(visualItemStatus(review))) return false;
    const reviewer = visualStatus(review.reviewerRole || review.reviewer || review.approvedByRole || review.owner);
    return reviewer && !['presentation', 'visual-director', 'director', 'human'].includes(reviewer);
  });
  const model = {
    configured,
    status: visualStatus(department?.status || (configured ? 'ready' : 'not-initialized')),
    roles,
    briefs,
    pendingBriefs,
    deliveries,
    directorReviews,
    humanSignoff,
    invalidSelfApprovals,
  };
  model.nextAction = visualNextAction(department, model);
  return model;
}

function renderVisualWorkList(items, empty, { review = false } = {}) {
  if (!items.length) return `<div class="visual-excellence-empty">${esc(empty)}</div>`;
  return items.slice(0, 6).map(item => {
    const status = visualItemStatus(item);
    const owner = visualText(review
      ? item.reviewerLabel || item.reviewerRole || item.reviewer || item.approvedByRole
      : item.ownerLabel || item.owner || item.role || item.specialistRole || item.specialist);
    return `
      <article class="visual-excellence-work is-${visualStatusTone(status)}">
        <span><strong>${esc(visualItemLabel(item, review ? 'Director review' : 'Visual work'))}</strong>${owner ? `<small>${esc(owner)}</small>` : ''}</span>
        <b>${esc(status.replace(/-/g, ' '))}</b>
      </article>
    `;
  }).join('');
}

export function renderVisualExcellenceDepartment(project = {}) {
  const model = getVisualExcellencePanelModel(project);
  const director = model.roles[0];
  const specialists = model.roles.slice(1);
  const reviewableBriefs = model.briefs.filter(brief => ['director-approved', 'human-approved'].includes(visualItemStatus(brief)));
  const canDecide = reviewableBriefs.length > 0 && !model.humanSignoff.approved;
  return `
    <section class="visual-excellence ${model.configured ? '' : 'is-empty'}">
      <div class="quality-section-heading">
        <div><span>VISUAL OPS</span><h3>Visual Excellence Department</h3></div>
        <p>Director-led composition and motion work, reviewed from rendered output. Specialists deliver; they cannot approve their own work.</p>
      </div>
      ${!model.configured ? `
        <div class="visual-excellence-legacy">
          <strong>Department not initialized for this project</strong>
          <span>Legacy projects remain valid. Initialize the workflow contract when visual production begins.</span>
        </div>
      ` : ''}
      <div class="visual-excellence-hierarchy" aria-label="Visual Excellence Department hierarchy">
        <article class="visual-excellence-role is-director is-${visualStatusTone(director.status)}">
          <span>DIRECTOR / REVIEW AUTHORITY</span><strong>${esc(director.label)}</strong><p>${esc(director.responsibility)}</p>
          <small>${director.assignee ? esc(director.assignee) : esc(director.status.replace(/-/g, ' '))}</small>
        </article>
        <div class="visual-excellence-branch" aria-hidden="true"><i></i><b></b><i></i></div>
        <div class="visual-excellence-specialists">
          ${specialists.map(role => `
            <article class="visual-excellence-role is-specialist is-${visualStatusTone(role.status)}">
              <span>SPECIALIST / DELIVERY AUTHORITY</span><strong>${esc(role.label)}</strong><p>${esc(role.responsibility)}</p>
              <small>${role.assignee ? esc(role.assignee) : esc(role.status.replace(/-/g, ' '))}</small>
            </article>
          `).join('')}
        </div>
      </div>
      <div class="visual-excellence-pipeline" aria-label="Visual production review path">
        <span>Specialist delivery</span><i>→</i><span>Game / Studio implementation</span><i>→</i><span>Render / Preview</span><i>→</i><span>Visual Director review</span><i>→</i><span>Refine</span>
      </div>
      <div class="visual-excellence-operations">
        <article><header><span>BRIEFS</span><strong>${model.pendingBriefs.length} pending</strong></header>${renderVisualWorkList(model.pendingBriefs, 'No pending visual briefs.')}</article>
        <article><header><span>SPECIALIST DELIVERY</span><strong>${model.deliveries.length} tracked</strong></header>${renderVisualWorkList(model.deliveries, 'No specialist deliveries yet.')}</article>
        <article><header><span>DIRECTOR REVIEW</span><strong>${model.directorReviews.length} recorded</strong></header>${renderVisualWorkList(model.directorReviews, 'No rendered work awaiting Director review.', { review: true })}</article>
        <article class="visual-excellence-human ${model.humanSignoff.approved ? 'is-complete' : 'is-pending'}">
          <header><span>FINAL AUTHORITY</span><strong>${model.humanSignoff.approved ? 'Signed off' : 'Human required'}</strong></header>
          <div><b>${model.humanSignoff.approved ? '✓' : 'H'}</b><span><strong>Human final visual sign-off</strong><small>${model.humanSignoff.approved ? `Approved${model.humanSignoff.by ? ` by ${esc(model.humanSignoff.by)}` : ''}.` : 'Director approval is internal to the swarm. The human retains final game and submission approval.'}</small></span></div>
          ${canDecide ? `
            <div class="visual-excellence-human-review" aria-label="Human visual sign-off controls">
              <div class="visual-excellence-human-briefs">
                ${reviewableBriefs.map(brief => `<label><input type="checkbox" data-human-visual-brief value="${esc(brief.id)}" ${visualItemStatus(brief) === 'director-approved' ? 'checked' : ''}><span><strong>${esc(visualItemLabel(brief, brief.id))}</strong><small>${esc(visualItemStatus(brief).replace(/-/g, ' '))}</small></span></label>`).join('')}
              </div>
              <label>Reviewer name<input id="humanVisualReviewer" autocomplete="name" placeholder="Required for the audit record"></label>
              <label>Audit notes<textarea id="humanVisualNotes" rows="3" placeholder="What you approved, or what must change"></textarea></label>
              <div class="visual-excellence-human-actions">
                <button class="btn-small" data-quality-panel="preview">Open Preview</button>
                <button class="btn-secondary" id="btnRejectVisual">Reject selected</button>
                <button class="btn-primary" id="btnApproveVisual">Approve selected</button>
              </div>
              <small class="visual-excellence-human-message" id="humanVisualMessage" aria-live="polite"></small>
            </div>
          ` : ''}
        </article>
      </div>
      ${model.invalidSelfApprovals.length ? `<div class="visual-excellence-governance-error"><strong>Approval authority conflict</strong><span>${model.invalidSelfApprovals.length} specialist approval record${model.invalidSelfApprovals.length === 1 ? '' : 's'} must be replaced by Visual Director review.</span></div>` : ''}
      <div class="visual-excellence-next"><span>NEXT ACTION</span><strong>${esc(model.nextAction)}</strong></div>
    </section>
  `;
}

export function applyHumanVisualDecision(project, input = {}) {
  const workflow = project?.production?.workflow;
  if (!workflow?.visualExcellence) throw new Error('The Visual Excellence Department is not initialized.');
  workflow.visualExcellence = recordHumanVisualSignoff(workflow.visualExcellence, input);
  workflow.updatedAt = new Date().toISOString();
  if (project.production?.qa) project.production.qa.gameCertification = null;
  return workflow.visualExcellence.humanSignoff;
}

export class QualityPanel {
  constructor(container, project, onChange, navigate, certifyGame, repairGame) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.navigate = navigate;
    this.certifyGame = certifyGame;
    this.repairGame = repairGame;
    this.project.production = normalizeProductionProfile(this.project.production);
    this.render();
  }

  render() {
    const audit = new QualityDirector(this.project).audit();
    const production = this.project.production;
    const repairRun = production.qa.repairRun ? {
      ...production.qa.repairRun,
      applied: production.qa.repairRun.applied || [],
      notes: production.qa.repairRun.notes || [],
      deferred: production.qa.repairRun.deferred || [],
    } : null;
    const certification = getGameCertificationSummary(this.project);
    const repairs = certification.repairs;
    const corrections = production.rig.corrections || [];
    const hasSpine = (this.project.animation?.spineAssets || []).length > 0;
    const motionReview = getProjectSpineMotionReview(this.project);
    const rigCertification = getProjectRigCertificationSummary(this.project);
    const visualCohesion = getVisualCohesionQASummary(this.project);
    const creativeDirector = normalizeCreativeDirectorState(this.project);
    const creativeProviders = getCreativeProviderStatus(this.project);
    const creativeBrief = creativeDirector.brief;
    const canRename = this.project.name === 'Untitled Game' || !this.project.blueprint;
    const visualExcellence = renderVisualExcellenceDepartment(this.project);

    this.container.innerHTML = `
      <div class="quality-panel">
        <section class="quality-hero">
          <div class="quality-score" style="--quality-score:${audit.score * 3.6}deg">
            <strong>${audit.score}</strong><span>/100</span>
          </div>
          <div class="quality-hero-copy">
            <span class="quality-kicker">Professional Factory Standard</span>
            <h2>${audit.releaseReady ? 'Quality gate passed' : 'Build the whole game to one standard'}</h2>
            <p>${esc(audit.summary)}. Overall target ${audit.targetScore}; every discipline must reach ${audit.categoryFloor}. A strong category can never hide a weak one.</p>
          </div>
          <div class="quality-hero-actions">
            <button class="btn-primary quality-certify-button" id="btnRepairGame">Repair &amp; Certify</button>
            <button class="btn-secondary" id="btnCertifyGame">Certify Only</button>
            <button class="btn-secondary" id="btnApplyPro">Apply Pro Defaults</button>
          </div>
        </section>

        <section class="quality-certification ${certification.complete ? 'is-certified' : certification.stale ? 'is-stale' : certification.fresh ? 'is-repair' : ''}">
          <div class="quality-section-heading">
            <div><span>FACTORY</span><h3>${certification.complete ? 'Release certificate issued' : certification.stale ? 'Release certificate is stale' : certification.fresh ? 'Certification produced a repair queue' : 'One-button game certification'}</h3></div>
            <p>${certification.complete ? `Evidence ${certification.fingerprint} · ${esc(certification.runAt || '')}` : 'Runs every browser-measured audit in sequence, then combines the results with the complete professional release gate.'}</p>
          </div>
          <div class="quality-certification-summary">
            <strong>${certification.complete ? 'CERTIFIED' : certification.stale ? 'STALE' : certification.fresh ? `${certification.blockers} BLOCKERS` : 'NOT RUN'}</strong>
            <span>${certification.score}/100 · ${certification.stages.filter(stage => stage.complete).length}/${certification.stages.length} stages passed</span>
          </div>
          <div class="quality-certification-stages">
            ${certification.stages.map((stage, index) => `
              <button class="quality-certification-stage ${stage.complete ? 'is-complete' : 'is-blocked'}" data-quality-panel="${esc(stage.panel)}">
                <b>${stage.complete ? '✓' : index + 1}</b>
                <span><strong>${esc(stage.label)}</strong><small>${esc(stage.details)}</small></span>
              </button>
            `).join('')}
          </div>
          <article class="quality-repair-report ${repairRun?.status === 'certified' ? 'is-complete' : ''}">
            ${repairRun ? `
              <div><strong>${repairRun.applied.length} safe repair${repairRun.applied.length === 1 ? '' : 's'} applied</strong><span>${repairRun.beforeScore} → ${repairRun.afterScore} quality · ${repairRun.deferred.length} deferred</span></div>
              <small>${repairRun.applied.length ? repairRun.applied.map(item => esc(item.label)).join(' · ') : 'No deterministic repair was needed.'}</small>
              ${repairRun.notes.length ? `<small class="is-note">Protected decisions: ${repairRun.notes.map(item => esc(item.reason)).join(' ')}</small>` : ''}
            ` : `
              <div><strong>Automatic repair has not run</strong><span>Safe fixes only</span></div>
              <small>Preserves authored assets and never fabricates provider identity, verified math, finished artwork or review evidence.</small>
            `}
          </article>
        </section>

        <section class="creative-director">
          <div class="quality-section-heading">
            <div><span>ZERO-COST</span><h3>Offline Creative Director</h3></div>
            <p>Generate three authored game directions locally, then compile the winner into the same contract a future AI provider will use.</p>
          </div>
          <div class="creative-provider-strip">
            ${creativeProviders.map(provider => `
              <div class="creative-provider ${provider.active ? 'is-active' : ''}">
                <i></i><span><strong>${esc(provider.label)}</strong><small>${provider.id === 'offline' ? 'active · no API · no usage cost' : esc(provider.status)}</small></span>
              </div>
            `).join('')}
            <div class="creative-provider-contract"><strong>ONE CONCEPT CONTRACT</strong><small>Swap in OpenAI later without rebuilding the pipeline.</small></div>
          </div>
          <div class="creative-brief-grid">
            <label class="creative-premise">Game fantasy or premise<textarea id="creativePremise" rows="3" placeholder="Example: An oath-broken Valkyrie fights through a frozen afterlife">${esc(creativeBrief.premise)}</textarea></label>
            <label>Tone<select id="creativeTone">
              ${Object.entries({ cinematic: 'Cinematic', brutal: 'Brutal', mysterious: 'Mysterious', triumphant: 'Triumphant', playful: 'Playful', luxurious: 'Luxurious' }).map(([value, label]) => `<option value="${value}" ${creativeBrief.tone === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select></label>
            <label>Provider name<input id="creativeProviderName" value="${esc(creativeBrief.providerName || this.project.build?.stakeEngine?.providerName)}" placeholder="Your studio name — never invented" /></label>
            <label>Direction seed<input id="creativeSeed" value="${esc(creativeBrief.seed)}" /></label>
            <button class="btn-primary" id="btnGenerateCreative">Generate 3 Concepts · Offline</button>
          </div>
          ${this.creativeMessage ? `<div class="creative-message ${this.creativeMessage.error ? 'is-error' : 'is-success'}">${esc(this.creativeMessage.text)}</div>` : ''}
          <div class="creative-concept-grid">
            ${creativeDirector.candidates.length ? creativeDirector.candidates.map((concept, index) => `
              <article class="creative-concept ${creativeDirector.selectedId === concept.id ? 'is-selected' : ''}">
                <div class="creative-concept-top"><span>DIRECTION ${String(index + 1).padStart(2, '0')}</span><b>${esc(concept.blueprintName)}</b></div>
                <h4>${esc(concept.title)}</h4>
                <p class="creative-tagline">${esc(concept.tagline)}</p>
                <dl><dt>PLAYER HOOK</dt><dd>${esc(concept.playerHook)}</dd><dt>SIGNATURE MOMENT</dt><dd>${esc(concept.signatureMoment)}</dd></dl>
                <ul>${concept.differentiators.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
                <div class="creative-palette">${concept.colorPalette.map(color => `<i style="--concept-color:${esc(color)}" title="${esc(color)}"></i>`).join('')}</div>
                <button class="btn-secondary" data-greenlight-concept="${esc(concept.id)}">${creativeDirector.selectedId === concept.id ? 'Greenlit & Compiled' : 'Greenlight This Direction'}</button>
              </article>
            `).join('') : '<div class="creative-empty"><strong>No paid service required.</strong><span>Write one rough premise—even a sentence fragment—and the local director will build three distinct, production-ready directions.</span></div>'}
          </div>
          <div class="creative-compile-options">
            <label><input type="checkbox" id="creativeCompileBlueprint" checked /> Compile the matching executable game blueprint</label>
            <label><input type="checkbox" id="creativeRenameProject" ${canRename ? 'checked' : ''} /> Use the concept title for this project</label>
            <small>Greenlighting writes the creative contract, world lore, palette, and a locked Art Direction Bible. It does not generate images, contact a service, or spend money.</small>
          </div>
        </section>

        ${visualExcellence}

        <section class="quality-direction">
          <div class="quality-section-heading">
            <div><span>01</span><h3>Creative contract</h3></div>
            <p>Short, concrete decisions that every later asset and mechanic must serve.</p>
          </div>
          <div class="quality-direction-grid">
            <label>Player hook<input id="qualityCoreHook" value="${esc(production.creative.coreHook)}" placeholder="Why does someone choose this game?" /></label>
            <label>Signature moment<input id="qualitySignature" value="${esc(production.creative.signatureMoment)}" placeholder="The moment players remember and share" /></label>
            <label class="quality-wide">Concrete differentiators<textarea id="qualityDifferentiators" rows="3" placeholder="One specific difference per line">${esc((production.creative.differentiators || []).join('\n'))}</textarea></label>
          </div>
        </section>

        <section class="quality-disciplines">
          <div class="quality-section-heading">
            <div><span>02</span><h3>Discipline gates</h3></div>
            <p>Balanced floors prevent polish in one area from compensating for unfinished work elsewhere.</p>
          </div>
          <div class="quality-category-grid">
            ${audit.categories.map(category => `
              <article class="quality-category ${category.score >= audit.categoryFloor ? 'is-healthy' : 'is-weak'}">
                <div class="quality-category-top">
                  <div><strong>${esc(category.label)}</strong><span>${category.passed}/${category.total} checks</span></div>
                  <b>${category.score}</b>
                </div>
                <div class="quality-meter"><i style="width:${category.score}%"></i></div>
                <small>${category.blockers ? `${category.blockers} blocker${category.blockers === 1 ? '' : 's'}` : 'No hard blockers'}</small>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="quality-evidence">
          <div class="quality-section-heading">
            <div><span>03</span><h3>Automated release evidence</h3></div>
            <p>General release gates are fingerprinted measurements. Art changes invalidate prior evidence automatically.</p>
          </div>
          <div class="quality-evidence-grid">
            <article class="quality-review ${visualCohesion.complete ? 'is-approved' : ''}">
              <span><strong>${visualCohesion.complete ? 'Visual Pack QA passed' : visualCohesion.stale ? 'Visual Pack QA is stale' : visualCohesion.fresh ? 'Visual Pack QA found corrections' : 'Visual Pack QA required'}</strong><small>${visualCohesion.complete ? `${visualCohesion.passedAssets}/${visualCohesion.totalAssets} assets and every whole-pack contract passed · evidence ${visualCohesion.fingerprint}` : visualCohesion.fresh ? `${visualCohesion.passedAssets}/${visualCohesion.totalAssets} assets clean · ${visualCohesion.issues.length} whole-pack contract failures` : 'Atlas measures palette, reference continuity, readability, framing, alpha, symbol identity, cabinet separation, and submission lineage.'}</small></span>
              <button class="btn-small" data-quality-panel="atlas">Open Atlas</button>
            </article>
          </div>
        </section>

        <section class="quality-rig-contract">
          <div class="quality-section-heading">
            <div><span>04</span><h3>Rig correction contract</h3></div>
            <p>Corrective art, draw-order rules, anchors and secondary motion are tracked as production evidence.</p>
          </div>
          <div class="quality-rig-stats">
            <div><strong>${corrections.length}</strong><span>corrective poses</span></div>
            <div><strong>${(production.rig.drawOrderRules || []).length}</strong><span>draw-order rules</span></div>
            <div><strong>${(production.rig.anchors || []).length}</strong><span>anchors</span></div>
            <div><strong>${(production.rig.secondaryMotion || []).length}</strong><span>secondary systems</span></div>
            <div><strong>${motionReview.passed}/${motionReview.total}</strong><span>automated motion cases</span></div>
          </div>
          <article class="quality-review ${!hasSpine || rigCertification.complete ? 'is-approved' : ''}">
            <span><strong>${!hasSpine ? 'No Spine rig — certification not applicable' : rigCertification.complete ? 'Rig Certification passed' : rigCertification.stale ? 'Rig Certification is stale' : rigCertification.fresh ? 'Rig Certification needs repair' : 'Rig Certification required'}</strong><small>${!hasSpine ? 'State-layer animation contains no skeletal rig to certify.' : rigCertification.complete ? `${rigCertification.motionFrames} motion frames · ${rigCertification.stressRenders} deformation renders · structure, loops, events and pixels passed` : rigCertification.issues.length ? `${rigCertification.issues.length} unified certification finding${rigCertification.issues.length === 1 ? '' : 's'}` : 'One action runs structural, automated motion, event, loop and deformation QA.'}</small></span>
            <button class="btn-small" data-quality-panel="spine">${hasSpine ? 'Open Spine' : 'Add Spine Rig'}</button>
          </article>
          <small>Rig Certification is tied to the exact Spine files, mappings, correction art and runtime pose systems. Any relevant change invalidates it automatically.</small>
        </section>

        <section class="quality-backlog">
          <div class="quality-section-heading">
            <div><span>05</span><h3>Next actions</h3></div>
            <p>${repairs.length} items remain. The certificate orders blockers first and links every repair to its owning workspace.</p>
          </div>
          <div class="quality-issue-list">
            ${repairs.length ? repairs.map(item => `
              <article class="quality-issue ${item.severity === 'blocker' ? 'is-blocker' : ''}">
                <span class="quality-issue-badge">#${item.order} ${item.severity === 'blocker' ? 'Blocker' : 'Improve'}</span>
                <div><strong>${esc(item.label)}</strong><p>${esc(item.remedy)}</p>${item.evidence ? `<small>${esc(item.evidence)}</small>` : ''}</div>
                <button class="btn-small" data-quality-panel="${esc(item.panel)}">Open ${esc(QUALITY_CATEGORIES[item.category]?.label || item.panel)}</button>
              </article>
            `).join('') : '<div class="quality-complete">Every professional quality requirement has evidence.</div>'}
          </div>
        </section>
      </div>
    `;

    this.bind();
  }

  bind() {
    this.container.querySelector('#btnApplyPro')?.addEventListener('click', () => {
      applyProfessionalDefaults(this.project);
      this.onChange?.();
      this.render();
    });
    this.container.querySelector('#btnCertifyGame')?.addEventListener('click', event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Certifying…';
      void this.certifyGame?.();
    });
    this.container.querySelector('#btnRepairGame')?.addEventListener('click', event => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Repairing…';
      void this.repairGame?.();
    });
    this.container.querySelector('#qualityCoreHook')?.addEventListener('input', event => {
      this.project.production.creative.coreHook = event.target.value.trim();
      this.onChange?.();
    });
    this.container.querySelector('#qualitySignature')?.addEventListener('input', event => {
      this.project.production.creative.signatureMoment = event.target.value.trim();
      this.onChange?.();
    });
    this.container.querySelector('#qualityDifferentiators')?.addEventListener('input', event => {
      this.project.production.creative.differentiators = event.target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      this.onChange?.();
    });
    ['Premise', 'Tone', 'ProviderName', 'Seed'].forEach(field => {
      const element = this.container.querySelector(`#creative${field}`);
      element?.addEventListener('input', event => {
        const key = field[0].toLowerCase() + field.slice(1);
        normalizeCreativeDirectorState(this.project).brief[key] = event.target.value;
        this.onChange?.();
      });
    });
    this.container.querySelector('#btnGenerateCreative')?.addEventListener('click', () => this.generateCreativeConcepts());
    this.container.querySelectorAll('[data-greenlight-concept]').forEach(button => {
      button.addEventListener('click', event => this.greenlightCreativeConcept(event.currentTarget.dataset.greenlightConcept));
    });
    this.container.querySelectorAll('[data-quality-panel]').forEach(button => {
      button.addEventListener('click', event => this.navigate?.(event.currentTarget.dataset.qualityPanel));
    });
    this.container.querySelector('#btnApproveVisual')?.addEventListener('click', () => this.recordHumanVisualDecision('approved'));
    this.container.querySelector('#btnRejectVisual')?.addEventListener('click', () => this.recordHumanVisualDecision('rejected'));
  }

  recordHumanVisualDecision(status) {
    const message = this.container.querySelector('#humanVisualMessage');
    const reviewer = this.container.querySelector('#humanVisualReviewer')?.value?.trim() || '';
    const notes = this.container.querySelector('#humanVisualNotes')?.value?.trim() || '';
    const briefIds = [...this.container.querySelectorAll('[data-human-visual-brief]:checked')].map(input => input.value);
    try {
      if (!reviewer) throw new Error('Enter the human reviewer name before recording a decision.');
      if (!briefIds.length) throw new Error('Select at least one Director-approved visual brief.');
      if (status === 'rejected' && !notes) throw new Error('Rejection requires audit notes describing what must change.');
      applyHumanVisualDecision(this.project, { status, decidedBy: reviewer, notes, briefIds });
      this.onChange?.();
      this.render();
      return true;
    } catch (error) {
      if (message) message.textContent = error.message;
      return false;
    }
  }

  generateCreativeConcepts(input = null) {
    const brief = input || {
      premise: this.container.querySelector('#creativePremise')?.value,
      tone: this.container.querySelector('#creativeTone')?.value,
      providerName: this.container.querySelector('#creativeProviderName')?.value,
      seed: this.container.querySelector('#creativeSeed')?.value,
    };
    try {
      const candidates = generateOfflineConcepts(this.project, brief);
      this.creativeMessage = { text: 'Three local directions are ready. Compare the hooks and signature moments, then greenlight one.', error: false };
      this.onChange?.();
      this.render();
      this.container.querySelector('.creative-concept-grid')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return candidates;
    } catch (error) {
      this.creativeMessage = { text: error.message, error: true };
      this.render();
      return [];
    }
  }

  greenlightCreativeConcept(conceptId, options = null) {
    try {
      const result = applyCreativeConcept(this.project, conceptId, options || {
        compileBlueprint: this.container.querySelector('#creativeCompileBlueprint')?.checked !== false,
        renameProject: this.container.querySelector('#creativeRenameProject')?.checked === true,
        providerName: this.container.querySelector('#creativeProviderName')?.value,
      });
      this.creativeMessage = { text: `${result.concept.title} is greenlit. The creative contract and locked Art Direction Bible are ready for production.`, error: false };
      this.onChange?.();
      this.render();
      return result;
    } catch (error) {
      this.creativeMessage = { text: error.message, error: true };
      this.render();
      return null;
    }
  }
}
