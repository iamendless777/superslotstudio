import { AudioEngine } from '../../engines/audio/AudioEngine.js?orchestration=20260811-1';
import {
  SFX_PRESETS,
  blobToDataUrl,
  generateCoreSfxPack,
  generateGameSound,
  polishAudioBlob,
} from '../../engines/audio/AudioFactory.js';
import {
  AUDIO_EVENT_SEQUENCE,
  auditAudioDirector,
  normalizeAudioDirector,
} from '../../engines/audio/AudioDirector.js';
import { SOUNDSCAPE_PROFILES, generateSoundscapePack } from '../../engines/audio/SoundscapeFactory.js';
import {
  MORPHEUS_EFFECT_CUE_SPECS,
  auditMorpheusEffectCuePack,
  installMorpheusEffectCuePack,
} from '../../engines/audio/SpecialtyCueFactory.js';
import {
  buildAudioMasteringInventory,
  getAudioMasteringSummary,
  recordAudioMasteringQA,
} from '../../engines/quality/AudioMasteringQA.js';

const STINGER_LABELS = {
  spinStart: 'Spin Start',
  reelStop: 'Reel Stop (variations)',
  winSmall: 'Win — Small',
  winMedium: 'Win — Medium',
  winBig: 'Win — Big',
  winMega: 'Win — Mega',
  wincap: 'Win — Cap',
  scatterLand: 'Scatter Land (variations)',
  bonusTrigger: 'Bonus Trigger',
  bonusEnd: 'Bonus End',
  anticipation: 'Anticipation',
  cascadeDrop: 'Cascade Drop',
  multiplierUp: 'Multiplier Up',
};

const MUSIC_LABELS = {
  baseMusic: 'Base Game Music',
  bonusMusic: 'Bonus Music',
  ambience: 'Ambience',
};

