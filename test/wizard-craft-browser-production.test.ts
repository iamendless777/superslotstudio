import assert from "node:assert/strict";
import test from "node:test";

import type { PlayRequest } from "../src/domain/rgs.js";
import type { RecoveryState } from "../src/recovery/machine.js";
import {
  WIZARD_CRAFT_ASSET_SLOTS,
  createWizardCraftBrowserProductionApp,
  createWizardCraftReviewBrowserProductionApp,
  wizardCraftAudioEntry,
  wizardCraftImageEntry,
  wizardCraftMusicEntry,
  type WizardCraftMode,
  type WizardCraftProductionSession,
  type WizardCraftRgsEvent,
} from "../src/index.js";

class Texture {
  destroyed = 0;
  destroy(): void {
    this.destroyed += 1;
  }
}

class Scale {
  value = 1;
  set(value: number): void {
    this.value = value;
  }
}

class Container {
  visible = true;
  x = 0;
  y = 0;
  readonly scale = new Scale();
  readonly children: Array<Container | Sprite> = [];
  destroyed = 0;
}

class Sprite {
  visible = false;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  alpha = 1;
  readonly scale = new Scale();
  readonly texture: Texture;
  destroyed = 0;
  constructor(texture: Texture) {
    this.texture = texture;
  }
}

class Session implements WizardCraftProductionSession {
  state: RecoveryState<readonly WizardCraftRgsEvent[]> = {
    value: "uninitialized",
  };
  disposed = 0;
  start(): Promise<void> {
    return Promise.resolve();
  }
  placeBet(
    _request: PlayRequest & { readonly mode: WizardCraftMode },
  ): Promise<void> {
    return Promise.resolve();
  }
  checkpoint(_event: string): Promise<void> {
    return Promise.resolve();
  }
  completePresentation(): Promise<void> {
    return Promise.resolve();
  }
  subscribe(
    listener: (state: RecoveryState<readonly WizardCraftRgsEvent[]>) => void,
  ): () => void {
    listener(this.state);
    return () => undefined;
  }
  dispose(): void {
    this.disposed += 1;
  }
}

class Cell {
  setGeometry(): void {}
  setSymbol(): void {}
  setSpinning(): void {}
  setHighlighted(): void {}
  destroy(): void {}
}

class Overlay {
  setGeometry(): void {}
  setState(): void {}
  setPhase(): void {}
  destroy(): void {}
}

class Text {
  text = "";
  visible = false;
  alpha = 1;
  fontSize = 0;
  y = 0;
  destroy(): void {}
}

class Multiplier {
  setState(): void {}
  setFontSize(): void {}
  destroy(): void {}
}

function entries() {
  return [
    ...WIZARD_CRAFT_ASSET_SLOTS.map((slot) =>
      wizardCraftImageEntry(slot.id, `assets/${slot.id}.png`)
    ),
    wizardCraftAudioEntry("clash.impact", "assets/clash.impact.ogg"),
    wizardCraftMusicEntry("assets/wizard-craft-hybrid.wav"),
  ];
}

function options(session: Session) {
  const textures: Texture[] = [];
  const containers: Container[] = [];
  const sprites: Sprite[] = [];
  let mounted = 0;
  let unmounted = 0;
  const text = {
    mode: new Text(),
    tier: new Text(),
    spin: new Text(),
    spinWin: new Text(),
    totalWin: new Text(),
    finalWin: new Text(),
    maximum: new Text(),
  };
  return {
    tracking: {
      textures,
      containers,
      sprites,
      mounted: () => mounted,
      unmounted: () => unmounted,
    },
    value: {
      session,
      assets: {
        baseUrl: "https://studio.cdn.stake-engine.com/wizard-craft/",
        entries: entries(),
        fetch: async (input: URL | RequestInfo) => {
          const audio = /\.(?:mp3|ogg|wav)$/.test(String(input));
          return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              "content-type": audio ? "audio/ogg" : "image/png",
              "content-length": "3",
            },
          });
        },
      },
      audioContext: {
        currentTime: 0,
        destination: {},
        createGain: () => ({
          gain: {
            value: 1,
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
        }),
        createBufferSource: () => ({
          buffer: null,
          onended: null,
          connect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        }),
        decodeAudioData: async () => ({}),
      },
      textureAdapter: {
        from: () => {
          const texture = new Texture();
          textures.push(texture);
          return texture;
        },
      },
      displayAdapter: {
        createContainer: () => {
          const container = new Container();
          containers.push(container);
          return container;
        },
        createSprite: (texture: Texture) => {
          const sprite = new Sprite(texture);
          sprites.push(sprite);
          return sprite;
        },
        addChild: (parent: Container, child: Container | Sprite) => {
          parent.children.push(child);
        },
        destroySprite: (sprite: Sprite) => {
          sprite.destroyed += 1;
        },
        destroyContainer: (container: Container) => {
          container.destroyed += 1;
        },
      },
      createViewComponents: () => ({
        reelCells: Array.from({ length: 20 }, () => new Cell()),
        reelOverlays: Array.from({ length: 5 }, () => new Overlay()),
        cabinetLighting: {
          setDragon: () => undefined,
          setWizard: () => undefined,
          setBalanced: () => undefined,
        },
        uiText: text,
        uiMultipliers: Array.from({ length: 5 }, () => new Multiplier()),
      }),
      mount: () => {
        mounted += 1;
        return () => {
          unmounted += 1;
        };
      },
      decodeImage: async () => ({
        width: 64,
        height: 64,
        close: () => undefined,
      }),
      autoStart: false,
      initialSize: { width: 640, height: 360 },
      runtime: {
        pixiClock: { sleep: async () => undefined },
        audioClock: { sleep: async () => undefined },
        presentationClock: { now: () => 0, sleep: async () => undefined },
      },
    },
  };
}

