export const COMMAND_RESULT_LIMIT = 200;

function normalizedResults(ledger) {
  return Array.isArray(ledger?.results) ? ledger.results.filter(item => item?.id) : [];
}

function tombstone(result, consumedAt) {
  return {
    id: result.id,
    ok: result.ok === true,
    completedAt: result.completedAt || consumedAt,
    consumedAt: result.consumedAt || consumedAt,
    pruned: true,
  };
}

export function compactCommandResultLedger(ledger, { now = () => new Date().toISOString() } = {}) {
  const consumedAt = now();
  return {
    results: normalizedResults(ledger)
      .slice(-COMMAND_RESULT_LIMIT)
      .map(result => result.pruned === true ? result : tombstone(result, consumedAt)),
  };
}

export function appendCommandResult(ledger, result, { now = () => new Date().toISOString() } = {}) {
  const existing = compactCommandResultLedger(ledger, { now }).results
    .filter(item => item.id !== result.id);
  return {
    results: [...existing, result].slice(-COMMAND_RESULT_LIMIT),
  };
}

export function consumeCommandResult(ledger, id, { now = () => new Date().toISOString() } = {}) {
  const results = normalizedResults(ledger);
  const index = results.findIndex(item => item.id === id);
  if (index < 0) return { status: 'missing', ledger: { results } };
  const result = results[index];
  if (result.pruned === true) return { status: 'consumed', ledger: { results } };
  const nextResults = [...results];
  nextResults[index] = tombstone(result, now());
  return {
    status: 'found',
    result,
    ledger: { results: nextResults.slice(-COMMAND_RESULT_LIMIT) },
  };
}
