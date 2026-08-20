import {
  ART_BIBLE_FIELDS,
  VISUAL_REFERENCE_ROLES,
  addVisualReference,
  approveVisualReference,
  assignGeneratedVisual,
  compileArtDirection,
  createVisualCorrectionPlan,
  forgeArtBible,
  getApplicableVisualReferences,
  getGeneratedVisualAnchors,
  getVisualCohesionStatus,
  getVisualFactoryTargets,
  lockArtBible,
  normalizeVisualFactoryState,
  recordVisualAnalysis,
  removeVisualReference,
} from '../../engines/assets/VisualAssetFactory.js';
import {
  beginAssetProductionAttempt,
  createAssetProductionRun,
  finishAssetProductionAttempt,
  getAssetProductionSummary,
  getNextAssetProductionItem,
  normalizeAssetProductionRun,
  refreshAssetProductionRun,
  resetAssetProductionItem,
} from '../../engines/assets/AssetProductionConductor.js';
import {
  createVisualWorkOrder,
  getVisualWorkOrderStatus,
} from '../../engines/assets/VisualWorkOrder.js';
import {
  beginVisualDeliveryReceipt,
  createVisualDeliveryCandidate,
  findVisualDeliveryResult,
  finishVisualDeliveryReceipt,
  getVisualDeliveryFolder,
  getVisualDeliverySummary,
  recordVisualDeliveryResult,
} from '../../engines/assets/VisualDeliveryEngine.js';
import {
  getCodexVisualBatchSummary,
  startCodexVisualBatch,
} from '../../engines/assets/CodexVisualBatch.js';
import {
  buildAssetIntegrityInventory,
  getAssetIntegritySummary,
  recordAssetIntegrityQA,
} from '../../engines/quality/AssetIntegrityQA.js';
import {
  buildVisualCohesionInventory,
  getVisualCohesionQASummary,
  getVisualSourceFingerprint,
  recordVisualCohesionQA,
} from '../../engines/quality/VisualCohesionQA.js';
import {
  buildLiveBoardArtBrief,
  slimBoardArtBrief,
} from '../../engines/assets/BoardArtBrief.js';
import { applyBoardSymbolPack, boardSymbolPackFor } from '../../engines/assets/BoardSymbolPack.js';

