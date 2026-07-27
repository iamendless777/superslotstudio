import {
  ReplaySession,
  parseClassicNineBook,
  projectClassicNinePresentation,
} from "../../dist/src/index.js";

const events = parseClassicNineBook([
  {
    schemaVersion: 1,
    index: 0,
    type: "reveal",
    payload: {
      grid: [
        ["cherry", "cherry", "cherry"],
        ["lemon", "wild", "plum"],
        ["bell", "seven", "orange"],
      ],
    },
  },
  {
    schemaVersion: 1,
    index: 1,
    type: "highlight",
    payload: {
      cells: [
        { column: 0, row: 0 },
        { column: 1, row: 0 },
        { column: 2, row: 0 },
      ],
    },
  },
]);

const session = new ReplaySession({
  async load() {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { payoutMultiplier: 3, costMultiplier: 1, state: events };
  },
});

const glyphs = {
  cherry: "●",
  lemon: "◆",
  orange: "●",
  plum: "⬟",
  bell: "♟",
  seven: "7",
  wild: "★",
};
const grid = document.querySelector("#grid");
const button = document.querySelector("#play-replay");
const stateLabel = document.querySelector("#replay-state");
const message = document.querySelector("#replay-message");
let checkpoint = 0;
let animation;

function renderGrid() {
  const view = projectClassicNinePresentation(events, String(checkpoint));
  const display =
    view.grid ?? Array.from({ length: 3 }, () => Array(3).fill(null));
  grid.replaceChildren();
  display.forEach((row, rowIndex) =>
    row.forEach((symbol, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = `cell symbol-${symbol ?? "hidden"}`;
      cell.dataset.symbol = symbol ?? "Waiting";
      cell.textContent = symbol ? glyphs[symbol] : "·";
      if (view.highlightedCells.has(`${columnIndex}:${rowIndex}`)) {
        cell.classList.add("winner");
      }
      grid.append(cell);
    }),
  );
}

function renderSession() {
  const state = session.state.value;
  stateLabel.textContent = state;
  grid.classList.toggle("is-loading", state === "loading");
  if (state === "loading") {
    button.disabled = true;
    button.textContent = "Loading…";
    message.textContent = "Loading the recorded result…";
  } else if (state === "ready") {
    button.disabled = false;
    button.textContent = "Play replay";
    message.textContent =
      "Recorded result ready. Playback starts only when you choose.";
  } else if (state === "playing") {
    button.disabled = true;
    button.textContent = "Playing…";
    message.textContent = "Replaying recorded presentation events.";
  } else if (state === "complete") {
    button.disabled = false;
    button.textContent = "Play again";
    message.textContent = "Replay complete. The final result remains visible.";
  } else if (state === "failed") {
    button.disabled = true;
    button.textContent = "Unavailable";
    message.textContent = "The recorded result could not be loaded.";
  }
  renderGrid();
}

function finishReplay() {
  checkpoint = 2;
  session.complete();
  renderSession();
}

button.addEventListener("click", () => {
  clearTimeout(animation);
  session.play();
  checkpoint = 1;
  renderSession();
  animation = setTimeout(finishReplay, 650);
});

renderSession();
await session.load();
renderSession();
