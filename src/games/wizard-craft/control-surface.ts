import { toDisplayUnits, type RgsAmount } from "../../domain/money.js";
import type {
  WizardCraftAutoplayRunner,
  WizardCraftAutoplayState,
  WizardCraftFullRoundDriver,
} from "./autoplay.js";
import type {
  WizardCraftAudioScheduler,
  WizardCraftAudioState,
} from "./audio.js";
import type { WizardCraftMode } from "./events.js";
import type {
  WizardCraftMusicDirector,
  WizardCraftMusicState,
} from "./music.js";
import {
  getWizardCraftInformation,
  type WizardCraftInformation,
} from "./information.js";
import type { WizardCraftSpeed } from "./policy.js";
import {
  WizardCraftUiController,
  type WizardCraftControlState,
} from "./ui-controller.js";

const MODE_NAMES: Readonly<Record<WizardCraftMode, string>> = {
  baseBattle: "Base Battle",
  runeSpark: "Rune Spark",
  siegeSigns: "Siege Signs",
  openGrimoire: "Open the Grimoire",
};

const SPEED_NAMES: Readonly<Record<WizardCraftSpeed, string>> = {
  normal: "Normal",
  turbo: "Turbo",
  superTurbo: "Super Turbo",
};

export interface WizardCraftControlSurfaceOptions {
  readonly audioScheduler?: Pick<
    WizardCraftAudioScheduler,
    "state" | "setMuted" | "subscribe"
  >;
  readonly musicDirector?: Pick<
    WizardCraftMusicDirector,
    "state" | "setEnabled" | "subscribe"
  >;
  readonly roundDriver?: Pick<WizardCraftFullRoundDriver, "playFullRound">;
  readonly autoplayRunner?: Pick<
    WizardCraftAutoplayRunner,
    "state" | "startConfirmed" | "stop" | "subscribe"
  >;
  readonly onAutoplayConfirmed?: (spins: number) => void | Promise<void>;
  readonly onReloadRequested?: () => void;
  readonly onSoundChanged?: (muted: boolean) => void;
  readonly onMusicChanged?: (enabled: boolean) => void;
}

export interface WizardCraftControlSurface {
  dispose(): void;
}

export function formatWizardCraftAmount(
  amount: RgsAmount,
  unit?: string,
): string {
  const value = toDisplayUnits(amount).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return unit === undefined ? value : `${value} ${unit}`;
}

function appendTextElement(
  parent: HTMLElement,
  tag: keyof HTMLElementTagNameMap,
  text: string,
  className?: string,
): HTMLElement {
  const element = parent.ownerDocument.createElement(tag);
  element.textContent = text;
  if (className !== undefined) element.className = className;
  parent.append(element);
  return element;
}

