export interface WizardCraftRigPoint {
  readonly x: number;
  readonly y: number;
}

export interface WizardCraftRigBounds extends WizardCraftRigPoint {
  readonly width: number;
  readonly height: number;
}

export interface WizardCraftDragonRigLayer {
  readonly assetId:
    | "dragon.rear.tail"
    | "dragon.front.head"
    | "dragon.front.jaw"
    | "dragon.front.eye"
    | "dragon.front.coil";
  readonly depth: "rear" | "foreground";
  readonly logicalBounds: WizardCraftRigBounds;
  readonly visibleBounds: WizardCraftRigBounds;
  readonly pivot: WizardCraftRigPoint;
}

/**
 * Static registration contract measured from the locked native 640×360 master.
 * These coordinates are shared by every future Dragon pose and effect anchor.
 */
export const WIZARD_CRAFT_DRAGON_RIG = Object.freeze({
  designSize: Object.freeze({ width: 640, height: 360 }),
  layers: Object.freeze([
    Object.freeze({
      assetId: "dragon.rear.tail",
      depth: "rear",
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      visibleBounds: Object.freeze({ x: 432, y: 178, width: 208, height: 182 }),
      pivot: Object.freeze({ x: 486, y: 310 }),
    }),
    Object.freeze({
      assetId: "dragon.front.head",
      depth: "foreground",
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      visibleBounds: Object.freeze({ x: 0, y: 62, width: 201, height: 265 }),
      pivot: Object.freeze({ x: 118, y: 286 }),
    }),
    Object.freeze({
      assetId: "dragon.front.jaw",
      depth: "foreground",
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      visibleBounds: Object.freeze({ x: 105, y: 169, width: 92, height: 38 }),
      pivot: Object.freeze({ x: 116, y: 188 }),
    }),
    Object.freeze({
      assetId: "dragon.front.eye",
      depth: "foreground",
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      visibleBounds: Object.freeze({ x: 137, y: 150, width: 18, height: 12 }),
      pivot: Object.freeze({ x: 146, y: 156 }),
    }),
    Object.freeze({
      assetId: "dragon.front.coil",
      depth: "foreground",
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      visibleBounds: Object.freeze({ x: 0, y: 270, width: 421, height: 90 }),
      pivot: Object.freeze({ x: 169, y: 314 }),
    }),
  ] satisfies readonly WizardCraftDragonRigLayer[]),
  attachments: Object.freeze({
    eye: Object.freeze({ x: 146, y: 156 }),
    mouth: Object.freeze({ x: 184, y: 180 }),
    jawHinge: Object.freeze({ x: 116, y: 188 }),
    neckBase: Object.freeze({ x: 118, y: 286 }),
    foregroundCoilSeam: Object.freeze({ x: 169, y: 314 }),
    rearTailSeam: Object.freeze({ x: 486, y: 310 }),
    attackOrigin: Object.freeze({ x: 184, y: 180 }),
  }),
  poses: Object.freeze({
    attackJaw: Object.freeze({
      assetId: "dragon.front.jaw.attack" as const,
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      hinge: Object.freeze({ x: 116, y: 188 }),
      reviewStatus: "clean-registered-hinge-rotation" as const,
    }),
    anticipationEye: Object.freeze({
      assetId: "dragon.front.eye.anticipation" as const,
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      pivot: Object.freeze({ x: 146, y: 156 }),
    }),
    attackEye: Object.freeze({
      assetId: "dragon.front.eye.attack" as const,
      logicalBounds: Object.freeze({ x: 0, y: 0, width: 640, height: 360 }),
      pivot: Object.freeze({ x: 146, y: 156 }),
    }),
  }),
});
