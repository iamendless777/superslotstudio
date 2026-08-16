import { STANDARD_ANIMATION_STATES, getAtlasPageNames, getAtlasRegionNames, parseAnimationMapping, validateAnimationConfig } from '../../engines/animation/AnimationEngine.js';
import {
  ANIMATION_QUALITY_PRESETS,
  applyAnimationQualityPreset,
  applySuggestedMappings,
  getAnimationCoverage,
  suggestStateMappings,
} from '../../engines/animation/AnimationProfiles.js';
import {
  RIG_CORRECTION_TYPES,
  getRigCorrectionSummary,
  validateRigCorrections,
} from '../../engines/animation/RigCorrectionEngine.js';
import {
  getPoseMechanicsSummary,
  validatePoseMechanics,
} from '../../engines/animation/PoseMechanicsEngine.js';
import { auditSpineAsset } from '../../engines/animation/SpineAssetAudit.js';
import { spineSkeletonFormat } from '../../engines/animation/SpineAssetCodec.js';
import {
  analyzeSpineMotionPixels,
  clearSpineMotionReview,
  getSpineMotionCases,
  getSpineMotionReviewSummary,
  getSpineMotionSampleTimes,
  recordSpineMotionQA,
} from '../../engines/animation/SpineMotionReview.js';
import {
  analyzeRigPosePixels,
  getRigStressCasePlan,
  getRigStressSummary,
  recordRigStressQA,
} from '../../engines/quality/RigStressQA.js';
import {
  getProjectRigCertificationSummary,
  getRigCertificationSummary,
  recordRigCertification,
} from '../../engines/quality/RigCertificationQA.js';

const GAME_STATES = STANDARD_ANIMATION_STATES;

const STATE_LABELS = {
  idle: 'Idle', spinStart: 'Spin Start', spinning: 'Spinning', spinStop: 'Spin Stop',
  winSmall: 'Win — Small', winMedium: 'Win — Medium', winBig: 'Win — Big',
  winMega: 'Win — Mega', wincap: 'Win Cap',
  anticipation: 'Anticipation', bonusEntry: 'Bonus Entry', bonusIdle: 'Bonus Idle',
  bonusExit: 'Bonus Exit', freeSpinBanner: 'Free Spin Banner', featureResult: 'Feature Result',
  lose: 'No Win', idleAlt: 'Idle Alternate',
};

