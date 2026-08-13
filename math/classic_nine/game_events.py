"""Signal Nine custom events layered on standard Stake events."""


def enter_signal_bonus_event(gamestate, reason):
    if reason not in {"natural", "bought"}:
        raise ValueError("Signal bonus reason must be natural or bought")
    gamestate.book.add_event(
        {
            "index": len(gamestate.book.events),
            "type": "enterBonus",
            "reason": reason,
        }
    )
