import type { JurisdictionFlags } from "../../domain/rgs.js";
import type { WizardCraftMode } from "./events.js";
import {
  getWizardCraftInformation,
  type WizardCraftInformation,
} from "./information.js";

export type WizardCraftSpeed = "normal" | "turbo" | "superTurbo";

export interface WizardCraftRuntimePolicy {
  readonly social: boolean;
  readonly showRtp: boolean;
  readonly showNetPosition: boolean;
  readonly showSessionTimer: boolean;
  readonly fullscreen: boolean;
  readonly autoplay: boolean;
  readonly slamStop: boolean;
  readonly spacebar: boolean;
  readonly availableSpeeds: readonly WizardCraftSpeed[];
  readonly openGrimoire: boolean;
  /** Platform numeric duration, interpreted as milliseconds by presentation. */
  readonly minimumRoundDuration: number;
}

export function getWizardCraftRuntimePolicy(
  jurisdiction: JurisdictionFlags,
): WizardCraftRuntimePolicy {
  return Object.freeze({
    social: jurisdiction.socialCasino,
    showRtp: jurisdiction.displayRTP,
    showNetPosition: jurisdiction.displayNetPosition,
    showSessionTimer: jurisdiction.displaySessionTimer,
    fullscreen: !jurisdiction.disabledFullscreen,
    autoplay: !jurisdiction.disabledAutoplay,
    slamStop: !jurisdiction.disabledSlamstop,
    spacebar: !jurisdiction.disabledSpacebar,
    availableSpeeds: Object.freeze([
      "normal" as const,
      ...(!jurisdiction.disabledTurbo ? ["turbo" as const] : []),
      ...(!jurisdiction.disabledSuperTurbo ? ["superTurbo" as const] : []),
    ]),
    openGrimoire: !jurisdiction.disabledBuyFeature,
    minimumRoundDuration: jurisdiction.minimumRoundDuration,
  });
}

export function isWizardCraftModeAvailable(
  mode: WizardCraftMode,
  policy: WizardCraftRuntimePolicy,
): boolean {
  return mode !== "openGrimoire" || policy.openGrimoire;
}

export function getWizardCraftRuntimeInformation(
  jurisdiction: JurisdictionFlags,
): WizardCraftInformation {
  const policy = getWizardCraftRuntimePolicy(jurisdiction);
  return getWizardCraftInformation({
    social: policy.social,
    displayRtp: policy.showRtp,
  });
}
