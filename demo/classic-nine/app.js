import {
  CLASSIC_NINE_GAME_VERSION,
  getClassicNineInformation,
  projectClassicNinePresentation,
} from "../../dist/src/index.js";

const books = [
  [
    ["pulse", "prism", "orbit"],
    ["beacon", "nova", "crown"],
    ["core", "portal", "pulse"],
  ],
  [
    ["crown", "nova", "pulse"],
    ["prism", "core", "beacon"],
    ["pulse", "orbit", "crown"],
  ],
];
const highlights = [
  [
    { column: 0, row: 0 },
    { column: 1, row: 1 },
    { column: 2, row: 2 },
  ],
  [
    { column: 0, row: 2 },
    { column: 1, row: 1 },
    { column: 2, row: 0 },
  ],
];
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
const advance = document.querySelector("#advance");
const reset = document.querySelector("#reset");
const nextBook = document.querySelector("#next-book");
const step = document.querySelector("#step");
const bookNumber = document.querySelector("#book-number");
const informationDialog = document.querySelector("#information-dialog");
const informationContent = document.querySelector("#information-content");
const informationVersion = document.querySelector("#information-version");
const openInformation = document.querySelector("#open-information");
const copyStatus = document.querySelector("#copy-status");
let bookIndex = 0;
let checkpoint = 1;

const launch = new URLSearchParams(window.location.search);
const social = launch.get("social") === "true";
const displayRtp = launch.get("displayRTP") !== "false";
const information = getClassicNineInformation({ social, displayRtp });

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderInformation() {
  informationContent.replaceChildren();

  const overview = element("section", undefined, "information-section");
  overview.append(element("h3", "How to play"));
  information.introduction.forEach((paragraph) =>
    overview.append(element("p", paragraph))
  );

  const paytableSection = element("section", undefined, "information-section");
  paytableSection.append(element("h3", information.paytableHeading));
  const paytable = element("table", undefined, "information-table");
  const paytableHead = document.createElement("thead");
  const paytableHeadingRow = document.createElement("tr");
  paytableHeadingRow.append(element("th", "Symbol"), element("th", "Three symbols"));
  paytableHead.append(paytableHeadingRow);
  const paytableBody = document.createElement("tbody");
  information.paytable.forEach((row) => {
    const tableRow = document.createElement("tr");
    tableRow.append(element("td", row.symbol), element("td", row.award));
    paytableBody.append(tableRow);
  });
  paytable.append(paytableHead, paytableBody);
  paytableSection.append(paytable);

  const feature = element("section", undefined, "information-section");
  feature.append(element("h3", information.featureHeading));
  const featureList = document.createElement("ul");
  information.featureRules.forEach((rule) =>
    featureList.append(element("li", rule))
  );
  feature.append(featureList);

  const modesSection = element("section", undefined, "information-section");
  modesSection.append(element("h3", information.modesHeading));
  const modes = element("table", undefined, "information-table mode-table");
  const modeHead = document.createElement("thead");
  const modeHeadingRow = document.createElement("tr");
  ["Mode", social ? "Play amount" : "Cost", ...(displayRtp ? ["RTP"] : []), "Maximum win", "Access"]
    .forEach((label) => modeHeadingRow.append(element("th", label)));
  modeHead.append(modeHeadingRow);
  const modeBody = document.createElement("tbody");
  information.modes.forEach((mode) => {
    const row = document.createElement("tr");
    [mode.name, mode.amount, ...(mode.rtp ? [mode.rtp] : []), mode.maximumWin, mode.access]
      .forEach((value) => row.append(element("td", value)));
    modeBody.append(row);
  });
  modes.append(modeHead, modeBody);
  modesSection.append(modes);

  const controls = element("section", undefined, "information-section");
  controls.append(element("h3", information.controlsHeading));
  const controlsList = element("dl", undefined, "control-guide");
  information.controls.forEach((control) => {
    controlsList.append(
      element("dt", control.name),
      element("dd", control.description),
    );
  });
  controls.append(controlsList);

  const settlement = element("section", undefined, "information-section");
  settlement.append(
    element("h3", information.settlementHeading),
    element("p", information.settlement),
  );

  const disclaimer = element("section", undefined, "information-section disclaimer");
  disclaimer.append(
    element("h3", information.disclaimerHeading),
    element("p", information.disclaimer),
  );

  informationContent.append(
    overview,
    paytableSection,
    feature,
    modesSection,
    controls,
    settlement,
    disclaimer,
  );
  informationVersion.textContent =
    `Candidate v${CLASSIC_NINE_GAME_VERSION} · ${information.locale}`;
  copyStatus.textContent = social ? "Sweeps copy" : "Standard copy";
}

function events() {
  const board = [0, 1, 2].map((reel) =>
    [0, 1, 2].map((row) => {
      const name = books[bookIndex][row][reel];
      return {
        name,
        ...(name === "core" ? { wild: true } : {}),
        ...(name === "portal" ? { scatter: true } : {}),
      };
    }),
  );
  const positions = highlights[bookIndex].map(({ column, row }) => ({
    reel: column,
    row,
  }));
  return [
    {
      schemaVersion: 1,
      index: 0,
      type: "reveal",
      payload: {
        board,
        gameType: "basegame",
        anticipation: [0, 0, 0],
      },
    },
    {
      schemaVersion: 1,
      index: 1,
      type: "winInfo",
      payload: {
        totalWin: 50,
        wins: [{
          symbol: "pulse",
          kind: 3,
          win: 50,
          positions,
          meta: {
            lineIndex: bookIndex === 0 ? 3 : 4,
            multiplier: 1,
            winWithoutMult: 50,
            globalMult: 1,
          },
        }],
      },
    },
    {
      schemaVersion: 1,
      index: 2,
      type: "finalWin",
      payload: { amount: 50 },
    },
  ];
}

function render() {
  const view = projectClassicNinePresentation(events(), String(checkpoint));
  grid.replaceChildren();
  const display = view.board
    ? [0, 1, 2].map((row) => [0, 1, 2].map((reel) => view.board[reel][row].name))
    : Array.from({ length: 3 }, () => Array(3).fill(null));
  display.forEach((row, rowIndex) =>
    row.forEach((symbol, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = `cell symbol-${symbol ?? "hidden"}`;
      cell.dataset.symbol = symbol ?? "Waiting";
      cell.textContent = symbol ? glyphs[symbol] : "·";
      if (view.highlightedCells.has(`${columnIndex}:${rowIndex}`))
        cell.classList.add("winner");
      grid.append(cell);
    }),
  );
  step.textContent = String(checkpoint);
  bookNumber.textContent = String(bookIndex + 1).padStart(2, "0");
  advance.textContent = checkpoint === 0
    ? "Reveal grid"
    : checkpoint === 1
      ? "Show line win"
      : checkpoint === 2
        ? "Settle result"
        : "Sequence complete";
  advance.disabled = view.complete;
}

advance.addEventListener("click", () => {
  checkpoint = Math.min(3, checkpoint + 1);
  render();
});
reset.addEventListener("click", () => {
  checkpoint = 0;
  render();
});
nextBook.addEventListener("click", () => {
  bookIndex = (bookIndex + 1) % books.length;
  checkpoint = 0;
  render();
});
openInformation.addEventListener("click", () => {
  informationDialog.showModal();
});
informationDialog.addEventListener("click", (event) => {
  if (event.target === informationDialog) informationDialog.close();
});
renderInformation();
render();
