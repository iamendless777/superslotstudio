#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [projectPath, assetRoot, outputPath = projectPath, bundleRoot = 'output/spine/morpheus-performance'] = process.argv.slice(2);
if (!projectPath || !assetRoot) {
  throw new Error('Usage: build-dreamfall-spine-rig.mjs <project.json> <runtime-asset-root> [output.json] [bundle-dir]');
}

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const rigName = 'morpheus-performance';
const pages = [
  { attachment: 'idle', file: 'morpheus-idle-v1.png' },
  { attachment: 'bonus_entry', file: 'morpheus-bonus-entry-v1.png' },
  { attachment: 'win_big', file: 'morpheus-win-big-v1.png' },
  { attachment: 'wincap', file: 'morpheus-wincap-v1.png' },
];

const dataUrl = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const attachmentFrame = name => [{ name }];
const transform = ({ duration, x = 0, y = 0, rotation = 0, scale = 1, pulse = 0, sway = 0 }) => ({
  rotate: [
    { value: rotation - sway },
    { time: duration / 2, value: rotation + sway },
    { time: duration, value: rotation - sway },
  ],
  translate: [
    { x, y },
    { time: duration / 2, x, y: y + pulse },
    { time: duration, x, y },
  ],
  scale: [
    { x: scale, y: scale },
    { time: duration / 2, x: scale + Math.abs(pulse) * 0.0016, y: scale + Math.abs(pulse) * 0.0016 },
    { time: duration, x: scale, y: scale },
  ],
});
const animation = (attachment, options) => ({
  slots: { character: { attachment: attachmentFrame(attachment) } },
  bones: { performance: transform(options) },
});

const rawJSON = {
  skeleton: {
    hash: 'morpheus-performance-v1',
    spine: '4.3.13',
    x: -301,
    y: -512,
    width: 602,
    height: 1024,
    images: './',
    audio: '',
  },
  bones: [
    { name: 'root' },
    { name: 'performance', parent: 'root' },
  ],
  slots: [
    { name: 'character', bone: 'performance', attachment: 'idle' },
  ],
  skins: [{
    name: 'default',
    attachments: {
      character: Object.fromEntries(pages.map(({ attachment }) => [attachment, {
        name: attachment,
        path: attachment,
        x: 0,
        y: 0,
        width: 602,
        height: 1024,
      }])),
    },
  }],
  animations: {
    idle: animation('idle', { duration: 4.8, pulse: 11, sway: 0.65, scale: 0.995 }),
    idle_alt: animation('idle', { duration: 3.4, x: -3, pulse: 10, sway: 0.9, scale: 1 }),
    spin_start: animation('idle', { duration: 0.34, x: -8, y: -2, pulse: 14, rotation: -1.2, sway: 0.8, scale: 1.01 }),
    spinning: animation('idle', { duration: 1.25, x: -6, y: 2, pulse: 11, rotation: -0.5, sway: 0.6, scale: 1.005 }),
    spin_stop: animation('idle', { duration: 0.4, x: 3, y: -2, pulse: -10, rotation: 0.7, sway: 0.7, scale: 1.01 }),
    win_small: animation('win_big', { duration: 1.25, x: -5, pulse: 12, rotation: -0.6, sway: 0.5, scale: 0.995 }),
    win_medium: animation('win_big', { duration: 1.8, x: -8, pulse: 18, rotation: -1, sway: 0.8, scale: 1.01 }),
    win_big: animation('win_big', { duration: 2.4, x: -12, pulse: 24, rotation: -1.2, sway: 1.05, scale: 1.025 }),
    win_mega: animation('wincap', { duration: 3, x: -14, pulse: 28, rotation: -1.4, sway: 1.25, scale: 1.035 }),
    wincap: animation('wincap', { duration: 3.6, x: -18, pulse: 32, rotation: -1.6, sway: 1.45, scale: 1.055 }),
    anticipation: animation('idle', { duration: 1.05, x: -7, y: 1, pulse: 10, rotation: -0.8, sway: 0.4, scale: 1.012 }),
    bonus_entry: animation('bonus_entry', { duration: 2, x: -12, pulse: 25, rotation: -1.4, sway: 1, scale: 1.025 }),
    bonus_idle: animation('bonus_entry', { duration: 3.6, x: -5, pulse: 9, rotation: -0.5, sway: 0.55, scale: 1.005 }),
    bonus_exit: animation('idle', { duration: 1.6, x: 5, pulse: -14, rotation: 0.8, sway: 0.75, scale: 1.005 }),
    free_spin_banner: animation('bonus_entry', { duration: 1.45, x: -8, pulse: 20, rotation: -1, sway: 0.8, scale: 1.02 }),
    feature_result: animation('win_big', { duration: 2.5, x: -10, pulse: 22, rotation: -1.1, sway: 0.9, scale: 1.025 }),
    lose: animation('idle', { duration: 1.15, x: 3, y: -7, pulse: -9, rotation: 0.9, sway: 0.45, scale: 0.985 }),
  },
};

