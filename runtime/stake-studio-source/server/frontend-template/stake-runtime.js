export const API_AMOUNT_MULTIPLIER = 1_000_000;

const REQUIRED_REPLAY_PARAMS = ['game', 'version', 'mode', 'event', 'rgs_url'];

export function normalizeRgsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Missing rgs_url.');
  const decoded = decodeURIComponent(raw);
  const url = /^https?:\/\//i.test(decoded) ? decoded : `https://${decoded}`;
  return url.replace(/\/+$/, '');
}

export function parseLaunch(href) {
  const url = new URL(href);
  const value = name => url.searchParams.get(name) || '';
  const replay = value('replay') === 'true';
  if (replay) {
    const missing = REQUIRED_REPLAY_PARAMS.filter(name => !value(name));
    if (missing.length) throw new Error(`Replay URL is missing: ${missing.join(', ')}.`);
  }
  const device = value('device') || 'desktop';
  if (!['desktop', 'mobile'].includes(device)) throw new Error(`Unsupported device type: ${device}.`);
  return {
    replay,
    studioPreview: value('studioPreview') === 'true',
    sessionID: value('sessionID'),
    lang: value('lang') || 'en',
    device,
    studioViewport: value('studioViewport'),
    social: value('social') === 'true',
    rgsUrl: value('rgs_url') ? normalizeRgsUrl(value('rgs_url')) : '',
    game: value('game'),
    version: value('version'),
    mode: value('mode'),
    event: value('event'),
    currency: value('currency') || 'USD',
    amount: Number(value('amount')) || 0,
  };
}

export class StakeRuntime {
  #balance = null;
  #config = null;
  #jurisdiction = null;
  #roundActive = false;

  constructor({
    href = globalThis.location?.href,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    onBalance = () => {},
    onRoundActive = () => {},
  } = {}) {
    if (!href) throw new Error('A launch URL is required.');
    if (!fetchImpl) throw new Error('fetch is required.');
    this.launch = parseLaunch(href);
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.now = now;
    this.onBalance = onBalance;
    this.onRoundActive = onRoundActive;
  }

