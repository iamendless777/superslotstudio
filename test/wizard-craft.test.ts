import assert from "node:assert/strict";
import test from "node:test";

import {
  WIZARD_CRAFT_ASSET_SLOTS,
  WIZARD_CRAFT_EVENT_ASSETS,
  WIZARD_CRAFT_MAX_BOOK_AMOUNT,
  WIZARD_CRAFT_MAX_WIN,
  WIZARD_CRAFT_MODES,
  parseWizardCraftBook,
  planWizardCraftCue,
  projectWizardCraftPresentation,
} from "../src/index.js";

const plain = (name: string) => ({ name });
const scatter = { name: "clashRune", scatter: true };
const board = [
  [plain("ember"), plain("crystal"), scatter, plain("scroll")],
  [plain("potion"), plain("ember"), plain("grimoire"), plain("ember")],
  [plain("crystal"), plain("staff"), plain("crown"), plain("crystal")],
  [plain("scroll"), plain("ember"), plain("potion"), plain("staff")],
  [plain("crown"), plain("grimoire"), plain("crystal"), plain("potion")],
];

const event = (index: number, type: string, payload: unknown) => ({
  schemaVersion: 1, index, type, payload,
});

const reveal = (index: number, mode: string, gameType = "basegame") =>
  event(index, "reveal", {
    board, gameType, mode, anticipation: [0, 0, 0, 0, 0],
  });

const expand = (
  index: number,
  reel: number,
  appliedMultiplier: number,
  persistence: "spin" | "sticky",
  advantage: "balanced" | "dragon" | "wizard" = "dragon",
) => event(index, "expandVsReel", {
  reel,
  dragonMultiplier: advantage === "wizard" ? 2 : appliedMultiplier,
  wizardMultiplier: advantage === "dragon" ? 2 : appliedMultiplier,
  appliedMultiplier,
  advantage,
  persistence,
});

const baseVsBook = [
  reveal(0, "baseBattle"),
  event(1, "prepareAttack", {
    side: "dragon", targetReel: 0, intensity: "quick",
  }),
  expand(2, 0, 2, "spin", "dragon"),
  expand(3, 2, 5, "spin", "wizard"),
  event(4, "winInfo", {
    totalWin: 1_400,
    wins: [{
      symbol: "crown",
      win: 1_400,
      positions: [
        { reel: 0, row: 0 }, { reel: 1, row: 0 }, { reel: 2, row: 0 },
      ],
      multiplier: 7,
      contributingVsReels: [
        { reel: 0, multiplier: 2 }, { reel: 2, multiplier: 5 },
      ],
    }],
  }),
  event(5, "setTotalWin", { amount: 1_400 }),
  event(6, "clearSpinReels", {}),
  event(7, "finalWin", { amount: 1_400 }),
];

function noFeatureBook(mode: string) {
  return [reveal(0, mode), event(1, "finalWin", { amount: 0 })];
}

function tierBook(
  tier: 1 | 2 | 3,
  mode = "baseBattle",
  includeSticky = tier === 3,
) {
  const totalFs = tier === 1 ? 8 : tier === 2 ? 10 : 12;
  const events: ReturnType<typeof event>[] = [
    event(0, "startDuel", { tier, totalFs }),
  ];
  const spinCount = tier === 3 ? 3 : 1;
  for (let spin = 1; spin <= spinCount; spin += 1) {
    events.push(reveal(events.length, mode, "freegame"));
    if (tier === 1 && spin === 1) {
      events.push(expand(events.length, 4, 6, "spin", "balanced"));
      events.push(event(events.length, "clearSpinReels", {}));
    }
    if (includeSticky && spin === spinCount) {
      events.push(expand(events.length, 3, 4, "sticky", "wizard"));
    }
  }
  events.push(event(events.length, "finalWin", { amount: 0 }));
  return events;
}

test("projects temporary any-reel VS multipliers and additive win metadata", () => {
  const parsed = parseWizardCraftBook(baseVsBook);
  assert.equal(parsed.length, 8);

  const prepared = projectWizardCraftPresentation(baseVsBook, "2");
  assert.deepEqual(prepared.pendingAttack, { side: "dragon", targetReel: 0 });

  const expanded = projectWizardCraftPresentation(baseVsBook, "5");
  assert.equal(expanded.spinVsReels.get(0)?.multiplier, 2);
  assert.equal(expanded.spinVsReels.get(2)?.multiplier, 5);
  assert.equal(expanded.highlightedCells.size, 3);

  const complete = projectWizardCraftPresentation(baseVsBook, "8");
  assert.equal(complete.mode, "baseBattle");
  assert.equal(complete.spinVsReels.size, 0);
  assert.equal(complete.stickyVsReels.size, 0);
  assert.equal(complete.totalWin, 1_400);
  assert.equal(complete.complete, true);
});

