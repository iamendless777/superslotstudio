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
      board: [
        [{ name: "pulse" }, { name: "prism" }, { name: "nova" }],
        [{ name: "pulse" }, { name: "core", wild: true }, { name: "crown" }],
        [{ name: "pulse" }, { name: "beacon" }, { name: "orbit" }],
      ],
      gameType: "basegame",
      anticipation: [0, 0, 0],
    },
  },
  {
    schemaVersion: 1,
    index: 1,
    type: "winInfo",
    payload: {
      totalWin: 300,
      wins: [{
        symbol: "pulse",
        kind: 3,
        win: 300,
        positions: [
          { reel: 0, row: 0 },
          { reel: 1, row: 0 },
          { reel: 2, row: 0 },
        ],
        meta: {
          lineIndex: 0,
          multiplier: 1,
          winWithoutMult: 300,
          globalMult: 1,
        },
      }],
    },
  },
  {
    schemaVersion: 1,
    index: 2,
    type: "finalWin",
    payload: { amount: 300 },
  },
]);

const session = new ReplaySession({
  async load() {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return { payoutMultiplier: 3, costMultiplier: 1, state: events };
  },
});

const glyphs = {
  pulse: "●",
  prism: "◆",
  orbit: "◉",
  beacon: "⌁",
  nova: "✦",
  crown: "♛",
  core: "★",
  portal: "◎",
};
const grid = document.querySelector("#grid");
const button = document.querySelector("#play-replay");
const stateLabel = document.querySelector("#replay-state");
const message = document.querySelector("#replay-message");
let checkpoint = 0;
let animation;

function renderGrid() {
  const view = projectClassicNinePresentation(events, String(checkpoint));
  const display = view.board
    ? [0, 1, 2].map((row) => [0, 1, 2].map((reel) => view.board[reel][row].name))
    : Array.from({ length: 3 }, () => Array(3).fill(null));
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
  checkpoint = 3;
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