  get balance() { return this.#balance ? Object.freeze({ ...this.#balance }) : null; }
  get config() { return this.#config ? Object.freeze({ ...this.#config }) : null; }
  get jurisdiction() { return this.#jurisdiction ? Object.freeze({ ...this.#jurisdiction }) : null; }
  get roundActive() { return this.#roundActive; }

  async request(path, { method = 'POST', body, session = true } = {}) {
    if (!this.launch.rgsUrl) throw new Error('Missing rgs_url.');
    if (session && !this.launch.sessionID) throw new Error('Missing sessionID.');
    const response = await this.fetch(`${this.launch.rgsUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      const code = data?.error?.code || data?.error || `HTTP ${response.status}`;
      const message = data?.error?.message || data?.message || String(code);
      const error = new Error(message);
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  commitBalance(balance) {
    if (!balance || !Number.isFinite(Number(balance.amount))) return;
    this.#balance = { amount: Number(balance.amount), currency: balance.currency || this.#balance?.currency || 'USD' };
    this.onBalance(this.balance);
  }

  setRoundActive(active) {
    this.#roundActive = Boolean(active);
    this.onRoundActive(this.#roundActive);
  }

  async authenticate() {
    if (this.launch.replay || this.launch.studioPreview) throw new Error('Session authentication is disabled in replay and Studio Preview.');
    const data = await this.request('/wallet/authenticate', {
      body: { sessionID: this.launch.sessionID, language: this.launch.lang },
    });
    this.#config = { ...(data.config || {}) };
    this.#jurisdiction = { ...(data.config?.jurisdiction || data.jurisdictionFlags || {}) };
    this.commitBalance(data.balance);
    this.setRoundActive(Boolean(data.round?.active));
    return { ...data, config: this.config, jurisdictionFlags: this.jurisdiction };
  }

  async refreshBalance() {
    const data = await this.request('/wallet/balance', { body: { sessionID: this.launch.sessionID } });
    this.commitBalance(data.balance);
    return this.balance;
  }

  validateBet(amount) {
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Bet amount must be a positive API-unit integer.');
    const config = this.#config || {};
    if (Number.isFinite(config.minBet) && value < config.minBet) throw new Error(`Bet is below the minimum ${config.minBet}.`);
    if (Number.isFinite(config.maxBet) && value > config.maxBet) throw new Error(`Bet is above the maximum ${config.maxBet}.`);
    if (Number.isFinite(config.stepBet) && config.stepBet > 0 && value % config.stepBet !== 0) throw new Error(`Bet must use the ${config.stepBet} step.`);
    if (Array.isArray(config.betLevels) && config.betLevels.length && !config.betLevels.includes(value)) throw new Error('Bet is not an allowed bet level.');
    return value;
  }

  isBonusGame(modeConfig = {}) {
    return Boolean(modeConfig.isFeature || modeConfig.isBuyBonus || modeConfig.autoCloseDisabled);
  }

  classifyRound(round, modeConfig = {}) {
    const isBonusGame = this.isBonusGame(modeConfig);
    if (round?.active === true && isBonusGame) return 'bonusWin';
    if (Number(round?.payoutMultiplier) > 0) return isBonusGame ? 'bonusWin' : 'singleRoundWin';
    return 'noWin';
  }

  async endRound() {
    const data = await this.request('/wallet/end-round', { body: { sessionID: this.launch.sessionID } });
    this.setRoundActive(false);
    return data;
  }

  async recordEvent(index) {
    if (this.launch.replay || this.launch.studioPreview) return null;
    return this.request('/bet/event', { body: { sessionID: this.launch.sessionID, event: String(index) } });
  }

  async present(round, present, { resume = false } = {}) {
    const state = Array.isArray(round?.state) ? round.state : [];
    const resumeIndex = resume ? Math.max(0, Number(round?.event) || 0) : 0;
    const snapshotEvents = resume ? state.slice(0, resumeIndex) : [];
    const events = state.slice(resumeIndex);
    return present({ round, events, snapshotEvents, recordEvent: index => this.recordEvent(index), replay: this.launch.replay, resume });
  }

  async honorMinimumRoundDuration(startedAt) {
    const minimum = Number(this.#jurisdiction?.minimumRoundDuration) || 0;
    const remaining = minimum - (this.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  async play({ amount, mode, modeConfig = {}, present }) {
    if (this.launch.replay || this.launch.studioPreview) throw new Error('Wallet play is disabled outside a live session.');
    if (this.#roundActive) throw new Error('A round is already active.');
    const amountApi = this.validateBet(amount);
    const startedAt = this.now();
    this.setRoundActive(true);
    let data;
    try {
      data = await this.request('/wallet/play', {
        body: { sessionID: this.launch.sessionID, mode, amount: amountApi },
      });
    } catch (error) {
      this.setRoundActive(false);
      throw error;
    }
    this.commitBalance(data.balance);
    const round = data.round || {};
    const type = this.classifyRound(round, modeConfig);
    if (!round.active && type === 'noWin') this.setRoundActive(false);

    let heldEndRound = null;
    if (type === 'singleRoundWin') heldEndRound = this.endRound();
    await this.present(round, present);
    await this.honorMinimumRoundDuration(startedAt);

    if (type === 'singleRoundWin') {
      const ended = await heldEndRound;
      this.commitBalance(ended.balance);
    } else if (type === 'bonusWin') {
      const ended = await this.endRound();
      this.commitBalance(ended.balance);
    }
    return { round, type, balance: this.balance };
  }

  async resume(round, { modeConfig = {}, present }) {
    if (!round?.active) return null;
    this.setRoundActive(true);
    await this.present(round, present, { resume: true });
    const ended = await this.endRound();
    this.commitBalance(ended.balance);
    return { round, type: this.classifyRound(round, modeConfig), balance: this.balance };
  }

  async loadReplay() {
    if (!this.launch.replay) throw new Error('This is not a replay URL.');
    const { game, version, mode, event } = this.launch;
    return this.request(`/bet/replay/${encodeURIComponent(game)}/${encodeURIComponent(version)}/${encodeURIComponent(mode)}/${encodeURIComponent(event)}`, {
      method: 'GET', session: false,
    });
  }

  async playReplay(replayData, present) {
    const round = { ...replayData, active: true, mode: this.launch.mode, event: '0', state: replayData?.state || [] };
    await this.present(round, present);
    return round;
  }
}
