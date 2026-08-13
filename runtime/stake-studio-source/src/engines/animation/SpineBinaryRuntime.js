import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonJson,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import {
  binaryDataUrlToBytes,
  bytesToBinaryDataUrl,
  spineMetadataFromSkeletonData,
  spineSkeletonFormat,
  validateSpineSkeletonPayload,
} from './SpineAssetCodec.js';

export function readSpineSkeletonData(asset, atlasOrText, scale = null) {
  const issues = validateSpineSkeletonPayload(asset);
  if (issues.length) throw new Error(issues.join(' '));
  const atlas = typeof atlasOrText === 'string' ? new TextureAtlas(atlasOrText) : atlasOrText;
  if (!atlas) throw new Error('A Spine atlas is required to parse the skeleton.');
  const loader = new AtlasAttachmentLoader(atlas);
  const format = spineSkeletonFormat(asset);
  const parser = format === 'binary' ? new SkeletonBinary(loader) : new SkeletonJson(loader);
  parser.scale = Number(scale ?? asset.runtimeScale) || 1;
  return parser.readSkeletonData(format === 'binary' ? binaryDataUrlToBytes(asset.rawBinary) : asset.rawJSON);
}

export function createBinarySpineAsset({ bytes, fileName, atlasText }) {
  if (!String(fileName || '').toLowerCase().endsWith('.skel')) throw new Error('Binary Spine skeleton filename must end in .skel.');
  const rawBinary = bytesToBinaryDataUrl(bytes);
  const seed = { skeletonFormat: 'binary', skeletonFileName: fileName, rawBinary };
  const skeletonData = readSpineSkeletonData(seed, atlasText);
  return {
    ...spineMetadataFromSkeletonData(skeletonData, { name: fileName, fileName, format: 'binary' }),
    rawBinary,
  };
}
