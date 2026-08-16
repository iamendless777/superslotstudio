export const MIXED_SPECIAL_SCHEDULER_SPIKE_FORMAT = 'stake-studio-mixed-special-scheduler-spike-v1';

const clone = value => JSON.parse(JSON.stringify(value));

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

export function hashMixedSpecialState(value) {
  return hashText(JSON.stringify(canonicalize(value)));
}

const clean = value => String(value ?? '').trim();
const pairKey = (left, right) => [clean(left), clean(right)].sort().join('|');

function normalizeGroups(groups = []) {
  const ids = new Set();
  return groups.map((group, groupIndex) => {
    const id = clean(group.id || `group-${groupIndex + 1}`);
    const mode = clean(group.mode);
    if (!['sequential', 'parallel'].includes(mode)) throw new Error(`Scheduler group "${id}" requires an explicit sequential or parallel mode.`);
    if (ids.has(id)) throw new Error(`Scheduler group "${id}" is duplicated.`);
    ids.add(id);
    const actions = (group.actions || []).map((action, actionIndex) => ({
      ...action,
      id: clean(action.id || `${id}:action-${actionIndex + 1}`),
      mechanic: clean(action.mechanic),
      blocking: action.blocking === true,
    }));
    if (!actions.length) throw new Error(`Scheduler group "${id}" has no actions.`);
    if (actions.some(action => !action.mechanic)) throw new Error(`Every action in scheduler group "${id}" requires a mechanic ID.`);
    return { id, mode, actions };
  });
}

export class MixedSpecialSchedulerSpike {
  constructor({ state = {}, forbiddenInteractions = [] } = {}) {
    this.state = clone(state);
    this.forbidden = new Map(forbiddenInteractions.map(item => [
      pairKey(item.left, item.right),
      clean(item.reason) || 'The interaction is forbidden by the mechanic architecture.',
    ]));
    this.trace = [];
    this.groupEvidence = [];
    this.running = false;
    this.closed = false;
    this.sequence = 0;
  }

  record(type, detail = {}) {
    const item = { sequence: this.sequence++, type, ...detail };
    this.trace.push(item);
    return item;
  }

  assertAllowed(group) {
    if (group.mode !== 'parallel') return;
    for (let left = 0; left < group.actions.length; left++) {
      for (let right = left + 1; right < group.actions.length; right++) {
        const first = group.actions[left];
        const second = group.actions[right];
        const reason = this.forbidden.get(pairKey(first.mechanic, second.mechanic));
        if (reason) throw new Error(`Forbidden parallel interaction ${first.mechanic} + ${second.mechanic}: ${reason}`);
      }
    }
  }

  async executeAction(group, action, executor) {
    let open = true;
    let acknowledgement = null;
    this.record('action-start', { groupId: group.id, actionId: action.id, mechanic: action.mechanic });
    const context = Object.freeze({
      groupId: group.id,
      actionId: action.id,
      mechanic: action.mechanic,
      readState: () => clone(this.state),
      mutate: (label, mutator) => {
        if (!open || !this.running || this.closed) throw new Error(`Late state mutation rejected for ${action.id}.`);
        if (typeof mutator !== 'function') throw new Error(`State mutation "${clean(label)}" requires a synchronous mutator.`);
        const draft = clone(this.state);
        const result = mutator(draft);
        if (result && typeof result.then === 'function') throw new Error(`State mutation "${clean(label)}" must be synchronous.`);
        this.state = draft;
        this.record('state-mutation', {
          groupId: group.id,
          actionId: action.id,
          label: clean(label),
          stateHash: hashMixedSpecialState(this.state),
        });
      },
      acknowledge: evidence => {
        if (!open || !this.running || this.closed) throw new Error(`Late acknowledgement rejected for ${action.id}.`);
        if (acknowledgement) throw new Error(`Action "${action.id}" was acknowledged more than once.`);
        const value = clean(evidence);
        if (!value) throw new Error(`Action "${action.id}" requires acknowledgement evidence.`);
        acknowledgement = value;
        this.record('acknowledgement', { groupId: group.id, actionId: action.id, evidence: value });
      },
    });

    try {
      await executor(action, context);
      if (action.blocking && !acknowledgement) throw new Error(`Blocking action "${action.id}" completed without acknowledgement.`);
      this.record('action-complete', {
        groupId: group.id,
        actionId: action.id,
        mechanic: action.mechanic,
        blocking: action.blocking,
        acknowledged: Boolean(acknowledgement),
      });
      return { actionId: action.id, acknowledged: acknowledgement };
    } finally {
      open = false;
    }
  }

  async run(inputGroups = [], executor) {
    if (this.running || this.closed) throw new Error('This scheduler spike instance can run only once.');
    if (typeof executor !== 'function') throw new Error('The scheduler spike requires an action executor.');
    const groups = normalizeGroups(inputGroups);
    this.running = true;
    try {
      for (const group of groups) {
        this.assertAllowed(group);
        const beforeHash = hashMixedSpecialState(this.state);
        this.record('group-start', { groupId: group.id, mode: group.mode });
        let results;
        if (group.mode === 'sequential') {
          results = [];
          for (const action of group.actions) results.push(await this.executeAction(group, action, executor));
        } else {
          const settled = await Promise.allSettled(group.actions.map(action => this.executeAction(group, action, executor)));
          const failed = settled.find(item => item.status === 'rejected');
          if (failed) throw failed.reason;
          results = settled.map(item => item.value);
        }
        const afterHash = hashMixedSpecialState(this.state);
        this.record('group-complete', { groupId: group.id, mode: group.mode, stateHash: afterHash });
        this.groupEvidence.push({
          id: group.id,
          mode: group.mode,
          beforeHash,
          afterHash,
          actions: results,
        });
      }
    } finally {
      this.running = false;
      this.closed = true;
    }
    return {
      format: MIXED_SPECIAL_SCHEDULER_SPIKE_FORMAT,
      passed: true,
      state: clone(this.state),
      stateHash: hashMixedSpecialState(this.state),
      groups: clone(this.groupEvidence),
      trace: clone(this.trace),
    };
  }
}

export async function runMixedSpecialSchedulerSpike(input, executor) {
  const scheduler = new MixedSpecialSchedulerSpike(input);
  return scheduler.run(input?.groups || [], executor);
}