test("supports all four paid modes and enforces their entry shape", () => {
  assert.deepEqual(WIZARD_CRAFT_MODES, [
    "baseBattle", "runeSpark", "siegeSigns", "openGrimoire",
  ]);
  parseWizardCraftBook(noFeatureBook("baseBattle"));
  parseWizardCraftBook(noFeatureBook("runeSpark"));
  parseWizardCraftBook(noFeatureBook("siegeSigns"));
  parseWizardCraftBook(tierBook(1, "openGrimoire"));

  const invalidDirect = noFeatureBook("openGrimoire");
  assert.throws(
    () => parseWizardCraftBook(invalidDirect),
    /Open the Grimoire feature reveal/,
  );
});

test("Tier I permits temporary VS reels but prohibits sticky reels", () => {
  parseWizardCraftBook(tierBook(1));
  const invalid = tierBook(1);
  invalid.splice(2, 1, expand(2, 4, 6, "sticky", "balanced"));
  assert.throws(
    () => parseWizardCraftBook(invalid),
    /sticky only in Tier II or Tier III/,
  );
});

test("Tier II permits zero sticky reels or non-decreasing sticky upgrades", () => {
  parseWizardCraftBook(tierBook(2, "runeSpark", false));

  const upgraded = tierBook(2, "runeSpark", true);
  upgraded.splice(upgraded.length - 1, 0, event(upgraded.length - 1, "upgradeStickyReel", {
    reel: 3,
    previousMultiplier: 4,
    dragonMultiplier: 9,
    wizardMultiplier: 3,
    appliedMultiplier: 9,
    advantage: "dragon",
  }));
  upgraded[upgraded.length - 1] = event(upgraded.length - 1, "finalWin", { amount: 0 });
  const view = projectWizardCraftPresentation(upgraded, String(upgraded.length));
  assert.equal(view.stickyVsReels.get(3)?.multiplier, 9);

  const decreased = structuredClone(upgraded);
  decreased[decreased.length - 2] = event(decreased.length - 2, "upgradeStickyReel", {
    reel: 3,
    previousMultiplier: 4,
    dragonMultiplier: 3,
    wizardMultiplier: 2,
    appliedMultiplier: 3,
    advantage: "dragon",
  });
  assert.throws(() => parseWizardCraftBook(decreased), /strict non-decreasing upgrade/);
});

test("Tier III guarantees a sticky on any reel by feature spin three", () => {
  const valid = tierBook(3, "openGrimoire", true);
  const view = projectWizardCraftPresentation(valid, String(valid.length));
  assert.equal(view.freeSpinsRevealed, 3);
  assert.equal(view.stickyVsReels.get(3)?.multiplier, 4);

  assert.throws(
    () => parseWizardCraftBook(tierBook(3, "openGrimoire", false)),
    /Tier III sticky by feature spin three/,
  );
});

test("requires win contributions to use active reels and add their values", () => {
  const wrongSum = structuredClone(baseVsBook);
  const payload = wrongSum[4]!.payload as {
    wins: Array<{ multiplier: number }>;
  };
  payload.wins[0]!.multiplier = 10;
  assert.throws(
    () => parseWizardCraftBook(wrongSum),
    /additive contributing multiplier 7/,
  );

  const clearedEarly = structuredClone(baseVsBook);
  clearedEarly.splice(4, 0, event(4, "clearSpinReels", {}));
  for (let index = 5; index < clearedEarly.length; index += 1) {
    clearedEarly[index]!.index = index;
  }
  assert.throws(
    () => parseWizardCraftBook(clearedEarly),
    /contributing VS values matching active expanded reels/,
  );
});

test("keeps attack blocks honest and resumable", () => {
  const blocked = [
    reveal(0, "siegeSigns"),
    event(1, "prepareAttack", {
      side: "wizard", targetReel: 4, intensity: "heavy",
    }),
    event(2, "blockAttack", { attacker: "wizard", targetReel: 4 }),
    event(3, "finalWin", { amount: 0 }),
  ];
  const view = projectWizardCraftPresentation(blocked, "3");
  assert.deepEqual(view.lastBlock, { attacker: "wizard", targetReel: 4 });
  assert.equal(view.spinVsReels.size, 0);
  assert.equal(view.stickyVsReels.size, 0);
  const blockPlan = planWizardCraftCue(
    parseWizardCraftBook(blocked)[2]!,
    "normal",
  );
  assert.deepEqual(
    blockPlan.beats.map((item) => item.id),
    [
      "wizard.attack-contained",
      "effects.wizard-magic-flight",
      "dragon.block",
      "clash.blocked-impact",
    ],
  );
});

