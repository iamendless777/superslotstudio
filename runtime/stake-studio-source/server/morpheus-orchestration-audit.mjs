#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  recordMorpheusAssetOrchestrationEvidence,
} from '../src/engines/quality/morpheus/MorpheusAssetOrchestrationEvidence.js';

const projectArgument = String(process.argv[2] || '').trim();
if (!projectArgument) throw new Error('Usage: node server/morpheus-orchestration-audit.mjs /absolute/path/to/project.json');
const projectPath = resolve(projectArgument);
const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const identities = [project.id, project.gameId, project.build?.stakeEngine?.gameId].filter(Boolean);
if (!identities.includes('morpheus_dreamfall')) {
  throw new Error('The Morpheus orchestration adapter only accepts morpheus_dreamfall.');
}
const summary = recordMorpheusAssetOrchestrationEvidence(project);
writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
const report = project.production?.qa?.assetOrchestrationAudit;
const planning = report?.evidence?.planning || {};
console.log(JSON.stringify({
  format: report?.format,
  fingerprint: summary.fingerprint,
  evidenceHash: summary.evidenceHash,
  fresh: summary.fresh,
  complete: summary.complete,
  counts: summary.counts,
  issueCount: summary.issues.length,
  missingRecipeEvents: planning.missingRecipeEvents || [],
  sourceEvidence: report?.evidence?.sourceEvidence || null,
}, null, 2));
