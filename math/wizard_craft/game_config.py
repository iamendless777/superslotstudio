"""Exploratory WIZARD CRAFT configuration for the official math SDK."""

import os

from src.config.betmode import BetMode
from src.config.config import Config
from src.config.distributions import Distribution


class GameConfig(Config):
    def __init__(self):
        super().__init__()
        self.game_id = "wizard_craft"
        self.provider_name = "Super Slot Studio"
        self.provider_number = 1
        self.game_name = "WIZARD CRAFT"
        self.working_name = "WIZARD CRAFT exploratory ways hypothesis 002"
        self.wincap = 25_000.0
        self.win_type = "ways"
        self.rtp = 0.965
        self.min_denomination = 0.01
        self.construct_paths()

        self.num_reels = 5
        self.num_rows = [4] * 5
        self.include_padding = False
        self.paytable = {
            (5, "CROWN"): 2, (4, "CROWN"): 0.5, (3, "CROWN"): 0.1,
            (5, "STAFF"): 1.2, (4, "STAFF"): 0.3, (3, "STAFF"): 0.1,
            (5, "GRIMOIRE"): 0.8, (4, "GRIMOIRE"): 0.2, (3, "GRIMOIRE"): 0.1,
            (5, "SCROLL"): 0.5, (4, "SCROLL"): 0.2, (3, "SCROLL"): 0.1,
            (5, "POTION"): 0.3, (4, "POTION"): 0.1, (3, "POTION"): 0.1,
            (5, "CRYSTAL"): 0.2, (4, "CRYSTAL"): 0.1, (3, "CRYSTAL"): 0.1,
            (5, "EMBER"): 0.2, (4, "EMBER"): 0.1, (3, "EMBER"): 0.1,
        }
        self.special_symbols = {
            "wild": ["WIZARD", "DRAGON"],
            "scatter": ["RUNE"],
        }
        self.freespin_triggers = {
            self.basegame_type: {3: 8, 4: 10, 5: 12},
            self.freegame_type: {3: 2, 4: 3, 5: 4},
        }
        self.anticipation_triggers = {
            self.basegame_type: 2,
            self.freegame_type: 2,
        }

        reel_files = {
            "BASE": "BASE.csv",
            "SPARK": "SPARK.csv",
            "SIEGE": "SIEGE.csv",
            "FREE": "FREE.csv",
            "WCAP": "WCAP.csv",
        }
        self.reels = {
            reel_id: self.read_reels_csv(os.path.join(self.reels_path, filename))
            for reel_id, filename in reel_files.items()
        }

        self.bet_modes = [
            self._chance_mode("baseBattle", 1.0, "BASE", 0.055, [80, 17, 3]),
            self._chance_mode("runeSpark", 3.0, "SPARK", 0.060, [75, 20, 5]),
            self._chance_mode("siegeSigns", 10.0, "SIEGE", 0.065, [68, 24, 8]),
            self._feature_mode(),
        ]

    def _conditions(self, reel, force_feature, vs_chance, tier_weights, force_cap=False):
        candidate_tier_weights = [45, 30, 25]
        return {
            "reel_weights": {
                self.basegame_type: {reel: 1},
                self.freegame_type: {"WCAP" if force_cap else "FREE": 1},
            },
            "force_wincap": force_cap,
            "force_freegame": force_feature,
            # Candidate generation deliberately oversamples expensive rare tiers.
            # Final lookup calibration restores target_tier_weights.
            "scatter_triggers": {
                3: candidate_tier_weights[0],
                4: candidate_tier_weights[1],
                5: candidate_tier_weights[2],
            },
            "candidate_tier_weights": {
                1: candidate_tier_weights[0],
                2: candidate_tier_weights[1],
                3: candidate_tier_weights[2],
            },
            "target_tier_weights": {
                1: tier_weights[0],
                2: tier_weights[1],
                3: tier_weights[2],
            },
            "base_vs_chance": vs_chance,
            "tier_two_sticky_chance": 0.018,
            "tier_three_sticky_chance": 0.025,
            "tier_one_temp_chance": 0.070,
            "feature_temp_chance": 0.055,
            "tier_two_upgrade_chance": 0.050,
            "tier_three_upgrade_chance": 0.070,
            "vs_values_base": {2: 80, 3: 15, 4: 4, 5: 0.9, 10: 0.1},
            "vs_values_tier_1": {2: 75, 3: 17, 4: 5, 5: 2, 10: 1},
            "vs_values_tier_2": {2: 68, 3: 18, 4: 7, 5: 4, 10: 2, 15: 0.8, 25: 0.2},
            "vs_values_tier_3": {2: 60, 3: 20, 4: 8, 5: 6, 10: 3, 15: 1.5, 25: 1, 50: 0.5},
        }

    def _chance_mode(self, name, cost, reel, vs_chance, tier_weights):
        ordinary = self._conditions(reel, False, vs_chance, tier_weights)
        feature = self._conditions(reel, True, vs_chance, tier_weights)
        cap = self._conditions(reel, True, vs_chance, tier_weights, True)
        return BetMode(
            name=name,
            cost=cost,
            rtp=self.rtp,
            max_win=self.wincap,
            auto_close_disabled=False,
            is_feature=False,
            is_buybonus=False,
            distributions=[
                Distribution(criteria="wincap", quota=0.001, win_criteria=self.wincap, conditions=cap),
                Distribution(criteria="freegame", quota=0.099, conditions=feature),
                Distribution(criteria="0", quota=0.45, win_criteria=0.0, conditions=ordinary),
                Distribution(criteria="basegame", quota=0.45, conditions=ordinary),
            ],
        )

    def _feature_mode(self):
        feature = self._conditions("BASE", True, 0, [55, 30, 15])
        cap = self._conditions("BASE", True, 0, [55, 30, 15], True)
        return BetMode(
            name="openGrimoire",
            cost=100.0,
            rtp=self.rtp,
            max_win=self.wincap,
            auto_close_disabled=True,
            is_feature=False,
            is_buybonus=True,
            distributions=[
                Distribution(criteria="wincap", quota=0.001, win_criteria=self.wincap, conditions=cap),
                Distribution(criteria="freegame", quota=0.999, conditions=feature),
            ],
        )