test("enforces the working 25,000x cap", () => {
  assert.equal(WIZARD_CRAFT_MAX_WIN, 25_000);
  assert.equal(WIZARD_CRAFT_MAX_BOOK_AMOUNT, 2_500_000);
  const invalid = structuredClone(baseVsBook);
  invalid[5] = event(5, "setTotalWin", { amount: 2_500_001 });
  assert.throws(() => parseWizardCraftBook(invalid), /safe integer from 0 to 2500000/);
});

test("keeps vertical-slice asset slots unique and independently addressable", () => {
  const ids = WIZARD_CRAFT_ASSET_SLOTS.map((slot) => slot.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(WIZARD_CRAFT_ASSET_SLOTS.every((slot) => slot.requiredForVerticalSlice));
  const known = new Set(ids);
  for (const assets of Object.values(WIZARD_CRAFT_EVENT_ASSETS)) {
    for (const asset of assets) {
      assert.equal(known.has(asset), true, `unknown asset slot ${asset}`);
    }
  }
});

test("plans deterministic battle cues without changing book outcomes", () => {
  const parsed = parseWizardCraftBook(baseVsBook);
  const preparation = parsed.find((item) => item.type === "prepareAttack");
  assert.ok(preparation);
  const preparationPlan = planWizardCraftCue(preparation, "normal");
  assert.deepEqual(
    preparationPlan.beats.map((item) => item.id),
    ["dragon.quick-windup", "wizard.brace"],
  );
  assert.equal(preparationPlan.beats[1]?.startMs, 80);

  const expansion = parsed.find((item) => item.type === "expandVsReel");
  assert.ok(expansion);
  const plan = planWizardCraftCue(expansion, "normal");
  assert.deepEqual(
    plan.beats.map((item) => item.id),
    [
      "dragon.windup",
      "wizard.brace",
      "dragon.launch",
      "effects.dragon-fire-flight",
      "clash.multicolor-impact",
      "reel.spin.claim",
      "dragon.claim",
      "wizard.recoil",
    ],
  );
  assert.equal(plan.eventIndex, expansion.index);
  assert.equal(plan.eventType, "expandVsReel");
  assert.equal(expansion.payload.appliedMultiplier, 2);

  const win = parsed.find((item) => item.type === "winInfo");
  assert.ok(win);
  assert.ok(
    planWizardCraftCue(win, "normal").beats.some((item) =>
      item.id === "win.vs-breakdown" && item.channel === "ui"
    ),
  );
});

test("gives both characters silent reactions during reel anticipation", () => {
  const anticipating = event(0, "reveal", {
    board,
    gameType: "basegame",
    mode: "baseBattle",
    anticipation: [0, 0, 0, 1, 1],
  });
  const parsed = parseWizardCraftBook([
    anticipating,
    event(1, "finalWin", { amount: 0 }),
  ]);
  const plan = planWizardCraftCue(parsed[0]!, "normal");
  assert.deepEqual(
    plan.beats.map((item) => item.id),
    [
      "reels.anticipate-and-stop",
      "cabinet.anticipation-glow",
      "dragon.anticipation",
      "wizard.anticipation",
    ],
  );
  assert.equal(plan.beats[2]?.audio, undefined);
  assert.equal(plan.beats[3]?.audio, undefined);
});

test("keeps fast cues legible and reduced-motion cues semantic", () => {
  const parsed = parseWizardCraftBook(baseVsBook);
  for (const item of parsed) {
    const fast = planWizardCraftCue(item, "fast");
    assert.ok(fast.durationMs >= 90);
    assert.ok(fast.beats.every((cue) => cue.durationMs >= 90));

    const reduced = planWizardCraftCue(item, "reducedMotion");
    assert.ok(reduced.beats.every((cue) => cue.motion === "none"));
    assert.ok(reduced.beats.some((cue) => cue.audio !== undefined));
  }
});

test("selects at most one highest-value symbol accent per sound family", () => {
  const parsed = parseWizardCraftBook(baseVsBook);
  const win = parsed.find((item) => item.type === "winInfo");
  assert.ok(win);
  const plan = planWizardCraftCue(win, "normal");
  const accents = plan.beats.filter((item) => item.id.endsWith(".accent"));
  assert.ok(accents.length <= 3);
  assert.equal(
    new Set(accents.map((item) => item.channel)).size,
    accents.length,
  );
  assert.ok(accents.every((item) => item.startMs === 70));
});
