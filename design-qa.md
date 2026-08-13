# WIZARD CRAFT design QA

Historical snapshot: the paths, test count, browser availability, and blocked
verdict below describe the original review run. They are preserved as evidence,
not as a current QA result. Run fresh browser and repository validation before
using this document for a release decision.

- Source visual truth: `art-src/wizard-craft/master/wizard-craft-static-master-reference-v3.png`
- Implementation screenshot: `reports/wizard-craft-visual-gate-2026-07-31/01-idle.png`
- Combined comparison: `reports/wizard-craft-visual-gate-2026-07-31/00-approved-vs-current.png`
- State sheet: `reports/wizard-craft-visual-gate-2026-07-31/08-state-contact-sheet.png`
- Viewport: 640 × 360 game canvas
- Source pixels: 640 × 360; implementation pixels: 640 × 360
- Density normalization: none required; both artifacts are native 1:1 pixels
- State: idle plus anticipation, Dragon attack, Wizard attack, sticky, and maximum

## Findings

- [P1] Browser-rendered evidence is unavailable.
  - Evidence: the Browser runtime returned `No browser is available`; deterministic same-size renders are available, but the actual Pixi canvas, responsive crop, and console could not be captured.
  - Impact: this pass cannot certify final browser compositing or interaction behavior.
  - Fix: capture the production route in the connected browser at 640 × 360 and compare it with the same approved master.
- [P2] Character motion frames still intentionally differ from the single approved attack-state illustration.
  - Evidence: the approved source contains one simultaneous fire/magic clash, while the runtime has truthful separate idle, anticipation, attack, sticky, and maximum states.
  - Impact: exact pixel equality is neither possible nor desirable across states, but character silhouette and palette must remain consistent.
  - Fix: retain the approved red Dragon/blue Wizard silhouettes and review each authored state in motion once browser capture is available.

## Required fidelity surfaces

- Fonts and typography: the gold pixel title is registered from the approved art; runtime UI typography is outside this 640 × 360 comparison.
- Spacing and layout rhythm: reel opening corrected to x164, y94, 316 × 216; registered cabinet parts now follow the approved frame proportions.
- Colors and visual tokens: approved oxblood Dragon, blue Wizard, cyan runes, gold title, and near-black stone palette are retained.
- Image quality and asset fidelity: corrupted edge-heavy symbol cutouts were replaced with clean reference-derived tiles; the wizard platform is an independent occluding scene layer; no CSS-drawn character stand-ins are used.
- Copy and content: title remains `WIZARD CRAFT`; no substitute copy appears inside the game canvas.

## Comparison history

1. P1: reconstructed cabinet, low Dragon head, oversized/misaligned Wizard, malformed symbol edges.
   - Fixes: restored proportion-safe registered cabinet, lifted Dragon head 48 px, seated Wizard at x536/y84, changed reel geometry, and rebuilt ten symbol tiles from unobstructed approved cells.
   - Evidence: `reports/wizard-craft-visual-gate-2026-07-31/03-fidelity-pass.png`.
2. P1: Wizard floated because its tower platform was missing; Dragon tail depth did not read correctly.
   - Fix: restored the approved right platform/stair assembly as `approved-wizard-platform-v1.png`, ordered in front of the rear tail.
   - Evidence: `reports/wizard-craft-visual-gate-2026-07-31/01-idle.png`.
3. P2: Wizard projectile read too horizontally and a large diamond/rune overlay appeared in the beam.
   - Fix: authored a diagonal registered beam from the existing approved-style bolt and removed the unrelated rune overlay from the flight path.
   - Evidence: `/tmp/wizard-attack-diagonal-clean.png`; reproducible with `python3 scripts/render-wizard-craft-runtime-still.py --state wizard-attack`.

## Focused-region evidence

- Dragon face, Wizard/platform, right-side tail depth, and reel grid are collected in `reports/wizard-craft-visual-gate-2026-07-31/09-critical-closeups.png`.
- Multi-state fluidity is collected in `reports/wizard-craft-visual-gate-2026-07-31/08-state-contact-sheet.png`.

## Verification

- Deterministic visual review set: generated successfully.
- Automated suite: 252 tests pass after updating visual-layout expectations.
- Browser interactions, responsive capture, and console errors: blocked because no browser is available.

final result: blocked
