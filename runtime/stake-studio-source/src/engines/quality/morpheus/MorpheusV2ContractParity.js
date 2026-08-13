export const MORPHEUS_V2_CONTRACT_FORMAT = 'morpheus-dreamfall-game-contract-v2';
export const MORPHEUS_V2_PARITY_FORMAT = 'stake-studio-morpheus-v2-contract-parity-v1';
export const MORPHEUS_PROOF_DISCIPLINES = Object.freeze([
  'math', 'events', 'frontend', 'presentation', 'gameInfo', 'replay',
]);

const REQUIRED_ARTIFACTS = Object.freeze([...MORPHEUS_PROOF_DISCIPLINES]);
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

const clean = value => String(value ?? '').trim();
const strings = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const equal = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

export function fingerprintMorpheusV2Contract(input = {}) {
  const contract = clone(input);
  delete contract.fingerprint;
  delete contract.contractFingerprint;
  return `morpheus-v2-${hashText(JSON.stringify(canonicalize(contract)))}`;
}

function selector(selectors, key, fallback) {
  return typeof selectors?.[key] === 'function' ? selectors[key] : fallback;
}

/**
 * Data-only adapter seam for fixtures and future evidence sources. Authority
 * is intentionally unavailable here; the registry-backed Morpheus adapter
 * owns that release boundary.
 */
export function createMorpheusV2QAAdapter(source = {}, selectors = {}) {
  const readContract = selector(selectors, 'contract', value => value.contract);
  const readArtifacts = selector(selectors, 'artifacts', value => value.artifacts);
  const readSlice = selector(selectors, 'signatureSlice', value => value.signatureSlice);
  return Object.freeze({
    // Generic/data adapters can never self-attest as authoritative. Only the
    // real Morpheus registry adapter may cross that release boundary.
    authority: 'data-fixture',
    readContract: () => clone(readContract(source)),
    readArtifacts: () => clone(readArtifacts(source) || {}),
    readSignatureSlice: () => clone(readSlice(source) || {}),
  });
}

function asAdapter(value) {
  return value && typeof value.readContract === 'function' && typeof value.readArtifacts === 'function'
    ? value
    : createMorpheusV2QAAdapter(value);
}

function contractSummary(contract) {
  return {
    economics: clone(contract.economics || {}),
    modeIds: strings(contract.modeIds),
    eventVocabulary: strings(contract.eventVocabulary),
  };
}

export function evaluateMorpheusV2ContractParity(input) {
  const adapter = asAdapter(input);
  const contract = adapter.readContract() || {};
  const artifacts = adapter.readArtifacts();
  const fingerprint = fingerprintMorpheusV2Contract(contract);
  const issues = [];
  if (contract.format !== MORPHEUS_V2_CONTRACT_FORMAT) issues.push(`Contract format must be ${MORPHEUS_V2_CONTRACT_FORMAT}.`);
  if (Number(contract.version) !== 2) issues.push('Morpheus contract version must be exactly 2.');
  const economics = contract.economics || {};
  if (Number(economics.rtp) !== 0.96) issues.push('The v2 RTP promise must be exactly 96.00%.');
  if (Number(economics.maxWin) !== 100000) issues.push('The v2 maximum win must be exactly 100,000x.');
  if (Number(economics.totalExposure) !== 50000000) issues.push('The three-star maximum total exposure must be exactly $50,000,000.');
  if (Number(economics.maxBaseBet) !== 500) issues.push('The maximum base bet must be exactly $500 at the 100,000x cap.');
  if (Number(economics.payoutIncrement) !== 0.1) issues.push('Stake settlement increment must be exactly 0.1x.');
  if (!strings(contract.modeIds).length) issues.push('The v2 mode contract is empty.');
  if (!strings(contract.eventVocabulary).length) issues.push('The v2 event vocabulary is empty.');
  if (!Array.isArray(contract.promises) || !contract.promises.length) issues.push('The v2 promise ledger is empty.');

  const expectedSummary = contractSummary(contract);
  const sourceFingerprint = clean(contract.sourceContractFingerprint);
  const artifactEvidence = {};
  for (const discipline of REQUIRED_ARTIFACTS) {
    const artifact = artifacts[discipline];
    const localIssues = [];
    if (!artifact) localIssues.push('artifact is missing');
    else {
      if (clean(artifact.contractFingerprint) !== fingerprint) localIssues.push(`contract fingerprint ${clean(artifact.contractFingerprint) || 'missing'} does not equal ${fingerprint}`);
      if (!equal(artifact.contractSummary, expectedSummary)) localIssues.push('contract summary does not exactly match economics, modes, and event vocabulary');
      if (sourceFingerprint && clean(artifact.sourceContractFingerprint) !== sourceFingerprint) {
        localIssues.push(`source fingerprint ${clean(artifact.sourceContractFingerprint) || 'missing'} does not equal ${sourceFingerprint}`);
      }
    }
    artifactEvidence[discipline] = { passed: localIssues.length === 0, issues: localIssues };
    for (const issue of localIssues) issues.push(`${discipline}: ${issue}.`);
  }

  const passed = issues.length === 0;
  const authoritative = adapter.authority === 'authoritative';
  return {
    format: MORPHEUS_V2_PARITY_FORMAT,
    passed,
    authoritative,
    releaseReady: passed && authoritative,
    fingerprint,
    issues,
    artifactEvidence,
    contract: clone(contract),
    artifacts: clone(artifacts),
    blockers: authoritative ? [] : ['Authoritative math/protocol contract adapter is not connected; evidence is fixture-only.'],
  };
}

