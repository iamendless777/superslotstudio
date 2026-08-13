import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WizardCraftPixiSceneRenderer,
  applyWizardCraftRgsEvent,
  assertWizardCraftVerticalSliceAssets,
  createWizardCraftRuntimeState,
  getMissingWizardCraftVerticalSliceAssets,
  type WizardCraftCueChannel,
  type WizardCraftPixiLayer,
  type WizardCraftPixiScene,
  type WizardCraftPresentationBeat,
  type WizardCraftRenderCommand,
  type WizardCraftRuntimeState,
} from "../src/index.js";

class Layer implements WizardCraftPixiLayer {
  readonly calls: string[] = [];
  failBeat = false;

  sync(state: WizardCraftRuntimeState): void {
    this.calls.push(`sync:${state.nextEventIndex}`);
  }

  play(beat: WizardCraftPresentationBeat): void {
    this.calls.push(`play:${beat.id}`);
    if (this.failBeat) throw new Error("asset animation failed");
  }

  cancel(): void {
    this.calls.push("cancel");
  }

  destroy(): void {
    this.calls.push("destroy");
  }
}

function scene(): {
  readonly scene: WizardCraftPixiScene;
  readonly layers: Record<WizardCraftCueChannel, Layer>;
} {
  const layers = {
    reels: new Layer(),
    dragon: new Layer(),
    wizard: new Layer(),
    clash: new Layer(),
    cabinet: new Layer(),
    ui: new Layer(),
  };
  return { scene: layers, layers };
}

function command(): WizardCraftRenderCommand {
  const before = createWizardCraftRuntimeState();
  const event = {
    index: 0,
    type: "reveal",
    board: [],
    gameType: "basegame",
    mode: "baseBattle",
  };
  const after = applyWizardCraftRgsEvent(before, event);
  return {
    event,
    before,
    after,
    cue: {
      eventIndex: 0,
      eventType: "reveal",
      durationMs: 440,
      beats: [
        {
          id: "reels.stop",
          channel: "reels",
          startMs: 0,
          durationMs: 440,
          motion: "full",
        },
        {
          id: "cabinet.glow",
          channel: "cabinet",
          startMs: 100,
          durationMs: 200,
          motion: "subtle",
        },
      ],
    },
  };
}

test("routes authored beats to exact Pixi layers and commits after-state", async () => {
  const fixture = scene();
  const sleeps: number[] = [];
  const renderer = new WizardCraftPixiSceneRenderer(fixture.scene, {
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  await renderer.render(command());

  assert.deepEqual(sleeps, [100, 440]);
  assert.ok(fixture.layers.reels.calls.includes("play:reels.stop"));
  assert.ok(fixture.layers.cabinet.calls.includes("play:cabinet.glow"));
  for (const layer of Object.values(fixture.layers)) {
    assert.equal(layer.calls.at(-1), "sync:1");
  }
});

test("failed layer animation rolls every layer back before rejecting", async () => {
  const fixture = scene();
  fixture.layers.reels.failBeat = true;
  const renderer = new WizardCraftPixiSceneRenderer(
    fixture.scene,
    { sleep: async () => undefined },
  );

  await assert.rejects(() => renderer.render(command()), /animation failed/);

  for (const layer of Object.values(fixture.layers)) {
    assert.equal(layer.calls.at(-1), "sync:0");
  }
});

test("rejects overlap, out-of-sequence commands, and use after disposal", async () => {
  const fixture = scene();
  let release: (() => void) | undefined;
  let waits = 0;
  const renderer = new WizardCraftPixiSceneRenderer(fixture.scene, {
    sleep: () => {
      waits += 1;
      return waits === 1
        ? new Promise<void>((resolve) => {
          release = resolve;
        })
        : Promise.resolve();
    },
  });
  const active = renderer.render(command());
  await assert.rejects(() => renderer.render(command()), /already rendering/);
  for (let turn = 0; turn < 10 && release === undefined; turn += 1) {
    await Promise.resolve();
  }
  assert.notEqual(release, undefined);
  release?.();
  await active;

  const invalid = command();
  await assert.rejects(
    () => renderer.render({
      ...invalid,
      event: { ...invalid.event, index: 3 },
    }),
    /out of sequence/,
  );
  renderer.dispose();
  await assert.rejects(() => renderer.render(command()), /is disposed/);
  for (const layer of Object.values(fixture.layers)) {
    assert.ok(layer.calls.includes("destroy"));
  }
});

test("fails closed when any required production asset is absent", () => {
  const all = new Set(WIZARD_CRAFT_ASSET_SLOTS.map((slot) => slot.id));
  assert.deepEqual(getMissingWizardCraftVerticalSliceAssets(all), []);
  assert.doesNotThrow(() => assertWizardCraftVerticalSliceAssets(all));

  all.delete("effects.fire.edge");
  assert.deepEqual(
    getMissingWizardCraftVerticalSliceAssets(all),
    ["effects.fire.edge"],
  );
  assert.throws(
    () => assertWizardCraftVerticalSliceAssets(all),
    /effects\.fire\.edge/,
  );
});