const VOICES = ['marin', 'cedar', 'coral', 'onyx', 'nova', 'sage', 'shimmer', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'verse'];
const ARRAY_TARGETS = new Set(['reelStop', 'scatterLand']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export class AudioPanel {
  constructor(container, project, onChange) {
    this.container = container;
    this.project = project;
    this.onChange = onChange;
    this.ensureProjectAudio();
    this.audioEngine = new AudioEngine(project);
    this.audioEngine.loadFromProject();
    this.previewAudio = null;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.recordingChunks = [];
    this.draft = null;
    this.auditionToken = 0;
    this.masteringBusy = false;
    this.render();
    this.loadCapabilities();
  }

  ensureProjectAudio() {
    this.project.audio ||= {};
    this.project.audio.layers ||= { baseMusic: null, bonusMusic: null, ambience: null };
    this.project.audio.stingers ||= {};
    for (const key of Object.keys(STINGER_LABELS)) {
      if (!(key in this.project.audio.stingers)) this.project.audio.stingers[key] = ARRAY_TARGETS.has(key) ? [] : null;
    }
    this.project.audio.factory ||= { version: 1, generatedAssets: 0, lastSource: null };
    this.project.audio.director = normalizeAudioDirector(this.project.audio.director);
  }

  render() {
    const director = normalizeAudioDirector(this.project.audio.director);
    const audit = auditAudioDirector(this.project);
    const mastering = getAudioMasteringSummary(this.project);
    const morpheusEffectAudio = auditMorpheusEffectCuePack(this.project);
    this.container.innerHTML = `
      <div class="audio-panel">
        <header class="audio-header audio-factory-header">
          <div>
            <span class="audio-kicker">Production system</span>
            <h2>Audio Factory</h2>
            <p class="section-desc">Create, record, import, polish and connect final game audio without leaving StakeStudio.</p>
          </div>
          <div class="audio-source-badges">
            <span>Local SFX · free</span><span>Mic + imports · free</span><span id="voiceCapability">AI voice · checking</span>
          </div>
        </header>

        <div class="audio-master">
          <label class="audio-toggle">
            <input type="checkbox" id="audioMute" ${this.audioEngine.muted ? 'checked' : ''}>
            <span>Mute All</span>
          </label>
          <label class="audio-volume-label">
            Master Volume
            <input type="range" id="audioVolume" min="0" max="1" step="0.05" value="${this.audioEngine.volume}">
          </label>
          <span class="audio-master-note">Factory output is peak-normalized and fade-safe.</span>
        </div>

        <section class="audio-director-console">
          <div class="audio-director-heading">
            <div><span>Mix intelligence</span><h3>Audio Director</h3><p>One mix contract controls every generated game: buses, ducking, variation and voice limits.</p></div>
            <div class="audio-director-audit ${audit.ready ? 'is-ready' : ''}">
              <strong>${audit.coverage}%</strong><span>event coverage</span><small>${audit.assetCount} assets · ${Math.round(audit.embeddedBytes / 1024)} KB embedded</small>
            </div>
          </div>
          <div class="audio-mix-grid">
            ${Object.entries(director.buses).map(([bus, value]) => `<label><span>${esc(bus)}</span><input type="range" min="0" max="1.25" step="0.01" value="${value}" data-audio-bus="${bus}"><output>${Math.round(value * 100)}</output></label>`).join('')}
          </div>
          <div class="audio-director-settings">
            <label class="audio-toggle"><input type="checkbox" id="audioDuckingEnabled" ${director.ducking.enabled ? 'checked' : ''}><span>Smart ducking</span></label>
            <label>Depth <input type="range" id="audioDuckAmount" min="0" max="0.9" step="0.01" value="${director.ducking.amount}"><output>${Math.round(director.ducking.amount * 100)}%</output></label>
            <label>Attack <input type="number" id="audioDuckAttack" min="5" max="2000" value="${director.ducking.attackMs}"><span>ms</span></label>
            <label>Release <input type="number" id="audioDuckRelease" min="20" max="5000" value="${director.ducking.releaseMs}"><span>ms</span></label>
            <button class="btn-primary" id="auditionAudioMix">▶ Audition event ladder</button>
            <button class="btn-secondary" id="stopAudioMix">Stop</button>
          </div>
          <div class="audio-audit-strip">
            <span class="${audit.reelVariations >= 3 ? 'is-good' : ''}">${audit.reelVariations} reel variations${audit.reelVariations < 3 ? ' · 3 needed' : ''}</span>
            <span class="${audit.scatterVariations >= 3 ? 'is-good' : ''}">${audit.scatterVariations} scatter variations${audit.scatterVariations < 3 ? ' · 3 needed' : ''}</span>
            <span class="${audit.unsafePeaks.length === 0 ? 'is-good' : 'has-warning'}">${audit.unsafePeaks.length ? `${audit.unsafePeaks.length} peak risks` : 'peak-safe'}</span>
            <span class="${audit.duckingReady ? 'is-good' : 'has-warning'}">${audit.duckingReady ? 'ducking active' : 'ducking off'}</span>
            <span class="${audit.worldBedReady ? 'is-good' : 'has-warning'}">${audit.worldBedReady ? 'world bed ready' : 'music/ambience missing'}</span>
            ${audit.missingEvents.length ? `<span class="has-warning">${audit.missingEvents.length} events missing</span>` : '<span class="is-good">all events mapped</span>'}
          </div>
          <div class="audio-mastering-qa ${mastering.complete ? 'is-complete' : mastering.fresh ? 'has-failures' : ''}">
            <div>
              <span>MEASURED RELEASE EVIDENCE</span>
              <h3>${mastering.complete ? 'Mastering audit passed' : mastering.stale ? 'Mastering evidence is stale' : mastering.fresh ? 'Mastering audit found work' : 'Mastering audit not run'}</h3>
              <p>${mastering.fresh
                ? `${mastering.decodedAssets}/${mastering.totalAssets} assets decoded · loudness ${mastering.loudness.passed ? 'safe' : 'blocked'} · ${mastering.synchronization.checked} critical cue recipes · ducking ${mastering.ducking.passed ? 'safe' : 'blocked'}`
                : 'Decodes every source and measures peaks, RMS, clipping, silence, DC offset, sample rate, cue timing and ducking.'}</p>
            </div>
            <button class="btn-primary" id="runAudioMastering" ${this.masteringBusy ? 'disabled' : ''}>${this.masteringBusy ? 'Measuring…' : mastering.complete ? 'Run Again' : 'Run Mastering Audit'}</button>
            ${mastering.fresh && mastering.issues.length ? `<div class="audio-mastering-findings">${mastering.issues.slice(0, 5).map(issue => `<span>${esc(issue)}</span>`).join('')}${mastering.issues.length > 5 ? `<b>+${mastering.issues.length - 5} more findings</b>` : ''}</div>` : ''}
          </div>
        </section>

        ${this.isMorpheusDreamfallProject() ? `
        <section class="audio-director-console audio-specialty-console">
          <div class="audio-director-heading">
            <div><span>Effect orchestration</span><h3>Morpheus specialty cue family</h3><p>Seven deterministic identities follow Mystery, Star, Dreamfall and terminal MAX barriers. They remain replaceable foundations until human audio approval.</p></div>
            <div class="audio-director-audit ${morpheusEffectAudio.foundationReady ? 'is-ready' : ''}">
              <strong>${morpheusEffectAudio.installedCueCount}/${morpheusEffectAudio.expectedCueCount}</strong><span>specialty cues</span><small>${morpheusEffectAudio.approvalStatus} · ${esc(morpheusEffectAudio.fingerprint)}</small>
            </div>
          </div>
          <div class="audio-director-settings">
            <button class="btn-primary" id="generateMorpheusEffectPack">${morpheusEffectAudio.foundationReady ? 'Rebuild governed cue pack' : 'Build governed cue pack'}</button>
            <button class="btn-secondary" id="auditionMorpheusEffectPack" ${morpheusEffectAudio.foundationReady ? '' : 'disabled'}>▶ Audition causal ladder</button>
            <span>${morpheusEffectAudio.productionReady ? 'Approved production audio' : morpheusEffectAudio.foundationReady ? 'Foundation ready · final mastering/art direction approval required' : 'Missing governed cue identities'}</span>
          </div>
        </section>` : ''}

        <section class="audio-factory-grid">
          <article class="audio-factory-card audio-sfx-card">
            <div class="audio-card-heading"><span>01</span><div><h3>Sound designer</h3><p>Deterministic, layered WAV effects generated on this Mac.</p></div></div>
            <label>Sound
              <select id="factorySfxPreset">${Object.entries(SFX_PRESETS).map(([key, value]) => `<option value="${key}">${esc(value.label)}</option>`).join('')}</select>
            </label>
            <div class="audio-control-row">
              <label>Intensity <input id="factorySfxIntensity" type="range" min="0.1" max="1" value="0.78" step="0.01"></label>
              <label>Variation <input id="factorySfxVariation" type="number" min="1" max="99" value="1"></label>
            </div>
            <label>Assign to event ${this.renderTargetSelect('factorySfxTarget', 'spinStart')}</label>
            <div class="audio-card-actions">
              <button class="btn-primary" id="generateSfx">Generate + assign</button>
              <button class="btn-secondary" id="generateSfxPack">Build complete core pack</button>
            </div>
          </article>

          <article class="audio-factory-card audio-voice-card">
            <div class="audio-card-heading"><span>02</span><div><h3>Character voice</h3><p>Expressive speech generated through the secure OpenAI server route.</p></div></div>
            <label>Line <textarea id="factoryVoiceText" maxlength="800" rows="3" placeholder="The house always collects."></textarea></label>
            <label>Performance direction <input id="factoryVoiceDirection" value="Dark, controlled, cinematic; close-mic delivery with a restrained smile."></label>
            <div class="audio-control-row">
              <label>Voice <select id="factoryVoice">${VOICES.map(voice => `<option value="${voice}">${voice}</option>`).join('')}</select></label>
              <label>Speed <input id="factoryVoiceSpeed" type="number" min="0.5" max="2" value="0.96" step="0.05"></label>
            </div>
            <label>Assign to event ${this.renderTargetSelect('factoryVoiceTarget', 'bonusTrigger')}</label>
            <div class="audio-card-actions">
              <button class="btn-primary" id="generateVoice">Generate voice + assign</button>
              <small>Paid only when pressed · 800-character guard</small>
            </div>
          </article>

          <article class="audio-factory-card audio-capture-card">
            <div class="audio-card-heading"><span>03</span><div><h3>Capture + polish</h3><p>Record anything or import a file, then trim silence, mono-fold, normalize and fade.</p></div></div>
            <div class="audio-capture-actions">
              <button class="btn-primary" id="toggleRecording">● Record microphone</button>
              <label class="btn-secondary audio-import-button">Import audio<input id="factoryImport" type="file" accept="audio/*" hidden></label>
            </div>
            <label>Assign polished take ${this.renderTargetSelect('factoryCaptureTarget', 'spinStart')}</label>
            <div class="audio-draft ${this.draft ? 'is-ready' : ''}">
              <div><strong>${this.draft ? esc(this.draft.name) : 'No take loaded'}</strong><span>${this.draft ? esc(this.draft.detail) : 'Record or import a sound to prepare it.'}</span></div>
              <button class="btn-icon" id="playDraft" ${this.draft ? '' : 'disabled'} title="Play">▶</button>
              <button class="btn-secondary" id="assignDraft" ${this.draft ? '' : 'disabled'}>Assign take</button>
            </div>
          </article>
        </section>

        <div class="audio-factory-status" id="audioFactoryStatus" role="status">Ready. No API charge occurs until you generate a voice.</div>

        <div class="audio-sections">
          <section class="audio-section">
            <div class="audio-section-title"><div><span>04</span><h3>Music + ambience</h3></div><p>Generated or imported layers stay separate so the world bed remains replaceable.</p></div>
            <div class="soundscape-composer">
              <div class="soundscape-copy"><span>Local generative score</span><strong>Soundscape Composer</strong><p>Build a matched base loop, intensified bonus loop and atmospheric bed from one musical identity.</p></div>
              <label>Direction<select id="soundscapeProfile">${Object.entries(SOUNDSCAPE_PROFILES).map(([key, profile]) => `<option value="${key}">${esc(profile.label)}</option>`).join('')}</select></label>
              <label>BPM<input id="soundscapeBpm" type="number" min="60" max="150" value="${SOUNDSCAPE_PROFILES.mythicDoom.bpm}"></label>
              <label>Bars<select id="soundscapeBars"><option value="2">2</option><option value="4" selected>4</option><option value="6">6</option><option value="8">8</option></select></label>
              <label>Seed<input id="soundscapeSeed" type="number" min="1" max="999999" value="1103"></label>
              <button class="btn-primary" id="generateSoundscape">Generate 3-layer soundscape</button>
              <div class="soundscape-audition">
                <button class="btn-secondary" data-soundscape-play="baseMusic">Base</button>
                <button class="btn-secondary" data-soundscape-play="bonusMusic">Bonus</button>
                <button class="btn-secondary" data-soundscape-play="ambience">Ambience</button>
                <button class="btn-secondary" id="stopSoundscape">Stop</button>
              </div>
            </div>
            <div class="audio-slots" id="musicSlots">${this.renderMusicSlots()}</div>
          </section>
          <section class="audio-section">
            <div class="audio-section-title"><div><span>05</span><h3>Event sound map</h3></div><p>Everything below is live-connected to Preview and Presentation Director cues.</p></div>
            <div class="audio-slots audio-event-grid" id="stingerSlots">${this.renderStingerSlots()}</div>
          </section>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderTargetSelect(id, selected) {
    return `<select id="${id}">${Object.entries(STINGER_LABELS).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  }

  renderMusicSlots() {
    return Object.entries(MUSIC_LABELS).map(([key, label]) => {
      const layer = this.project.audio.layers[key];
      const hasSrc = Boolean(layer?.src);
      return `
        <div class="audio-slot" data-type="music" data-key="${key}">
          <div class="slot-info"><span class="slot-label">${label}</span><span class="slot-status ${hasSrc ? 'loaded' : 'empty'}">${hasSrc ? esc(this.getFilename(layer.src, layer)) : 'No file'}</span></div>
          <div class="slot-controls">
            ${hasSrc ? '<button class="btn-icon" data-action="play" title="Play">▶</button><button class="btn-icon" data-action="stop" title="Stop">■</button>' : ''}
            <label class="btn-secondary slot-upload-label">Import<input type="file" accept="audio/*" class="slot-upload" hidden data-slot="${key}" data-type="music"></label>
            ${hasSrc ? '<button class="btn-icon" data-action="remove" title="Remove">×</button>' : ''}
          </div>
          ${hasSrc ? `<div class="slot-settings"><label>Volume <input type="range" class="slot-volume" min="0" max="1" step="0.05" value="${layer.volume ?? 0.5}" data-slot="${key}" data-type="music"></label><label><input type="checkbox" class="slot-loop" ${layer.loop !== false ? 'checked' : ''} data-slot="${key}" data-type="music"> Loop</label></div>` : ''}
        </div>`;
    }).join('');
  }

  renderStingerSlots() {
    return Object.entries(STINGER_LABELS).map(([key, label]) => {
      const stinger = this.project.audio.stingers[key];
      const isArray = Array.isArray(stinger);
      const hasSrc = isArray ? stinger.some(item => item?.src) : Boolean(stinger?.src);
      if (isArray) {
        const items = stinger.length ? stinger : [null];
        return `
          <div class="audio-slot array-slot" data-type="stinger" data-key="${key}">
            <div class="slot-info"><span class="slot-label">${label}</span><span class="slot-status ${hasSrc ? 'loaded' : 'empty'}">${hasSrc ? `${stinger.filter(item => item?.src).length} variation(s)` : 'No files'}</span></div>
            <div class="slot-array">
              ${items.map((item, index) => `<div class="slot-array-item"><span class="slot-array-index">${index + 1}</span><span class="slot-array-name">${item?.src ? esc(this.getFilename(item.src, item)) : '—'}</span>${item?.src ? `<button class="btn-icon" data-action="play" data-index="${index}" title="Play">▶</button><button class="btn-icon" data-action="stop" data-index="${index}" title="Stop">■</button>` : ''}<label class="btn-secondary slot-upload-label">Import<input type="file" accept="audio/*" class="slot-upload" hidden data-slot="${key}" data-type="stinger" data-index="${index}"></label>${item?.src ? `<button class="btn-icon" data-action="remove" data-index="${index}" title="Remove">×</button>` : ''}</div>`).join('')}
              <button class="btn-secondary slot-add-item" data-slot="${key}">+ Variation</button>
            </div>
          </div>`;
      }
      return `
        <div class="audio-slot" data-type="stinger" data-key="${key}">
          <div class="slot-info"><span class="slot-label">${label}</span><span class="slot-status ${hasSrc ? 'loaded' : 'empty'}">${hasSrc ? esc(this.getFilename(stinger.src, stinger)) : 'No file'}</span></div>
          <div class="slot-controls">${hasSrc ? '<button class="btn-icon" data-action="play" title="Play">▶</button><button class="btn-icon" data-action="stop" title="Stop">■</button>' : ''}<label class="btn-secondary slot-upload-label">Import<input type="file" accept="audio/*" class="slot-upload" hidden data-slot="${key}" data-type="stinger"></label>${hasSrc ? '<button class="btn-icon" data-action="remove" title="Remove">×</button>' : ''}</div>
        </div>`;
    }).join('');
  }

  getFilename(src, asset = {}) {
    if (asset.source === 'procedural') return `${asset.factory?.preset || 'generated'} v${asset.factory?.variation || 1}`;
    if (asset.source === 'procedural-music') return `${asset.factory?.profileLabel || 'Generated'} · ${asset.factory?.bpm || '?'} BPM`;
    if (asset.source === 'openai-voice') return `AI voice · ${asset.factory?.voice || 'generated'}`;
    if (asset.source === 'recorded') return 'polished recording';
    if (asset.source === 'imported') return asset.factory?.name || 'polished import';
    if (!src) return '';
    if (src.startsWith('data:')) return 'embedded audio';
    return src.split('/').pop().split('?')[0] || 'audio file';
  }

  bindEvents() {
    const panel = this.container.querySelector('.audio-panel');
    if (!panel) return;
    panel.querySelector('#audioMute')?.addEventListener('change', event => this.audioEngine.setMuted(event.target.checked));
    panel.querySelector('#audioVolume')?.addEventListener('input', event => this.audioEngine.setVolume(parseFloat(event.target.value)));
    panel.querySelector('#generateMorpheusEffectPack')?.addEventListener('click', () => this.handleGenerateMorpheusEffectPack());
    panel.querySelector('#auditionMorpheusEffectPack')?.addEventListener('click', () => this.auditionMorpheusEffectPack());
    panel.querySelectorAll('[data-audio-bus]').forEach(input => input.addEventListener('input', event => {
      const bus = event.target.dataset.audioBus;
      this.audioEngine.setMixBus(bus, event.target.value);
      event.target.parentElement.querySelector('output').textContent = Math.round(Number(event.target.value) * 100);
      this.invalidateAudioReview();
      this.onChange?.();
    }));
    panel.querySelector('#audioDuckingEnabled')?.addEventListener('change', event => {
      this.project.audio.director.ducking.enabled = event.target.checked;
      this.audioEngine.director.refresh();
      this.invalidateAudioReview();
      this.onChange?.();
    });
    panel.querySelector('#audioDuckAmount')?.addEventListener('input', event => {
      this.project.audio.director.ducking.amount = Number(event.target.value);
      this.audioEngine.director.refresh();
      event.target.parentElement.querySelector('output').textContent = `${Math.round(Number(event.target.value) * 100)}%`;
      this.invalidateAudioReview();
      this.onChange?.();
    });
    for (const [selector, field] of [['#audioDuckAttack', 'attackMs'], ['#audioDuckRelease', 'releaseMs']]) {
      panel.querySelector(selector)?.addEventListener('change', event => {
        this.project.audio.director.ducking[field] = Number(event.target.value);
        this.project.audio.director = normalizeAudioDirector(this.project.audio.director);
        this.audioEngine.director.refresh();
        this.invalidateAudioReview();
        this.onChange?.();
      });
    }
    panel.querySelector('#auditionAudioMix')?.addEventListener('click', () => this.auditionMix());
    panel.querySelector('#stopAudioMix')?.addEventListener('click', () => this.stopAudition());
    panel.querySelector('#runAudioMastering')?.addEventListener('click', () => this.runAudioMasteringAudit());
    panel.querySelector('#factorySfxPreset')?.addEventListener('change', event => {
      const target = panel.querySelector('#factorySfxTarget');
      if (target && event.target.value in STINGER_LABELS) target.value = event.target.value;
    });
    panel.querySelector('#generateSfx')?.addEventListener('click', () => this.handleGenerateSfx());
    panel.querySelector('#generateSfxPack')?.addEventListener('click', () => this.handleGeneratePack());
    panel.querySelector('#generateVoice')?.addEventListener('click', () => this.handleGenerateVoice());
    panel.querySelector('#soundscapeProfile')?.addEventListener('change', event => {
      const bpm = panel.querySelector('#soundscapeBpm');
      if (bpm) bpm.value = SOUNDSCAPE_PROFILES[event.target.value]?.bpm || 96;
    });
    panel.querySelector('#generateSoundscape')?.addEventListener('click', () => this.handleGenerateSoundscape());
    panel.querySelectorAll('[data-soundscape-play]').forEach(button => button.addEventListener('click', event => {
      const layer = event.currentTarget.dataset.soundscapePlay;
      if (layer === 'ambience') this.audioEngine.playAmbience();
      else this.audioEngine.playMusic(layer);
    }));
    panel.querySelector('#stopSoundscape')?.addEventListener('click', () => {
      this.audioEngine.stopMusic();
      this.audioEngine.stopAmbience();
    });
    panel.querySelector('#toggleRecording')?.addEventListener('click', () => this.toggleRecording());
    panel.querySelector('#factoryImport')?.addEventListener('change', event => this.handleFactoryImport(event));
    panel.querySelector('#playDraft')?.addEventListener('click', () => this.playSource(this.draft?.asset?.src));
    panel.querySelector('#assignDraft')?.addEventListener('click', () => {
      if (this.draft) this.assignAsset(panel.querySelector('#factoryCaptureTarget').value, this.draft.asset, `Assigned ${this.draft.name}.`);
    });
    panel.querySelectorAll('.slot-upload').forEach(input => input.addEventListener('change', event => this.handleUpload(event)));
    panel.querySelectorAll('[data-action="play"]').forEach(button => button.addEventListener('click', event => this.handlePlay(event)));
    panel.querySelectorAll('[data-action="stop"]').forEach(button => button.addEventListener('click', event => this.handleStop(event)));
    panel.querySelectorAll('[data-action="remove"]').forEach(button => button.addEventListener('click', event => this.handleRemove(event)));
    panel.querySelectorAll('.slot-volume').forEach(range => range.addEventListener('input', event => this.handleVolumeChange(event)));
    panel.querySelectorAll('.slot-loop').forEach(input => input.addEventListener('change', event => this.handleLoopChange(event)));
    panel.querySelectorAll('.slot-add-item').forEach(button => button.addEventListener('click', event => this.handleAddArraySlot(event)));
  }

  async loadCapabilities() {
    try {
      const response = await fetch('/__stake_studio/audio/capabilities');
      const capabilities = await response.json();
      const badge = this.container.querySelector('#voiceCapability');
      if (badge) badge.textContent = capabilities.aiVoice ? 'AI voice · ready' : 'AI voice · key needed';
    } catch {
      const badge = this.container.querySelector('#voiceCapability');
      if (badge) badge.textContent = 'AI voice · unavailable';
    }
  }

  audioMime(src) {
    return String(src || '').match(/^data:([^;,]+)/i)?.[1]?.toLowerCase()
      || (String(src || '').startsWith('blob:') ? 'blob' : 'external');
  }

  async inspectMasteringAsset(asset, context) {
    const src = String(asset.src || '');
    const base = {
      id: asset.id,
      sourceFingerprint: `${src.length}:${src.slice(0, 24)}:${src.slice(-32)}`,
      mime: this.audioMime(src),
      portable: src.startsWith('data:audio/'),
    };
    if (!src) return { ...base, loaded: false, error: 'missing source' };
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      let peak = 0;
      let energy = 0;
      let dc = 0;
      let clippedSamples = 0;
      let firstAudible = decoded.length;
      let lastAudible = -1;
      const threshold = 0.003;
      for (let frame = 0; frame < decoded.length; frame++) {
        let framePeak = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const sample = decoded.getChannelData(channel)[frame];
          const absolute = Math.abs(sample);
          peak = Math.max(peak, absolute);
          framePeak = Math.max(framePeak, absolute);
          energy += sample * sample;
          dc += sample;
          if (absolute >= 0.999) clippedSamples++;
        }
        if (framePeak > threshold) {
          firstAudible = Math.min(firstAudible, frame);
          lastAudible = frame;
        }
      }
      const sampleCount = decoded.length * decoded.numberOfChannels;
      return {
        ...base,
        loaded: true,
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        sampleCount,
        peak,
        rms: sampleCount ? Math.sqrt(energy / sampleCount) : 0,
        dcOffset: sampleCount ? dc / sampleCount : 0,
        clippedSamples,
        leadingSilenceMs: firstAudible < decoded.length ? firstAudible / decoded.sampleRate * 1000 : decoded.duration * 1000,
        trailingSilenceMs: lastAudible >= 0 ? (decoded.length - 1 - lastAudible) / decoded.sampleRate * 1000 : decoded.duration * 1000,
      };
    } catch (error) {
      return { ...base, loaded: false, error: error.message };
    }
  }

  async runAudioMasteringAudit() {
    if (this.masteringBusy) return;
    this.masteringBusy = true;
    this.render();
    this.setStatus('Decoding and measuring every assigned audio source…', 'working');
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) {
      this.masteringBusy = false;
      this.render();
      this.setStatus('This browser cannot decode audio for mastering QA.', 'error');
      return;
    }
    const context = new Context();
    try {
      const inventory = buildAudioMasteringInventory(this.project);
      const cache = new Map();
      const samples = [];
      for (const asset of inventory) {
        let measured = cache.get(asset.src);
        if (!measured) {
          measured = await this.inspectMasteringAsset(asset, context);
          cache.set(asset.src, measured);
        }
        samples.push({ ...measured, id: asset.id });
      }
      const result = recordAudioMasteringQA(this.project, samples);
      this.onChange?.();
      this.masteringBusy = false;
      this.render();
      this.loadCapabilities();
      this.setStatus(result.complete
        ? `Mastering QA passed: ${result.decodedAssets}/${result.totalAssets} assets and ${result.synchronization.checked} critical cue recipes are release-safe.`
        : `Mastering QA found ${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}. Fix the measured findings and run again.`, result.complete ? 'success' : 'error');
    } catch (error) {
      this.setStatus(`Mastering QA could not finish: ${error.message}`, 'error');
    } finally {
      await context.close().catch(() => {});
      if (this.masteringBusy) {
        this.masteringBusy = false;
        this.render();
      }
    }
  }

  async auditionMix() {
    const token = ++this.auditionToken;
    this.audioEngine.stopAll();
    this.audioEngine.startSoundscape('baseMusic');
    this.setStatus('Auditioning the complete event ladder with live bus gain, variations and ducking…', 'working');
    let played = 0;
    for (const event of AUDIO_EVENT_SEQUENCE) {
      if (token !== this.auditionToken) return;
      if (this.audioEngine.playStinger(event)) played += 1;
      await new Promise(resolve => setTimeout(resolve, event === 'wincap' ? 1400 : 620));
    }
    if (token !== this.auditionToken) return;
    this.setStatus(`Audition complete: ${played}/${AUDIO_EVENT_SEQUENCE.length} mapped events played through Audio Director.`, played === AUDIO_EVENT_SEQUENCE.length ? 'success' : 'error');
  }

  stopAudition() {
    this.auditionToken += 1;
    this.audioEngine.stopAll();
    this.setStatus('Audio audition stopped and every voice settled.', 'ready');
  }

  setStatus(message, state = 'ready') {
    const status = this.container.querySelector('#audioFactoryStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  invalidateAudioReview() {
    const audio = this.project.production?.audio;
    if (!audio) return;
    audio.loudnessNormalized = false;
    audio.synchronizationReviewed = false;
    audio.duckingConfigured = false;
  }

  isMorpheusDreamfallProject() {
    return this.project.build?.stakeEngine?.gameId === 'morpheus_dreamfall'
      || String(this.project.name || '').toLowerCase().includes('morpheus');
  }

  handleGenerateMorpheusEffectPack({ seed = 110811, approvalStatus = 'foundation' } = {}) {
    const result = installMorpheusEffectCuePack(this.project, { seed, approvalStatus });
    this.invalidateAudioReview();
    this.refreshAudio();
    this.onChange?.();
    this.render();
    this.loadCapabilities();
    this.setStatus(`Morpheus specialty pack installed: ${result.audit.installedCueCount}/${result.audit.expectedCueCount} distinct barrier cues.`, result.audit.foundationReady ? 'success' : 'error');
    return result;
  }

  async auditionMorpheusEffectPack() {
    const audit = auditMorpheusEffectCuePack(this.project);
    if (!audit.foundationReady) {
      this.setStatus('Build the governed Morpheus cue pack before auditioning it.', 'error');
      return audit;
    }
    const token = ++this.auditionToken;
    this.audioEngine.stopAll();
    this.audioEngine.startSoundscape('bonusMusic');
    this.setStatus('Auditioning Mystery → Star → Dreamfall → MAX with collision and ducking rules…', 'working');
    const receipts = [];
    for (const cueId of Object.keys(MORPHEUS_EFFECT_CUE_SPECS)) {
      if (token !== this.auditionToken) return { ...audit, cancelled: true, receipts };
      receipts.push(this.audioEngine.playStingerWithReceipt(cueId));
      const duration = Number(this.project.audio.stingers[cueId]?.factory?.duration || 0.6);
      await new Promise(resolve => setTimeout(resolve, Math.min(3400, Math.max(460, duration * 1000 + 90))));
    }
    if (token === this.auditionToken) this.setStatus(`Specialty audition complete: ${receipts.filter(receipt => receipt.played).length}/${receipts.length} cue starts acknowledged.`, 'success');
    return { ...audit, receipts };
  }

  refreshAudio() {
    this.audioEngine.unload();
    this.audioEngine.loadFromProject();
  }

  assignAsset(target, asset, message) {
    if (!asset?.src || !(target in STINGER_LABELS)) return;
    if (ARRAY_TARGETS.has(target)) {
      const values = Array.isArray(this.project.audio.stingers[target]) ? this.project.audio.stingers[target] : [];
      const emptyIndex = values.findIndex(value => !value?.src);
      if (emptyIndex >= 0) values[emptyIndex] = asset;
      else values.push(asset);
      this.project.audio.stingers[target] = values;
    } else {
      this.project.audio.stingers[target] = asset;
    }
    this.project.audio.factory.generatedAssets = Number(this.project.audio.factory.generatedAssets || 0) + 1;
    this.project.audio.factory.lastSource = asset.source || 'imported';
    this.invalidateAudioReview();
    this.refreshAudio();
    this.onChange?.();
    this.render();
    this.loadCapabilities();
    this.setStatus(message || `Assigned audio to ${STINGER_LABELS[target]}.`, 'success');
  }

  handleGenerateSfx() {
    const preset = this.container.querySelector('#factorySfxPreset').value;
    const intensity = Number(this.container.querySelector('#factorySfxIntensity').value);
    const variation = Number(this.container.querySelector('#factorySfxVariation').value);
    const target = this.container.querySelector('#factorySfxTarget').value;
    const asset = generateGameSound(preset, { intensity, variation });
    this.assignAsset(target, asset, `${SFX_PRESETS[preset].label} variation ${variation} generated locally and assigned.`);
    this.playSource(asset.src);
  }

  handleGeneratePack() {
    const intensity = Number(this.container.querySelector('#factorySfxIntensity').value);
    this.project.audio.stingers = { ...this.project.audio.stingers, ...generateCoreSfxPack({ intensity }) };
    this.project.audio.factory.generatedAssets = Number(this.project.audio.factory.generatedAssets || 0) + 21;
    this.project.audio.factory.lastSource = 'procedural-pack';
    this.invalidateAudioReview();
    this.refreshAudio();
    this.onChange?.();
    this.render();
    this.loadCapabilities();
    this.setStatus('Complete 21-file core SFX pack generated locally and mapped to game events.', 'success');
  }

  handleGenerateSoundscape() {
    const profile = this.container.querySelector('#soundscapeProfile').value;
    const bpm = Number(this.container.querySelector('#soundscapeBpm').value);
    const bars = Number(this.container.querySelector('#soundscapeBars').value);
    const seed = Number(this.container.querySelector('#soundscapeSeed').value);
    this.setStatus('Composing matched base, bonus and ambience layers locally…', 'working');
    const pack = generateSoundscapePack({ profile, bpm, bars, seed });
    this.project.audio.layers = pack;
    this.project.audio.factory.generatedAssets = Number(this.project.audio.factory.generatedAssets || 0) + 3;
    this.project.audio.factory.lastSource = 'procedural-soundscape';
    this.invalidateAudioReview();
    this.refreshAudio();
    this.onChange?.();
    this.render();
    this.loadCapabilities();
    const seconds = pack.baseMusic.factory.duration.toFixed(1);
    this.setStatus(`${SOUNDSCAPE_PROFILES[profile].label} soundscape generated: three matched ${seconds}s loop-safe layers.`, 'success');
    this.audioEngine.startSoundscape('baseMusic');
  }

  async handleGenerateVoice() {
    const text = this.container.querySelector('#factoryVoiceText').value.trim();
    if (!text) return this.setStatus('Write the character line first.', 'error');
    const target = this.container.querySelector('#factoryVoiceTarget').value;
    const voice = this.container.querySelector('#factoryVoice').value;
    const instructions = this.container.querySelector('#factoryVoiceDirection').value.trim();
    const speed = Number(this.container.querySelector('#factoryVoiceSpeed').value);
    const button = this.container.querySelector('#generateVoice');
    button.disabled = true;
    this.setStatus('Generating the voice performance…', 'working');
    try {
      const response = await fetch('/__stake_studio/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, voice, instructions, speed }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || 'Voice generation failed.');
      }
      const src = await blobToDataUrl(await response.blob());
      const asset = {
        src,
        volume: 1,
        source: 'openai-voice',
        factory: { model: 'gpt-4o-mini-tts', voice, speed, characters: text.length, generatedAt: new Date().toISOString() },
      };
      this.assignAsset(target, asset, `Generated ${voice} voice assigned to ${STINGER_LABELS[target]}.`);
      this.playSource(src);
    } catch (error) {
      this.setStatus(error.message, 'error');
      button.disabled = false;
    }
  }

  async toggleRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      return this.setStatus('Microphone recording is not available in this browser.', 'error');
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const preferred = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      this.mediaRecorder = new MediaRecorder(this.mediaStream, preferred ? { mimeType: preferred } : undefined);
      this.recordingChunks = [];
      this.mediaRecorder.ondataavailable = event => { if (event.data.size) this.recordingChunks.push(event.data); };
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordingChunks, { type: this.mediaRecorder.mimeType });
        this.mediaStream?.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
        try {
          const asset = await polishAudioBlob(blob);
          asset.source = 'recorded';
          this.draft = { name: 'Microphone take', detail: `${asset.factory.duration?.toFixed(2) || '?'}s · trimmed + normalized`, asset };
          this.render();
          this.loadCapabilities();
          this.setStatus('Microphone take polished and ready to audition.', 'success');
          this.playSource(asset.src);
        } catch (error) {
          this.setStatus(`Could not process recording: ${error.message}`, 'error');
        }
      };
      this.mediaRecorder.start(100);
      const button = this.container.querySelector('#toggleRecording');
      if (button) button.textContent = '■ Stop + polish';
      this.setStatus('Recording clean input. Press stop when the take is finished.', 'recording');
    } catch (error) {
      this.setStatus(`Microphone unavailable: ${error.message}`, 'error');
    }
  }

  async handleFactoryImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    this.setStatus(`Polishing ${file.name}…`, 'working');
    try {
      const asset = await polishAudioBlob(file);
      asset.source = 'imported';
      asset.factory.name = file.name;
      this.draft = { name: file.name, detail: `${asset.factory.duration?.toFixed(2) || '?'}s · trimmed + mono + normalized`, asset };
      this.render();
      this.loadCapabilities();
      this.setStatus(`${file.name} is polished and ready to assign.`, 'success');
      this.playSource(asset.src);
    } catch (error) {
      this.setStatus(`Could not process ${file.name}: ${error.message}`, 'error');
    }
  }

  playSource(src) {
    if (!src) return;
    this.previewAudio?.pause();
    this.previewAudio = new Audio(src);
    this.previewAudio.volume = this.audioEngine.volume;
    this.previewAudio.play().catch(() => {});
  }

  handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const slot = event.target.dataset.slot;
      const type = event.target.dataset.type;
      const index = event.target.dataset.index;
      const asset = { src, volume: type === 'music' ? 0.5 : 1, source: 'imported', factory: { name: file.name } };
      if (type === 'music') this.project.audio.layers[slot] = { ...asset, loop: true };
      else if (index !== undefined) {
        if (!Array.isArray(this.project.audio.stingers[slot])) this.project.audio.stingers[slot] = [];
        this.project.audio.stingers[slot][Number(index)] = asset;
      } else this.project.audio.stingers[slot] = asset;
      this.invalidateAudioReview();
      this.refreshAudio();
      this.onChange?.();
      this.render();
      this.loadCapabilities();
      this.setStatus(`${file.name} imported. Use Capture + polish for automatic mastering.`, 'success');
    };
    reader.readAsDataURL(file);
  }

  handlePlay(event) {
    const slot = event.target.closest('.audio-slot');
    const index = event.target.dataset.index;
    if (slot.dataset.type === 'music') this.audioEngine.playMusic(slot.dataset.key);
    else this.audioEngine.playStinger(slot.dataset.key, index !== undefined ? Number(index) : undefined);
  }

  handleStop(event) {
    const slot = event.target.closest('.audio-slot');
    const index = event.target.dataset.index;
    if (slot.dataset.type === 'music') this.audioEngine.stopMusic();
    else this.audioEngine.stop(index !== undefined ? `stinger_${slot.dataset.key}_${index}` : `stinger_${slot.dataset.key}`);
  }

  handleRemove(event) {
    const slot = event.target.closest('.audio-slot');
    const key = slot.dataset.key;
    const index = event.target.dataset.index;
    if (slot.dataset.type === 'music') this.project.audio.layers[key] = null;
    else if (index !== undefined) this.project.audio.stingers[key][Number(index)] = null;
    else this.project.audio.stingers[key] = null;
    this.invalidateAudioReview();
    this.refreshAudio();
    this.onChange?.();
    this.render();
    this.loadCapabilities();
  }

  handleVolumeChange(event) {
    const slot = event.target.dataset.slot;
    if (event.target.dataset.type === 'music' && this.project.audio.layers[slot]) this.project.audio.layers[slot].volume = Number(event.target.value);
    this.onChange?.();
  }

  handleLoopChange(event) {
    const slot = event.target.dataset.slot;
    if (this.project.audio.layers[slot]) this.project.audio.layers[slot].loop = event.target.checked;
    this.onChange?.();
  }

  handleAddArraySlot(event) {
    const key = event.target.dataset.slot;
    if (!Array.isArray(this.project.audio.stingers[key])) this.project.audio.stingers[key] = [];
    this.project.audio.stingers[key].push(null);
    this.onChange?.();
    this.render();
    this.loadCapabilities();
  }

  destroy() {
    this.auditionToken += 1;
    this.previewAudio?.pause();
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioEngine.stopAll();
    this.audioEngine.unload();
  }
}
