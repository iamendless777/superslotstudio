import { projectClassicNinePresentation } from "../../dist/src/index.js";

const books = [
  [
    ["cherry", "lemon", "orange"],
    ["plum", "bell", "seven"],
    ["wild", "cherry", "lemon"],
  ],
  [
    ["seven", "bell", "cherry"],
    ["lemon", "wild", "plum"],
    ["orange", "bell", "seven"],
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
  cherry: "●",
  lemon: "◆",
  orange: "●",
  plum: "⬟",
  bell: "♟",
  seven: "7",
  wild: "★",
};
const grid = document.querySelector("#grid");
const advance = document.querySelector("#advance");
const reset = document.querySelector("#reset");
const nextBook = document.querySelector("#next-book");
const step = document.querySelector("#step");
const bookNumber = document.querySelector("#book-number");
let bookIndex = 0;
let checkpoint = 1;

function events() {
  return [
    {
      schemaVersion: 1,
      index: 0,
      type: "reveal",
      payload: { grid: books[bookIndex] },
    },
    {
      schemaVersion: 1,
      index: 1,
      type: "highlight",
      payload: { cells: highlights[bookIndex] },
    },
  ];
}

function render() {
  const view = projectClassicNinePresentation(events(), String(checkpoint));
  grid.replaceChildren();
  const display =
    view.grid ?? Array.from({ length: 3 }, () => Array(3).fill(null));
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
  advance.textContent =
    checkpoint === 0
      ? "Reveal grid"
      : checkpoint === 1
        ? "Show highlight"
        : "Sequence complete";
  advance.disabled = view.complete;
}

advance.addEventListener("click", () => {
  checkpoint = Math.min(2, checkpoint + 1);
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
render();
