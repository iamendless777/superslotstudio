import assert from "node:assert/strict";
import test from "node:test";

import type { PlayRequest, Round } from "../src/domain/rgs.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WizardCraftProductionRuntime,
  type WizardCraftMode,
  type WizardCraftProductionSession,
  type WizardCraftProductionViews,
  type WizardCraftRgsEvent,
} from "../src/index.js";
import { balance, config, jurisdiction } from "./fixtures.js";

const events: readonly WizardCraftRgsEvent[] = [
  {
    index: 0,
    type: "reveal",
    board: Array.from({ length: 5 }, () =>
      Array.from({ length: 4 }, () => ({ name: "EMBER" }))
    ),
    gameType: "basegame",
    mode: "baseBattle",
    anticipation: [0, 0, 0, 0, 0],
  },
  { index: 1, type: "setTotalWin", amount: 0 },
  { index: 2, type: "finalWin", amount: 0 },
];

class RuntimeSession implements WizardCraftProductionSession {
  state: RecoveryState<readonly WizardCraftRgsEvent[]>;
  readonly listeners = new Set<
    (state: RecoveryState<readonly WizardCraftRgsEvent[]>) => void
  >();
  readonly checkpoints: string[] = [];
  completions = 0;
  disposed = false;

  constructor() {
    const round: Round<readonly WizardCraftRgsEvent[]> = {
      id: 77,
      amount: config.defaultBetLevel,
      payout: config.defaultBetLevel,
      payoutMultiplier: 0,
      active: true,
      mode: "baseBattle",
      event: "0",
      state: events,
    };
    this.state = {
      value: "active",
      session: { balance, config, jurisdiction },
      round,
      resumed: true,
    };
  }

  async start(): Promise<void> {}
  async placeBet(
    _request: PlayRequest & { readonly mode: WizardCraftMode },
  ): Promise<void> {}
  async checkpoint(event: string): Promise<void> {
    this.checkpoints.push(event);
  }
  async completePresentation(): Promise<void> {
    this.completions += 1;
    this.setState({
      value: "idle",
      session: { balance, config, jurisdiction },
    });
  }
  subscribe(
    listener: (
      state: RecoveryState<readonly WizardCraftRgsEvent[]>,
    ) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
  setState(state: RecoveryState<readonly WizardCraftRgsEvent[]>): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

function productionViews(log: string[]): WizardCraftProductionViews {
  return {
    reels: {
      layout: (width, height) => log.push(`reels:${width}x${height}`),
      setBoard: () => undefined,
      setOverlay: () => undefined,
      setWinningCells: () => undefined,
      setFeatureProgress: () => undefined,
      spinTo: () => {
        log.push("reels:spin");
      },
      claimOverlay: () => undefined,
      guaranteeSticky: () => undefined,
      upgradeSticky: () => undefined,
      releaseTemporary: () => undefined,
      highlightWins: () => undefined,
      cancelAnimations: () => undefined,
      destroy: () => log.push("reels:destroy"),
    },
    dragon: {
      setState: () => undefined,
      windup: () => undefined,
      brace: () => undefined,
      counter: () => undefined,
      launch: () => undefined,
      claim: () => undefined,
      recoil: () => undefined,
      containAttack: () => undefined,
      block: () => undefined,
      cancelAnimations: () => undefined,
      destroy: () => log.push("dragon:destroy"),
    },
    wizard: {
      setState: () => undefined,
      windup: () => undefined,
      brace: () => undefined,
      counter: () => undefined,
      launch: () => undefined,
      claim: () => undefined,
      recoil: () => undefined,
      containAttack: () => undefined,
      block: () => undefined,
      cancelAnimations: () => undefined,
      destroy: () => log.push("wizard:destroy"),
    },
    clash: {
      setPersistentState: () => undefined,
      launchDragonFire: () => undefined,
      launchWizardMagic: () => undefined,
      impact: () => undefined,
      blockedImpact: () => undefined,
      stickySurge: () => undefined,
      cancelEffects: () => undefined,
      destroy: () => log.push("clash:destroy"),
    },
    cabinet: {
      setState: () => undefined,
      setLayout: (layout) => log.push(`cabinet:${layout.compact}`),
      setAmbientMotion: () => undefined,
      anticipation: () => undefined,
      enterFeature: () => undefined,
      handoff: () => undefined,
      retrigger: () => undefined,
      endFeature: () => undefined,
      strongWin: () => undefined,
      maximumWin: () => undefined,
      cancelAnimations: () => undefined,
      destroy: () => log.push("cabinet:destroy"),
    },
    ui: {
      setState: () => undefined,
      setLayout: (layout) => log.push(`ui:${layout.compact}`),
      animateTier: () => undefined,
      animateRetrigger: () => undefined,
      animateFeatureEnd: () => undefined,
      animateVsBreakdown: () => undefined,
      animateSpinCounter: () => undefined,
      animateSpinWin: () => undefined,
      animateTotalWin: () => {
        log.push("ui:total");
      },
      animateFinalWin: () => {
        log.push("ui:final");
      },
      cancelAnimations: () => undefined,
      destroy: () => log.push("ui:destroy"),
    },
  };
}

test("assembles, resumes, settles, resizes, and disposes one production runtime", async () => {
  const session = new RuntimeSession();
  const log: string[] = [];
  const runtime = new WizardCraftProductionRuntime({
    session,
    views: productionViews(log),
    audioBackend: {
      play: () => ({ stop: () => undefined }),
    },
    loadedAssets: new Set(WIZARD_CRAFT_ASSET_SLOTS.map((slot) => slot.id)),
    presentationClock: { now: () => 0, sleep: async () => undefined },
    pixiClock: { sleep: async () => undefined },
    audioClock: { sleep: async () => undefined },
  });

  runtime.resize(360, 240);
  await runtime.start();

  assert.deepEqual(session.checkpoints, ["0", "1", "2"]);
  assert.equal(session.completions, 1);
  assert.equal(runtime.ui.state.ui.phase, "ready");
  assert.ok(log.includes("cabinet:true"));
  assert.ok(log.includes("ui:true"));
  assert.ok(log.includes("reels:300x220"));
  assert.ok(log.includes("reels:spin"));
  assert.ok(log.includes("ui:total"));
  assert.ok(log.includes("ui:final"));

  runtime.dispose();
  assert.equal(session.disposed, true);
  for (const layer of ["reels", "dragon", "wizard", "clash", "cabinet", "ui"]) {
    assert.ok(log.includes(`${layer}:destroy`));
  }
  assert.throws(() => runtime.resize(1_920, 1_080), /is disposed/);
});

test("production assembly fails before session use when an asset is missing", () => {
  const session = new RuntimeSession();
  assert.throws(() => new WizardCraftProductionRuntime({
    session,
    views: productionViews([]),
    audioBackend: { play: () => ({ stop: () => undefined }) },
    loadedAssets: new Set(),
  }), /Missing WIZARD CRAFT production assets/);
  assert.equal(session.listeners.size, 0);
});
