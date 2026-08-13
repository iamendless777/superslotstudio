"""Export selected WIZARD CRAFT books for the local presentation prototype."""

import json
from pathlib import Path

from analyze_tier_rebalance import iter_books


ROOT = Path(__file__).resolve().parents[2]
PUBLISH = ROOT / "reference/math-sdk/games/wizard_craft/library/publish_files"
OUTPUT = ROOT / "demo/wizard-craft/replays"
SELECTIONS = {
    "base-tier-three": ("baseBattle", 67170),
    "base-near-miss": ("baseBattle", 5),
    "rune-tier-one": ("runeSpark", 42822),
    "base-tier-two-no-sticky": ("baseBattle", 52068),
    "rune-tier-two-sticky": ("runeSpark", 16512),
    "grimoire-sticky-upgrade": ("openGrimoire", 49253),
    "siege-retrigger": ("siegeSigns", 1646),
    "grimoire-max-win": ("openGrimoire", 60552),
    "siege-large-win": ("siegeSigns", 24680),
    "grimoire-large-win": ("openGrimoire", 83497),
}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    catalog = []
    wanted_by_mode = {}
    for slug, (mode, event_id) in SELECTIONS.items():
        wanted_by_mode.setdefault(mode, {})[event_id] = slug

    for mode, wanted in wanted_by_mode.items():
        path = PUBLISH / f"books_{mode}.jsonl.zst"
        for book in iter_books(path):
            slug = wanted.get(book["id"])
            if slug is None:
                continue
            target = OUTPUT / f"{slug}.json"
            target.write_text(json.dumps(book, separators=(",", ":")), encoding="utf-8")
            catalog.append({
                "slug": slug,
                "label": slug.replace("-", " ").title(),
                "mode": mode,
                "eventId": book["id"],
                "payoutMultiplier": book["payoutMultiplier"],
                "file": f"./replays/{slug}.json",
            })
    catalog.sort(key=lambda item: list(SELECTIONS).index(item["slug"]))
    if len(catalog) != len(SELECTIONS):
        raise RuntimeError("one or more selected replay books were not found")
    (OUTPUT / "catalog.json").write_text(
        json.dumps(catalog, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