test("boots and owns the complete browser production lifecycle", async () => {
  const session = new Session();
  const configured = options(session);
  const app = await createWizardCraftBrowserProductionApp(configured.value);

  assert.equal(configured.tracking.mounted(), 1);
  assert.equal(app.scene.sprites.size, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.notEqual(app.runtime.music, null);
  assert.equal(app.runtime.music?.state.enabled, false);
  app.resize(1_280, 720);
  app.dispose();
  app.dispose();

  assert.equal(configured.tracking.unmounted(), 1);
  assert.equal(session.disposed, 1);
  assert.equal(
    configured.tracking.textures.every((texture) => texture.destroyed === 1),
    true,
  );
  assert.equal(
    configured.tracking.sprites.every((sprite) => sprite.destroyed === 1),
    true,
  );
  assert.throws(() => app.resize(640, 360), /browser app is disposed/);
});

test("boots review art and authored sound without a hand-built entry list", async () => {
  const session = new Session();
  const configured = options(session);
  const { entries: _entries, ...assets } = configured.value.assets;
  const app = await createWizardCraftReviewBrowserProductionApp({
    ...configured.value,
    assets,
  });

  assert.equal(app.scene.sprites.size, WIZARD_CRAFT_ASSET_SLOTS.length);
  assert.notEqual(app.runtime.music, null);
  assert.deepEqual(
    {
      x: app.scene.sprite("environment.base").x,
      y: app.scene.sprite("environment.base").y,
      width: app.scene.sprite("environment.base").width,
      height: app.scene.sprite("environment.base").height,
      alpha: app.scene.sprite("environment.base").alpha,
    },
    { x: 0, y: 0, width: 640, height: 360, alpha: 1 },
  );
  assert.equal(app.scene.sprite("environment.sky").visible, false);
  assert.equal(app.scene.sprite("dragon.idle").alpha, 0);
  assert.equal(app.scene.sprite("dragon.idle").visible, false);
  assert.equal(app.scene.sprite("cabinet.title").alpha, 0);
  assert.equal(app.scene.sprite("cabinet.title").visible, false);
  assert.equal(app.scene.sprite("dragon.rear.tail").visible, false);
  assert.equal(app.scene.sprite("dragon.front.head").visible, false);
  assert.equal(app.scene.sprite("dragon.front.jaw").visible, false);
  assert.equal(app.scene.sprite("dragon.front.jaw.attack").visible, false);
  assert.equal(app.scene.sprite("dragon.front.jaw.attack").alpha, 0);
  assert.equal(app.scene.sprite("dragon.front.eye").visible, false);
  assert.equal(app.scene.sprite("dragon.front.eye.anticipation").visible, false);
  assert.equal(app.scene.sprite("dragon.front.eye.anticipation").alpha, 0);
  assert.equal(app.scene.sprite("wizard.idle").alpha, 0);
  assert.equal(app.scene.sprite("wizard.idle").visible, false);
  assert.equal(app.scene.sprite("wizard.body").visible, false);
  assert.equal(app.scene.sprite("wizard.hat.idle").visible, false);
  app.dispose();
});