export function evaluateMorpheusPromiseAssertionMatrix({ contract, assertions = [], fingerprint = fingerprintMorpheusV2Contract(contract) } = {}) {
  const issues = [];
  const promises = Array.isArray(contract?.promises) ? contract.promises : [];
  const assertionMap = new Map();
  for (const assertion of assertions) {
    const id = clean(assertion.id);
    if (!id) { issues.push('An assertion has no stable ID.'); continue; }
    if (assertionMap.has(id)) { issues.push(`Assertion ${id} is duplicated.`); continue; }
    assertionMap.set(id, assertion);
  }

  const matrix = promises.map(promise => {
    const promiseId = clean(promise.id);
    const requiredDisciplines = strings(promise.requiredDisciplines);
    const requiredAssertionIds = strings(promise.assertionIds);
    const rows = requiredAssertionIds.map(assertionId => {
      const assertion = assertionMap.get(assertionId);
      const rowIssues = [];
      if (!assertion) rowIssues.push('assertion is missing');
      else {
        if (clean(assertion.promiseId) !== promiseId) rowIssues.push(`belongs to ${clean(assertion.promiseId) || 'no promise'}`);
        if (!MORPHEUS_PROOF_DISCIPLINES.includes(assertion.discipline)) rowIssues.push(`uses unknown discipline ${assertion.discipline}`);
        if (clean(assertion.contractFingerprint) !== fingerprint) rowIssues.push('uses a different contract fingerprint');
        if (assertion.passed !== true) rowIssues.push('did not pass');
        if (!strings(assertion.evidence).length) rowIssues.push('has no evidence');
      }
      return { assertionId, discipline: assertion?.discipline || null, passed: rowIssues.length === 0, issues: rowIssues };
    });
    const coveredDisciplines = [...new Set(rows.filter(row => row.passed).map(row => row.discipline))];
    const missingDisciplines = requiredDisciplines.filter(discipline => !coveredDisciplines.includes(discipline));
    if (!promiseId) issues.push('A contract promise has no stable ID.');
    if (!requiredAssertionIds.length) issues.push(`Promise ${promiseId || 'unknown'} has no assertion IDs.`);
    if (missingDisciplines.length) issues.push(`Promise ${promiseId || 'unknown'} lacks passing ${missingDisciplines.join(', ')} assertions.`);
    for (const row of rows) for (const issue of row.issues) issues.push(`${promiseId || 'unknown'} / ${row.assertionId}: ${issue}.`);
    return {
      promiseId,
      title: clean(promise.title),
      requiredDisciplines,
      coveredDisciplines,
      missingDisciplines,
      rows,
      passed: Boolean(promiseId && requiredAssertionIds.length && !missingDisciplines.length && rows.every(row => row.passed)),
    };
  });

  const knownPromiseIds = new Set(promises.map(promise => clean(promise.id)));
  for (const assertion of assertions) if (!knownPromiseIds.has(clean(assertion.promiseId))) issues.push(`Assertion ${clean(assertion.id)} targets unknown promise ${clean(assertion.promiseId)}.`);
  const disciplineCoverage = Object.fromEntries(MORPHEUS_PROOF_DISCIPLINES.map(discipline => [discipline,
    assertions.some(assertion => assertion.discipline === discipline && assertion.passed === true
      && clean(assertion.contractFingerprint) === fingerprint && strings(assertion.evidence).length > 0),
  ]));
  for (const [discipline, covered] of Object.entries(disciplineCoverage)) if (!covered) issues.push(`No passing ${discipline} assertion is present.`);
  return {
    fingerprint,
    complete: promises.length > 0 && matrix.every(entry => entry.passed)
      && Object.values(disciplineCoverage).every(Boolean) && issues.length === 0,
    issues: [...new Set(issues)],
    disciplineCoverage,
    matrix,
  };
}

export function createMorpheusContractSummary(contract) {
  return contractSummary(contract);
}
