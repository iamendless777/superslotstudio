import {
  listTemplateIds,
  loadTemplate,
  planFromBlueprint,
  listStyleIds,
} from "../../dist/src/index.js";

const templateSelect = document.querySelector("#template");
const styleSelect = document.querySelector("#style");
const meta = document.querySelector("#meta");
const track = document.querySelector("#track");
const log = document.querySelector("#log");
const replay = document.querySelector("#replay");

let playToken = 0;

for (const id of listTemplateIds()) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = id;
  templateSelect.append(opt);
}

const styleAuto = document.createElement("option");
styleAuto.value = "";
styleAuto.textContent = "(blueprint default)";
styleSelect.append(styleAuto);
for (const id of listStyleIds()) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = id;
  styleSelect.append(opt);
}

function render() {
  playToken += 1;
  const token = playToken;
  const blueprint = loadTemplate(templateSelect.value);
  const override = styleSelect.value || undefined;
  const plan = planFromBlueprint(blueprint, {
    overrideStyleId: override,
    winCells: ["0:0", "1:1", "2:2"],
  });
  const { timeline } = plan;
  const total = Math.max(timeline.totalDurationMs, 1);

  meta.replaceChildren();
  for (const line of [
    `${blueprint.title} · ${blueprint.grid.columns}×${blueprint.grid.rows} · ${blueprint.winType}`,
    `Style: ${plan.lockedStyleId}${plan.styleMatchesLocked ? "" : " (override / mismatch)"}`,
    `Duration: ${timeline.totalDurationMs}ms · ${timeline.effects.length} effects`,
    `Art gap: ${plan.missingArtIds.length ? plan.missingArtIds.join(", ") : "none"}`,
  ]) {
    const p = document.createElement("p");
    p.textContent = line;
    meta.append(p);
  }

  track.replaceChildren();
  log.replaceChildren();
  const bars = [];
  for (const effect of timeline.effects) {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.dataset.kind = effect.stepKind;
    bar.style.left = `${(effect.startMs / total) * 100}%`;
    bar.style.width = `${Math.max((effect.durationMs / total) * 100, 1.5)}%`;
    bar.textContent = effect.effectId;
    bar.title = `${effect.effectId} @ ${effect.startMs}ms (${effect.stepKind}, d${effect.depth})`;
    track.append(bar);
    bars.push({ bar, effect });

    const li = document.createElement("li");
    li.textContent = `${String(effect.startMs).padStart(5, " ")}ms  ${effect.effectId}  [${effect.stepKind}]`;
    log.append(li);
  }

  const items = [...log.children];
  const start = performance.now();

  function frame(now) {
    if (token !== playToken) return;
    const t = now - start;
    bars.forEach(({ bar, effect }, i) => {
      const on =
        t >= effect.startMs && t < effect.startMs + effect.durationMs;
      bar.classList.toggle("active", on);
      items[i]?.classList.toggle("active", on);
    });
    if (t < total + 200) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

templateSelect.addEventListener("change", render);
styleSelect.addEventListener("change", render);
replay.addEventListener("click", render);
render();
