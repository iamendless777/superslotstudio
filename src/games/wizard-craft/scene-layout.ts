/**
 * Native WIZARD CRAFT composition contract.
 *
 * Every authored layer resolves inside this single 640×360 coordinate space.
 * Registered full-canvas character layers stay at (0, 0). Trimmed cabinet and
 * reel textures use these explicit rectangles and must preserve their prepared
 * dimensions exactly; callers must not independently crop or stretch them.
 */
export interface WizardCraftSceneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const WIZARD_CRAFT_SCENE_SIZE = Object.freeze({
  width: 640,
  height: 360,
});

export const WIZARD_CRAFT_REGISTERED_SCENE_RECT = Object.freeze({
  x: 0,
  y: 0,
  width: WIZARD_CRAFT_SCENE_SIZE.width,
  height: WIZARD_CRAFT_SCENE_SIZE.height,
});

export const WIZARD_CRAFT_CABINET_RECTS = Object.freeze({
  title: Object.freeze({ x: 160, y: 4, width: 320, height: 64 }),
  lintel: Object.freeze({ x: 96, y: 52, width: 448, height: 42 }),
  dragonPillar: Object.freeze({ x: 88, y: 82, width: 76, height: 218 }),
  wizardPillar: Object.freeze({ x: 480, y: 82, width: 80, height: 218 }),
  sill: Object.freeze({ x: 100, y: 300, width: 440, height: 32 }),
  crest: Object.freeze({ x: 282, y: 60, width: 76, height: 38 }),
  // Measured from the clean production plate. The previous reconstructed
  // opening started 12 px too far left and visibly clipped the Dragon's face.
  reels: Object.freeze({ x: 176, y: 104, width: 300, height: 220 }),
}) satisfies Readonly<Record<string, WizardCraftSceneRect>>;

export function wizardCraftSceneTuple(
  rect: WizardCraftSceneRect,
): readonly [number, number, number, number] {
  return [rect.x, rect.y, rect.width, rect.height];
}
