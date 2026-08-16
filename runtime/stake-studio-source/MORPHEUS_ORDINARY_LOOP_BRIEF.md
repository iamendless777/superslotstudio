# Morpheus Ordinary Loop — Visual Director Brief

Brief id: `ordinary-round-flow-v1`

Status: `in-production`

Human visual approval: `required`

## Objective

Make one complete normal-speed base-game loop read as a single intentionally
directed physical performance:

`spin start -> continuous reel movement -> deliberate reel stops -> evaluate -> winning relationship -> clear -> visible empty space -> synchronized fall -> landing impact -> evaluate next -> return to idle`

The five recordings supplied by the human on 2026-08-14 are the quality
standard. Their common requirement is causal ownership: every visible action
must finish or deliberately hand off before the next action takes control.

## Current step

Give the complete ordinary round one presentation owner. The owner must advance
only after the renderer's real completion signal; it must not infer completion
from a timeout, a DOM mutation, a trace entry, or the existence of a planned
phase.

## Authoritative inputs

- `spinStart`: local player intent; begins reel motion before book playback.
- `reveal`: Stake Math SDK board, anticipation values, and padding positions.
- `winInfo`: Stake Math SDK winning contributors and exact positions.
- `tumbleBoard`: Stake Math SDK cleared positions and incoming symbols.
- settlement/final events: authoritative decision to evaluate again or return
  to idle.

The Stake event book remains mechanic authority. The presentation owner decides
when each authoritative state becomes visible and awaits the visual result.

## Composition contract

- Preserve `full-canvas-cabinet-v1` and its 1280 x 800 authored plane.
- The reel bay remains inside the cabinet and clipped at every transient frame.
- Spin tracks, clear artwork, and incoming tumble artwork may never appear
  behind or outside the cabinet.
- Tile wells remain fixed while symbol artwork clears and falls.
- The empty-space phase must be visibly readable before gravity begins.
- Morpheus and the right foliage keep their established depth relationship;
  foreground foliage may not cover the playable board.

## Motion contract

- Reels visibly accelerate into continuous travel and stop in deliberate order.
- Every reel commits its authoritative symbols at its own stop; there is no
  last-frame whole-board replacement.
- Win recognition, relationship tracing, reaction, and resolution form one
  awaited sequence.
- Clear completes before incoming artwork becomes visible.
- All affected columns share one gravity clock; no per-tile random delay.
- Landing produces one coordinated impact and fully settles before another
  effect or idle motion can own the same symbols.
- Normal speed is the primary target. Fast and reduced modes inherit the same
  semantic ordering after normal desktop is accepted.

## Acceptance

- A fresh continuous recording shows the entire loop at normal desktop speed.
- No surprise tile, last-frame board swap, transient cabinet leak, overlapping
  idle/effect motion, unexplained pause, or competing effect is visible.
- Phase telemetry agrees with the recording, but telemetry is not acceptance.
- Independent visual QA lists defects in temporal order from the recording.
- The Visual Director may request revision or declare the implementation ready
  for human review. Only the human can approve this brief.

