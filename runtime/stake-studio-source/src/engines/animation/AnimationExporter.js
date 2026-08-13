import { createAnimationManifest, parseAnimationMapping } from './AnimationEngine.js';
import { createRigCorrectionManifest, normalizeRigCorrection } from './RigCorrectionEngine.js';
import { createPoseMechanicsManifest } from './PoseMechanicsEngine.js';
import { binaryDataUrlToBytes, spineSkeletonFormat } from './SpineAssetCodec.js';

const SPINE_RUNTIME_LICENSE = `Spine Runtimes License Agreement
Last updated April 5, 2025. Replaces all prior versions.

Copyright (c) 2013-2025, Esoteric Software LLC

Integration of the Spine Runtimes into software or otherwise creating derivative works of the Spine Runtimes is permitted under the terms and conditions of Section 2 of the Spine Editor License Agreement: http://esotericsoftware.com/spine-editor-license

Otherwise, it is permitted to integrate the Spine Runtimes into software or otherwise create derivative works of the Spine Runtimes (collectively, "Products"), provided that each user of the Products must obtain their own Spine Editor license and redistribution of the Products in any form must include this license and copyright notice.

THE SPINE RUNTIMES ARE PROVIDED BY ESOTERIC SOFTWARE LLC "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL ESOTERIC SOFTWARE LLC BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES, BUSINESS INTERRUPTION, OR LOSS OF USE, DATA, OR PROFITS) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THE SPINE RUNTIMES, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

const slug = value => String(value || 'spine').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'spine';

function safeAtlasPagePath(value) {
  const path = String(value || '').replaceAll('\\', '/');
  const parts = path.split('/');
  if (!path || path.startsWith('/') || parts.some(part => !part || part === '.' || part === '..') || /[<>:"|?*\x00-\x1F]/.test(path)) {
    throw new Error(`Spine atlas page name "${value}" is not a safe portable path.`);
  }
  return path;
}

function decodeBase64(value) {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(value);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function dataUrlToBytes(value) {
  const match = String(value || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Animation atlas image is not an embedded data URL.');
  return match[2] ? decodeBase64(match[3]) : new TextEncoder().encode(decodeURIComponent(match[3]));
}

export function generateAnimationFiles(project) {
  const mappings = Object.values(project.animation?.stateAnimations || {}).map(parseAnimationMapping).filter(Boolean);
  const mappedNames = new Set(mappings.map(mapping => mapping.asset));
  const assets = (project.animation?.spineAssets || []).filter(asset => mappedNames.has(asset.name));
  if (assets.length === 0) return {};

  const manifest = createAnimationManifest(project);
  const rigManifest = createRigCorrectionManifest(project);
  const poseManifest = createPoseMechanicsManifest(project);
  const files = {
    'animation/SPINE-RUNTIMES-LICENSE.txt': SPINE_RUNTIME_LICENSE,
  };
  manifest.assets = manifest.assets.filter(asset => mappedNames.has(asset.name)).map(asset => {
    const source = assets.find(item => item.name === asset.name);
    const root = `animation/spine/${slug(asset.name)}`;
    const skeletonFormat = spineSkeletonFormat(source);
    const pages = asset.atlasPages || [];
    const imageFiles = {};
    pages.forEach((page, index) => {
      const pagePath = safeAtlasPagePath(page);
      const image = source.atlasImages?.[page] || (index === 0 ? source.atlasImage : null);
      if (!image) throw new Error(`Spine asset "${asset.name}" is missing atlas page image "${page}".`);
      const outputPath = `${root}/${pagePath}`;
      files[outputPath] = dataUrlToBytes(image);
      imageFiles[page] = outputPath;
    });
    const output = {
      ...asset,
      files: {
        skeleton: `${root}/skeleton.${skeletonFormat === 'binary' ? 'skel' : 'json'}`,
        atlas: `${root}/skeleton.atlas`,
        image: imageFiles[pages[0]] || null,
        images: imageFiles,
      },
    };
    files[output.files.skeleton] = skeletonFormat === 'binary'
      ? binaryDataUrlToBytes(source.rawBinary)
      : JSON.stringify(source.rawJSON, null, 2);
    files[output.files.atlas] = source.atlasText;
    return output;
  });
  const sourceCorrections = (project.production?.rig?.corrections || []).map(normalizeRigCorrection);
  rigManifest.corrections = rigManifest.corrections.filter(correction => mappedNames.has(correction.asset)).map(correction => {
    if (correction.type !== 'overlay') return correction;
    const source = sourceCorrections.find(item => item.id === correction.id);
    if (!source?.image) return correction;
    const mime = String(source.image).match(/^data:([^;,]+)/)?.[1] || 'image/png';
    const extension = mime.includes('jpeg') ? 'jpg'
      : mime.includes('webp') ? 'webp'
        : mime.includes('svg') ? 'svg'
          : 'png';
    const imageFile = `animation/corrections/${slug(correction.id || correction.name)}.${extension}`;
    files[imageFile] = dataUrlToBytes(source.image);
    return { ...correction, imageFile };
  });
  manifest.rig = rigManifest;
  poseManifest.drawOrderRules = poseManifest.drawOrderRules.filter(rule => mappedNames.has(rule.asset));
  poseManifest.anchors = poseManifest.anchors.filter(anchor => mappedNames.has(anchor.asset));
  poseManifest.secondaryMotion = poseManifest.secondaryMotion.filter(system => mappedNames.has(system.asset));
  manifest.poseMechanics = poseManifest;
  files['animation/runtime.json'] = JSON.stringify(manifest, null, 2);
  return files;
}
