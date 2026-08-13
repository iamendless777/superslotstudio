"""Reusable WIZARD CRAFT ways and VS-reel actions."""

import random

from game_calculations import GameCalculations
from game_events import (
    clear_spin_reels_event,
    expand_vs_reel_event,
    reveal_wizard_event,
    upgrade_sticky_reel_event,
)
from src.calculations.statistics import get_random_outcome
from src.calculations.ways import Ways
from src.events.events import set_total_event, set_win_event, win_info_event


class GameExecutables(GameCalculations):
    def draw_wizard_board(self):
        self.draw_board(emit_event=False)
        if self.betmode == "siegeSigns" and self.gametype == self.config.basegame_type:
            if self.count_special_symbols("scatter") == 0:
                reel = random.randrange(self.config.num_reels)
                row = random.randrange(self.config.num_rows[reel])
                self.board[reel][row] = self.create_symbol("RUNE")
                self.get_special_symbols_on_board()
        reveal_wizard_event(self)

    def choose_tier(self):
        if self.betmode == "openGrimoire":
            return get_random_outcome(
                self.get_current_distribution_conditions()[
                    "candidate_tier_weights"
                ]
            )
        count = self.count_special_symbols("scatter")
        if count >= 3:
            return min(count - 2, 3)
        return get_random_outcome(
            self.get_current_distribution_conditions()["candidate_tier_weights"]
        )

    def choose_vs_values(self, minimum=2):
        conditions = self.get_current_distribution_conditions()
        value_key = (
            f"vs_values_tier_{self.duel_tier}"
            if self.gametype == self.config.freegame_type
            and self.duel_tier in {1, 2, 3}
            else "vs_values_base"
        )
        weights = conditions[value_key]
        dragon = max(minimum, get_random_outcome(weights))
        wizard = max(minimum, get_random_outcome(weights))
        if dragon == wizard:
            advantage = "balanced"
            applied = dragon
        elif dragon > wizard:
            advantage = "dragon"
            applied = dragon
        else:
            advantage = "wizard"
            applied = wizard
        return {
            "dragon": dragon,
            "wizard": wizard,
            "applied": applied,
            "advantage": advantage,
        }

    def expand_base_vs_reels(self):
        chance = self.get_current_distribution_conditions()["base_vs_chance"]
        for reel in range(self.config.num_reels):
            if random.random() < chance:
                values = self.choose_vs_values()
                self.spin_vs_reels[reel] = values["applied"]
                self._make_reel_wild(reel, values["advantage"])
                expand_vs_reel_event(self, reel, values, "spin")

    def expand_feature_vs_reels(self):
        conditions = self.get_current_distribution_conditions()
        if (
            self.duel_tier == 3
            and self.fs == self.guaranteed_sticky_spin
            and self.guaranteed_sticky_reel not in self.sticky_vs_reels
        ):
            values = self.choose_vs_values()
            reel = self.guaranteed_sticky_reel
            self.sticky_vs_reels[reel] = values["applied"]
            expand_vs_reel_event(self, reel, values, "sticky")

        sticky_chance = (
            conditions["tier_two_sticky_chance"] if self.duel_tier == 2
            else conditions["tier_three_sticky_chance"] if self.duel_tier == 3
            else 0
        )
        temporary_chance = (
            conditions["tier_one_temp_chance"] if self.duel_tier == 1
            else conditions["feature_temp_chance"]
        )
        upgrade_chance = (
            conditions["tier_two_upgrade_chance"] if self.duel_tier == 2
            else conditions["tier_three_upgrade_chance"] if self.duel_tier == 3
            else 0
        )

        for reel in range(self.config.num_reels):
            if reel in self.sticky_vs_reels:
                previous = self.sticky_vs_reels[reel]
                if random.random() < upgrade_chance:
                    values = self.choose_vs_values(previous)
                    if values["applied"] > previous:
                        self.sticky_vs_reels[reel] = values["applied"]
                        upgrade_sticky_reel_event(self, reel, previous, values)
                continue
            if random.random() < sticky_chance:
                values = self.choose_vs_values()
                self.sticky_vs_reels[reel] = values["applied"]
                expand_vs_reel_event(self, reel, values, "sticky")
            elif random.random() < temporary_chance:
                values = self.choose_vs_values()
                self.spin_vs_reels[reel] = values["applied"]
                expand_vs_reel_event(self, reel, values, "spin")

        for reel, value in self.sticky_vs_reels.items():
            self._make_reel_wild(reel, "dragon" if value % 2 else "wizard")
        for reel in self.spin_vs_reels:
            self._make_reel_wild(reel, "wizard")

    def _make_reel_wild(self, reel, advantage):
        symbol = "DRAGON" if advantage == "dragon" else "WIZARD"
        self.board[reel] = [
            self.create_symbol(symbol)
            for _ in range(self.config.num_rows[reel])
        ]

    def evaluate_wizard_ways(self):
        self.win_data = Ways.get_ways_data(self.config, self.board)
        active = {**self.sticky_vs_reels, **self.spin_vs_reels}
        total = 0
        for win in self.win_data["wins"]:
            base_win = win["win"]
            contributing = [
                {"reel": reel, "multiplier": value}
                for reel, value in sorted(active.items())
                if reel < win["kind"]
            ]
            applied = sum(item["multiplier"] for item in contributing) or 1
            win["win"] = round(base_win * applied, 2)
            win["meta"]["winWithoutMult"] = base_win
            win["meta"]["globalMult"] = applied
            win["meta"]["contributingVsReels"] = contributing
            total += win["win"]
        self.win_data["totalWin"] = round(total, 2)

        if total > 0:
            Ways.record_ways_wins(self)
            self.win_manager.update_spinwin(self.win_data["totalWin"])
            win_info_event(self, include_padding_index=False)
            self.evaluate_wincap()
            set_win_event(self)
        set_total_event(self)

    def clear_temporary_vs_reels(self):
        if self.spin_vs_reels:
            clear_spin_reels_event(self)
            self.spin_vs_reels = {}