export class AtlasPanel {
  constructor(container, project, onChange, projectId = project.id) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.projectId = projectId;
    this.visualCapabilities = null;
    this.visualBusy = false;
    this.visualProductionBusy = false;
    this.visualProductionAuthorized = false;
    this.visualDeliveryBusy = false;
    this.visualMessage = null;
    this.integrityBusy = false;
    this.cohesionBusy = false;
    // The panel is reconstructed on every tab switch, so all state lives on the
    // project rather than the instance.
    if (!project.atlas) project.atlas = { assets: [], packed: null, padding: 2, maxSize: 2048 };
    normalizeVisualFactoryState(project);
    this.render();
    this.loadVisualCapabilities();
  }

  get atlas() { return this.project.atlas; }
  get assets() { return this.atlas.assets; }
  get packedAtlas() { return this.atlas.packed; }
  set packedAtlas(v) { this.atlas.packed = v; }
  get padding() { return this.atlas.padding; }
  set padding(v) { this.atlas.padding = v; }
  get maxSize() { return this.atlas.maxSize; }
  set maxSize(v) { this.atlas.maxSize = v; }

  /** Persist + repaint. Every mutation goes through here. */
  commit() {
    this.onChange?.();
    this.render();
  }

  render() {
    const factory = normalizeVisualFactoryState(this.project);
    const targets = getVisualFactoryTargets(this.project);
    const selected = targets.find(item => item.key === factory.selectedTarget) || targets[0];
    const missing = targets.filter(item => !item.ready);
    const latest = factory.latest;
    const analysis = latest?.analysis;
    const correctionPlan = factory.correctionPlan;
    const configured = this.visualCapabilities?.configured;
    const cohesion = getVisualCohesionStatus(this.project);
    const bible = factory.artBible;
    const integrity = getAssetIntegritySummary(this.project);
    const cohesionQa = getVisualCohesionQASummary(this.project);
    const generationReady = configured && cohesion.ready;
    const references = factory.references || [];
    const routedReferences = getApplicableVisualReferences(this.project, selected);
    const bibleCurrent = cohesion.validation.valid && cohesion.locked && !cohesion.bibleDrift;
    const productionRun = normalizeAssetProductionRun(this.project);
    const production = getAssetProductionSummary(this.project, false);
    const workOrder = getVisualWorkOrderStatus(this.project);
    const delivery = getVisualDeliverySummary(this.project);
    const codexBatch = getCodexVisualBatchSummary(this.project);
    const productionRequestLimit = Math.max(1, Math.min(10, Number(factory.batchRequestLimit) || 3));
    const boardBrief = buildLiveBoardArtBrief(this.project);
    this.container.innerHTML = `
      <div class="atlas-panel">
        <section class="visual-factory">
          <div class="visual-factory-header">
            <div>
              <span class="visual-factory-kicker">VISUAL ASSET FACTORY</span>
              <h2>Generate, inspect, then assign production art</h2>
              <p>One image per click. Transparent pieces are converted to final alpha PNGs offline before they enter the project.</p>
            </div>
            <div class="visual-factory-status ${configured ? 'is-ready' : ''}">
              <strong>${this.visualCapabilities ? (configured ? 'READY' : 'SETUP NEEDED') : 'CHECKING'}</strong>
              <span>${missing.length} of ${targets.length} core slots missing</span>
            </div>
          </div>
          <section class="board-art-brief" id="atlasBoardArtBrief">
            <div class="board-art-brief-copy">
              <b>BOARD ART BRIEF</b>
              <span>${this.esc(boardBrief.grid)} · ${this.esc(boardBrief.winType)} · ${boardBrief.missingCount} gaps</span>
              <p>${this.esc(boardBrief.motion)}</p>
              <small>${this.esc(boardBrief.note)}</small>
            </div>
            <div class="board-art-brief-actions">
              <button type="button" class="btn-primary" id="atlasCopyBoardBrief">Copy board brief</button>
              ${boardSymbolPackFor(this.project) ? '<button type="button" class="btn-secondary" id="atlasApplyBoardPack">Apply board pack</button>' : ''}
            </div>
            <ol class="board-art-brief-slots">
              ${(boardBrief.slots || []).map((slot) => (
                `<li data-status="${this.esc(slot.status)}"><strong>${this.esc(slot.label)}</strong> · ${this.esc(slot.role)} · ${this.esc(slot.status)}</li>`
              )).join('') || '<li>No symbols on this board</li>'}
            </ol>
          </section>
          <details class="art-bible ${cohesion.ready ? 'is-locked' : 'needs-lock'}" ${cohesion.ready ? '' : 'open'}>
            <summary>
              <span><b>ART DIRECTION BIBLE</b><small>${cohesion.ready ? `Locked · ${cohesion.currentFingerprint}` : cohesion.bibleDrift ? 'Changed since lock · re-lock required' : `${cohesion.validation.completed}/${cohesion.validation.total} fields complete · lock required`}</small></span>
              <i>${cohesion.driftedAssignments.length ? `${cohesion.driftedAssignments.length} old-lineage asset${cohesion.driftedAssignments.length === 1 ? '' : 's'}` : 'one visual lineage'}</i>
            </summary>
            <div class="art-bible-body">
              <div class="art-bible-actions">
                <button class="btn-secondary" id="artBibleForge">Forge From Current Theme</button>
                <button class="btn-primary" id="artBibleLock">${cohesion.lockedFingerprint ? 'Re-lock Current Bible' : 'Lock Current Bible'}</button>
                <span>Locking creates the continuity fingerprint embedded in every future asset.</span>
              </div>
              <div class="art-bible-grid">
                ${ART_BIBLE_FIELDS.map(([field, label]) => `
                  <label class="${['concept', 'forbidden', 'characterIdentity', 'symbolGrammar'].includes(field) ? 'art-bible-wide' : ''}">${this.esc(label)}
                    <textarea data-art-bible="${field}" maxlength="500" rows="${['concept', 'forbidden', 'characterIdentity', 'symbolGrammar'].includes(field) ? 2 : 3}">${this.esc(bible[field])}</textarea>
                  </label>
                `).join('')}
              </div>
              ${cohesion.validation.issues.length ? `<div class="art-bible-issues">${cohesion.validation.issues.map(issue => `<span>${this.esc(issue)}</span>`).join('')}</div>` : ''}
            </div>
          </details>
          <section class="reference-library">
            <div class="reference-library-header">
              <div>
                <b>REFERENCE ANCHORS</b>
                <span>Approved pixels guide identity and style through GPT Image’s high-fidelity edit path.</span>
              </div>
              <small>${cohesion.approvedReferences} approved · ${references.length}/8 stored</small>
            </div>
            <div class="reference-library-tools">
              <select id="visualReferenceRole">
                ${Object.entries(VISUAL_REFERENCE_ROLES).map(([role, label]) => `<option value="${role}">${this.esc(label)}</option>`).join('')}
              </select>
              <label class="btn-secondary reference-upload">+ Add Reference Images<input id="visualReferenceUpload" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
              <span>Up to 4 relevant approved anchors are routed per candidate.</span>
            </div>
            ${references.length ? `<div class="reference-grid">
              ${references.map(reference => {
                const stale = reference.approved && reference.bibleFingerprint !== cohesion.currentFingerprint;
                return `<article class="reference-card ${reference.approved && !stale ? 'is-approved' : ''} ${stale ? 'is-stale' : ''}">
                  <img src="${reference.src}" alt="${this.esc(reference.name)}">
                  <div><strong>${this.esc(reference.name)}</strong><span>${this.esc(VISUAL_REFERENCE_ROLES[reference.role])} · ${reference.width}×${reference.height}</span><small>${stale ? 'Re-approve for current Bible' : reference.approved ? `Approved · ${reference.bibleFingerprint}` : 'Awaiting approval'}</small></div>
                  <button class="btn-small reference-approve" data-reference-id="${this.esc(reference.id)}" ${!bibleCurrent ? 'disabled' : ''}>${reference.approved && !stale ? 'Unapprove' : 'Approve'}</button>
                  <button class="btn-icon reference-remove" data-reference-id="${this.esc(reference.id)}" title="Remove">×</button>
                </article>`;
              }).join('')}
            </div>` : '<p class="reference-empty">Add a style board, approved character master, or symbol-family master. References are optional; text-only generation still works.</p>'}
          </section>
          <section class="asset-production ${production.complete ? 'is-complete' : productionRun ? 'has-plan' : ''}">
            <div class="asset-production-heading">
              <div>
                <span>VISUAL PACK CONDUCTOR</span>
                <h3>${production.complete ? 'The complete production pack is assembled' : productionRun ? 'Produce the pack in continuity-safe order' : 'Turn the Art Bible into a resumable production plan'}</h3>
                <p>World master → character and symbol masters → families → cabinet finish → brand. Every paid request is bounded, locally audited, corrected when measurable, and autosaved.</p>
              </div>
              <div class="asset-production-score"><strong>${production.assigned}<i>/${production.total || targets.length}</i></strong><span>assigned</span></div>
            </div>
            ${productionRun ? `
              <div class="asset-production-stats">
                <span><b>${production.pending}</b> ready</span>
                <span><b>${production.waiting}</b> waiting</span>
                <span><b>${production.failed}</b> attempt-limited</span>
                <span><b>${production.protected}</b> protected decisions</span>
                <span><b>${production.requestsUsed}</b> requests used</span>
              </div>
              <div class="asset-production-rail">
                ${productionRun.items.map(item => `<button class="asset-production-item is-${this.esc(item.state)}" data-production-target="${this.esc(item.key)}" title="${this.esc(item.lastError || item.label)}"><b>${item.state === 'assigned' ? '✓' : item.attempts || '·'}</b><span>${this.esc(item.label)}</span></button>`).join('')}
              </div>
              ${production.blockers?.length ? `<div class="asset-production-blockers">${production.blockers.map(blocker => `<span>${this.esc(blocker)}</span>`).join('')}</div>` : ''}
              ${productionRun.items.some(item => item.lastError) ? `<div class="asset-production-attention">${productionRun.items.filter(item => item.lastError).slice(0, 4).map(item => `<span><b>${this.esc(item.label)}</b>${this.esc(item.lastError)}</span>`).join('')}</div>` : ''}
            ` : ''}
            <div class="asset-production-actions">
              <label>Pack quality<select id="visualProductionQuality" ${this.visualProductionBusy ? 'disabled' : ''}>
                <option value="concept" ${(productionRun?.quality || factory.productionQuality || 'review') === 'concept' ? 'selected' : ''}>Concept · low</option>
                <option value="review" ${(productionRun?.quality || factory.productionQuality || 'review') === 'review' ? 'selected' : ''}>Review · medium</option>
                <option value="final" ${(productionRun?.quality || factory.productionQuality || 'review') === 'final' ? 'selected' : ''}>Final · high</option>
              </select></label>
              <label>Correction limit<select id="visualProductionAttempts" ${this.visualProductionBusy ? 'disabled' : ''}>
                ${[1, 2, 3, 4].map(value => `<option value="${value}" ${(productionRun?.maxAttempts || 2) === value ? 'selected' : ''}>${value} attempt${value === 1 ? '' : 's'} per asset</option>`).join('')}
              </select></label>
              <button class="btn-secondary" id="visualProductionPlan" ${this.visualProductionBusy ? 'disabled' : ''}>${productionRun ? 'Re-plan Pack' : 'Plan Pack · No Cost'}</button>
              ${production.failed ? '<button class="btn-secondary" id="visualProductionRetry" title="Reset the first attempt-limited asset after you inspect its last candidate">Retry First Failed</button>' : ''}
              <label class="asset-production-limit">Batch ceiling<input id="visualProductionLimit" type="number" min="1" max="10" value="${productionRequestLimit}" ${this.visualProductionBusy ? 'disabled' : ''}> requests</label>
              <label class="asset-production-authorize"><input id="visualProductionAuthorize" type="checkbox" ${this.visualProductionAuthorized ? 'checked' : ''} ${this.visualProductionBusy ? 'disabled' : ''}> I authorize this bounded paid batch</label>
              <button class="btn-primary" id="visualProductionRun" ${!generationReady || !productionRun || !production.runnable || this.visualProductionBusy || !this.visualProductionAuthorized ? 'disabled' : ''}>${this.visualProductionBusy ? 'Producing…' : `Produce Next Batch · max ${productionRequestLimit}`}</button>
            </div>
            <small class="asset-production-boundary">No background spending. The run stops at the displayed request ceiling, any protected decision, a changed Bible, or an exhausted correction limit. Passing assets are assigned automatically; failed candidates remain available for inspection.</small>
            <div class="visual-work-order ${workOrder.current ? 'is-current' : workOrder.stale ? 'is-stale' : ''}">
              <div>
                <span>FREE PRODUCTION BRIDGE</span>
                <h4>${workOrder.current ? 'Codex work order ready' : workOrder.stale ? 'Visual contract changed' : 'Prepare the complete Codex handoff'}</h4>
                <p>${this.esc(workOrder.reason)} The same contract also works with an artist or local image tool; the paid OpenAI adapter remains available whenever you add it later.</p>
                ${workOrder.exists ? `<small>${workOrder.actionableCount} requested named PNG${workOrder.actionableCount === 1 ? '' : 's'}${workOrder.protectedCount ? ` · ${workOrder.protectedCount} protected decision${workOrder.protectedCount === 1 ? '' : 's'} excluded` : ''}${workOrder.preservedCount ? ` · ${workOrder.preservedCount} existing asset${workOrder.preservedCount === 1 ? '' : 's'} preserved` : ''} · ${workOrder.embeddedReferences} embedded reference${workOrder.embeddedReferences === 1 ? '' : 's'} · ${this.esc(workOrder.fingerprint)}</small>` : ''}
              </div>
              <div class="visual-work-order-actions">
                <button class="btn-primary" id="visualWorkOrderPrepare" ${!cohesion.ready || this.visualProductionBusy ? 'disabled' : ''}>${workOrder.exists ? 'Refresh Work Order' : 'Prepare Work Order · Free'}</button>
                <button class="btn-secondary" id="visualWorkOrderDownload" ${!workOrder.current ? 'disabled' : ''}>Download JSON</button>
                <button class="btn-primary" id="visualDeliveryIngest" ${!workOrder.current || this.visualDeliveryBusy ? 'disabled' : ''}>${this.visualDeliveryBusy ? 'Auditing Delivery…' : 'Scan Delivery Folder'}</button>
                <button class="btn-secondary" id="codexVisualBatchStart" ${!workOrder.current || this.visualDeliveryBusy ? 'disabled' : ''}>${codexBatch.exists ? 'Restart Visual Autopilot' : 'Start Visual Autopilot'}</button>
              </div>
              <div class="visual-provider-rail">
                <span class="is-active"><b>ACTIVE</b> Codex handoff · no project API key</span>
                <span><b>ACTIVE</b> Named PNG import · any art tool</span>
                <span><b>OPTIONAL LATER</b> OpenAI direct adapter</span>
                <span><b>OPTIONAL LATER</b> Spine rigging</span>
              </div>
              <div class="visual-delivery-status">
                <span><b>INBOX</b> ${this.esc(getVisualDeliveryFolder(this.projectId))}</span>
                ${delivery.exists ? `<span class="is-accepted"><b>${delivery.accepted}</b> accepted</span><span class="${delivery.rejected ? 'is-rejected' : ''}"><b>${delivery.rejected}</b> rejected</span><span><b>${delivery.waiting}</b> waiting</span>` : '<span>Place exact named PNGs here, then scan.</span>'}
              </div>
              ${codexBatch.exists ? `<div class="codex-batch-status is-${this.esc(codexBatch.status)}"><span><b>VISUAL AUTOPILOT</b> ${this.esc(codexBatch.status)}</span><span><b>${codexBatch.accepted}/${codexBatch.total}</b> accepted</span><span><b>${codexBatch.attempts}</b> attempts</span><span><b>${codexBatch.waiting}</b> dependency-locked</span><span>safety · ${codexBatch.maxAttemptsPerTask}/asset</span>${codexBatch.currentTaskKey ? `<span>${codexBatch.status === 'blocked' ? 'stopped' : 'next'} · ${this.esc(codexBatch.currentTaskKey)}</span>` : ''}${codexBatch.stopReason ? `<span class="is-rejected">${this.esc(codexBatch.stopReason)}</span>` : ''}</div>` : ''}
            </div>
          </section>
          <div class="visual-factory-grid">
            <div class="visual-factory-controls">
              <label>Asset slot
                <select id="visualTarget">
                  ${targets.map(item => `<option value="${this.esc(item.key)}" ${item.key === selected.key ? 'selected' : ''}>${item.ready ? '✓ ' : ''}${this.esc(item.label)}</option>`).join('')}
                </select>
              </label>
              <label>Quality pass
                <select id="visualQuality">
                  <option value="concept" ${factory.quality === 'concept' ? 'selected' : ''}>Concept · low</option>
                  <option value="review" ${factory.quality === 'review' ? 'selected' : ''}>Review · medium</option>
                  <option value="final" ${factory.quality === 'final' ? 'selected' : ''}>Final · high</option>
                </select>
              </label>
              <label class="visual-wide">Specific adjustment
                <input id="visualDetail" value="${this.esc(factory.detail)}" placeholder="Optional: silhouette, pose, focal object, lighting note...">
              </label>
              <div class="reference-routing visual-wide"><strong>${routedReferences.length ? `${routedReferences.length} anchor${routedReferences.length === 1 ? '' : 's'} routed` : 'Text-only lineage'}</strong><span>${routedReferences.length ? routedReferences.map(reference => reference.name).join(' · ') : 'Add and approve reference anchors for pixel-level continuity.'}</span></div>
              ${correctionPlan ? `<div class="visual-correction-plan visual-wide"><strong>CORRECTION ${correctionPlan.attempt} PREPARED</strong><span>${correctionPlan.issueIds.map(id => this.esc(id)).join(' · ')}</span><small>Review the adjustment above. Generation still occurs only when you explicitly click the paid button.</small></div>` : ''}
              <div class="visual-factory-actions visual-wide">
                <button class="btn-primary" id="visualGenerate" ${!generationReady || this.visualBusy ? 'disabled' : ''}>${this.visualBusy ? 'Generating…' : correctionPlan ? `Generate Correction ${correctionPlan.attempt} · One Image` : 'Generate One Candidate'}</button>
                ${missing.length ? `<button class="btn-secondary" id="visualNext" ${!generationReady || this.visualBusy ? 'disabled' : ''}>Next Missing · ${this.esc(missing[0].label)}</button>` : '<span class="visual-complete">Core art slots complete</span>'}
              </div>
              <small class="visual-spend-boundary visual-wide">Manual spend boundary: each button press requests exactly one image. Only the Visual Pack Conductor may continue automatically, and only after a separate bounded-batch authorization.</small>
              ${!configured && this.visualCapabilities ? '<p class="visual-message has-errors visual-wide">The local OpenAI project key is not available to this server.</p>' : ''}
              ${configured && !cohesion.ready ? '<p class="visual-message has-errors visual-wide">Complete and lock the Art Direction Bible before generating. This prevents unrelated assets from entering the pack.</p>' : ''}
              ${this.visualMessage ? `<p class="visual-message ${this.visualMessage.error ? 'has-errors' : ''} visual-wide">${this.esc(this.visualMessage.text)}</p>` : ''}
            </div>
            <div class="visual-candidate ${latest ? 'has-candidate' : ''}">
              ${latest ? `
                <div class="visual-candidate-image"><img src="${latest.dataUrl}" alt="Generated ${this.esc(latest.slot)} candidate"></div>
                ${this.renderVisualAnalysis(analysis)}
                <div class="visual-candidate-meta">
                  <strong>${this.esc(latest.slot)}${latest.target ? ` · ${this.esc(latest.target)}` : ''}</strong>
                  <span>${this.esc(latest.qualityProfile)} · ${latest.width}×${latest.height}${latest.matteRemoved ? ' · alpha processed' : ''}${latest.references?.length ? ` · ${latest.references.length} references` : ''}</span>
                  <div class="visual-candidate-actions">
                    ${analysis && !analysis.passed ? '<button class="btn-secondary" id="visualPrepareCorrection">Prepare Correction</button>' : ''}
                    <button class="btn-secondary" id="visualReanalyze" ${this.visualBusy ? 'disabled' : ''}>Re-run Local QA</button>
                    <button class="btn-primary" id="visualAssign" ${latest.assignedAt || analysis?.passed !== true ? 'disabled' : ''}>${latest.assignedAt ? 'Assigned to Project' : analysis?.passed ? 'Approve & Assign' : 'QA Pass Required'}</button>
                  </div>
                </div>
              ` : '<div class="visual-candidate-empty"><strong>No candidate waiting</strong><span>Generation saves a provenance copy, but does not replace project art until you approve it.</span></div>'}
            </div>
          </div>
        </section>

        <section class="asset-integrity ${integrity.complete ? 'is-complete' : integrity.fresh ? 'has-failures' : ''}">
          <div class="asset-integrity-copy">
            <span>PRODUCTION FILE QA</span>
            <h3>${integrity.complete ? 'Asset integrity gate passed' : integrity.stale ? 'Asset evidence is stale' : integrity.fresh ? 'Asset repair required' : 'Decode and inspect every production image'}</h3>
            <p>${integrity.fresh ? `${integrity.passedAssets}/${integrity.totalAssets} assignments clean · ${(integrity.decodedBytes / 1024 / 1024).toFixed(1)}MB decoded · atlas ${integrity.atlasReady ? 'safe' : 'blocked'}` : 'Checks missing files, real dimensions, portability, alpha mattes, crop risk, transparent-pixel color, texture memory, compression, atlas frames, and padding.'}</p>
          </div>
          <button class="btn-primary" id="assetIntegrityRun" ${this.integrityBusy ? 'disabled' : ''}>${this.integrityBusy ? 'Inspecting…' : integrity.complete ? 'Run Again' : 'Run Integrity Audit'}</button>
          <small>Evidence ${integrity.fingerprint}${integrity.runAt ? ` · ${this.esc(new Date(integrity.runAt).toLocaleString())}` : ''} · deterministic · no API cost</small>
          ${integrity.issues.length ? `<div class="asset-integrity-findings">${integrity.issues.slice(0, 12).map(issue => `<span>${this.esc(issue)}</span>`).join('')}${integrity.issues.length > 12 ? `<b>+${integrity.issues.length - 12} more</b>` : ''}</div>` : ''}
        </section>

        <section class="asset-integrity visual-cohesion-audit ${cohesionQa.complete ? 'is-complete' : cohesionQa.fresh ? 'has-failures' : ''}">
          <div class="asset-integrity-copy">
            <span>WHOLE-PACK VISUAL QA</span>
            <h3>${cohesionQa.complete ? 'Visual cohesion gate passed' : cohesionQa.stale ? 'Cohesion evidence is stale' : cohesionQa.fresh ? 'Visual corrections required' : 'Prove the art reads as one production set'}</h3>
            <p>${cohesionQa.fresh ? `${cohesionQa.passedAssets}/${cohesionQa.totalAssets} assets clean · ${cohesionQa.checks.filter(check => check.passed).length}/${cohesionQa.checks.length} pack contracts passed` : 'Refreshes file integrity, then checks every visual role for palette, reference continuity, readability, framing, alpha, unique symbol identity, cabinet separation, and submission lineage.'}</p>
          </div>
          <button class="btn-primary" id="visualCohesionRun" ${this.cohesionBusy || this.integrityBusy ? 'disabled' : ''}>${this.cohesionBusy ? 'Auditing Pack…' : cohesionQa.complete ? 'Run Again' : 'Run Visual Pack QA'}</button>
          <small>Evidence ${cohesionQa.fingerprint}${cohesionQa.runAt ? ` · ${this.esc(new Date(cohesionQa.runAt).toLocaleString())}` : ''} · deterministic · no API cost</small>
          ${cohesionQa.issues.length ? `<div class="asset-integrity-findings">${cohesionQa.issues.slice(0, 12).map(issue => `<span>${this.esc(issue)}</span>`).join('')}${cohesionQa.issues.length > 12 ? `<b>+${cohesionQa.issues.length - 12} more</b>` : ''}</div>` : ''}
        </section>

        <div class="atlas-header">
          <h2>Texture Atlas Packer</h2>
          <p class="section-desc">Import assets, pack into optimized sprite sheets for production builds.</p>
        </div>

        <div class="atlas-toolbar">
          <label class="btn-secondary atlas-upload-label">
            + Add Assets
            <input type="file" accept="image/*" multiple id="atlasUpload" style="display:none">
          </label>
          <button class="btn-secondary" id="atlasFromSymbols">Import Symbol Art</button>
          <span class="toolbar-sep"></span>
          <label class="atlas-setting">Padding <input type="number" id="atlasPadding" value="${this.padding}" min="0" max="16" style="width:50px"></label>
          <label class="atlas-setting">Max Size <select id="atlasMaxSize">
            ${[512, 1024, 2048, 4096].map(s => `<option value="${s}" ${s === this.maxSize ? 'selected' : ''}>${s}x${s}</option>`).join('')}
          </select></label>
          <button class="btn-primary" id="atlasPack" ${this.assets.length === 0 ? 'disabled' : ''}>Pack Atlas</button>
        </div>

        <div class="atlas-body">
          <div class="atlas-assets" id="atlasAssets">
            <h3>Assets (${this.assets.length})</h3>
            ${this.assets.length === 0 ? '<p class="empty-state">No assets added. Upload images or import symbol art.</p>' : ''}
            <div class="asset-grid" id="assetGrid">
              ${this.assets.map((a, i) => `
                <div class="asset-thumb" data-index="${i}">
                  <img src="${a.src}" alt="${a.name}">
                  <span class="asset-name">${a.name}</span>
                  <span class="asset-size">${a.width}x${a.height}</span>
                  <button class="btn-icon asset-remove" data-index="${i}" title="Remove">&#10005;</button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="atlas-preview" id="atlasPreview">
            <h3>Packed Atlas</h3>
            ${this.packedAtlas ? this.renderPackedPreview() : '<p class="empty-state">Click "Pack Atlas" to generate the sprite sheet.</p>'}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderPackedPreview() {
    const a = this.packedAtlas;
    return `
      <div class="atlas-stats">
        <span>${a.width}x${a.height}</span>
        <span>${this.assets.length} sprites</span>
        <span>${(a.dataUrl.length * 0.75 / 1024).toFixed(1)} KB</span>
      </div>
      <div class="atlas-canvas-wrap">
        <img src="${a.dataUrl}" alt="Packed Atlas" class="atlas-canvas-img" id="atlasImage">
      </div>
      <div class="atlas-export-row">
        <button class="btn-secondary" id="atlasDownloadPNG">Download PNG</button>
        <button class="btn-secondary" id="atlasDownloadJSON">Download JSON</button>
      </div>
    `;
  }

  renderVisualAnalysis(analysis) {
    if (!analysis) return '<div class="visual-qa is-waiting"><strong>LOCAL VISUAL QA</strong><span>Analysis has not run yet.</span></div>';
    const failures = [...(analysis.blockers || []), ...(analysis.warnings || [])];
    const passedCount = (analysis.checks || []).filter(item => item.passed).length;
    return `
      <div class="visual-qa ${analysis.passed ? 'is-passed' : 'is-blocked'}">
        <div class="visual-qa-header">
          <span><b>LOCAL VISUAL QA</b><small>${analysis.passed ? 'Assignment gate passed' : `${analysis.blockers?.length || 0} blocker${analysis.blockers?.length === 1 ? '' : 's'}`}</small></span>
          <strong>${analysis.score}<i>/100</i></strong>
        </div>
        <div class="visual-qa-summary">${passedCount}/${analysis.checks?.length || 0} checks passed · deterministic · no API cost</div>
        ${failures.length ? `<div class="visual-qa-findings">${failures.map(item => `<div class="${item.severity}"><b>${this.esc(item.name)}</b><span>${this.esc(item.evidence)}</span><small>${this.esc(item.remedy)}</small></div>`).join('')}</div>` : '<div class="visual-qa-clean">Alpha, framing, readability, palette, and continuity checks are clean.</div>'}
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#atlasCopyBoardBrief')?.addEventListener('click', () => {
      const slim = slimBoardArtBrief(buildLiveBoardArtBrief(this.project));
      void navigator.clipboard?.writeText(JSON.stringify(slim, null, 2)).then(() => {
        this.visualMessage = {
          text: `Board art brief copied · ${slim.slots.length} symbols. Ways boards: do not commission cluster-hex gems.`,
        };
        this.render();
      }).catch((error) => {
        this.visualMessage = { error: true, text: error?.message || 'Clipboard copy failed.' };
        this.render();
      });
    });
    this.container.querySelector('#atlasApplyBoardPack')?.addEventListener('click', () => {
      const result = applyBoardSymbolPack(this.project);
      this.visualMessage = result.filled
        ? { text: `Board pack applied · ${result.filled} empty slots. Existing art was left alone.` }
        : { text: 'Board pack: no empty slots. Real art stays.' };
      this.commit();
    });
    this.container.querySelector('#visualReferenceUpload')?.addEventListener('change', event => this.handleReferenceUpload(event));
    this.container.querySelectorAll('.reference-approve').forEach(button => {
      button.addEventListener('click', () => {
        try {
          const factory = normalizeVisualFactoryState(this.project);
          const reference = factory.references.find(item => item.id === button.dataset.referenceId);
          const current = getVisualCohesionStatus(this.project).currentFingerprint;
          const alreadyCurrent = reference?.approved && reference.bibleFingerprint === current;
          approveVisualReference(this.project, button.dataset.referenceId, !alreadyCurrent);
          this.visualMessage = { text: alreadyCurrent ? 'Reference anchor removed from generation routing.' : 'Reference anchor approved for the current Art Direction Bible.' };
          this.commit();
        } catch (error) {
          this.visualMessage = { error: true, text: error.message };
          this.render();
        }
      });
    });
    this.container.querySelectorAll('.reference-remove').forEach(button => {
      button.addEventListener('click', () => {
        removeVisualReference(this.project, button.dataset.referenceId);
        this.visualMessage = { text: 'Reference anchor removed from the project.' };
        this.commit();
      });
    });
    this.container.querySelector('#artBibleForge')?.addEventListener('click', () => {
      const factory = normalizeVisualFactoryState(this.project);
      factory.artBible = forgeArtBible(this.project);
      factory.latest = null;
      this.visualMessage = { text: 'A complete professional Bible was forged from the current theme. Review it, then lock it.' };
      this.commit();
    });
    this.container.querySelector('#artBibleLock')?.addEventListener('click', () => {
      try {
        this.captureArtBibleForm();
        const fingerprint = lockArtBible(this.project);
        this.visualMessage = { text: `Art Direction Bible locked as ${fingerprint}. Future candidates inherit this exact lineage.` };
        this.commit();
      } catch (error) {
        this.visualMessage = { error: true, text: error.message };
        this.render();
      }
    });
    this.container.querySelectorAll('[data-art-bible]').forEach(input => {
      input.addEventListener('change', () => {
        this.captureArtBibleForm();
        this.onChange?.();
        this.render();
      });
    });
    this.container.querySelector('#visualTarget')?.addEventListener('change', event => {
      const factory = normalizeVisualFactoryState(this.project);
      factory.selectedTarget = event.target.value;
      if (factory.correctionPlan && factory.correctionPlan.targetKey !== event.target.value) {
        factory.correctionPlan = null;
        factory.detail = '';
        this.visualMessage = { text: 'Correction draft cleared because the asset target changed.' };
        this.render();
      }
      this.onChange?.();
    });
    this.container.querySelector('#visualQuality')?.addEventListener('change', event => {
      this.project.visualFactory.quality = event.target.value;
      this.onChange?.();
    });
    this.container.querySelector('#visualDetail')?.addEventListener('change', event => {
      this.project.visualFactory.detail = event.target.value.trim();
      this.onChange?.();
    });
    this.container.querySelector('#visualGenerate')?.addEventListener('click', () => this.generateVisual());
    this.container.querySelector('#visualProductionPlan')?.addEventListener('click', () => this.planVisualProduction());
    this.container.querySelector('#visualWorkOrderPrepare')?.addEventListener('click', () => this.prepareVisualWorkOrder());
    this.container.querySelector('#visualWorkOrderDownload')?.addEventListener('click', () => this.downloadVisualWorkOrder());
    this.container.querySelector('#visualDeliveryIngest')?.addEventListener('click', () => this.ingestVisualDelivery());
    this.container.querySelector('#codexVisualBatchStart')?.addEventListener('click', () => this.startCodexVisualBatch());
    this.container.querySelector('#visualProductionAuthorize')?.addEventListener('change', event => {
      this.visualProductionAuthorized = event.target.checked;
      this.render();
    });
    this.container.querySelector('#visualProductionLimit')?.addEventListener('change', event => {
      normalizeVisualFactoryState(this.project).batchRequestLimit = Math.max(1, Math.min(10, Number(event.target.value) || 3));
      this.commit();
    });
    this.container.querySelector('#visualProductionRun')?.addEventListener('click', () => this.runVisualProductionBatch());
    this.container.querySelector('#visualProductionRetry')?.addEventListener('click', () => {
      const run = normalizeAssetProductionRun(this.project);
      const failed = run?.items.find(item => item.state === 'failed');
      if (!failed) return;
      resetAssetProductionItem(this.project, failed.key);
      normalizeVisualFactoryState(this.project).selectedTarget = failed.key;
      this.visualMessage = { text: `${failed.label} is eligible for a fresh bounded correction cycle.` };
      this.commit();
    });
    this.container.querySelectorAll('[data-production-target]').forEach(button => button.addEventListener('click', () => {
      normalizeVisualFactoryState(this.project).selectedTarget = button.dataset.productionTarget;
      this.onChange?.();
      this.render();
    }));
    this.container.querySelector('#visualNext')?.addEventListener('click', () => {
      const next = getVisualFactoryTargets(this.project).find(item => !item.ready);
      if (next) this.generateVisual(next.key);
    });
    this.container.querySelector('#visualAssign')?.addEventListener('click', () => this.assignVisual());
    this.container.querySelector('#visualReanalyze')?.addEventListener('click', () => this.reanalyzeVisual());
    this.container.querySelector('#visualPrepareCorrection')?.addEventListener('click', () => this.prepareVisualCorrection());
    this.container.querySelector('#assetIntegrityRun')?.addEventListener('click', () => this.runAssetIntegrityAudit());
    this.container.querySelector('#visualCohesionRun')?.addEventListener('click', () => this.runVisualCohesionAudit());
    document.getElementById('atlasUpload')?.addEventListener('change', (e) => this.handleUpload(e));
    document.getElementById('atlasFromSymbols')?.addEventListener('click', () => this.importSymbolArt());
    document.getElementById('atlasPack')?.addEventListener('click', () => this.packAtlas());
    document.getElementById('atlasPadding')?.addEventListener('change', (e) => {
      this.padding = parseInt(e.target.value) || 0;
      this.onChange?.();
    });
    document.getElementById('atlasMaxSize')?.addEventListener('change', (e) => {
      this.maxSize = parseInt(e.target.value);
      this.onChange?.();
    });
    document.getElementById('atlasDownloadPNG')?.addEventListener('click', () => this.downloadPNG());
    document.getElementById('atlasDownloadJSON')?.addEventListener('click', () => this.downloadJSON());

    this.container.querySelectorAll('.asset-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        this.assets.splice(parseInt(btn.dataset.index), 1);
        this.packedAtlas = null;
        this.commit();
      });
    });
  }

  esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  async loadVisualCapabilities() {
    try {
      const response = await fetch('/__stake_studio/visual/capabilities');
      this.visualCapabilities = response.ok ? await response.json() : { configured: false };
    } catch {
      this.visualCapabilities = { configured: false };
    }
    // The main container is shared by every panel. Do not repaint it if the
    // user switched tabs while the capability request was in flight.
    if (this.container.querySelector('.atlas-panel')) this.render();
  }

  assetMime(src) {
    const match = String(src || '').match(/^data:([^;,]+)/i);
    return match?.[1]?.toLowerCase() || (String(src || '').startsWith('blob:') ? 'blob' : 'external');
  }

  assetEncodedBytes(src) {
    const value = String(src || '');
    const comma = value.indexOf(',');
    if (comma < 0) return value.length;
    const header = value.slice(0, comma);
    const payload = value.slice(comma + 1);
    if (!header.includes(';base64')) return new TextEncoder().encode(payload).length;
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * .75) - padding);
  }

  loadImageStrict(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('browser image decoder rejected the source'));
      image.src = src;
    });
  }

  inspectDecodedPixels(image) {
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let transparent = 0;
    let riskyTransparent = 0;
    let edgePixels = 0;
    let opaqueEdge = 0;
    let croppedEdge = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const alpha = pixels[offset + 3];
        if (alpha < 250) transparent++;
        if (alpha <= 32 && Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 64) riskyTransparent++;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          edgePixels++;
          if (alpha >= 250) opaqueEdge++;
          if (alpha >= 32) croppedEdge++;
        }
      }
    }
    return {
      hasTransparency: transparent > 0,
      opaqueEdgeRatio: edgePixels ? opaqueEdge / edgePixels : 0,
      croppedEdgeRatio: edgePixels ? croppedEdge / edgePixels : 0,
      transparentColorRisk: width * height ? riskyTransparent / (width * height) : 0,
    };
  }

  async inspectIntegrityAsset(asset) {
    const base = {
      id: asset.id,
      sourceFingerprint: `${String(asset.src || '').length}:${String(asset.src || '').slice(0, 24)}:${String(asset.src || '').slice(-32)}`,
      mime: this.assetMime(asset.src),
      portable: String(asset.src || '').startsWith('data:image/'),
      byteLength: this.assetEncodedBytes(asset.src),
    };
    if (!asset.src) return { ...base, loaded: false, error: 'missing source' };
    try {
      const image = await this.loadImageStrict(asset.src);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      return { ...base, loaded: true, width, height, decodedBytes: width * height * 4, ...this.inspectDecodedPixels(image) };
    } catch (error) {
      return { ...base, loaded: false, error: error.message };
    }
  }

  async runAssetIntegrityAudit() {
    if (this.integrityBusy) return;
    this.integrityBusy = true;
    this.render();
    try {
      const samples = await this.collectAssetIntegritySamples();
      recordAssetIntegrityQA(this.project, samples);
      this.onChange?.();
    } finally {
      this.integrityBusy = false;
      this.render();
    }
  }

  async collectAssetIntegritySamples() {
    const inventory = buildAssetIntegrityInventory(this.project);
    const cache = new Map();
    const samples = [];
    for (const asset of inventory) {
      const key = asset.src || asset.id;
      let measured = cache.get(key);
      if (!measured) {
        measured = await this.inspectIntegrityAsset(asset);
        cache.set(key, measured);
      }
      samples.push({ ...measured, id: asset.id });
    }
    return samples;
  }

  async analyzeVisualPackItem(item) {
    const references = getApplicableVisualReferences(this.project, item)
      .slice(0, 4)
      .map(reference => ({ id: reference.id, role: reference.role, src: reference.src }));
    if (!item.src) return { id: item.id, sourceFingerprint: '', analysis: null };
    try {
      const response = await fetch('/__stake_studio/visual/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: item.src, slot: item.slot,
          palette: normalizeVisualFactoryState(this.project).artBible.palette,
          references,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Local visual QA failed.');
      return { id: item.id, sourceFingerprint: getVisualSourceFingerprint(item.src), analysis: payload.analysis };
    } catch (error) {
      return {
        id: item.id, sourceFingerprint: getVisualSourceFingerprint(item.src),
        analysis: { format: 'stake-studio-visual-analysis-error-v1', passed: false, checks: [], error: error.message },
      };
    }
  }

  async runVisualCohesionAudit() {
    if (this.cohesionBusy || this.integrityBusy) return;
    this.cohesionBusy = true;
    this.visualMessage = { text: 'Auditing the complete visual pack locally…' };
    this.render();
    try {
      if (!getAssetIntegritySummary(this.project).complete) {
        recordAssetIntegrityQA(this.project, await this.collectAssetIntegritySamples());
      }
      const samples = [];
      for (const item of buildVisualCohesionInventory(this.project)) samples.push(await this.analyzeVisualPackItem(item));
      const summary = recordVisualCohesionQA(this.project, samples);
      this.visualMessage = summary.complete
        ? { text: `Visual Pack QA passed: ${summary.passedAssets}/${summary.totalAssets} assets and every cross-pack contract are clean.` }
        : { error: true, text: `Visual Pack QA found ${summary.issues.length} contract failure${summary.issues.length === 1 ? '' : 's'}.` };
      this.onChange?.();
    } finally {
      this.cohesionBusy = false;
      this.render();
    }
  }

  captureVisualForm(targetKey) {
    const factory = normalizeVisualFactoryState(this.project);
    this.captureArtBibleForm();
    factory.selectedTarget = targetKey || this.container.querySelector('#visualTarget')?.value || factory.selectedTarget;
    factory.quality = this.container.querySelector('#visualQuality')?.value || factory.quality;
    factory.detail = this.container.querySelector('#visualDetail')?.value.trim() || '';
    return factory;
  }

  captureArtBibleForm() {
    const factory = normalizeVisualFactoryState(this.project);
    this.container.querySelectorAll('[data-art-bible]').forEach(input => {
      factory.artBible[input.dataset.artBible] = input.value.trim();
    });
    return factory.artBible;
  }

  async handleReferenceUpload(event) {
    const role = this.container.querySelector('#visualReferenceRole')?.value || 'style';
    try {
      for (const file of Array.from(event.target.files || [])) {
        if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} exceeds the 12 MB reference limit.`);
        const src = await this.readFile(file);
        const image = await this.loadImage(src);
        addVisualReference(this.project, {
          name: file.name.replace(/\.[^.]+$/, ''), role, src,
          width: image.naturalWidth || image.width, height: image.naturalHeight || image.height,
        });
      }
      this.visualMessage = { text: 'Reference added. Inspect it and approve it against the locked Bible before generation routing.' };
      this.commit();
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
    }
  }

  planVisualProduction() {
    this.captureArtBibleForm();
    const quality = this.container.querySelector('#visualProductionQuality')?.value || 'review';
    const maxAttempts = Number(this.container.querySelector('#visualProductionAttempts')?.value) || 2;
    normalizeVisualFactoryState(this.project).productionQuality = quality;
    const run = createAssetProductionRun(this.project, { quality, maxAttempts });
    const summary = getAssetProductionSummary(this.project, false);
    this.visualProductionAuthorized = false;
    this.visualMessage = run.blockers.length
      ? { error: true, text: `Production plan created but blocked: ${run.blockers[0]}` }
      : { text: `${summary.total} production slots planned in dependency order. ${summary.assigned} existing assignments were preserved; no image was requested.` };
    this.commit();
    return run;
  }

  prepareVisualWorkOrder() {
    this.captureArtBibleForm();
    const quality = this.container.querySelector('#visualProductionQuality')?.value || 'review';
    const maxAttempts = Number(this.container.querySelector('#visualProductionAttempts')?.value) || 2;
    try {
      const workOrder = createVisualWorkOrder(this.project, { quality, maxAttempts, replan: true });
      this.visualProductionAuthorized = false;
      const held = workOrder.items.length - workOrder.productionOrder.length;
      this.visualMessage = { text: `Free visual handoff prepared: ${workOrder.productionOrder.length} exact PNG deliverable${workOrder.productionOrder.length === 1 ? '' : 's'} in continuity-safe order.${held ? ` ${held} protected or existing item${held === 1 ? '' : 's'} excluded.` : ''} No image request was made.` };
      this.commit();
      return workOrder;
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
      return null;
    }
  }

  startCodexVisualBatch() {
    try {
      const batch = startCodexVisualBatch(this.project, { force: true });
      const summary = getCodexVisualBatchSummary(this.project);
      this.visualMessage = {
        text: summary.status === 'complete'
          ? 'Codex visual batch is already complete.'
          : `Codex batch started: ${summary.accepted}/${summary.total} accepted. The next eligible task is ${summary.currentTaskKey || 'waiting for a master'}.`,
      };
      this.commit();
      return batch;
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
      return null;
    }
  }

  downloadVisualWorkOrder() {
    const workOrder = normalizeVisualFactoryState(this.project).workOrder;
    const status = getVisualWorkOrderStatus(this.project);
    if (!workOrder || !status.current) {
      this.visualMessage = { error: true, text: status.reason };
      this.render();
      return;
    }
    const blob = new Blob([JSON.stringify(workOrder, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${String(workOrder.project.id || 'game').replace(/[^a-z0-9_-]+/gi, '_')}_visual_work_order.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    this.visualMessage = { text: 'Portable visual work order downloaded. Give it to Codex, an artist, or any compatible image tool, then import the exact named PNGs in Game Config → Asset Pack.' };
    this.render();
  }

  async ingestVisualDelivery() {
    if (this.visualDeliveryBusy) return null;
    const workOrderStatus = getVisualWorkOrderStatus(this.project);
    if (!workOrderStatus.current) {
      this.visualMessage = { error: true, text: workOrderStatus.reason };
      this.render();
      return null;
    }
    this.visualDeliveryBusy = true;
    this.visualMessage = { text: 'Scanning the visual delivery folder. No external service is being called.' };
    this.render();
    try {
      const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/visual-delivery`);
      const scan = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(scan.error || 'Visual delivery folder could not be scanned.');
      beginVisualDeliveryReceipt(this.project, scan);
      const factory = normalizeVisualFactoryState(this.project);
      const workOrder = factory.workOrder;
      const files = new Map((scan.files || []).map(file => [String(file.filename).toLowerCase(), file]));
      const expected = new Set(workOrder.items.map(item => String(item.output.filename).toLowerCase()));
      let accepted = 0;
      let rejected = 0;
      let waiting = 0;
      let skipped = 0;

      for (const key of workOrder.productionOrder) {
        const item = workOrder.items.find(candidate => candidate.key === key);
        const file = files.get(String(item.output.filename).toLowerCase());
        if (!file) continue;
        try {
          const dimensions = await this.loadImageStrict(file.dataUrl).then(image => ({
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          }));
          const candidate = createVisualDeliveryCandidate(this.project, file, dimensions);
          const previous = findVisualDeliveryResult(this.project, candidate.fingerprint);
          const targetReady = getVisualFactoryTargets(this.project).find(target => target.key === item.key)?.ready;
          if (previous && (previous.status === 'rejected' || targetReady)) {
            skipped += 1;
            continue;
          }
          factory.latest = candidate.result;
          const analysis = await this.analyzeVisualCandidate(candidate.result);
          if (!analysis.passed) {
            recordVisualDeliveryResult(this.project, {
              key: item.key,
              filename: file.filename,
              fileFingerprint: candidate.fingerprint,
              status: 'rejected',
              score: analysis.score,
              error: analysis.blockers?.[0]?.name || 'Local visual QA failed.',
            });
            rejected += 1;
            continue;
          }
          const assignment = assignGeneratedVisual(this.project, candidate.result);
          recordVisualDeliveryResult(this.project, {
            key: item.key,
            filename: file.filename,
            fileFingerprint: candidate.fingerprint,
            status: 'accepted',
            score: analysis.score,
            assignmentKey: assignment.assignmentKey,
          });
          refreshAssetProductionRun(this.project);
          accepted += 1;
        } catch (error) {
          const dependencyWait = /waiting for its required master/i.test(error.message);
          recordVisualDeliveryResult(this.project, {
            key: item.key,
            filename: file.filename,
            fileFingerprint: `file-${file.bytes || 0}-${file.modifiedAt || ''}`,
            status: dependencyWait ? 'waiting' : 'rejected',
            error: error.message,
          });
          if (dependencyWait) waiting += 1;
          else rejected += 1;
        }
      }

      for (const file of scan.files || []) {
        if (expected.has(String(file.filename).toLowerCase())) continue;
        recordVisualDeliveryResult(this.project, {
          key: null,
          filename: file.filename,
          fileFingerprint: `unexpected-${file.bytes || 0}-${file.modifiedAt || ''}`,
          status: 'rejected',
          error: 'File is not declared by the current visual work order.',
        });
        rejected += 1;
      }

      const summary = finishVisualDeliveryReceipt(this.project);
      const presentExpected = workOrder.productionOrder.filter(key => {
        const item = workOrder.items.find(candidate => candidate.key === key);
        return files.has(String(item.output.filename).toLowerCase());
      }).length;
      const missing = Math.max(0, workOrder.productionOrder.length - presentExpected);
      this.visualMessage = accepted || rejected || waiting || skipped
        ? {
          error: Boolean(rejected || waiting),
          text: `Delivery scan complete: ${accepted} accepted, ${rejected} rejected, ${waiting} waiting, ${skipped} unchanged, ${missing} requested file${missing === 1 ? '' : 's'} not present. No paid request was made.`,
        }
        : { text: `Delivery folder is ready at ${scan.folder}. Add exact named PNGs from the work order, then scan again.` };
      this.onChange?.();
      return { ...summary, acceptedThisScan: accepted, rejectedThisScan: rejected, waitingThisScan: waiting, skippedThisScan: skipped, missing };
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      return { error: error.message };
    } finally {
      this.visualDeliveryBusy = false;
      this.render();
    }
  }

  async requestProductionCandidate(item, quality, detail = '') {
    const factory = normalizeVisualFactoryState(this.project);
    const selected = getVisualFactoryTargets(this.project).find(target => target.key === item.key);
    if (!selected) throw new Error(`${item.label} no longer exists in the project.`);
    const compiledDirection = compileArtDirection(this.project, selected);
    factory.selectedTarget = selected.key;
    factory.quality = quality;
    factory.detail = detail || '';
    const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/visual-factory/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot: selected.slot, target: selected.target, direction: compiledDirection.text,
        detail: factory.detail, quality, coherenceFingerprint: compiledDirection.fingerprint,
        references: compiledDirection.references.map(reference => ({
          id: reference.id, name: reference.name, role: reference.role,
          src: reference.src, imageFingerprint: reference.imageFingerprint,
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Visual generation failed.');
    if (item.correction) payload.result.correction = item.correction;
    factory.latest = payload.result;
    const analysis = await this.analyzeVisualCandidate(factory.latest);
    return { selected, result: factory.latest, analysis };
  }

  async runVisualProductionBatch(requestLimit = null) {
    if (this.visualProductionBusy) return null;
    if (!this.visualProductionAuthorized && requestLimit === null) {
      this.visualMessage = { error: true, text: 'Authorize the displayed paid-request ceiling before starting a batch.' };
      this.render();
      return null;
    }
    const factory = normalizeVisualFactoryState(this.project);
    const run = refreshAssetProductionRun(this.project);
    if (!run) return this.planVisualProduction();
    const limit = Math.max(1, Math.min(10, Number(requestLimit ?? this.container.querySelector('#visualProductionLimit')?.value ?? factory.batchRequestLimit) || 3));
    factory.batchRequestLimit = limit;
    this.visualProductionBusy = true;
    this.visualProductionAuthorized = false;
    let requested = 0;
    let assigned = 0;
    this.visualMessage = { text: `Bounded visual production started. It will stop after at most ${limit} paid request${limit === 1 ? '' : 's'}.` };
    this.render();
    try {
      while (requested < limit) {
        const item = getNextAssetProductionItem(this.project);
        if (!item) break;
        beginAssetProductionAttempt(this.project, item.key);
        requested += 1;
        this.visualMessage = { text: `${requested}/${limit} · generating ${item.label.toLowerCase()} · attempt ${item.attempts}/${run.maxAttempts}` };
        this.onChange?.();
        this.render();
        try {
          const candidate = await this.requestProductionCandidate(item, run.quality, item.correction?.direction || '');
          if (candidate.analysis.passed) {
            const assignment = assignGeneratedVisual(this.project, candidate.result);
            finishAssetProductionAttempt(this.project, item.key, {
              assigned: true,
              score: candidate.analysis.score,
              assignmentKey: assignment.assignmentKey,
            });
            assigned += 1;
          } else {
            const correction = createVisualCorrectionPlan(candidate.result);
            finishAssetProductionAttempt(this.project, item.key, {
              assigned: false,
              score: candidate.analysis.score,
              correction,
              error: `${candidate.analysis.blockers.length} local QA blocker${candidate.analysis.blockers.length === 1 ? '' : 's'}; correction ${correction.attempt} prepared.`,
            });
          }
        } catch (error) {
          finishAssetProductionAttempt(this.project, item.key, { assigned: false, error: error.message });
        }
        this.onChange?.();
        this.render();
      }
      const summary = getAssetProductionSummary(this.project);
      if (summary.complete) {
        if (this.assets.length) await this.packAtlas();
        await this.runAssetIntegrityAudit();
        await this.runVisualCohesionAudit();
      }
      this.visualMessage = summary.complete
        ? { text: `Production pack assembled: ${summary.assigned}/${summary.total} assets assigned, packed, and audited.` }
        : summary.runnable
          ? { text: `Batch ceiling reached: ${requested} request${requested === 1 ? '' : 's'}, ${assigned} asset${assigned === 1 ? '' : 's'} assigned. Resume when ready.` }
          : { error: true, text: `Production paused with ${summary.assigned}/${summary.total} assigned. Inspect protected or attempt-limited items before resuming.` };
      return summary;
    } finally {
      this.visualProductionBusy = false;
      this.onChange?.();
      this.render();
    }
  }

  async generateVisual(targetKey = null) {
    if (this.visualBusy) return;
    const factory = this.captureVisualForm(targetKey);
    const selected = getVisualFactoryTargets(this.project).find(item => item.key === factory.selectedTarget);
    if (!selected) return;
    let compiledDirection;
    try {
      compiledDirection = compileArtDirection(this.project, selected);
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
      return;
    }
    this.visualBusy = true;
    const correctionPlan = factory.correctionPlan?.targetKey === selected.key ? factory.correctionPlan : null;
    this.visualMessage = { text: `Requesting one ${factory.quality} ${selected.label.toLowerCase()} candidate…` };
    this.render();
    try {
      const response = await fetch(`/__stake_studio/projects/${encodeURIComponent(this.projectId)}/visual-factory/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: selected.slot, target: selected.target, direction: compiledDirection.text,
          detail: factory.detail, quality: factory.quality, coherenceFingerprint: compiledDirection.fingerprint,
          references: compiledDirection.references.map(reference => ({
            id: reference.id, name: reference.name, role: reference.role,
            src: reference.src, imageFingerprint: reference.imageFingerprint,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Visual generation failed.');
      if (correctionPlan) payload.result.correction = correctionPlan;
      factory.latest = payload.result;
      factory.correctionPlan = null;
      this.visualMessage = { text: 'Candidate received. Running deterministic local visual QA…' };
      this.onChange?.();
      this.render();
      const analysis = await this.analyzeVisualCandidate(factory.latest);
      this.visualMessage = analysis.passed
        ? { text: `Local visual QA passed at ${analysis.score}/100. Inspect the candidate, then approve it.` }
        : { error: true, text: `Assignment blocked by local visual QA: ${analysis.blockers.length} blocker${analysis.blockers.length === 1 ? '' : 's'}, ${analysis.warnings.length} warning${analysis.warnings.length === 1 ? '' : 's'}.` };
      this.onChange?.();
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
    } finally {
      this.visualBusy = false;
      this.render();
    }
  }

  prepareVisualCorrection() {
    const factory = normalizeVisualFactoryState(this.project);
    if (!factory.latest) return;
    try {
      const plan = createVisualCorrectionPlan(factory.latest);
      factory.correctionPlan = plan;
      factory.selectedTarget = plan.targetKey;
      factory.detail = plan.direction;
      this.visualMessage = { text: `Correction ${plan.attempt} prepared from ${plan.issueIds.length} measured failure${plan.issueIds.length === 1 ? '' : 's'}. Review it; no image has been requested.` };
      this.commit();
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
    }
  }

  async analyzeVisualCandidate(result) {
    const factory = normalizeVisualFactoryState(this.project);
    const referenceIds = new Set((result.references || []).map(reference => reference.id));
    const references = [...(factory.references || []), ...getGeneratedVisualAnchors(this.project)]
      .filter(reference => referenceIds.has(reference.id))
      .slice(0, 4)
      .map(reference => ({ id: reference.id, role: reference.role, src: reference.src }));
    const response = await fetch('/__stake_studio/visual/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: result.dataUrl,
        slot: result.slot,
        palette: factory.artBible.palette,
        references,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Local visual QA failed.');
    recordVisualAnalysis(this.project, result, payload.analysis);
    return payload.analysis;
  }

  async reanalyzeVisual() {
    const factory = normalizeVisualFactoryState(this.project);
    if (!factory.latest || this.visualBusy) return;
    this.visualBusy = true;
    this.visualMessage = { text: 'Re-running deterministic local visual QA…' };
    this.render();
    try {
      const analysis = await this.analyzeVisualCandidate(factory.latest);
      this.visualMessage = analysis.passed
        ? { text: `Local visual QA passed at ${analysis.score}/100.` }
        : { error: true, text: `Assignment remains blocked: ${analysis.blockers.length} blocker${analysis.blockers.length === 1 ? '' : 's'}.` };
      this.onChange?.();
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
    } finally {
      this.visualBusy = false;
      this.render();
    }
  }

  assignVisual() {
    const factory = normalizeVisualFactoryState(this.project);
    if (!factory.latest) return;
    try {
      assignGeneratedVisual(this.project, factory.latest);
      this.visualMessage = { text: 'Candidate assigned. Texture atlas and visual QA approvals were safely invalidated for review.' };
      this.commit();
    } catch (error) {
      this.visualMessage = { error: true, text: error.message };
      this.render();
    }
  }

  async handleUpload(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const src = await this.readFile(file);
      const img = await this.loadImage(src);
      this.assets.push({
        name: file.name.replace(/\.[^.]+$/, ''),
        src,
        width: img.width,
        height: img.height,
      });
    }
    this.packedAtlas = null;
    this.commit();
  }

  async importSymbolArt() {
    const symbols = this.project.theme.symbols || [];
    let added = 0;

    // Dimensions must come from a decoded image — naturalWidth reads 0 until load.
    for (const sym of symbols) {
      if (sym.src && !this.assets.find(a => a.name === sym.name)) {
        const img = await this.loadImage(sym.src);
        this.assets.push({
          name: sym.name,
          src: sym.src,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
        added++;
      }
    }

    if (added === 0) {
      const layers = this.project.theme.cabinet?.layers || [];
      for (const layer of layers) {
        if (layer.src && !this.assets.find(a => a.name === layer.type)) {
          const img = await this.loadImage(layer.src);
          this.assets.push({
            name: layer.type || `layer_${layer.zIndex}`,
            src: layer.src,
            width: img.naturalWidth || layer.width || 128,
            height: img.naturalHeight || layer.height || 128,
          });
          added++;
        }
      }
    }

    if (added > 0) {
      this.packedAtlas = null;
      this.commit();
    }
  }

  async packAtlas() {
    if (this.assets.length === 0) return;

    const images = await Promise.all(this.assets.map(a => this.loadImage(a.src)));
    const rects = this.assets.map((a, i) => ({
      index: i,
      name: a.name,
      w: images[i].width + this.padding * 2,
      h: images[i].height + this.padding * 2,
      img: images[i],
    }));

    rects.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

    const { width, height, placements } = this.binPack(rects);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const frames = {};
    for (const p of placements) {
      const r = rects[p.rectIdx];
      ctx.drawImage(r.img, p.x + this.padding, p.y + this.padding);
      frames[r.name] = {
        frame: { x: p.x + this.padding, y: p.y + this.padding, w: r.img.width, h: r.img.height },
        sourceSize: { w: r.img.width, h: r.img.height },
      };
    }

    this.packedAtlas = {
      width,
      height,
      dataUrl: canvas.toDataURL('image/png'),
      frames,
    };

    this.commit();
  }

  binPack(rects) {
    let size = 128;
    while (size <= this.maxSize) {
      const result = this.tryPack(rects, size, size);
      if (result) return { width: size, height: size, placements: result };
      size *= 2;
    }
    const result = this.tryPack(rects, this.maxSize, this.maxSize);
    return { width: this.maxSize, height: this.maxSize, placements: result || [] };
  }

  tryPack(rects, W, H) {
    const spaces = [{ x: 0, y: 0, w: W, h: H }];
    const placements = [];

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      let bestIdx = -1;
      let bestShort = Infinity;

      for (let s = 0; s < spaces.length; s++) {
        const sp = spaces[s];
        if (r.w <= sp.w && r.h <= sp.h) {
          const leftover = Math.min(sp.w - r.w, sp.h - r.h);
          if (leftover < bestShort) {
            bestShort = leftover;
            bestIdx = s;
          }
        }
      }

      if (bestIdx === -1) return null;

      const sp = spaces[bestIdx];
      placements.push({ rectIdx: i, x: sp.x, y: sp.y });

      const dw = sp.w - r.w;
      const dh = sp.h - r.h;
      let s1, s2;
      if (dw > dh) {
        s1 = { x: sp.x + r.w, y: sp.y, w: dw, h: sp.h };
        s2 = { x: sp.x, y: sp.y + r.h, w: r.w, h: dh };
      } else {
        s1 = { x: sp.x, y: sp.y + r.h, w: sp.w, h: dh };
        s2 = { x: sp.x + r.w, y: sp.y, w: dw, h: r.h };
      }

      spaces.splice(bestIdx, 1);
      if (s1.w > 0 && s1.h > 0) spaces.push(s1);
      if (s2.w > 0 && s2.h > 0) spaces.push(s2);
    }

    return placements;
  }

  downloadPNG() {
    if (!this.packedAtlas) return;
    const a = document.createElement('a');
    a.href = this.packedAtlas.dataUrl;
    a.download = `${this.project.name.replace(/\s+/g, '_')}_atlas.png`;
    a.click();
  }

  downloadJSON() {
    if (!this.packedAtlas) return;
    const atlas = {
      meta: {
        image: `${this.project.name.replace(/\s+/g, '_')}_atlas.png`,
        size: { w: this.packedAtlas.width, h: this.packedAtlas.height },
        format: 'RGBA8888',
        padding: this.padding,
      },
      frames: this.packedAtlas.frames,
    };
    const blob = new Blob([JSON.stringify(atlas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.project.name.replace(/\s+/g, '_')}_atlas.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = src;
    });
  }
}