function setDialogOpen(dialog: HTMLDialogElement, open: boolean): void {
  if (open) {
    if (dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return;
  }
  if (!dialog.open && !dialog.hasAttribute("open")) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function renderInformation(
  container: HTMLElement,
  information: WizardCraftInformation,
): void {
  container.replaceChildren();
  for (const paragraph of information.introduction) {
    appendTextElement(container, "p", paragraph);
  }

  appendTextElement(container, "h3", "Awards");
  const table = container.ownerDocument.createElement("table");
  const caption = table.createCaption();
  caption.textContent = "Symbol award multiples";
  const header = table.createTHead().insertRow();
  for (const heading of ["Symbol", "3", "4", "5"]) {
    const cell = container.ownerDocument.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const row of information.paytable) {
    const cells = [row.symbol, row.three, row.four, row.five];
    const tableRow = body.insertRow();
    for (const value of cells) {
      const cell = tableRow.insertCell();
      cell.textContent = value;
    }
  }
  container.append(table);

  const sections = [
    ["Wild symbols", information.wildRules],
    ["Clash Rune", information.runeRules],
    ["VS multiplier reels", information.vsRules],
  ] as const;
  for (const [heading, rules] of sections) {
    appendTextElement(container, "h3", heading);
    const list = container.ownerDocument.createElement("ul");
    for (const rule of rules) appendTextElement(list, "li", rule);
    container.append(list);
  }

  appendTextElement(container, "h3", "Feature tiers");
  const tiers = container.ownerDocument.createElement("ul");
  for (const tier of information.tiers) {
    appendTextElement(
      tiers,
      "li",
      `${tier.name}: ${tier.spins} spins. ${tier.rule}`,
    );
  }
  container.append(tiers);

  appendTextElement(container, "h3", "Modes");
  const modes = container.ownerDocument.createElement("ul");
  for (const mode of information.modes) {
    const rtp = mode.rtp === null ? "" : ` RTP ${mode.rtp}.`;
    appendTextElement(
      modes,
      "li",
      `${mode.name}: ${mode.amount}. ${mode.access}. Maximum win ${mode.maximumWin}.${rtp}`,
    );
  }
  container.append(modes);

  appendTextElement(container, "h3", "Settlement");
  appendTextElement(container, "p", information.settlement);
  appendTextElement(container, "p", information.disclaimer, "wc-disclaimer");
}

function focusAllowsSpacebar(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("dialog[open]") !== null) return false;
  if (target.closest("button, input, select, textarea, a[href]") !== null) {
    return false;
  }
  return !target.closest("[contenteditable='true']");
}

/**
 * Mounts the semantic HTML controls. Cabinet/reel rendering stays outside this
 * adapter so production art can skin or position the controls without changing
 * wallet, jurisdiction, recovery, or keyboard behavior.
 */
export function mountWizardCraftControlSurface(
  root: HTMLElement,
  controller: WizardCraftUiController,
  options: WizardCraftControlSurfaceOptions = {},
): WizardCraftControlSurface {
  const document = root.ownerDocument;
  root.replaceChildren();
  root.classList.add("wizard-craft-controls");

  const status = document.createElement("section");
  status.className = "wc-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const headline = appendTextElement(status, "strong", "Preparing WIZARD CRAFT");
  const message = appendTextElement(status, "span", "");
  root.append(status);

  const balance = appendTextElement(root, "output", "", "wc-balance");
  balance.setAttribute("aria-label", "Balance");

  const selection = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Play settings";
  selection.append(legend);

  const amountLabel = document.createElement("label");
  amountLabel.textContent = "Base amount";
  const amount = document.createElement("select");
  amount.name = "wizard-craft-amount";
  amountLabel.append(amount);
  selection.append(amountLabel);

  const modes = document.createElement("fieldset");
  const modesLegend = document.createElement("legend");
  modesLegend.textContent = "Mode";
  modes.append(modesLegend);
  selection.append(modes);

  const speedLabel = document.createElement("label");
  speedLabel.textContent = "Speed";
  const speed = document.createElement("select");
  speed.name = "wizard-craft-speed";
  speedLabel.append(speed);
  selection.append(speedLabel);
  root.append(selection);

  const actions = document.createElement("div");
  actions.className = "wc-actions";
  const play = document.createElement("button");
  play.type = "button";
  play.textContent = "Play";
  play.className = "wc-play";
  const autoplay = document.createElement("button");
  autoplay.type = "button";
  autoplay.textContent = "Autoplay";
  const sound = document.createElement("button");
  sound.type = "button";
  sound.className = "wc-effects";
  sound.textContent = "Effects on";
  sound.setAttribute("aria-pressed", "false");
  const music = document.createElement("button");
  music.type = "button";
  music.className = "wc-music";
  music.textContent = "Music off";
  music.setAttribute("aria-pressed", "false");
  music.hidden = options.musicDirector === undefined &&
    options.onMusicChanged === undefined;
  const informationButton = document.createElement("button");
  informationButton.type = "button";
  informationButton.textContent = "Information";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.hidden = true;
  actions.append(play, autoplay, sound, music, informationButton, reload);
  root.append(actions);

  const informationDialog = document.createElement("dialog");
  informationDialog.className = "wc-dialog wc-information";
  informationDialog.setAttribute("aria-labelledby", "wc-information-title");
  const informationTitle = appendTextElement(
    informationDialog,
    "h2",
    "WIZARD CRAFT information",
  );
  informationTitle.id = "wc-information-title";
  const informationBody = document.createElement("div");
  informationDialog.append(informationBody);
  const informationClose = document.createElement("button");
  informationClose.type = "button";
  informationClose.textContent = "Close";
  informationDialog.append(informationClose);
  root.append(informationDialog);

  const autoplayDialog = document.createElement("dialog");
  autoplayDialog.className = "wc-dialog wc-autoplay";
  autoplayDialog.setAttribute("aria-labelledby", "wc-autoplay-title");
  const autoplayTitle = appendTextElement(
    autoplayDialog,
    "h2",
    "Confirm autoplay",
  );
  autoplayTitle.id = "wc-autoplay-title";
  const autoplayCopy = appendTextElement(autoplayDialog, "p", "");
  const autoplayCancel = document.createElement("button");
  autoplayCancel.type = "button";
  autoplayCancel.textContent = "Cancel";
  const autoplayConfirm = document.createElement("button");
  autoplayConfirm.type = "button";
  autoplayConfirm.textContent = "Confirm";
  autoplayDialog.append(autoplayCancel, autoplayConfirm);
  root.append(autoplayDialog);

  let current: WizardCraftControlState = controller.state;
  let autoplayState: WizardCraftAutoplayState | null =
    options.autoplayRunner?.state ?? null;
  let audioState: WizardCraftAudioState | null =
    options.audioScheduler?.state ?? null;
  let muted = audioState?.muted ?? false;
  let musicState: WizardCraftMusicState | null =
    options.musicDirector?.state ?? null;
  let musicEnabled = musicState?.enabled ?? false;
  let informationReturnFocus: HTMLElement = informationButton;
  let autoplayReturnFocus: HTMLElement = autoplay;

  const invoke = (action: () => unknown | Promise<unknown>): void => {
    try {
      void Promise.resolve(action()).catch(() => {
        // Recovery state supplies safe player-facing failure copy.
      });
    } catch {
      // Invalid UI intent is ignored; the next render restores valid controls.
    }
  };

  const render = (state: WizardCraftControlState): void => {
    current = state;
    headline.textContent = state.ui.headline;
    message.textContent = state.ui.message;
    status.dataset.phase = state.ui.phase;
    balance.textContent = state.ui.balance === null
      ? "Balance unavailable"
      : `Balance ${formatWizardCraftAmount(
        state.ui.balance.amount,
        state.ui.balance.unit,
      )}`;

    amount.replaceChildren();
    for (const optionAmount of state.amountOptions) {
      const option = document.createElement("option");
      option.value = String(optionAmount);
      option.textContent = formatWizardCraftAmount(
        optionAmount,
        state.ui.balance?.unit,
      );
      option.selected = optionAmount === state.selectedAmount;
      amount.append(option);
    }
    amount.disabled = !state.ui.canChangeAmount;

    modes.replaceChildren(modesLegend);
    for (const mode of state.modes) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "wizard-craft-mode";
      radio.value = mode.id;
      radio.checked = mode.id === state.selectedMode;
      radio.disabled = !state.ui.canChangeMode || !mode.available;
      label.append(radio, `${MODE_NAMES[mode.id]} · ${mode.cost}×`);
      if (!mode.available) label.append(" (unavailable)");
      modes.append(label);
    }

    speed.replaceChildren();
    for (const availableSpeed of state.speeds) {
      const option = document.createElement("option");
      option.value = availableSpeed;
      option.textContent = SPEED_NAMES[availableSpeed];
      option.selected = availableSpeed === state.selectedSpeed;
      speed.append(option);
    }
    speed.disabled = !state.ui.canPlay || state.speeds.length < 2;
    play.disabled = !state.ui.canPlay || state.selectedAmount === null;
    const autoplayActive = autoplayState?.status === "running" ||
      autoplayState?.status === "stopping";
    autoplay.hidden = state.ui.policy?.autoplay !== true && !autoplayActive;
    autoplay.disabled = autoplayActive
      ? autoplayState?.status === "stopping"
      : !state.ui.canPlay;
    autoplay.textContent = autoplayActive ? "Stop autoplay" : "Autoplay";
    informationButton.disabled = !state.ui.canOpenInformation;
    reload.hidden = !state.ui.requiresReload;
    sound.textContent = muted ? "Effects off" : "Effects on";
    sound.setAttribute("aria-pressed", String(muted));
    music.textContent = musicEnabled ? "Music on" : "Music off";
    music.setAttribute("aria-pressed", String(musicEnabled));

    const spins = state.autoplayConfirmation;
    autoplayCopy.textContent = spins === null
      ? ""
      : `Start ${spins} automatic plays? You can stop the sequence at any time.`;
    setDialogOpen(autoplayDialog, spins !== null);
    if (spins !== null) autoplayConfirm.focus();
  };

  amount.addEventListener("change", () => {
    const selected = current.amountOptions.find(
      (item) => String(item) === amount.value,
    );
    if (selected !== undefined) invoke(() => controller.selectAmount(selected));
  });
  modes.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      invoke(() => controller.selectMode(target.value as WizardCraftMode));
    }
  });
  speed.addEventListener("change", () => {
    invoke(() => controller.selectSpeed(speed.value as WizardCraftSpeed));
  });
  play.addEventListener("click", () =>
    invoke(() =>
      options.roundDriver === undefined
        ? controller.play()
        : options.roundDriver.playFullRound()
    )
  );
  autoplay.addEventListener("click", () => {
    if (
      autoplayState?.status === "running" ||
      autoplayState?.status === "stopping"
    ) {
      options.autoplayRunner?.stop();
      return;
    }
    autoplayReturnFocus = autoplay;
    invoke(() => controller.requestAutoplay(10));
  });
  autoplayCancel.addEventListener("click", () => {
    controller.cancelAutoplayConfirmation();
    autoplayReturnFocus.focus();
  });
  autoplayConfirm.addEventListener("click", () => {
    const spins = controller.confirmAutoplay();
    setDialogOpen(autoplayDialog, false);
    autoplayReturnFocus.focus();
    if (options.autoplayRunner !== undefined) {
      invoke(() => options.autoplayRunner?.startConfirmed(spins));
    } else if (options.onAutoplayConfirmed !== undefined) {
      invoke(() => options.onAutoplayConfirmed?.(spins));
    }
  });
  informationButton.addEventListener("click", () => {
    informationReturnFocus = informationButton;
    const policy = current.ui.policy;
    renderInformation(
      informationBody,
      getWizardCraftInformation({
        social: policy?.social ?? false,
        displayRtp: policy?.showRtp ?? false,
      }),
    );
    setDialogOpen(informationDialog, true);
    informationClose.focus();
  });
  informationClose.addEventListener("click", () => {
    setDialogOpen(informationDialog, false);
    informationReturnFocus.focus();
  });
  informationDialog.addEventListener("cancel", () => {
    informationReturnFocus.focus();
  });
  sound.addEventListener("click", () => {
    muted = !muted;
    if (options.audioScheduler !== undefined) {
      options.audioScheduler.setMuted(muted);
    } else {
      render(current);
      options.onSoundChanged?.(muted);
    }
  });
  music.addEventListener("click", () => {
    musicEnabled = !musicEnabled;
    if (options.musicDirector !== undefined) {
      options.musicDirector.setEnabled(musicEnabled);
    } else {
      render(current);
      options.onMusicChanged?.(musicEnabled);
    }
  });
  reload.addEventListener("click", () => options.onReloadRequested?.());
  autoplayDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    controller.cancelAutoplayConfirmation();
    autoplayReturnFocus.focus();
  });

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.code !== "Space" || event.repeat) return;
    if (!focusAllowsSpacebar(event.target)) return;
    event.preventDefault();
    invoke(() => controller.handleSpacebar(true));
  };
  document.addEventListener("keydown", onKeydown);

  const unsubscribe = controller.subscribe(render);
  const unsubscribeAutoplay = options.autoplayRunner?.subscribe((state) => {
    autoplayState = state;
    render(current);
  });
  const unsubscribeAudio = options.audioScheduler?.subscribe((state) => {
    audioState = state;
    muted = audioState.muted;
    render(current);
  });
  const unsubscribeMusic = options.musicDirector?.subscribe((state) => {
    musicState = state;
    musicEnabled = musicState.enabled;
    render(current);
  });
  return Object.freeze({
    dispose(): void {
      unsubscribe();
      unsubscribeAutoplay?.();
      unsubscribeAudio?.();
      unsubscribeMusic?.();
      document.removeEventListener("keydown", onKeydown);
      setDialogOpen(informationDialog, false);
      setDialogOpen(autoplayDialog, false);
      root.replaceChildren();
      root.classList.remove("wizard-craft-controls");
    },
  });
}
