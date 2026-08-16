# Full-Canvas Cabinet

Canonical mode id: `full-canvas-cabinet-v1`

Full-Canvas Cabinet is StakeStudio's authored game-player environment. The
project's cabinet dimensions define one coordinate plane containing the full
visual composition: background, cabinet architecture, reel window, symbols,
character or Spine rig, feature layers, effects, foreground, title, and player
controls.

## Contract

- The canonical project stores `theme.cabinet.compositionMode` with the mode id.
- Cabinet dimensions are the authoring coordinates; Morpheus uses 1280 × 800.
- The player fits that plane into the viewport without independently reflowing
  visual layers or stretching the authored aspect ratio.
- The project background is the full-bleed surface behind the authored plane;
  Full-Canvas Cabinet does not place a translucent HTML stage over it.
- Desktop, mobile, and mini show the same composition. Controls may preserve
  minimum tap/readability sizes, but they remain anchored to the cabinet plane.
- Layer order comes from explicit z-index values. Background is behind the
  cabinet; the character, reel bay, effects, foliage, and controls do not rely
  on unrelated HTML page flow.
- Character and Spine placement is authored in cabinet coordinates and scaled
  with the same plane.
- Preview and compiled export resolve the same composition contract.

Use the legacy page-composition mode only for projects that intentionally keep
separate page regions around a game stage. New visually authored games should
use Full-Canvas Cabinet.