export class SpinePanel {
  constructor(container, project, onChange) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.selectedAsset = null;
    this.importReport = null;
    this.pendingCorrectionImage = null;
    this.pendingCorrectionImageName = '';
    this.motionReviewCaseId = null;
    this.rigRuntime = null;
    this.rigMountGeneration = 0;
    if (!this.project.animation.spineAssets) this.project.animation.spineAssets = [];
    if (!this.project.animation.stateAnimations) this.project.animation.stateAnimations = {};
    if (!this.project.animation.runtime) this.project.animation.runtime = { version: 1, defaultMix: 0.18, reducedMotion: 'respect', activeSpineAsset: null };
    this.project.production ||= {};
    this.project.production.rig ||= {};
    this.project.production.rig.motionReviews ||= {};
    this.project.production.rig.stressAudits ||= {};
    this.project.production.rig.certifications ||= {};
    for (const key of ['corrections', 'boneLimits', 'drawOrderRules', 'anchors', 'secondaryMotion']) {
      this.project.production.rig[key] ||= [];
    }
    this.render();
  }

  render() {
    if (this.rigSweepFrame) cancelAnimationFrame(this.rigSweepFrame);
    this.rigSweepFrame = null;
    this.rigRuntime?.destroy();
    this.rigRuntime = null;
    this.rigMountGeneration++;
    const assets = this.project.animation.spineAssets;
    const selected = this.selectedAsset !== null ? assets[this.selectedAsset] : null;
    const animationIssues = validateAnimationConfig(this.project);
    const coverage = getAnimationCoverage(this.project);
    const profile = this.project.animation.runtime.profile || 'balanced';
    const selectedSuggestions = selected ? suggestStateMappings(selected) : {};

    this.container.innerHTML = `
      <div class="spine-panel">
        <div class="spine-header">
          <h2>Spine2D Animations</h2>
          <p class="section-desc">Import a Spine 4.3 JSON or binary .skel export, its .atlas, and every declared atlas page image, then map animations to game states.</p>
        </div>

        <div class="spine-factory-toolbar">
          <label class="btn-primary spine-upload-label spine-bundle-upload">
            Import Complete Bundle
            <input type="file" accept=".json,.skel,.atlas,.txt,.png,.jpg,.jpeg,.webp,application/json,application/octet-stream,image/*" id="spineBundleUpload" multiple style="display:none">
          </label>
          <span class="spine-bundle-copy"><strong>One shot:</strong> select one skeleton JSON or .skel, one .atlas, and all page images together.</span>
          <label class="spine-profile-control">Motion profile
            <select id="spineMotionProfile">
              ${Object.entries(ANIMATION_QUALITY_PRESETS).map(([id, preset]) => `<option value="${id}" ${profile === id ? 'selected' : ''}>${preset.name}</option>`).join('')}
            </select>
          </label>
          <button class="btn-secondary" id="spineApplyProfile">Apply Profile</button>
        </div>

        ${this.renderImportReport()}

        <div class="spine-toolbar spine-repair-toolbar">
          <span class="spine-repair-label">Repair / replace individual files:</span>
          <label class="btn-secondary spine-upload-label">
            + Import Spine JSON
            <input type="file" accept=".json,application/json" id="spineUpload" style="display:none">
          </label>
          <label class="btn-secondary spine-upload-label">
            + Import .atlas
            <input type="file" accept=".atlas,.txt" id="spineAtlasTextUpload" style="display:none">
          </label>
          <label class="btn-secondary spine-upload-label">
            + Import Atlas Image
            <input type="file" accept="image/*" id="spineAtlasUpload" style="display:none">
          </label>
          ${selected ? '' : '<span class="spine-hint">Select a skeleton to attach its atlas files.</span>'}
        </div>

        <div class="spine-coverage-card">
          <div class="spine-coverage-heading">
            <div><strong>Choreography coverage</strong><span>${coverage.productionResolved.length}/${coverage.productionResolved.length + coverage.missingProduction.length} production states resolve</span></div>
            <b>${coverage.productionPercent}%</b>
          </div>
          <div class="spine-coverage-track"><i style="width:${coverage.productionPercent}%"></i></div>
          <div class="spine-coverage-actions">
            <span>${coverage.direct.length} direct maps · ${coverage.resolved.length} states including fallbacks</span>
            <button class="btn-secondary" id="spineAutoMap" ${selected ? '' : 'disabled'}>Auto-map Empty</button>
            <button class="btn-secondary" id="spineRemapAll" ${selected ? '' : 'disabled'}>Remap Recognized</button>
            <button class="btn-secondary" id="spineClearMappings" ${selected ? '' : 'disabled'}>Clear This Rig</button>
          </div>
          ${coverage.missingProduction.length ? `<p>Needs animation or fallback: ${coverage.missingProduction.map(state => STATE_LABELS[state]).join(', ')}</p>` : '<p class="is-complete">Core spin, win, anticipation, bonus, and max-win choreography is covered.</p>'}
          ${selected && Object.keys(selectedSuggestions).length ? `<small>Detected ${Object.keys(selectedSuggestions).length} likely state matches in “${this.esc(selected.name)}”.</small>` : ''}
        </div>

        <div class="spine-runtime-summary ${animationIssues.some(issue => issue.severity === 'error') ? 'has-errors' : 'is-ready'}">
          <div><strong>Animation Runtime v1</strong><span>PixiJS 8 · Spine 4.3 · skins · events · pose fallback</span></div>
          <button class="btn-secondary" id="spineOpenPreview">Open Runtime Preview</button>
          ${animationIssues.length ? `<ul>${animationIssues.slice(0, 6).map(issue => `<li class="issue-${issue.severity}">${this.esc(issue.message)}</li>`).join('')}</ul>` : '<p>No animation configuration problems found.</p>'}
        </div>

        <div class="spine-body">
          <div class="spine-sidebar">
            <h3>Skeletons (${assets.length})</h3>
            ${assets.length === 0 ? '<p class="empty-state">No Spine assets imported.</p>' : ''}
            <div class="spine-asset-list">
              ${assets.map((a, i) => `
                <div class="spine-asset-item ${this.selectedAsset === i ? 'selected' : ''}" data-index="${i}">
                  <span class="spine-asset-icon">&#9881;</span>
                  <div class="spine-asset-meta">
                    <span class="spine-asset-name">${this.esc(a.name)}</span>
                    <span class="spine-asset-info">${a.animations?.length || 0} anims, ${a.bones?.length || 0} bones</span>
                  </div>
                  <button class="btn-icon spine-asset-remove" data-index="${i}" title="Remove">&#10005;</button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="spine-detail">
            ${selected ? this.renderDetail(selected) : '<p class="empty-state">Select a skeleton to view details and map animations.</p>'}
          </div>
        </div>

        ${selected ? this.renderRigLab(selected) : ''}

        <div class="spine-mapping-section">
          <h3>State Animation Mapping</h3>
          <p class="section-desc">Assign Spine animations to game states. Each state triggers its mapped animation.</p>
          <div class="state-mapping-grid">
            ${this.renderStateMapping()}
          </div>
        </div>
        <p class="spine-license-note">Spine Runtime notice: anyone using this toolkit to import or build Spine content must hold the appropriate Spine Editor license. Runtime and copyright notices must remain in redistributed products.</p>
      </div>
    `;

    this.bindEvents();
    if (selected) this.mountRigLab(selected);
  }

  async handleBundleImport(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    try {
      const skeletonFiles = files.filter(file => /\.(json|skel)$/i.test(file.name));
      const atlasFiles = files.filter(file => /\.(atlas|txt)$/i.test(file.name));
      const imageFiles = files.filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name));
      if (skeletonFiles.length !== 1 || atlasFiles.length !== 1 || imageFiles.length < 1) {
        throw new Error(`Select exactly one JSON or .skel, one .atlas, and one or more page images (received ${skeletonFiles.length}/${atlasFiles.length}/${imageFiles.length}).`);
      }

      const skeletonFile = skeletonFiles[0];
      const binary = skeletonFile.name.toLowerCase().endsWith('.skel');
      const [skeletonValue, atlasText, ...atlasImageValues] = await Promise.all([
        binary ? skeletonFile.arrayBuffer() : skeletonFile.text(), atlasFiles[0].text(), ...imageFiles.map(file => this.readFileAsDataURL(file)),
      ]);
      const name = skeletonFile.name.replace(/\.[^.]+$/, '');
      let asset;
      if (binary) {
        const { createBinarySpineAsset } = await import('../../engines/animation/SpineBinaryRuntime.js');
        asset = createBinarySpineAsset({ bytes: new Uint8Array(skeletonValue), fileName: skeletonFile.name, atlasText });
      } else {
        let data;
        try { data = JSON.parse(skeletonValue); } catch { throw new Error(`${skeletonFile.name} is not valid JSON.`); }
        if (!data.skeleton || !Array.isArray(data.bones)) throw new Error(`${skeletonFile.name} is not a Spine skeleton export.`);
        asset = this.parseSpineJSON(data, name, skeletonFile.name);
      }
      asset.atlasText = atlasText;
      asset.atlasPages = getAtlasPageNames(atlasText);
      asset.atlasPage = asset.atlasPages[0] || imageFiles[0].name;
      asset.atlasImages = Object.fromEntries(imageFiles.map((file, index) => [file.name, atlasImageValues[index]]));
      asset.atlasImage = asset.atlasImages[asset.atlasPage] || atlasImageValues[0];
      asset.atlasImageName = asset.atlasPage;
      asset.regions = this.parseAtlasRegions(atlasText);

      const missingPages = asset.atlasPages.filter(page => !asset.atlasImages[page]);
      const extraPages = imageFiles.map(file => file.name).filter(name => !asset.atlasPages.includes(name));
      if (!asset.atlasPages.length) throw new Error('The atlas declares no page image.');
      if (missingPages.length) throw new Error(`The atlas expects missing page image${missingPages.length === 1 ? '' : 's'}: ${missingPages.join(', ')}.`);
      if (extraPages.length) throw new Error(`Selected image${extraPages.length === 1 ? '' : 's'} not declared by the atlas: ${extraPages.join(', ')}.`);

      const existingIndex = this.project.animation.spineAssets.findIndex(item => item.name === name);
      if (existingIndex >= 0) {
        asset.placement = this.project.animation.spineAssets[existingIndex].placement || asset.placement;
        asset.activeSkin = this.project.animation.spineAssets[existingIndex].activeSkin || asset.activeSkin;
        this.project.animation.spineAssets[existingIndex] = asset;
        this.selectedAsset = existingIndex;
      } else {
        this.project.animation.spineAssets.push(asset);
        this.selectedAsset = this.project.animation.spineAssets.length - 1;
      }

      this.project.animation.runtime.activeSpineAsset = name;
      this.motionReviewCaseId = null;
      const presetId = document.getElementById('spineMotionProfile')?.value || this.project.animation.runtime.profile || 'balanced';
      const preset = applyAnimationQualityPreset(this.project, presetId);
      const mapping = applySuggestedMappings(this.project, asset, { overwrite: false });
      const audit = auditSpineAsset(asset);
      this.importReport = {
        type: audit.valid ? 'success' : 'error', title: audit.valid ? (existingIndex >= 0 ? 'Spine bundle replaced cleanly' : 'Spine bundle ready') : 'Spine bundle needs repair',
        message: `${binary ? 'Binary .skel' : 'JSON'} · ${asset.animations.length} animations · ${audit.metrics.meshes} audited meshes · ${mapping.applied.length} states mapped · ${preset.name} motion`,
        details: [
          ...audit.issues.map(item => item.message),
          ...mapping.applied.slice(0, 6).map(item => `${STATE_LABELS[item.state]} → ${item.animation}`),
        ],
      };
      this.onChange?.();
      this.render();
    } catch (error) {
      this.importReport = { type: 'error', title: 'Bundle import stopped', message: error.message || 'The selected files could not be imported.' };
      this.render();
    } finally {
      event.target.value = '';
    }
  }

  autoMapSelected(overwrite) {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    const result = applySuggestedMappings(this.project, asset, { overwrite });
    this.project.animation.runtime.activeSpineAsset = asset.name;
    this.importReport = {
      type: 'success', title: overwrite ? 'Recognized states remapped' : 'Empty states auto-mapped',
      message: result.applied.length ? `${result.applied.length} state mappings applied from animation names.` : 'No additional confident animation-name matches were found.',
      details: result.applied.slice(0, 8).map(item => `${STATE_LABELS[item.state]} → ${item.animation}`),
    };
    this.onChange?.();
    this.render();
  }

  clearSelectedMappings() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    let removed = 0;
    for (const [state, value] of Object.entries(this.project.animation.stateAnimations)) {
      if (parseAnimationMapping(value)?.asset === asset.name) {
        delete this.project.animation.stateAnimations[state];
        removed++;
      }
    }
    this.importReport = { type: 'success', title: 'Rig mappings cleared', message: `${removed} mappings removed; the imported files remain available.` };
    this.onChange?.();
    this.render();
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
      reader.readAsDataURL(file);
    });
  }

  renderImportReport() {
    if (!this.importReport) return '';
    const report = this.importReport;
    return `
      <div class="spine-import-report ${report.type === 'error' ? 'has-errors' : 'is-success'}" role="status">
        <strong>${this.esc(report.title)}</strong>
        <span>${this.esc(report.message)}</span>
        ${report.details?.length ? `<ul>${report.details.map(detail => `<li>${this.esc(detail)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  renderDetail(asset) {
    const audit = auditSpineAsset(asset);
    return `
      <div class="spine-detail-content">
        <h3>${this.esc(asset.name)}</h3>
        <div class="spine-detail-grid">
          <div class="spine-detail-section">
            <h4>Skeleton Info</h4>
            <div class="spine-info-row"><span>Format:</span> <span>${spineSkeletonFormat(asset) === 'binary' ? 'Binary .skel' : 'JSON'}</span></div>
            <div class="spine-info-row"><span>Version:</span> <span>${asset.version || '—'}</span></div>
            <div class="spine-info-row"><span>Bones:</span> <span>${asset.bones?.length || 0}</span></div>
            <div class="spine-info-row"><span>Slots:</span> <span>${asset.slots?.length || 0}</span></div>
            <div class="spine-info-row"><span>Skins:</span> <span>${asset.skins?.length || 0}</span></div>
            <div class="spine-info-row"><span>Size:</span> <span>${asset.width || '?'}x${asset.height || '?'}</span></div>
            <div class="spine-info-row"><span>.atlas:</span> <span class="${asset.atlasText ? 'spine-ok' : 'spine-missing'}">${asset.atlasText ? `${asset.regions?.length || 0} regions` : 'missing'}</span></div>
            <div class="spine-info-row"><span>Atlas pages:</span> <span class="${asset.atlasImage ? 'spine-ok' : 'spine-missing'}">${asset.atlasPages?.length || 0} declared · ${asset.atlasPages?.filter((page, index) => asset.atlasImages?.[page] || (index === 0 && asset.atlasImage)).length || 0} loaded</span></div>
            ${!spineSkeletonFormat(asset) || !asset.atlasText || !asset.atlasImage ? `<p class="spine-warn">Incomplete — a Spine runtime needs a skeleton JSON or .skel, the .atlas file and every page image.</p>` : ''}
            ${asset.atlasImage ? `<div class="spine-atlas-preview"><img src="${asset.atlasImage}" alt="Atlas"></div>` : ''}
            <h4>Stage Placement</h4>
            <div class="spine-placement-grid">
              ${['x', 'y', 'width', 'height', 'scale'].map(key => `<label>${key}<input type="number" step="${key === 'scale' ? '0.05' : '1'}" data-placement="${key}" value="${asset.placement?.[key] ?? (key === 'scale' ? 1 : '')}"></label>`).join('')}
            </div>
          </div>

          <div class="spine-detail-section">
            <h4>Animations (${asset.animations?.length || 0})</h4>
            <div class="spine-anim-list">
              ${(asset.animations || []).map(anim => `
                <div class="spine-anim-item">
                  <span class="spine-anim-name">${this.esc(anim.name)}</span>
                  <span class="spine-anim-dur">${anim.duration ? anim.duration.toFixed(2) + 's' : '—'}</span>
                  <span class="spine-anim-tracks">${anim.trackCount} tracks</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="spine-detail-section">
            <h4>Skins & Runtime Look</h4>
            <label class="spine-skin-select">Active skin<select id="spineActiveSkin">
              <option value="">Setup / default attachments</option>
              ${(asset.skins || []).map(skin => `<option value="${this.esc(skin)}" ${asset.activeSkin === skin ? 'selected' : ''}>${this.esc(skin)}</option>`).join('')}
            </select></label>
            <div class="spine-skin-list">
              ${(asset.skins || []).map(skin => `
                <div class="spine-skin-item">${this.esc(skin)}</div>
              `).join('')}
              ${(!asset.skins || asset.skins.length === 0) ? '<span class="empty-state">No skins</span>' : ''}
            </div>
            <div class="spine-pro-audit ${audit.valid ? 'is-valid' : 'has-errors'}">
              <div><b>PRO RIG AUDIT</b><strong>${audit.valid ? 'STRUCTURALLY CLEAN' : 'REPAIR REQUIRED'}</strong></div>
              <span>${audit.metrics.meshVertices} mesh vertices · max ${audit.metrics.maxInfluences} influences · ${audit.metrics.timelines} timelines · ${audit.metrics.keys} keys</span>
              <span>${audit.features.length ? audit.features.map(value => this.esc(value)).join(' · ') : 'Region-only rig · no advanced deformation features detected'}</span>
              ${audit.issues.length ? `<div class="spine-audit-findings">${audit.issues.map(item => `<p class="${item.severity}"><b>${this.esc(item.message)}</b><small>${this.esc(item.remedy)}</small></p>`).join('')}</div>` : '<small>Atlas paths, meshes, weights, clipping budget, deform load, constraints, sequences, and event keys inspected.</small>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderRigLab(asset) {
    const corrections = this.project.production.rig.corrections.filter(correction => correction.asset === asset.name);
    const summary = getRigCorrectionSummary(this.project, asset.name);
    const issues = validateRigCorrections(this.project);
    const defaultBone = asset.bones?.find(name => name !== 'root') || asset.bones?.[0] || '';
    const defaultSlot = asset.slots?.[0] || '';
    const slotAttachments = (asset.attachments || []).filter(item => item.slot === defaultSlot);
    const complete = spineSkeletonFormat(asset) && asset.atlasText && asset.atlasImage;
    const motionReview = getSpineMotionReviewSummary(this.project, asset.name);
    const stressAudit = getRigStressSummary(this.project, asset.name);
    const certification = getRigCertificationSummary(this.project, asset.name);
    const activeMotionCase = motionReview.cases.find(item => item.id === this.motionReviewCaseId)
      || motionReview.nextCase;
    return `
      <section class="rig-lab">
        <div class="rig-lab-header">
          <div>
            <span class="rig-lab-kicker">Corrective deformation</span>
            <h3>Rig Correction Lab</h3>
            <p>Stress a bone, find the angle where volume breaks, then reveal replacement pixels only inside that range.</p>
          </div>
          <div class="rig-lab-summary ${summary.valid ? 'is-valid' : 'has-errors'}">
            <strong>${summary.enabled}/${summary.total}</strong><span>active corrections</span>
            <small>${summary.overlay} overlays · ${summary.attachment} attachment swaps · ${summary.bones.length} bones covered</small>
          </div>
        </div>

        ${issues.length ? `<div class="rig-lab-issues">${issues.slice(0, 5).map(issue => `<span>${this.esc(issue.message)}</span>`).join('')}</div>` : ''}

        <section class="spine-motion-review rig-certification ${certification.complete ? 'is-complete' : certification.fresh ? 'has-repairs' : ''}">
          <div class="rig-card-heading">
            <div><strong>Rig Certification</strong><span>Structure + motion + events + loops + pixel deformation in one factory action.</span></div>
            <b>${certification.complete ? 'CERTIFIED' : certification.stale ? 'STALE' : certification.fresh ? 'REPAIR' : 'NOT RUN'}</b>
          </div>
          <div class="rig-certification-steps">
            <span class="${certification.structural?.valid ? 'is-pass' : 'is-fail'}">1 · Structure ${certification.structural?.valid ? 'passed' : 'needs repair'}</span>
            <span class="${certification.motion?.complete ? 'is-pass' : 'is-fail'}">2 · Motion ${certification.motion?.passed || 0}/${certification.motion?.total || 0}</span>
            <span class="${certification.stress?.complete ? 'is-pass' : 'is-fail'}">3 · Deformation ${certification.stress?.passed || 0}/${certification.stress?.total || 0}</span>
          </div>
          <div class="spine-motion-controls">
            <button class="btn-primary" id="rigCertify" ${complete ? '' : 'disabled'}>${certification.complete ? 'Certify Rig Again' : 'Certify Rig'}</button>
            <span>${certification.complete ? `${certification.motion.framesMeasured} motion frames · ${certification.stress.testedAngles} stress renders · evidence ${certification.fingerprint}` : 'Runs every animation/skin case, then every driven bone/state/angle case.'}</span>
          </div>
          ${certification.issues.length && !certification.complete ? `<div class="spine-audit-findings">${certification.issues.slice(0, 5).map(message => `<p class="error"><b>${this.esc(message)}</b></p>`).join('')}</div>` : ''}
        </section>

        <section class="spine-motion-review ${motionReview.complete ? 'is-complete' : motionReview.repairs ? 'has-repairs' : ''}">
          <div class="rig-card-heading">
            <div><strong>Automated Motion QA Matrix</strong><span>Every animation × every skin; fixed-time rendered evidence resets when the imported rig changes.</span></div>
            <b>${motionReview.passed}/${motionReview.total} passed</b>
          </div>
          ${motionReview.stale ? '<p class="spine-motion-stale">The Spine files changed after review. Previous approvals are stale and have been removed from the release gate.</p>' : ''}
          <div class="spine-motion-controls">
            <label>Review case<select id="spineMotionCase">
              ${motionReview.cases.map(item => `<option value="${this.esc(item.id)}" ${activeMotionCase?.id === item.id ? 'selected' : ''}>${item.status === 'pass' ? '✓' : item.status === 'repair' ? '!' : '○'} ${this.esc(item.skin || 'setup')} / ${this.esc(item.animation)}</option>`).join('')}
            </select></label>
            <button class="btn-secondary" id="spineMotionPreview" ${complete && activeMotionCase ? '' : 'disabled'}>Preview Case</button>
            <button class="btn-primary" id="spineMotionAuto" ${complete && motionReview.total ? '' : 'disabled'}>${motionReview.complete ? 'Run Automated Motion QA Again' : 'Run Automated Motion QA'}</button>
            <button class="btn-tiny" id="spineMotionReset" ${motionReview.reviewed ? '' : 'disabled'}>Reset Evidence</button>
          </div>
          <div class="spine-motion-status">
            <span>${motionReview.framesMeasured} measured frames · ${motionReview.eventsObserved} runtime events · ${motionReview.repairs} repair case${motionReview.repairs === 1 ? '' : 's'} · fingerprint ${motionReview.fingerprint}</span>
            <span id="spineMotionEventTrace">Spine events will appear here while the case plays.</span>
          </div>
          <div class="spine-motion-case-grid">
            ${motionReview.cases.map(item => `<button data-motion-case="${this.esc(item.id)}" class="motion-case-${item.status}" title="${this.esc(item.skin || 'setup')} / ${this.esc(item.animation)}">${item.status === 'pass' ? '✓' : item.status === 'repair' ? '!' : '○'}</button>`).join('')}
          </div>
          ${motionReview.complete ? '<p class="spine-motion-complete">Every exported animation/skin case passed measured visibility, silhouette stability, frame continuity, stage clipping, motion range, loop seam and event-timing checks.</p>' : motionReview.fresh && motionReview.issues.length ? `<div class="spine-audit-findings">${motionReview.issues.slice(0, 5).map(message => `<p class="error"><b>${this.esc(message)}</b></p>`).join('')}</div>` : '<small>One run deterministically seeks thirteen frames per case. Preview remains available for creative acting and timing judgment, but release evidence is automatic.</small>'}
        </section>

        <div class="rig-lab-grid">
          <div class="rig-stress-card">
            <div class="rig-card-heading"><strong>Live stress pose</strong><span id="rigRuntimeStatus">${complete ? 'Loading rig…' : 'Complete the Spine bundle to preview'}</span></div>
            <div class="rig-stress-audit ${stressAudit.complete ? 'is-complete' : stressAudit.fresh ? 'has-failures' : ''}">
              <strong>${stressAudit.complete ? 'Pixel Deformation Audit passed' : stressAudit.stale ? 'Pixel deformation evidence is stale' : stressAudit.fresh ? 'Pixel Deformation Audit needs repair' : 'Pixel Deformation Audit not recorded'}</strong>
              <span>${stressAudit.complete ? `${stressAudit.passed}/${stressAudit.total} bone/state cases · ${stressAudit.testedAngles} measured renders · no residual deformation` : stressAudit.fresh ? `${stressAudit.correctionRequired} corrective-pixel findings · ${stressAudit.poseMechanicsRequired} pose-mechanics findings. ${stressAudit.issues.slice(0, 2).join(' ')}` : `${getRigStressCasePlan(asset).length} bone/state cases will measure nine rendered angles each.`}</span>
              <small>Fingerprint ${stressAudit.fingerprint}${stressAudit.runAt ? ` · ${this.esc(new Date(stressAudit.runAt).toLocaleString())}` : ''}</small>
            </div>
            <div class="rig-preview-stage" id="rigPreviewStage">
              ${complete ? '' : '<span>JSON, atlas and atlas image required</span>'}
            </div>
            <div class="rig-stress-controls">
              <label>Bone<select id="rigStressBone">${(asset.bones || []).map(name => `<option value="${this.esc(name)}" ${name === defaultBone ? 'selected' : ''}>${this.esc(name)}</option>`).join('')}</select></label>
              <label>Game state<select id="rigStressState"><option value="idle">Idle</option>${GAME_STATES.filter(state => state !== 'idle').map(state => `<option value="${state}">${STATE_LABELS[state]}</option>`).join('')}</select></label>
              <label class="rig-angle-control">Angle <output id="rigStressAngleValue">0°</output><input id="rigStressAngle" type="range" min="-180" max="180" step="1" value="0"></label>
              <button class="btn-secondary" id="rigAutoSweep">${stressAudit.complete ? 'Run Pixel Deformation Audit Again' : 'Run Pixel Deformation Audit'}</button>
              <button class="btn-secondary" id="rigResetPose">Reset Pose</button>
            </div>
            <div class="rig-active-corrections" id="rigActiveCorrections">No correction active at 0°.</div>
          </div>

          <div class="rig-author-card">
            <div class="rig-card-heading"><strong>Author a correction</strong><span>Stored in the reusable project contract</span></div>
            <div class="rig-author-grid">
              <label>Name<input id="rigCorrectionName" value="${this.esc(defaultBone ? `${defaultBone} bend fill` : 'Bend fill')}" /></label>
              <label>Correction type<select id="rigCorrectionType">${Object.entries(RIG_CORRECTION_TYPES).map(([id, type]) => `<option value="${id}">${type.label}</option>`).join('')}</select></label>
              <label>Driven bone<select id="rigCorrectionBone">${(asset.bones || []).map(name => `<option value="${this.esc(name)}" ${name === defaultBone ? 'selected' : ''}>${this.esc(name)}</option>`).join('')}</select></label>
              <label>Only during<select id="rigCorrectionState"><option value="any">Any game state</option>${GAME_STATES.map(state => `<option value="${state}">${STATE_LABELS[state]}</option>`).join('')}</select></label>
              <label>From angle<input id="rigCorrectionMin" type="number" min="-180" max="180" value="45" /></label>
              <label>To angle<input id="rigCorrectionMax" type="number" min="-180" max="180" value="135" /></label>
              <label>Priority<input id="rigCorrectionPriority" type="number" value="0" /></label>
            </div>

            <div class="rig-correction-fields" id="rigOverlayFields">
              <label class="rig-art-upload">Correction artwork<input id="rigCorrectionImage" type="file" accept="image/*" /></label>
              <span id="rigCorrectionImageStatus">${this.pendingCorrectionImageName ? this.esc(this.pendingCorrectionImageName) : 'Choose a transparent PNG/WebP patch'}</span>
              <div class="rig-author-grid rig-transform-grid">
                <label>Offset X<input id="rigCorrectionOffsetX" type="number" value="0" /></label>
                <label>Offset Y<input id="rigCorrectionOffsetY" type="number" value="0" /></label>
                <label>Scale<input id="rigCorrectionScale" type="number" min="0.01" step="0.05" value="1" /></label>
                <label>Rotation<input id="rigCorrectionRotation" type="number" value="0" /></label>
                <label>Anchor X<input id="rigCorrectionAnchorX" type="number" min="0" max="1" step="0.05" value="0.5" /></label>
                <label>Anchor Y<input id="rigCorrectionAnchorY" type="number" min="0" max="1" step="0.05" value="0.5" /></label>
              </div>
            </div>

            <div class="rig-correction-fields" id="rigAttachmentFields" hidden>
              <div class="rig-author-grid">
                <label>Slot<select id="rigCorrectionSlot">${(asset.slots || []).map(name => `<option value="${this.esc(name)}" ${name === defaultSlot ? 'selected' : ''}>${this.esc(name)}</option>`).join('')}</select></label>
                <label>Replacement attachment<select id="rigCorrectionAttachment">${slotAttachments.map(item => `<option value="${this.esc(item.name)}">${this.esc(item.skin)} / ${this.esc(item.name)}</option>`).join('')}</select></label>
              </div>
              ${asset.attachments?.length ? '' : '<small>No named attachments were found in this Spine JSON. Add alternate artwork to a Spine skin or use an overlay patch.</small>'}
            </div>
            <button class="btn-primary rig-add-correction" id="rigAddCorrection">Add Correction</button>
          </div>
        </div>

        <div class="rig-correction-list">
          <div class="rig-card-heading"><strong>Correction library</strong><span>${corrections.length ? 'Highest priority wins when attachment ranges overlap.' : 'No corrections authored for this rig yet.'}</span></div>
          ${corrections.map(correction => `
            <article class="rig-correction-item ${correction.enabled === false ? 'is-disabled' : ''}">
              ${correction.type === 'overlay' && correction.image ? `<img src="${correction.image}" alt="">` : '<div class="rig-correction-icon">SWAP</div>'}
              <div><strong>${this.esc(correction.name)}</strong><span>${this.esc(correction.bone)} · ${correction.minAngle}° to ${correction.maxAngle}°${correction.state ? ` · ${this.esc(STATE_LABELS[correction.state] || correction.state)}` : ''}</span><small>${correction.type === 'attachment' ? `${this.esc(correction.slot)} → ${this.esc(correction.attachment)}` : `${this.esc(correction.imageName || 'overlay art')} · offset ${correction.offsetX || 0}, ${correction.offsetY || 0}`}</small></div>
              <label class="rig-enabled-toggle"><input type="checkbox" data-rig-enable="${this.esc(correction.id)}" ${correction.enabled === false ? '' : 'checked'}> enabled</label>
              <button class="btn-tiny" data-rig-delete="${this.esc(correction.id)}" title="Delete correction">×</button>
            </article>
          `).join('')}
        </div>
        ${this.renderPoseMechanics(asset)}
      </section>
    `;
  }

  renderPoseMechanics(asset) {
    const summary = getPoseMechanicsSummary(this.project, asset.name);
    const issues = validatePoseMechanics(this.project);
    const defaultBone = asset.bones?.find(name => name !== 'root') || asset.bones?.[0] || '';
    const firstSlot = asset.slots?.[0] || '';
    const secondSlot = asset.slots?.find(name => name !== firstSlot) || firstSlot;
    const states = `<option value="any">Any game state</option>${GAME_STATES.map(state => `<option value="${state}">${STATE_LABELS[state]}</option>`).join('')}`;
    const bones = (asset.bones || []).map(name => `<option value="${this.esc(name)}" ${name === defaultBone ? 'selected' : ''}>${this.esc(name)}</option>`).join('');
    const slots = (asset.slots || []).map(name => `<option value="${this.esc(name)}">${this.esc(name)}</option>`).join('');
    return `
      <section class="pose-mechanics">
        <div class="rig-lab-header">
          <div><span class="rig-lab-kicker">Runtime pose assistance</span><h3>Pose Mechanics</h3><p>Fix occlusion, plant a contact point, publish prop sockets, and add restrained spring follow-through.</p></div>
          <div class="rig-lab-summary ${summary.valid ? 'is-valid' : 'has-errors'}"><strong>${summary.enabled}/${summary.total}</strong><span>active mechanics</span><small>${summary.drawOrderRules.length} layer · ${summary.anchors.length} anchor · ${summary.secondaryMotion.length} spring</small></div>
        </div>
        ${issues.length ? `<div class="rig-lab-issues">${issues.slice(0, 5).map(issue => `<span>${this.esc(issue.message)}</span>`).join('')}</div>` : ''}
        <div class="pose-author-grid">
          <article class="pose-author-card">
            <div class="rig-card-heading"><strong>Dynamic layer</strong><span>Angle-driven slot order</span></div>
            <label>Name<input id="poseLayerName" value="${this.esc(defaultBone ? `${defaultBone} crossing` : 'Layer crossing')}" /></label>
            <div class="rig-author-grid">
              <label>Driven bone<select id="poseLayerBone">${bones}</select></label>
              <label>Only during<select id="poseLayerState">${states}</select></label>
              <label>From angle<input id="poseLayerMin" type="number" min="-180" max="180" value="45" /></label>
              <label>To angle<input id="poseLayerMax" type="number" min="-180" max="180" value="135" /></label>
              <label>Move slot<select id="poseLayerSlot">${slots}</select></label>
              <label>Relative to<select id="poseLayerRelative">${(asset.slots || []).map(name => `<option value="${this.esc(name)}" ${name === secondSlot ? 'selected' : ''}>${this.esc(name)}</option>`).join('')}</select></label>
              <label>Placement<select id="poseLayerPosition"><option value="after">In front of</option><option value="before">Behind</option></select></label>
              <label>Priority<input id="poseLayerPriority" type="number" value="0" /></label>
            </div>
            <button class="btn-secondary" id="poseAddLayer" ${asset.slots?.length > 1 ? '' : 'disabled'}>Add Layer Rule</button>
          </article>
          <article class="pose-author-card">
            <div class="rig-card-heading"><strong>Contact anchor</strong><span>Plant or publish a socket</span></div>
            <label>Name<input id="poseAnchorName" value="${this.esc(defaultBone ? `${defaultBone} contact` : 'Contact anchor')}" /></label>
            <div class="rig-author-grid">
              <label>Bone<select id="poseAnchorBone">${bones}</select></label>
              <label>Mode<select id="poseAnchorMode"><option value="plant">Plant character</option><option value="socket">Prop / effect socket</option></select></label>
              <label>Only during<select id="poseAnchorState">${states}</select></label>
              <label>Strength<input id="poseAnchorStrength" type="number" min="0.01" max="1" step="0.05" value="1" /></label>
              <label>Target X<input id="poseAnchorX" type="number" placeholder="capture current" /></label>
              <label>Target Y<input id="poseAnchorY" type="number" placeholder="capture current" /></label>
              <label>Priority<input id="poseAnchorPriority" type="number" value="0" /></label>
            </div>
            <small>Plant compensates with the character root. Socket exposes the bone position for props and effects; authored Spine IK remains the right tool for limb solving.</small>
            <button class="btn-secondary" id="poseAddAnchor">Add Anchor</button>
          </article>
          <article class="pose-author-card">
            <div class="rig-card-heading"><strong>Secondary spring</strong><span>Hair, fabric and accessories</span></div>
            <label>Name<input id="poseSpringName" value="${this.esc(defaultBone ? `${defaultBone} follow-through` : 'Follow-through')}" /></label>
            <div class="rig-author-grid">
              <label>Bone<select id="poseSpringBone">${bones}</select></label>
              <label>Only during<select id="poseSpringState">${states}</select></label>
              <label>Stiffness<input id="poseSpringStiffness" type="number" min="0.1" step="1" value="90" /></label>
              <label>Damping<input id="poseSpringDamping" type="number" min="0" step="1" value="14" /></label>
              <label>Maximum lag<input id="poseSpringMax" type="number" min="1" max="180" value="25" /></label>
              <label>Priority<input id="poseSpringPriority" type="number" value="0" /></label>
            </div>
            <button class="btn-secondary" id="poseAddSpring">Add Secondary Motion</button>
          </article>
        </div>
        <div class="pose-runtime-status" id="rigActivePoseMechanics">No pose mechanic active at this stress pose.</div>
        <div class="pose-mechanic-list">
          ${this.renderPoseMechanicItems(summary)}
        </div>
      </section>
    `;
  }

  renderPoseMechanicItems(summary) {
    const items = [
      ...summary.drawOrderRules.map(item => ({ ...item, kind: 'drawOrderRules', meta: `${item.bone} · ${item.minAngle}° to ${item.maxAngle}° · ${item.slot} ${item.position} ${item.relativeTo}` })),
      ...summary.anchors.map(item => ({ ...item, kind: 'anchors', meta: `${item.bone} · ${item.mode === 'plant' ? 'root-compensated plant' : 'prop/effect socket'} · strength ${item.strength}` })),
      ...summary.secondaryMotion.map(item => ({ ...item, kind: 'secondaryMotion', meta: `${item.bone} · stiffness ${item.stiffness} · damping ${item.damping} · max ${item.maxAngle}°` })),
    ];
    return items.length ? items.map(item => `
      <article class="pose-mechanic-item ${item.enabled ? '' : 'is-disabled'}">
        <div><strong>${this.esc(item.name)}</strong><span>${this.esc(item.meta)}${item.state ? ` · ${this.esc(STATE_LABELS[item.state] || item.state)}` : ''}</span></div>
        <label class="rig-enabled-toggle"><input type="checkbox" data-pose-enable="${this.esc(item.id)}" data-pose-kind="${item.kind}" ${item.enabled ? 'checked' : ''}> enabled</label>
        <button class="btn-tiny" data-pose-delete="${this.esc(item.id)}" data-pose-kind="${item.kind}" title="Delete pose mechanic">×</button>
      </article>
    `).join('') : '<p class="empty-state">No pose mechanics authored for this rig yet.</p>';
  }

  renderStateMapping() {
    const assets = this.project.animation.spineAssets;
    const mapping = this.project.animation.stateAnimations;
    const allAnims = [];
    for (const asset of assets) {
      for (const anim of (asset.animations || [])) {
        allAnims.push({ label: `${asset.name} / ${anim.name}`, value: `${asset.name}:${anim.name}` });
      }
    }

    return GAME_STATES.map(state => {
      const parsedCurrent = parseAnimationMapping(mapping[state]);
      const current = parsedCurrent ? `${parsedCurrent.asset}:${parsedCurrent.animation}` : '';
      return `
        <div class="state-map-row">
          <span class="state-map-label">${STATE_LABELS[state]}</span>
          <select class="state-map-select" data-state="${state}">
            <option value="">— None —</option>
            ${allAnims.map(a => `<option value="${this.esc(a.value)}" ${current === a.value ? 'selected' : ''}>${this.esc(a.label)}</option>`).join('')}
          </select>
        </div>
      `;
    }).join('');
  }

  bindEvents() {
    document.getElementById('spineBundleUpload')?.addEventListener('change', (e) => this.handleBundleImport(e));
    document.getElementById('spineUpload')?.addEventListener('change', (e) => this.handleImport(e));
    document.getElementById('spineAtlasUpload')?.addEventListener('change', (e) => this.handleAtlasImage(e));
    document.getElementById('spineAtlasTextUpload')?.addEventListener('change', (e) => this.handleAtlasText(e));
    document.getElementById('spineOpenPreview')?.addEventListener('click', () => window.studio?.activatePanel('preview'));
    document.getElementById('spineApplyProfile')?.addEventListener('click', () => {
      const profile = document.getElementById('spineMotionProfile')?.value || 'balanced';
      const preset = applyAnimationQualityPreset(this.project, profile);
      this.importReport = { type: 'success', title: `${preset.name} motion applied`, message: preset.description };
      this.onChange?.();
      this.render();
    });
    document.getElementById('spineAutoMap')?.addEventListener('click', () => this.autoMapSelected(false));
    document.getElementById('spineRemapAll')?.addEventListener('click', () => this.autoMapSelected(true));
    document.getElementById('spineClearMappings')?.addEventListener('click', () => this.clearSelectedMappings());
    document.getElementById('spineActiveSkin')?.addEventListener('change', event => {
      const asset = this.project.animation.spineAssets[this.selectedAsset];
      if (!asset) return;
      asset.activeSkin = event.target.value || null;
      this.project.animation.runtime.activeSpineAsset = asset.name;
      this.project.animation.runtime.activeSkin = asset.activeSkin;
      this.onChange?.();
      this.render();
    });
    document.getElementById('rigCorrectionType')?.addEventListener('change', event => {
      const attachment = event.target.value === 'attachment';
      const overlayFields = document.getElementById('rigOverlayFields');
      const attachmentFields = document.getElementById('rigAttachmentFields');
      if (overlayFields) overlayFields.hidden = attachment;
      if (attachmentFields) attachmentFields.hidden = !attachment;
    });
    document.getElementById('rigCorrectionImage')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      this.pendingCorrectionImage = await this.readFileAsDataURL(file);
      this.pendingCorrectionImageName = file.name;
      const status = document.getElementById('rigCorrectionImageStatus');
      if (status) status.textContent = `${file.name} ready`;
    });
    document.getElementById('rigCorrectionSlot')?.addEventListener('change', event => this.updateAttachmentOptions(event.target.value));
    document.getElementById('rigAddCorrection')?.addEventListener('click', () => this.addRigCorrection());
    document.getElementById('spineMotionCase')?.addEventListener('change', event => {
      this.motionReviewCaseId = event.target.value;
      this.previewMotionCase();
    });
    document.getElementById('spineMotionPreview')?.addEventListener('click', () => this.previewMotionCase());
    document.getElementById('spineMotionAuto')?.addEventListener('click', () => this.runMotionAutoQA());
    document.getElementById('rigCertify')?.addEventListener('click', () => this.runRigCertification());
    document.getElementById('spineMotionReset')?.addEventListener('click', () => {
      const asset = this.project.animation.spineAssets[this.selectedAsset];
      if (!asset) return;
      clearSpineMotionReview(this.project, asset.name);
      this.motionReviewCaseId = null;
      this.onChange?.();
      this.render();
    });
    this.container.querySelectorAll('[data-motion-case]').forEach(button => {
      button.addEventListener('click', event => {
        this.motionReviewCaseId = event.currentTarget.dataset.motionCase;
        this.render();
      });
    });
    document.getElementById('poseAddLayer')?.addEventListener('click', () => this.addPoseLayerRule());
    document.getElementById('poseAddAnchor')?.addEventListener('click', () => this.addPoseAnchor());
    document.getElementById('poseAddSpring')?.addEventListener('click', () => this.addPoseSpring());
    for (const id of ['rigStressBone', 'rigStressState', 'rigStressAngle']) {
      document.getElementById(id)?.addEventListener('input', () => this.updateRigStressPose());
      document.getElementById(id)?.addEventListener('change', () => this.updateRigStressPose());
    }
    document.getElementById('rigResetPose')?.addEventListener('click', () => {
      if (this.rigSweepFrame) cancelAnimationFrame(this.rigSweepFrame);
      this.rigSweepFrame = null;
      const slider = document.getElementById('rigStressAngle');
      if (slider) slider.value = '0';
      this.updateRigStressPose();
    });
    document.getElementById('rigAutoSweep')?.addEventListener('click', () => this.runRigAutoSweep());
    this.container.querySelectorAll('[data-rig-enable]').forEach(input => {
      input.addEventListener('change', event => {
        const correction = this.project.production.rig.corrections.find(item => item.id === event.currentTarget.dataset.rigEnable);
        if (!correction) return;
        correction.enabled = event.currentTarget.checked;
        this.onChange?.();
        this.render();
      });
    });
    this.container.querySelectorAll('[data-rig-delete]').forEach(button => {
      button.addEventListener('click', event => {
        const id = event.currentTarget.dataset.rigDelete;
        this.project.production.rig.corrections = this.project.production.rig.corrections.filter(item => item.id !== id);
        this.onChange?.();
        this.render();
      });
    });
    this.container.querySelectorAll('[data-pose-enable]').forEach(input => {
      input.addEventListener('change', event => {
        const collection = this.project.production.rig[event.currentTarget.dataset.poseKind] || [];
        const item = collection.find(value => value.id === event.currentTarget.dataset.poseEnable);
        if (!item) return;
        item.enabled = event.currentTarget.checked;
        this.onChange?.();
        this.render();
      });
    });
    this.container.querySelectorAll('[data-pose-delete]').forEach(button => {
      button.addEventListener('click', event => {
        const kind = event.currentTarget.dataset.poseKind;
        const id = event.currentTarget.dataset.poseDelete;
        this.project.production.rig[kind] = (this.project.production.rig[kind] || []).filter(item => item.id !== id);
        this.onChange?.();
        this.render();
      });
    });

    this.container.querySelectorAll('.spine-asset-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.spine-asset-remove')) return;
        this.selectedAsset = parseInt(el.dataset.index);
        this.motionReviewCaseId = null;
        this.render();
      });
    });

    this.container.querySelectorAll('.spine-asset-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const [removed] = this.project.animation.spineAssets.splice(parseInt(btn.dataset.index), 1);
        for (const [state, value] of Object.entries(this.project.animation.stateAnimations)) {
          if (parseAnimationMapping(value)?.asset === removed?.name) delete this.project.animation.stateAnimations[state];
        }
        if (this.project.animation.runtime.activeSpineAsset === removed?.name) this.project.animation.runtime.activeSpineAsset = null;
        if (removed?.name) {
          delete this.project.production.rig.motionReviews?.[removed.name];
          delete this.project.production.rig.stressAudits?.[removed.name];
          delete this.project.production.rig.certifications?.[removed.name];
        }
        this.selectedAsset = null;
        this.motionReviewCaseId = null;
        this.onChange?.();
        this.render();
      });
    });

    this.container.querySelectorAll('.state-map-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const state = sel.dataset.state;
        if (sel.value) {
          this.project.animation.stateAnimations[state] = sel.value;
        } else {
          delete this.project.animation.stateAnimations[state];
        }
        this.onChange?.();
        this.render();
      });
    });

    this.container.querySelectorAll('[data-placement]').forEach(input => {
      input.addEventListener('change', () => {
        const asset = this.project.animation.spineAssets[this.selectedAsset];
        if (!asset) return;
        asset.placement ||= {};
        const value = Number(input.value);
        if (Number.isFinite(value) && input.value !== '') asset.placement[input.dataset.placement] = value;
        else delete asset.placement[input.dataset.placement];
        this.onChange?.();
      });
    });
  }

  updateAttachmentOptions(slot) {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    const select = document.getElementById('rigCorrectionAttachment');
    if (!asset || !select) return;
    const attachments = (asset.attachments || []).filter(item => item.slot === slot);
    select.innerHTML = attachments.length
      ? attachments.map(item => `<option value="${this.esc(item.name)}">${this.esc(item.skin)} / ${this.esc(item.name)}</option>`).join('')
      : '<option value="">No attachments found for this slot</option>';
  }

  addRigCorrection() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    const value = id => document.getElementById(id)?.value;
    const type = value('rigCorrectionType') || 'overlay';
    const correction = {
      id: crypto.randomUUID(),
      name: value('rigCorrectionName')?.trim() || 'Untitled correction',
      type,
      enabled: true,
      asset: asset.name,
      bone: value('rigCorrectionBone') || '',
      state: value('rigCorrectionState') === 'any' ? null : value('rigCorrectionState'),
      minAngle: Number(value('rigCorrectionMin')),
      maxAngle: Number(value('rigCorrectionMax')),
      priority: Number(value('rigCorrectionPriority')) || 0,
    };
    if (type === 'overlay') {
      if (!this.pendingCorrectionImage) {
        this.importReport = { type: 'error', title: 'Correction art required', message: 'Choose a transparent PNG, WebP, or JPEG patch before adding this overlay correction.' };
        this.render();
        return;
      }
      Object.assign(correction, {
        image: this.pendingCorrectionImage,
        imageName: this.pendingCorrectionImageName,
        offsetX: Number(value('rigCorrectionOffsetX')) || 0,
        offsetY: Number(value('rigCorrectionOffsetY')) || 0,
        scale: Number(value('rigCorrectionScale')) || 1,
        rotation: Number(value('rigCorrectionRotation')) || 0,
        anchorX: Number(value('rigCorrectionAnchorX')),
        anchorY: Number(value('rigCorrectionAnchorY')),
        opacity: 1,
      });
    } else {
      correction.slot = value('rigCorrectionSlot') || '';
      correction.attachment = value('rigCorrectionAttachment') || '';
      if (!correction.slot || !correction.attachment) {
        this.importReport = { type: 'error', title: 'Attachment required', message: 'Choose a slot and a replacement attachment from the Spine export.' };
        this.render();
        return;
      }
    }
    this.project.production.rig.corrections.push(correction);
    this.pendingCorrectionImage = null;
    this.pendingCorrectionImageName = '';
    this.importReport = {
      type: 'success', title: 'Rig correction added',
      message: `${correction.name} activates on ${correction.bone} from ${correction.minAngle}° to ${correction.maxAngle}°${correction.state ? ` during ${STATE_LABELS[correction.state] || correction.state}` : ''}.`,
    };
    this.onChange?.();
    this.render();
  }

  poseValue(id) {
    return document.getElementById(id)?.value;
  }

  poseState(id) {
    const value = this.poseValue(id);
    return value === 'any' ? null : value;
  }

  finishPoseMechanic(title, message) {
    this.importReport = { type: 'success', title, message };
    this.onChange?.();
    this.render();
  }

  addPoseLayerRule() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    const rule = {
      id: crypto.randomUUID(), name: this.poseValue('poseLayerName')?.trim() || 'Untitled layer rule', enabled: true,
      asset: asset.name, bone: this.poseValue('poseLayerBone') || '', state: this.poseState('poseLayerState'),
      minAngle: Number(this.poseValue('poseLayerMin')), maxAngle: Number(this.poseValue('poseLayerMax')),
      slot: this.poseValue('poseLayerSlot') || '', relativeTo: this.poseValue('poseLayerRelative') || '',
      position: this.poseValue('poseLayerPosition') === 'before' ? 'before' : 'after', priority: Number(this.poseValue('poseLayerPriority')) || 0,
    };
    if (!rule.slot || !rule.relativeTo || rule.slot === rule.relativeTo) {
      this.importReport = { type: 'error', title: 'Two different slots required', message: 'Choose the slot that moves and a different slot it should cross.' };
      this.render();
      return;
    }
    this.project.production.rig.drawOrderRules.push(rule);
    this.finishPoseMechanic('Dynamic layer added', `${rule.name} changes the slot order only inside its angle and state range.`);
  }

  addPoseAnchor() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    const rawX = this.poseValue('poseAnchorX');
    const rawY = this.poseValue('poseAnchorY');
    const anchor = {
      id: crypto.randomUUID(), name: this.poseValue('poseAnchorName')?.trim() || 'Untitled anchor', enabled: true,
      asset: asset.name, bone: this.poseValue('poseAnchorBone') || '', state: this.poseState('poseAnchorState'),
      mode: this.poseValue('poseAnchorMode') === 'socket' ? 'socket' : 'plant',
      targetX: rawX === '' ? null : Number(rawX), targetY: rawY === '' ? null : Number(rawY),
      strength: Number(this.poseValue('poseAnchorStrength')), priority: Number(this.poseValue('poseAnchorPriority')) || 0,
    };
    if ((anchor.targetX == null) !== (anchor.targetY == null)) {
      this.importReport = { type: 'error', title: 'Incomplete target', message: 'Enter both X and Y, or leave both empty to capture the current contact point.' };
      this.render();
      return;
    }
    this.project.production.rig.anchors.push(anchor);
    this.finishPoseMechanic('Anchor added', `${anchor.name} is now available as a ${anchor.mode === 'plant' ? 'root-compensated contact plant' : 'prop and effect socket'}.`);
  }

  addPoseSpring() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return;
    const system = {
      id: crypto.randomUUID(), name: this.poseValue('poseSpringName')?.trim() || 'Untitled secondary motion', enabled: true,
      asset: asset.name, bone: this.poseValue('poseSpringBone') || '', state: this.poseState('poseSpringState'),
      stiffness: Number(this.poseValue('poseSpringStiffness')), damping: Number(this.poseValue('poseSpringDamping')),
      maxAngle: Number(this.poseValue('poseSpringMax')), priority: Number(this.poseValue('poseSpringPriority')) || 0,
    };
    this.project.production.rig.secondaryMotion.push(system);
    this.finishPoseMechanic('Secondary motion added', `${system.name} adds bounded spring follow-through to ${system.bone}.`);
  }

  async mountRigLab(asset) {
    const stage = document.getElementById('rigPreviewStage');
    if (!stage || !asset.rawJSON || !asset.atlasText || !asset.atlasImage) return;
    const generation = this.rigMountGeneration;
    const { SpinePreviewRuntime } = await import('../../engines/animation/SpinePreviewRuntime.js');
    if (generation !== this.rigMountGeneration || !stage.isConnected) return;
    const runtime = new SpinePreviewRuntime(this.project, {
      assetName: asset.name,
      placementOverride: { x: 0, y: 0, width: 520, height: 330, scale: 0.9, anchorX: 0.5, anchorY: 0.5 },
      onStatus: status => {
        if (runtime !== this.rigRuntime) return;
        const element = document.getElementById('rigRuntimeStatus');
        if (element) element.textContent = status.status === 'ready' ? 'Runtime ready' : status.detail || status.status;
      },
      onEvent: event => {
        if (runtime !== this.rigRuntime) return;
        const trace = document.getElementById('spineMotionEventTrace');
        if (trace) trace.textContent = `Event: ${event.name || 'unnamed'} · ${event.animation || 'unknown animation'}`;
      },
    });
    this.rigRuntime = runtime;
    await runtime.mount(stage, { width: 520, height: 330 });
    if (generation !== this.rigMountGeneration || runtime !== this.rigRuntime) {
      runtime.destroy();
      return;
    }
    this.updateRigStressPose();
  }

  activeMotionReviewCase() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    if (!asset) return null;
    const summary = getSpineMotionReviewSummary(this.project, asset.name);
    const selectedId = document.getElementById('spineMotionCase')?.value || this.motionReviewCaseId;
    return summary.cases.find(item => item.id === selectedId) || summary.nextCase;
  }

  previewMotionCase() {
    const motionCase = this.activeMotionReviewCase();
    if (!motionCase || !this.rigRuntime) return false;
    this.motionReviewCaseId = motionCase.id;
    const trace = document.getElementById('spineMotionEventTrace');
    if (trace) trace.textContent = `Playing ${motionCase.animation} in ${motionCase.skin || 'setup'} skin…`;
    this.rigRuntime.setSkin(motionCase.skin);
    return Boolean(this.rigRuntime.playAnimation(motionCase.animation, { loop: true }));
  }

  async collectMotionQACases(asset, onProgress = null) {
    const cases = [];
    const plan = getSpineMotionCases(asset, this.project);
    for (let index = 0; index < plan.length; index++) {
      const motionCase = plan[index];
      const sample = {
        id: motionCase.id,
        skin: motionCase.skin,
        animation: motionCase.animation,
        samples: [],
        events: [],
        error: '',
      };
      onProgress?.(index + 1, plan.length);
      try {
        this.rigRuntime.beginMotionAudit(motionCase);
        for (const time of getSpineMotionSampleTimes(motionCase.duration)) {
          try {
            sample.samples.push({
              time,
              metrics: analyzeSpineMotionPixels(this.rigRuntime.sampleMotionAuditFrame(time)),
              error: '',
            });
          } catch (error) {
            sample.samples.push({ time, metrics: null, error: error.message || String(error) });
          }
        }
        sample.events = this.rigRuntime.getEventHistory().map(event => ({ name: event.name, time: event.time }));
      } catch (error) {
        sample.error = error.message || String(error);
      } finally {
        this.rigRuntime.endMotionAudit();
      }
      cases.push(sample);
      if ((index + 1) % 4 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return cases;
  }

  async runMotionAutoQA() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    const button = document.getElementById('spineMotionAuto');
    if (!asset || !this.rigRuntime) return;
    if (this.rigRuntime.status !== 'ready') {
      if (button) button.textContent = `Runtime ${this.rigRuntime.status} — retry when ready`;
      return;
    }
    if (button) button.disabled = true;
    const cases = await this.collectMotionQACases(asset, (current, total) => {
      if (button) button.textContent = `Measuring ${current}/${total}…`;
    });
    const summary = recordSpineMotionQA(this.project, asset.name, cases, { runtimeStatus: this.rigRuntime.status });
    this.motionReviewCaseId = summary.nextCase?.id || null;
    this.importReport = summary.complete
      ? { type: 'success', title: 'Automated Motion QA passed', message: `${summary.passed}/${summary.total} animation/skin cases and ${summary.framesMeasured} rendered frames passed.` }
      : { type: 'error', title: 'Automated Motion QA found repairs', message: summary.issues.slice(0, 3).join(' ') };
    this.onChange?.();
    this.render();
  }

  updateRigStressPose() {
    const bone = document.getElementById('rigStressBone')?.value;
    const state = document.getElementById('rigStressState')?.value || 'idle';
    const angle = Number(document.getElementById('rigStressAngle')?.value) || 0;
    const output = document.getElementById('rigStressAngleValue');
    if (output) output.textContent = `${angle}°`;
    const active = this.rigRuntime?.setStressPose({ bone, angle, state }) || [];
    const status = document.getElementById('rigActiveCorrections');
    if (status) status.textContent = active.length
      ? `Active: ${active.map(correction => correction.name).join(', ')}`
      : `No correction active at ${angle}°.`;
    const pose = this.rigRuntime?.poseMechanicsStatus();
    const poseNames = pose ? [
      ...pose.drawOrderRules.map(item => `layer: ${item.name}`),
      ...pose.anchors.map(item => `${item.mode}: ${item.name}`),
      ...pose.secondaryMotion.map(item => `spring: ${item.name}`),
    ] : [];
    const poseStatus = document.getElementById('rigActivePoseMechanics');
    if (poseStatus) poseStatus.textContent = poseNames.length
      ? `Active pose mechanics — ${poseNames.join(', ')}`
      : 'No pose mechanic active at this stress pose.';
  }

  async collectRigStressCases(asset, onProgress = null) {
    const slider = document.getElementById('rigStressAngle');
    const cases = [];
    const plan = getRigStressCasePlan(asset);
    const boneSelect = document.getElementById('rigStressBone');
    const stateSelect = document.getElementById('rigStressState');
    for (let index = 0; index < plan.length; index++) {
      const planned = plan[index];
      const sample = {
        id: planned.id, bone: planned.bone, state: planned.state,
        anglesTested: [], correctionsTriggered: [], poseMechanicsTriggered: [], measurements: [], error: '',
      };
      onProgress?.(index + 1, plan.length);
      if (boneSelect) boneSelect.value = planned.bone;
      if (stateSelect) stateSelect.value = planned.state;
      try {
        if (!this.rigRuntime.spine?.skeleton.findBone(planned.bone)) throw new Error('Bone is missing from the mounted runtime skeleton.');
        for (const angle of planned.angles) {
          slider.value = String(angle);
          const corrections = this.rigRuntime.setStressPose({ bone: planned.bone, state: planned.state, angle });
          const pose = this.rigRuntime.poseMechanicsStatus();
          const correctionIds = corrections.map(item => item.id || item.name);
          const poseMechanicIds = [
            ...pose.drawOrderRules.map(item => item.id || item.name),
            ...pose.anchors.map(item => item.id || item.name),
            ...pose.secondaryMotion.map(item => item.id || item.name),
          ];
          sample.anglesTested.push(angle);
          sample.correctionsTriggered.push(...correctionIds);
          sample.poseMechanicsTriggered.push(...poseMechanicIds);
          try {
            sample.measurements.push({
              angle,
              metrics: analyzeRigPosePixels(this.rigRuntime.capturePixels()),
              correctionsTriggered: correctionIds,
              poseMechanicsTriggered: poseMechanicIds,
              error: '',
            });
          } catch (error) {
            sample.measurements.push({
              angle,
              metrics: null,
              correctionsTriggered: correctionIds,
              poseMechanicsTriggered: poseMechanicIds,
              error: error.message || String(error),
            });
          }
        }
      } catch (error) {
        sample.error = error.message || String(error);
      }
      cases.push(sample);
      if ((index + 1) % 20 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return cases;
  }

  async runRigAutoSweep() {
    const slider = document.getElementById('rigStressAngle');
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    const button = document.getElementById('rigAutoSweep');
    if (!slider || !asset || !this.rigRuntime) return;
    if (this.rigSweepFrame) cancelAnimationFrame(this.rigSweepFrame);
    this.rigSweepFrame = null;
    if (this.rigRuntime.status !== 'ready') {
      if (button) button.textContent = `Runtime ${this.rigRuntime.status} — retry when ready`;
      return;
    }
    if (button) button.disabled = true;
    const cases = await this.collectRigStressCases(asset, (current, total) => {
      if (button) button.textContent = `Auditing ${current}/${total}…`;
    });
    const summary = recordRigStressQA(this.project, asset.name, cases, { runtimeStatus: this.rigRuntime.status });
    this.importReport = summary.complete
      ? { type: 'success', title: 'Pixel Deformation Audit passed', message: `${summary.passed}/${summary.total} bone/state cases and ${summary.testedAngles} rendered poses passed with no residual deformation.` }
      : { type: 'error', title: 'Pixel Deformation Audit blocked', message: `${summary.correctionRequired} corrective-pixel and ${summary.poseMechanicsRequired} pose-mechanics findings. ${summary.issues.slice(0, 3).join(' ')}` };
    this.onChange?.();
    this.render();
  }

  async runRigCertification() {
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    const button = document.getElementById('rigCertify');
    if (!asset || !this.rigRuntime) return null;
    if (this.rigRuntime.status !== 'ready') {
      const certification = recordRigCertification(this.project, asset.name);
      this.importReport = {
        type: 'error',
        title: 'Rig Certification could not start',
        message: `Runtime ${this.rigRuntime.status}. ${certification.issues.slice(0, 3).join(' ')}`,
      };
      this.onChange?.();
      this.render();
      return certification;
    }
    if (button) button.disabled = true;
    const motionCases = await this.collectMotionQACases(asset, (current, total) => {
      if (button) button.textContent = `Motion ${current}/${total}…`;
    });
    recordSpineMotionQA(this.project, asset.name, motionCases, { runtimeStatus: this.rigRuntime.status });
    const stressCases = await this.collectRigStressCases(asset, (current, total) => {
      if (button) button.textContent = `Deformation ${current}/${total}…`;
    });
    recordRigStressQA(this.project, asset.name, stressCases, { runtimeStatus: this.rigRuntime.status });
    const certification = recordRigCertification(this.project, asset.name);
    this.motionReviewCaseId = certification.motion?.nextCase?.id || null;
    this.importReport = certification.complete
      ? {
        type: 'success',
        title: 'Rig Certification passed',
        message: `${certification.motion.framesMeasured} motion frames and ${certification.stress.testedAngles} stress renders passed with a clean structural audit.`,
      }
      : {
        type: 'error',
        title: 'Rig Certification found repairs',
        message: certification.issues.slice(0, 4).join(' '),
      };
    this.onChange?.();
    this.render();
    return certification;
  }

  async waitForRigRuntime(timeoutMs = 12000) {
    const startedAt = performance.now();
    while (performance.now() - startedAt < timeoutMs) {
      const status = this.rigRuntime?.status;
      if (status === 'ready' || status === 'error' || status === 'disabled') return status || 'disabled';
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    return 'timeout';
  }

  async runAllRigCertifications(onProgress = null) {
    const assets = this.project.animation?.spineAssets || [];
    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index];
      onProgress?.(index + 1, assets.length, asset);
      this.selectedAsset = index;
      this.render();
      const hasRuntimeBundle = Boolean(spineSkeletonFormat(asset) && asset.atlasText && asset.atlasImage);
      const status = hasRuntimeBundle ? await this.waitForRigRuntime() : 'error';
      if (status === 'ready') {
        await this.runRigCertification();
        continue;
      }
      const certification = recordRigCertification(this.project, asset.name);
      this.importReport = {
        type: 'error',
        title: `${asset.name} could not be certified`,
        message: `Runtime ${status}. ${certification.issues.slice(0, 3).join(' ')}`,
      };
      this.onChange?.();
    }
    this.render();
    return getProjectRigCertificationSummary(this.project);
  }

  destroy() {
    if (this.rigSweepFrame) cancelAnimationFrame(this.rigSweepFrame);
    this.rigSweepFrame = null;
    this.rigMountGeneration++;
    this.rigRuntime?.destroy();
    this.rigRuntime = null;
  }

  async handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }

    const asset = this.parseSpineJSON(data, file.name.replace(/\.[^.]+$/, ''), file.name);
    this.project.animation.spineAssets.push(asset);
    if (!this.project.animation.runtime.activeSpineAsset) this.project.animation.runtime.activeSpineAsset = asset.name;
    this.selectedAsset = this.project.animation.spineAssets.length - 1;
    this.motionReviewCaseId = null;
    this.onChange?.();
    this.render();
  }

  handleAtlasImage(e) {
    const file = e.target.files[0];
    if (!file || this.selectedAsset === null) return;
    const reader = new FileReader();
    reader.onload = () => {
      const asset = this.project.animation.spineAssets[this.selectedAsset];
      asset.atlasImages ||= {};
      asset.atlasImages[file.name] = reader.result;
      if (!asset.atlasImage || file.name === asset.atlasPages?.[0]) {
        asset.atlasImage = reader.result;
        asset.atlasImageName = file.name;
      }
      this.onChange?.();
      this.render();
    };
    reader.readAsDataURL(file);
  }

  async handleAtlasText(e) {
    const file = e.target.files[0];
    if (!file || this.selectedAsset === null) return;
    const text = await file.text();
    const asset = this.project.animation.spineAssets[this.selectedAsset];
    asset.atlasText = text;
    asset.atlasPages = getAtlasPageNames(text);
    asset.atlasPage = asset.atlasPages[0] || file.name.replace(/\.[^.]+$/, '');
    asset.regions = this.parseAtlasRegions(text);
    this.onChange?.();
    this.render();
  }

  /**
   * Region names in a .atlas are the unindented lines that follow the page
   * header block; every property line beneath them is indented.
   */
  parseAtlasRegions(text) {
    return getAtlasRegionNames(text);
  }

  parseSpineJSON(data, filename, skeletonFileName = `${filename}.json`) {
    const skeleton = data.skeleton || {};
    const bones = data.bones || [];
    const slots = data.slots || [];
    const skins = [];

    if (data.skins) {
      if (Array.isArray(data.skins)) {
        data.skins.forEach(s => skins.push(s.name || 'default'));
      } else {
        Object.keys(data.skins).forEach(k => skins.push(k));
      }
    }

    const animations = [];
    if (data.animations) {
      for (const [name, animData] of Object.entries(data.animations)) {
        let trackCount = 0;
        let maxDuration = 0;
        for (const [trackType, tracks] of Object.entries(animData)) {
          if (typeof tracks === 'object') {
            const entries = Array.isArray(tracks) ? tracks : Object.values(tracks);
            trackCount += Array.isArray(tracks) ? tracks.length : Object.keys(tracks).length;
            for (const track of (Array.isArray(entries[0]) ? entries : [entries])) {
              if (Array.isArray(track)) {
                for (const kf of track) {
                  if (kf.time !== undefined && kf.time > maxDuration) maxDuration = kf.time;
                }
              }
            }
          }
        }
        animations.push({ name, duration: maxDuration || null, trackCount });
      }
    }

    return {
      name: filename,
      skeletonFormat: 'json',
      skeletonFileName,
      version: skeleton.spine || skeleton.version || null,
      width: skeleton.width || null,
      height: skeleton.height || null,
      bones: bones.map(b => b.name),
      slots: slots.map(s => s.name),
      skins,
      attachments: this.extractAttachments(data.skins),
      animations,
      atlasImage: null,
      atlasImages: {},
      atlasText: null,
      atlasPage: null,
      regions: [],
      atlasPages: [],
      activeSkin: skins[0] || null,
      placement: { scale: 1 },
      rawJSON: data,
    };
  }

  extractAttachments(skinsData) {
    const attachments = [];
    const collect = (skinName, slots = {}) => {
      for (const [slot, entries] of Object.entries(slots || {})) {
        for (const name of Object.keys(entries || {})) attachments.push({ skin: skinName, slot, name });
      }
    };
    if (Array.isArray(skinsData)) {
      for (const skin of skinsData) collect(skin.name || 'default', skin.attachments || {});
    } else {
      for (const [skinName, slots] of Object.entries(skinsData || {})) collect(skinName, slots);
    }
    return attachments;
  }

  esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
