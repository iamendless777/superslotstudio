"""Custom WIZARD CRAFT events emitted by the official math model."""

from src.events.events import json_ready_sym


def add_event(gamestate, event_type, **payload):
    gamestate.book.add_event({
        "index": len(gamestate.book.events),
        "type": event_type,
        **payload,
    })


def start_duel_event(gamestate):
    add_event(
        gamestate,
        "startDuel",
        tier=gamestate.duel_tier,
        totalFs=gamestate.tot_fs,
    )


def enter_bonus_event(gamestate, reason):
    add_event(gamestate, "enterBonus", reason=reason, tier=gamestate.duel_tier)


def expand_vs_reel_event(gamestate, reel, values, persistence):
    add_event(
        gamestate,
        "expandVsReel",
        reel=reel,
        dragonMultiplier=values["dragon"],
        wizardMultiplier=values["wizard"],
        appliedMultiplier=values["applied"],
        advantage=values["advantage"],
        persistence=persistence,
    )


def upgrade_sticky_reel_event(gamestate, reel, previous, values):
    add_event(
        gamestate,
        "upgradeStickyReel",
        reel=reel,
        previousMultiplier=previous,
        dragonMultiplier=values["dragon"],
        wizardMultiplier=values["wizard"],
        appliedMultiplier=values["applied"],
        advantage=values["advantage"],
    )


def clear_spin_reels_event(gamestate):
    add_event(gamestate, "clearSpinReels")


def reveal_wizard_event(gamestate):
    attributes = list(gamestate.config.special_symbols.keys())
    board = [
        [json_ready_sym(symbol, attributes) for symbol in reel]
        for reel in gamestate.board
    ]
    add_event(
        gamestate,
        "reveal",
        board=board,
        paddingPositions=gamestate.reel_positions,
        gameType=gamestate.gametype,
        mode=gamestate.betmode,
        anticipation=gamestate.anticipation,
    )


def feature_trigger_event(gamestate):
    add_event(
        gamestate,
        "freeSpinTrigger",
        tier=gamestate.duel_tier,
        totalFs=gamestate.tot_fs,
        positions=list(gamestate.special_syms_on_board["scatter"]),
    )