const atlasText = pages.map(({ attachment, file }) => `${file}
size: 602,1024
format: RGBA8888
filter: Linear,Linear
repeat: none
pma: true
${attachment}
  bounds: 0,0,602,1024
  offsets: 0,0,602,1024
  rotate: 0
  index: -1`).join('\n\n') + '\n';

const animationEntries = Object.entries(rawJSON.animations).map(([name, clip]) => {
  let duration = 0;
  const visit = value => {
    if (Array.isArray(value)) for (const key of value) duration = Math.max(duration, Number(key?.time) || 0);
    else if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
  };
  visit(clip);
  return { name, duration, trackCount: 4 };
});
const atlasImages = Object.fromEntries(pages.map(({ file }) => [file, dataUrl(path.join(assetRoot, file))]));
const asset = {
  name: rigName,
  skeletonFormat: 'json',
  skeletonFileName: `${rigName}.json`,
  version: '4.3.13',
  width: 602,
  height: 1024,
  bones: ['root', 'performance'],
  slots: ['character'],
  skins: ['default'],
  attachments: pages.map(({ attachment }) => ({ skin: 'default', slot: 'character', name: attachment })),
  animations: animationEntries,
  atlasImage: atlasImages[pages[0].file],
  atlasImages,
  atlasText,
  atlasPage: pages[0].file,
  atlasImageName: pages[0].file,
  regions: pages.map(page => page.attachment),
  atlasPages: pages.map(page => page.file),
  activeSkin: 'default',
  // The right inner pillar is an intentional foreground cabinet element.
  // Keep the rig behind it for depth, but center Morpheus in the open bay so
  // his face and silhouette are not swallowed by the pillar itself.
  placement: { x: 925, y: 66, width: 355, height: 650, anchorX: 0.5, anchorY: 0.5, scale: 1 },
  rawJSON,
};

project.animation ||= {};
project.animation.spineAssets = [asset];
project.animation.runtime = {
  ...(project.animation.runtime || {}),
  version: 1,
  profile: 'balanced',
  defaultMix: 0.18,
  reducedMotion: 'respect',
  activeSpineAsset: rigName,
  activeSkin: 'default',
};
const looping = new Set(['idle', 'idleAlt', 'spinning', 'anticipation', 'bonusIdle']);
const mappings = {
  idle: 'idle', idleAlt: 'idle_alt', spinStart: 'spin_start', spinning: 'spinning', spinStop: 'spin_stop',
  winSmall: 'win_small', winMedium: 'win_medium', winBig: 'win_big', winMega: 'win_mega', wincap: 'wincap',
  anticipation: 'anticipation', bonusEntry: 'bonus_entry', bonusIdle: 'bonus_idle', bonusExit: 'bonus_exit',
  freeSpinBanner: 'free_spin_banner', featureResult: 'feature_result', lose: 'lose',
};
project.animation.stateAnimations = Object.fromEntries(Object.entries(mappings).map(([state, clip]) => [state, {
  asset: rigName,
  animation: clip,
  loop: looping.has(state),
  mix: state === 'wincap' ? 0.26 : 0.18,
}]));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`);
fs.mkdirSync(bundleRoot, { recursive: true });
fs.writeFileSync(path.join(bundleRoot, `${rigName}.json`), `${JSON.stringify(rawJSON, null, 2)}\n`);
fs.writeFileSync(path.join(bundleRoot, `${rigName}.atlas`), atlasText);
for (const { file } of pages) fs.copyFileSync(path.join(assetRoot, file), path.join(bundleRoot, file));

console.log(JSON.stringify({
  asset: rigName,
  version: asset.version,
  bones: asset.bones.length,
  attachments: asset.attachments.length,
  animations: asset.animations.length,
  mappings: Object.keys(project.animation.stateAnimations).length,
  outputPath,
  bundleRoot,
}, null, 2));
