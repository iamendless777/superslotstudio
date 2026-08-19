/**
 * Plays a motion cue sheet inside the studio.
 * Fixtures: /motion-fixtures/<template>.json
 * Or generate: npm run studio -- cues <template>
 */
import { createMotionCueHost } from './MotionCueHost.js';

export async function loadMotionFixture(templateId) {
  const id = String(templateId || 'classic-nine').trim();
  const response = await fetch(`/motion-fixtures/${encodeURIComponent(id)}.json`);
  if (!response.ok) {
    throw new Error(`Motion fixture not found: ${id} (${response.status})`);
  }
  return response.json();
}

export function playMotionCueSheet(cueSheet, {
  project,
  onAnimState,
  onTumbleAction,
  onLog,
  onComplete,
  executePresentation,
} = {}) {
  const host = createMotionCueHost({
    project,
    onAnimState,
    onTumbleAction,
    executePresentation,
    allowPresentationEvents: false,
    onComplete,
    onCue: (cue) => {
      onLog?.(`${Math.round(cue.startMs)}ms  ${cue.cue}  (${cue.stepKind || '—'})`);
    },
  });
  host.load(cueSheet);

  let raf = 0;
  const t0 = performance.now();
  const frame = (now) => {
    if (host.tick(now - t0)) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    host,
    stop() {
      cancelAnimationFrame(raf);
      host.reset();
    },
  };
}

export async function playMotionTemplate(templateId, options = {}) {
  const sheet = await loadMotionFixture(templateId);
  return playMotionCueSheet(sheet, options);
}
