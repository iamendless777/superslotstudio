import { Howl, Howler } from 'howler';
import { AudioDirector, normalizeAudioDirector } from './AudioDirector.js';

export class AudioEngine {
  constructor(project) {
    this.project = project;
    this.muted = false;
    this.volume = 1;
    this.sounds = {};
    this.soundMeta = {};
    this.musicPlaying = null;
    this.ambiencePlaying = null;
    this.activeStingers = [];
    this.lastStingerReceipt = null;
    this.duckReleaseTimer = null;
    this.director = new AudioDirector(project);
    this.syncMasterVolume();
  }

  get layers() { return this.project.audio.layers; }
  get stingers() { return this.project.audio.stingers; }

  syncMasterVolume() {
    Howler.volume(this.volume * Number(this.director.profile.buses.master ?? 1));
  }

  load(key, src, opts = {}) {
    if (!src) return null;
    if (this.sounds[key]) return this.sounds[key];
    const type = opts.type || 'stinger';
    const busGain = this.director.busGain(type, opts.asset || opts);
    const gain = (opts.volume ?? 1) * busGain;
    const howl = new Howl({
      src: [src],
      loop: opts.loop || false,
      volume: gain,
      preload: true,
    });
    this.sounds[key] = howl;
    this.soundMeta[key] = { type, bus: type === 'music' ? 'music' : type === 'ambience' ? 'ambience' : (opts.asset?.source === 'openai-voice' || opts.asset?.source === 'recorded-voice' ? 'voice' : 'sfx'), gain, asset: opts.asset || opts, event: opts.event || null };
    return howl;
  }

  loadFromProject() {
    this.director.refresh();
    this.syncMasterVolume();
    for (const [key, layer] of Object.entries(this.layers)) {
      if (!layer?.src) continue;
      const type = key === 'ambience' ? 'ambience' : 'music';
      this.load(`music_${key}`, layer.src, { ...layer, type, asset: layer });
    }
    for (const [event, stinger] of Object.entries(this.stingers)) {
      if (Array.isArray(stinger)) {
        stinger.forEach((asset, index) => {
          if (asset?.src) this.load(`stinger_${event}_${index}`, asset.src, { ...asset, type: 'stinger', asset, event });
        });
      } else if (stinger?.src) {
        this.load(`stinger_${event}`, stinger.src, { ...stinger, type: 'stinger', asset: stinger, event });
      }
    }
  }

  pruneVoices() {
    this.activeStingers = this.activeStingers.filter(voice => voice.sound.playing(voice.id));
  }

  enforceConcurrency(event, asset = {}) {
    this.pruneVoices();
    const profile = this.director.profile.concurrency;
    while (this.activeStingers.length >= profile.totalStingers) {
      const oldest = this.activeStingers.shift();
      oldest?.sound.stop(oldest.id);
    }
    const maximumSameEvent = Math.max(1, Math.min(profile.sameEvent, Number(asset?.orchestration?.maxVoices || profile.sameEvent)));
    const sameEvent = this.activeStingers.filter(voice => voice.event === event);
    while (sameEvent.length >= maximumSameEvent) {
      const oldest = sameEvent.shift();
      oldest?.sound.stop(oldest.id);
      this.activeStingers = this.activeStingers.filter(voice => voice !== oldest);
    }
    const exclusiveGroup = asset?.orchestration?.exclusiveGroup;
    if (exclusiveGroup) {
      const incomingPriority = Number(asset?.orchestration?.priority || 0);
      for (const voice of this.activeStingers.filter(item => item.exclusiveGroup === exclusiveGroup)) {
        if (incomingPriority < Number(voice.priority || 0)) return false;
        voice.sound.stop(voice.id);
        this.activeStingers = this.activeStingers.filter(item => item !== voice);
      }
    }
    return true;
  }

  play(key, context = {}) {
    const sound = this.sounds[key];
    if (!sound || this.muted) return null;
    const meta = this.soundMeta[key] || {};
    if (meta.type === 'stinger' && this.enforceConcurrency(context.event || meta.event, meta.asset) === false) return null;
    const id = sound.play();
    if (meta.type === 'stinger') {
      const bus = meta.bus;
      if (bus !== 'voice') {
        const variation = this.director.playbackVariation();
        sound.rate(variation.rate, id);
        sound.volume(meta.gain * variation.volume, id);
      }
      const voice = {
        key,
        id,
        sound,
        event: context.event || meta.event,
        startedAt: Date.now(),
        exclusiveGroup: meta.asset?.orchestration?.exclusiveGroup || null,
        priority: Number(meta.asset?.orchestration?.priority || 0),
      };
      this.activeStingers.push(voice);
      sound.once('end', () => { this.activeStingers = this.activeStingers.filter(item => item !== voice); }, id);
      if (this.director.shouldDuck(voice.event, meta.asset)) this.applyDucking();
    }
    return sound;
  }

