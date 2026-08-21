# The loop

Stake Studio is the factory. You, the AI, and Stake’s SDKs work the **same project**.

```
Cabinet / Config / Strips / Atlas
        │  you move layers, paytable, art
        ▼
    project.json
        │
        ├─ Preview  → same reel-area, same books, live SPIN / Live Dreamfall
        ├─ Math Publisher → Stake math-sdk → library/publish_files (books, LUT, index)
        └─ Frontend Compiler → static shell (rgs_url, Authenticate / Play / EndRound, replay)
                │
                ▼
        Stake Engine dashboard
        upload Math + Frontend → submit for review
```

## Rules

1. The **Inner Pillar reel-area** you drag in Cabinet **is** the game window. Preview and the compiled frontend must use that rectangle. Dreamfall grows **inside** it (6×4 start, chance +1 per reel, cap 8 / 48). Empty cells show the cabinet art behind them.
2. Do not invent a second cabinet. No colosseum overlay unless you drop that art on a feature layer yourself. Glow is a motion layer.
3. Math is Stake’s math-sdk. Frontend is a static site that consumes RGS `book.events`. The studio does not pick outcomes at runtime.
4. Hold 1200ms. Do not hide studio chrome.

If the human cannot see the slot, open **Preview**. If the window is wrong, open **Cabinet** and move the reel-area.
