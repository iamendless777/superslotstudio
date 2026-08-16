import {
  getApplicableVisualReferences,
  getVisualFactoryTargets,
  normalizeVisualFactoryState,
} from './VisualAssetFactory.js';
import { getVisualWorkOrderStatus } from './VisualWorkOrder.js';

export const VISUAL_DELIVERY_RECEIPT_FORMAT = 'stake-studio-visual-delivery-receipt-v1';

function fingerprint(value) {
  const input = String(value || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function filename(value) {
  return String(value || '').trim().toLowerCase();
}

export function getVisualDeliveryFolder(projectId) {
  return `games/${String(projectId || '').trim()}/assets/visual-delivery`;
}

export function getVisualDeliveryReceipt(project) {
  const receipt = normalizeVisualFactoryState(project).deliveryReceipt;
  return receipt?.format === VISUAL_DELIVERY_RECEIPT_FORMAT ? receipt : null;
}

export function createVisualDeliveryCandidate(project, file, dimensions = {}) {
  const status = getVisualWorkOrderStatus(project);
  if (!status.current) throw new Error(status.reason);
  const workOrder = normalizeVisualFactoryState(project).workOrder;
  const item = workOrder.items.find(candidate => filename(candidate.output?.filename) === filename(file?.filename));
  if (!item) throw new Error(`${file?.filename || 'Unnamed file'} is not declared by the current visual work order.`);
  if (item.action !== 'generate') throw new Error(`${item.label} is marked ${item.action}; the delivery cannot replace it.`);
  if (!/^data:image\/png;base64,/i.test(file.dataUrl || '')) throw new Error(`${item.output.filename} must be a PNG data URL.`);
  const width = Number(dimensions.width) || 0;
  const height = Number(dimensions.height) || 0;
  if (width !== item.output.width || height !== item.output.height) {
    throw new Error(`${item.output.filename} is ${width}×${height}; the locked contract requires ${item.output.width}×${item.output.height}.`);
  }
  const target = getVisualFactoryTargets(project).find(candidate => candidate.key === item.key);
  if (!target) throw new Error(`${item.label} no longer exists in this project.`);
  const targets = new Map(getVisualFactoryTargets(project).map(candidate => [candidate.key, candidate]));
  const dependencies = item.requiredGeneratedReferences || item.dependencies || [];
  const missingDependency = dependencies.find(key => !targets.get(key)?.ready);
  if (missingDependency) throw new Error(`${item.label} is waiting for its required master ${missingDependency}.`);
  const references = getApplicableVisualReferences(project, target);
  return {
    item,
    fingerprint: fingerprint(file.dataUrl),
    result: {
      format: 'stake-studio-generated-visual-v1',
      model: 'codex-handoff',
      provider: 'codex-handoff',
      slot: item.slot,
      target: item.target,
      qualityProfile: workOrder.quality,
      width,
      height,
      bytes: Number(file.bytes) || 0,
      dataUrl: file.dataUrl,
      filename: item.output.filename,
      relativePath: `assets/visual-delivery/${item.output.filename}`,
      coherenceFingerprint: workOrder.bibleFingerprint,
      referenceMode: references.length ? 'work-order-dependencies' : 'locked-text-contract',
      references: references.map(reference => ({
        id: reference.id,
        role: reference.role,
        imageFingerprint: reference.imageFingerprint,
      })),
      generatedAt: file.modifiedAt || new Date().toISOString(),
      workOrderFingerprint: workOrder.fingerprint,
    },
  };
}

export function beginVisualDeliveryReceipt(project, scan = {}) {
  const status = getVisualWorkOrderStatus(project);
  if (!status.current) throw new Error(status.reason);
  const previous = getVisualDeliveryReceipt(project);
  const receipt = {
    format: VISUAL_DELIVERY_RECEIPT_FORMAT,
    workOrderFingerprint: status.fingerprint,
    folder: scan.folder || null,
    scannedAt: new Date().toISOString(),
    completedAt: null,
    items: previous?.workOrderFingerprint === status.fingerprint ? [...(previous.items || [])] : [],
  };
  normalizeVisualFactoryState(project).deliveryReceipt = receipt;
  return receipt;
}

export function findVisualDeliveryResult(project, fileFingerprint) {
  const receipt = getVisualDeliveryReceipt(project);
  return receipt?.items.find(item => item.fileFingerprint === fileFingerprint && ['accepted', 'rejected'].includes(item.status)) || null;
}

export function recordVisualDeliveryResult(project, result) {
  const receipt = getVisualDeliveryReceipt(project);
  if (!receipt) throw new Error('Start a visual delivery receipt before recording results.');
  const record = {
    key: result.key,
    filename: result.filename,
    fileFingerprint: result.fileFingerprint,
    status: result.status,
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : null,
    assignmentKey: result.assignmentKey || null,
    error: result.error || null,
    processedAt: new Date().toISOString(),
  };
  const index = receipt.items.findIndex(item => item.filename === record.filename);
  if (index >= 0) receipt.items[index] = record;
  else receipt.items.push(record);
  return record;
}

export function finishVisualDeliveryReceipt(project) {
  const receipt = getVisualDeliveryReceipt(project);
  if (!receipt) return null;
  receipt.completedAt = new Date().toISOString();
  return getVisualDeliverySummary(project);
}

export function getVisualDeliverySummary(project) {
  const receipt = getVisualDeliveryReceipt(project);
  if (!receipt) return { exists: false, accepted: 0, rejected: 0, waiting: 0, skipped: 0, total: 0 };
  const count = status => receipt.items.filter(item => item.status === status).length;
  return {
    exists: true,
    accepted: count('accepted'),
    rejected: count('rejected'),
    waiting: count('waiting'),
    skipped: count('skipped'),
    total: receipt.items.length,
    folder: receipt.folder,
    scannedAt: receipt.scannedAt,
    completedAt: receipt.completedAt,
    items: receipt.items,
  };
}
