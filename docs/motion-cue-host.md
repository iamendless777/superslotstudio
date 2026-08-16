# MotionCueHost

Location: `runtime/stake-studio-source/src/engines/presentation/MotionCueHost.js`

## Flow

```text
Blueprint (src/studio)
  → planFromBlueprint() → cueSheet
  → createMotionCueHost().load(cueSheet)
  → tick(elapsedMs) each frame
       → onAnimState / onTumbleAction / PresentationDirectorRuntime.dispatch
```

## Studio integration sketch

```js
import { createMotionCueHost } from './engines/presentation/MotionCueHost.js';
// cueSheet from domain: planFromBlueprint(loadTemplate('cluster-hex')).cueSheet

const host = createMotionCueHost({
  project,
  onAnimState: (state) => animationEngine.setState(state),
  onTumbleAction: (action, phase, cue) => {
    // When book data is available, prefer createTumblePlan(...)
    // and drive phase runners from paths; use action as the phase hint.
    tumbleLayer.hint(phase, action, cue.cells);
  },
  executePresentation: (item, payload) => presentationBus.execute(item, payload),
});

host.load(cueSheet);
const t0 = performance.now();
function frame(now) {
  if (host.tick(now - t0)) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

## Authority rules

| Concern | Owner |
|---------|--------|
| Order and start times | Motion cue sheet |
| Cell paths for fall/clear | Math book + `createTumblePlan` |
| Recipe polish (win tier duration, reduced motion) | PresentationDirector |
| Particles / camera impulse | VisualEffectRuntime bindings |

Do not invent a second cascade timeline inside Morpheus or FlagshipWorkflow.
