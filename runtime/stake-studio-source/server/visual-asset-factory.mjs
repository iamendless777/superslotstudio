import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VISUAL_MODEL = 'gpt-image-2';
export const VISUAL_QUALITY_PROFILES = Object.freeze({ concept: 'low', review: 'medium', final: 'high' });
export const VISUAL_SLOT_SPECS = Object.freeze({
  background: { size: '1536x1024', transparent: false, label: 'Cabinet background' },
  foreground: { size: '1024x1536', transparent: true, label: 'Cabinet foreground' },
  symbol: { size: '1024x1024', transparent: true, label: 'Reel symbol' },
  characterPose: { size: '1024x1536', transparent: true, label: 'Character pose' },
  providerLogo: { size: '1024x1024', transparent: true, label: 'Provider logo' },
});

const MAX_PROMPT_CHARACTERS = 8000;
const REQUESTS_PER_MINUTE = 10;
const MAX_REFERENCE_IMAGES = 4;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;
const MATTE = 'pure RGB magenta #FF00FF';
const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'remove-image-matte.py');

function safePart(value, fallback = 'asset') {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function dimensions(size) {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, value);
  renameSync(temp, path);
}

export function buildGenerationPrompt({ slot, target, direction, detail }) {
  const spec = VISUAL_SLOT_SPECS[slot];
  if (!spec) throw new Error(`Unsupported visual slot "${slot}".`);
  const purpose = {
    background: 'a wide premium slot-game cabinet environment with a readable darker central reel area and strong depth, but no reels, UI, text, logos, or characters',
    foreground: 'a premium slot-game foreground framing layer with art concentrated around the outer edges and a completely unobstructed center play area',
    symbol: `one centered premium slot reel symbol for ${target || 'the selected symbol'}, readable at thumbnail size, with a bold silhouette and no letters or UI`,
    characterPose: `one full-body premium game character in the ${target || 'idle'} pose, fully inside frame, anatomically coherent and suitable for later rigging`,
    providerLogo: `one clean provider emblem for ${target || 'the configured studio'}, icon-led and without tiny text`,
  }[slot];
  const background = spec.transparent
    ? `Place it on one perfectly flat, untextured ${MATTE} background extending to every edge. No shadow, glow, particles, fog, or reflected light may touch the background or image border.`
    : 'Fill the entire canvas. Produce an opaque finished environment with no transparency.';
  const prompt = [
    `Create ${purpose}.`,
    `Unified art direction: ${String(direction || 'cinematic premium game art with controlled contrast').trim()}.`,
    String(detail || '').trim() ? `Specific direction: ${String(detail).trim()}.` : '',
    background,
    'Single production-ready composition, clean edges, no mockup, no watermark, no explanatory labels.',
  ].filter(Boolean).join(' ');
  if (prompt.length > MAX_PROMPT_CHARACTERS) throw new Error(`Visual direction must be ${MAX_PROMPT_CHARACTERS} characters or fewer after formatting.`);
  return prompt;
}

export function processMattePng(buffer) {
  return execFileSync('python3', [scriptPath], { input: buffer, maxBuffer: 40 * 1024 * 1024 });
}

function decodeReference(reference, index) {
  const match = String(reference?.src || '').match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error(`Reference image ${index + 1} must be a PNG, JPEG, or WebP data URL.`);
  const mimeType = `image/${match[1].toLowerCase()}`;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_REFERENCE_BYTES) throw new Error(`Reference image ${index + 1} must be 12 MB or smaller.`);
  return {
    buffer,
    mimeType,
    filename: `${safePart(reference.name, `reference-${index + 1}`)}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]}`,
    id: safePart(reference.id, `reference-${index + 1}`),
    role: safePart(reference.role, 'style'),
    imageFingerprint: /^[a-f0-9]{8}$/.test(String(reference.imageFingerprint || '')) ? reference.imageFingerprint : null,
  };
}