  playStinger(event, index) {
    const value = this.stingers[event];
    let selectedIndex = index;
    let asset = value;
    if (Array.isArray(value)) {
      const selected = selectedIndex === undefined
        ? this.director.chooseVariation(event, value)
        : { asset: value[selectedIndex], index: selectedIndex };
      if (!selected?.asset?.src) return null;
      selectedIndex = selected.index;
      asset = selected.asset;
    }
    const key = selectedIndex !== undefined ? `stinger_${event}_${selectedIndex}` : `stinger_${event}`;
    const sound = this.play(key, { event, asset });
    this.lastStingerReceipt = {
      format: 'stake-studio-audio-playback-receipt-v1',
      cueId: event,
      variation: selectedIndex ?? 0,
      played: Boolean(sound),
      sourceFingerprint: asset?.factory?.fingerprint || null,
      packId: asset?.factory?.packId || null,
      approvalStatus: asset?.factory?.approvalStatus || null,
      duration: Number(asset?.factory?.duration || 0),
      exclusiveGroup: asset?.orchestration?.exclusiveGroup || null,
      priority: Number(asset?.orchestration?.priority || 0),
      ducking: Boolean(asset?.orchestration?.ducking),
      interruptPolicy: asset?.orchestration?.interruptPolicy || null,
      startedAt: Date.now(),
    };
    return sound;
  }

  playStingerWithReceipt(event, index) {
    this.playStinger(event, index);
    return this.lastStingerReceipt ? { ...this.lastStingerReceipt } : {
      format: 'stake-studio-audio-playback-receipt-v1', cueId: event, variation: index ?? 0, played: false,
    };
  }

  playMusic(layerKey) {
    if (this.musicPlaying === `music_${layerKey}` && this.sounds[this.musicPlaying]?.playing()) return this.sounds[this.musicPlaying];
    this.stopMusic();
    const key = `music_${layerKey}`;
    const sound = this.play(key);
    if (sound) this.musicPlaying = key;
    return sound;
  }

  playAmbience() {
    const key = 'music_ambience';
    if (this.ambiencePlaying === key && this.sounds[key]?.playing()) return this.sounds[key];
    const sound = this.play(key);
    if (sound) this.ambiencePlaying = key;
    return sound;
  }

  startSoundscape(musicLayer = 'baseMusic') {
    this.playAmbience();
    return this.playMusic(musicLayer);
  }

  applyDucking() {
    const { amount, attackMs, releaseMs } = this.director.profile.ducking;
    clearTimeout(this.duckReleaseTimer);
    for (const key of [this.musicPlaying, this.ambiencePlaying].filter(Boolean)) {
      const sound = this.sounds[key];
      const baseGain = this.soundMeta[key]?.gain ?? sound?.volume() ?? 1;
      if (sound?.playing()) sound.fade(sound.volume(), baseGain * (1 - amount), attackMs);
    }
    this.duckReleaseTimer = setTimeout(() => {
      for (const key of [this.musicPlaying, this.ambiencePlaying].filter(Boolean)) {
        const sound = this.sounds[key];
        const baseGain = this.soundMeta[key]?.gain ?? 1;
        if (sound?.playing()) sound.fade(sound.volume(), baseGain, releaseMs);
      }
      this.duckReleaseTimer = null;
    }, attackMs + releaseMs);
  }

  stopMusic() {
    if (this.musicPlaying && this.sounds[this.musicPlaying]) this.sounds[this.musicPlaying].stop();
    this.musicPlaying = null;
  }

  stopAmbience() {
    if (this.ambiencePlaying && this.sounds[this.ambiencePlaying]) this.sounds[this.ambiencePlaying].stop();
    this.ambiencePlaying = null;
  }

  setMuted(muted) {
    this.muted = muted;
    Howler.mute(muted);
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, Number(volume)));
    this.syncMasterVolume();
  }

  setMixBus(bus, value) {
    this.project.audio.director = normalizeAudioDirector(this.project.audio.director);
    if (!(bus in this.project.audio.director.buses)) return;
    this.project.audio.director.buses[bus] = Math.max(0, Math.min(1.25, Number(value)));
    this.director.refresh();
    if (bus === 'master') this.syncMasterVolume();
    for (const [key, meta] of Object.entries(this.soundMeta)) {
      if (meta.bus !== bus || !this.sounds[key]) continue;
      const assetVolume = Number(meta.asset?.volume ?? 1);
      meta.gain = assetVolume * this.director.profile.buses[bus];
      this.sounds[key].volume(meta.gain);
    }
  }

  stop(key) {
    if (this.sounds[key]) this.sounds[key].stop();
    this.pruneVoices();
  }

  stopAll() {
    clearTimeout(this.duckReleaseTimer);
    this.duckReleaseTimer = null;
    Howler.stop();
    this.musicPlaying = null;
    this.ambiencePlaying = null;
    this.activeStingers = [];
    this.lastStingerReceipt = null;
  }

  unload() {
    this.stopAll();
    for (const sound of Object.values(this.sounds)) sound.unload();
    this.sounds = {};
    this.soundMeta = {};
  }

  getStinger(event) {
    return this.stingers[event] || null;
  }

  getMusicForState(state) {
    return state.startsWith('bonus') ? this.layers.bonusMusic : this.layers.baseMusic;
  }

  exportAudioManifest() {
    const files = [];
    for (const [key, layer] of Object.entries(this.layers)) {
      if (layer?.src) files.push({ type: key === 'ambience' ? 'ambience' : 'music', key, bus: key === 'ambience' ? 'ambience' : 'music', src: layer.src });
    }
    for (const [event, stinger] of Object.entries(this.stingers)) {
      if (Array.isArray(stinger)) {
        stinger.forEach((asset, index) => { if (asset?.src) files.push({ type: 'stinger', key: `${event}_${index}`, event, bus: asset.source === 'openai-voice' ? 'voice' : 'sfx', src: asset.src }); });
      } else if (stinger?.src) {
        files.push({ type: 'stinger', key: event, event, bus: stinger.source === 'openai-voice' ? 'voice' : 'sfx', src: stinger.src });
      }
    }
    return { director: this.director.exportManifest(), files };
  }
}
