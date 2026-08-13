export const RECOVERY_REPLAY_SPIKE_FORMAT = 'stake-studio-recovery-replay-spike-v1';
export const RECOVERY_CHECKPOINT_FORMAT = 'stake-studio-recovery-checkpoint-v1';

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function hashRecoveryValue(value) {
  return hashText(JSON.stringify(canonicalize(value)));
}

function merge(target, patch) {
  if (patch === undefined) return clone(target);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return clone(patch);
  const result = target && typeof target === 'object' && !Array.isArray(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key], value)
      : clone(value);
  }
  return result;
}

function applyBoardChanges(board, changes = []) {
  const next = clone(board);
  for (const change of changes) {
    const reel = Number(change.reel);
    const row = Number(change.row);
    if (!Number.isSafeInteger(reel) || !Number.isSafeInteger(row) || next[reel]?.[row] === undefined) {
      throw new Error(`Invalid board change at ${change.reel}:${change.row}.`);
    }
    next[reel][row] = clone(change.to);
  }
  return next;
}

function applyEvent(snapshot, event) {
  let board = event.board === undefined ? clone(snapshot.board) : clone(event.board);
  if (event.boardChanges?.length) board = applyBoardChanges(board, event.boardChanges);
  let state = merge(snapshot.state, event.statePatch);
  state = merge(state, event.persistentStatePatch);
  return { board, state };
}

function checkpointFor(snapshot, event, eventIndex) {
  const checkpoint = {
    format: RECOVERY_CHECKPOINT_FORMAT,
    id: `checkpoint:${String(event.id || event.type || eventIndex)}`,
    eventIndex,
    nextEventIndex: eventIndex + 1,
    eventHash: snapshot.eventHash,
    board: clone(snapshot.board),
    state: clone(snapshot.state),
    boardHash: hashRecoveryValue(snapshot.board),
    stateHash: hashRecoveryValue(snapshot.state),
  };
  checkpoint.checkpointHash = hashRecoveryValue(checkpoint);
  return checkpoint;
}

function execute(events, initial, { startIndex = 0, checkpoints = false } = {}) {
  let snapshot = {
    board: clone(initial.board),
    state: clone(initial.state),
    eventHash: initial.eventHash,
  };
  const timeline = [];
  const created = [];
  for (let eventIndex = startIndex; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    const beforeStateHash = hashRecoveryValue(snapshot.state);
    const next = applyEvent(snapshot, event);
    const eventHash = hashRecoveryValue({ previous: snapshot.eventHash, event });
    snapshot = { ...next, eventHash };
    const boardHash = hashRecoveryValue(snapshot.board);
    const stateHash = hashRecoveryValue(snapshot.state);
    const persistent = event.persistentChange === true || event.persistentStatePatch !== undefined;
    if (persistent && stateHash === beforeStateHash) {
      throw new Error(`Persistent event "${event.id || event.type || eventIndex}" did not change authoritative state.`);
    }
    const entry = {
      eventIndex,
      eventId: String(event.id || event.type || eventIndex),
      eventType: String(event.type || ''),
      persistent,
      eventHash,
      boardHash,
      stateHash,
    };
    timeline.push(entry);
    if (checkpoints && persistent) {
      const checkpoint = checkpointFor(snapshot, event, eventIndex);
      created.push(checkpoint);
      entry.checkpointHash = checkpoint.checkpointHash;
    }
  }
  return { ...snapshot, timeline, checkpoints: created };
}

function genesis(initialBoard, initialState) {
  const board = clone(initialBoard);
  const state = clone(initialState);
  return {
    format: RECOVERY_CHECKPOINT_FORMAT,
    id: 'checkpoint:genesis',
    eventIndex: -1,
    nextEventIndex: 0,
    eventHash: hashRecoveryValue({ board, state }),
    board,
    state,
    boardHash: hashRecoveryValue(board),
    stateHash: hashRecoveryValue(state),
    checkpointHash: hashRecoveryValue({ id: 'checkpoint:genesis', board, state }),
  };
}

export function reconstructRecoveryReplay(events, checkpoint) {
  const recovered = execute(events, checkpoint, { startIndex: checkpoint.nextEventIndex, checkpoints: false });
  return {
    checkpointId: checkpoint.id,
    checkpointHash: checkpoint.checkpointHash,
    eventHash: recovered.eventHash,
    board: recovered.board,
    state: recovered.state,
    boardHash: hashRecoveryValue(recovered.board),
    stateHash: hashRecoveryValue(recovered.state),
    replayedEvents: recovered.timeline.length,
    timeline: recovered.timeline,
  };
}

export function runRecoveryReplaySpike({ initialBoard = [], initialState = {}, events = [], reconnectAfter = events.length } = {}) {
  const safeReconnectAfter = Math.max(0, Math.min(events.length, Number(reconnectAfter) || 0));
  const origin = genesis(initialBoard, initialState);
  const continuous = execute(events, origin, { checkpoints: true });
  const eligible = continuous.checkpoints.filter(checkpoint => checkpoint.nextEventIndex <= safeReconnectAfter);
  const checkpoint = clone(eligible.at(-1) || origin);
  const recovered = reconstructRecoveryReplay(events, checkpoint);
  const repeated = reconstructRecoveryReplay(events, checkpoint);
  const final = {
    eventHash: continuous.eventHash,
    boardHash: hashRecoveryValue(continuous.board),
    stateHash: hashRecoveryValue(continuous.state),
  };
  const equality = {
    event: recovered.eventHash === final.eventHash,
    board: recovered.boardHash === final.boardHash,
    state: recovered.stateHash === final.stateHash,
  };
  const deterministic = recovered.eventHash === repeated.eventHash
    && recovered.boardHash === repeated.boardHash
    && recovered.stateHash === repeated.stateHash;
  return {
    format: RECOVERY_REPLAY_SPIKE_FORMAT,
    passed: Object.values(equality).every(Boolean) && deterministic,
    reconnectAfter: safeReconnectAfter,
    checkpoint,
    checkpoints: continuous.checkpoints,
    continuous: { ...final, timeline: continuous.timeline },
    recovered,
    equality,
    deterministic,
  };
}