export function createVisualAssetFactory({ studioHome, apiKey, fetchImpl = fetch, processPng = processMattePng, now = () => Date.now() }) {
  const requestTimes = [];
  const configured = Boolean(String(apiKey || '').trim());

  const capabilities = () => ({
    configured,
    model: VISUAL_MODEL,
    oneImagePerRequest: true,
    automaticFactoryRuns: false,
    maxRequestsPerMinute: REQUESTS_PER_MINUTE,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    referenceGuidedEditing: true,
    qualityProfiles: VISUAL_QUALITY_PROFILES,
    slots: VISUAL_SLOT_SPECS,
    transparentAssetPipeline: 'offline-matte-removal',
  });

  async function generate({ projectId, slot, target, direction, detail, quality = 'concept', coherenceFingerprint = null, references = [] }) {
    if (!configured) throw new Error('OpenAI visual generation is not configured.');
    const spec = VISUAL_SLOT_SPECS[slot];
    if (!spec) throw new Error(`Unsupported visual slot "${slot}".`);
    if (!VISUAL_QUALITY_PROFILES[quality]) throw new Error(`Unsupported visual quality profile "${quality}".`);
    if (['symbol', 'characterPose'].includes(slot) && !String(target || '').trim()) throw new Error(`${spec.label} requires a target.`);
    const timestamp = now();
    while (requestTimes.length && requestTimes[0] < timestamp - 60_000) requestTimes.shift();
    if (requestTimes.length >= REQUESTS_PER_MINUTE) throw new Error('Visual generation is cooling down. Try again in a minute.');
    requestTimes.push(timestamp);

    if (!Array.isArray(references)) throw new Error('Visual references must be an array.');
    if (references.length > MAX_REFERENCE_IMAGES) throw new Error(`Use no more than ${MAX_REFERENCE_IMAGES} reference images per request.`);
    const decodedReferences = references.map(decodeReference);

    const prompt = buildGenerationPrompt({ slot, target, direction, detail });
    let endpoint = 'https://api.openai.com/v1/images/generations';
    let request;
    if (decodedReferences.length) {
      endpoint = 'https://api.openai.com/v1/images/edits';
      const form = new FormData();
      form.append('model', VISUAL_MODEL);
      form.append('prompt', prompt);
      form.append('size', spec.size);
      form.append('quality', VISUAL_QUALITY_PROFILES[quality]);
      form.append('n', '1');
      form.append('output_format', 'png');
      for (const reference of decodedReferences) form.append('image[]', new Blob([reference.buffer], { type: reference.mimeType }), reference.filename);
      request = { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form };
    } else {
      request = {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VISUAL_MODEL,
          prompt,
          size: spec.size,
          quality: VISUAL_QUALITY_PROFILES[quality],
          n: 1,
          output_format: 'png',
        }),
      };
    }
    const response = await fetchImpl(endpoint, request);
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      const error = new Error(failure.error?.message || 'OpenAI visual generation failed.');
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error('OpenAI visual generation returned no PNG data.');
    let png = Buffer.from(encoded, 'base64');
    if (png.length < 8 || png.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('OpenAI visual generation returned an invalid PNG.');
    if (spec.transparent) png = processPng(png);

    const project = safePart(projectId, 'project');
    const targetPart = safePart(target, slot);
    const serial = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
    const filename = `${safePart(slot)}-${targetPart}-${quality}-${serial}.png`;
    const relativePath = `assets/generated/${filename}`;
    const outputPath = join(studioHome, 'games', project, relativePath);
    atomicWrite(outputPath, png);
    const safeCoherenceFingerprint = /^[a-f0-9]{8}$/.test(String(coherenceFingerprint || '')) ? coherenceFingerprint : null;
    const metadata = {
      format: 'stake-studio-generated-visual-v1', model: VISUAL_MODEL, slot, target: target || null,
      qualityProfile: quality, apiQuality: VISUAL_QUALITY_PROFILES[quality], size: spec.size,
      matteRemoved: spec.transparent, coherenceFingerprint: safeCoherenceFingerprint,
      referenceMode: decodedReferences.length ? 'high-fidelity-edit' : 'text-generation',
      references: decodedReferences.map(({ id, role, imageFingerprint }) => ({ id, role, imageFingerprint })),
      prompt, generatedAt: new Date(timestamp).toISOString(), filename, relativePath,
    };
    atomicWrite(`${outputPath}.json`, JSON.stringify(metadata, null, 2));
    return {
      ...metadata,
      ...dimensions(spec.size),
      bytes: png.length,
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    };
  }

  return { capabilities, generate };
}
