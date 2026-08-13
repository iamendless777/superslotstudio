"""Signal Nine configuration for the official Stake Engine math SDK."""

import os

from src.config.betmode import BetMode
from src.config.config import Config
from src.config.distributions import Distribution


class GameConfig(Config):
    """Working configuration; final weights and statistics are not approved."""

    def __init__(self):
        super().__init__()
        self.game_id = "classic_nine"
        self.provider_name = "Super Slot Studio"
        self.provider_number = 1
        self.game_name = "Classic Nine"
        self.working_name = "Classic Nine: Signal Nine"
        self.wincap = 10_000.0
        self.win_type = "lines"
        self.rtp = 0.965
        self.min_denomination = 0.01
        self.construct_paths()

        self.num_reels = 3
        self.num_rows = [3, 3, 3]
        self.paytable = {
            (3, "PULSE"): 0.5,
            (3, "PRISM"): 0.8,
            (3, "ORBIT"): 1.2,
            (3, "BEACON"): 2.0,
            (3, "NOVA"): 4.0,
            (3, "CROWN"): 8.0,
            (3, "CORE"): 12.0,
        }
        self.paylines = {
            1: [0, 0, 0],
            2: [1, 1, 1],
            3: [2, 2, 2],
            4: [0, 1, 2],
            5: [2, 1, 0],
        }
        self.include_padding = False
        self.special_symbols = {
            "wild": ["CORE"],
            "scatter": ["PORTAL"],
        }
        self.freespin_triggers = {
            self.basegame_type: {3: 9},
            self.freegame_type: {3: 3},
        }
        self.anticipation_triggers = {
            self.basegame_type: 2,
            self.freegame_type: 2,
        }

        reel_files = {
            "BR0": "BR0.csv",
            "FR0": "FR0.csv",
            "WCAP": "WCAP.csv",
        }
        self.reels = {
            reel_id: self.read_reels_csv(
                os.path.join(self.reels_path, filename)
            )
            for reel_id, filename in reel_files.items()
        }

        base_reels = {
            self.basegame_type: {"BR0": 1},
            self.freegame_type: {"FR0": 1},
        }
        cap_reels = {
            self.basegame_type: {"BR0": 1},
            self.freegame_type: {"WCAP": 1},
        }
        base_conditions = {
            "reel_weights": base_reels,
            "scatter_triggers": {3: 1},
            "force_wincap": False,
            "force_freegame": False,
        }
        feature_conditions = {
            "reel_weights": base_reels,
            "scatter_triggers": {3: 1},
            "force_wincap": False,
            "force_freegame": True,
        }
        cap_conditions = {
            "reel_weights": cap_reels,
            "scatter_triggers": {3: 1},
            "force_wincap": True,
            "force_freegame": True,
        }

        self.bet_modes = [
            BetMode(
                name="base",
                cost=1.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=False,
                is_buybonus=False,
                distributions=[
                    Distribution(
                        criteria="wincap",
                        quota=0.001,
                        win_criteria=self.wincap,
                        conditions=cap_conditions,
                    ),
                    Distribution(
                        criteria="freegame",
                        quota=0.08,
                        conditions=feature_conditions,
                    ),
                    Distribution(
                        criteria="0",
                        quota=0.5,
                        win_criteria=0.0,
                        conditions=base_conditions,
                    ),
                    Distribution(
                        criteria="basegame",
                        quota=0.419,
                        conditions=base_conditions,
                    ),
                ],
            ),
            BetMode(
                name="bonus",
                cost=100.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=True,
                is_feature=False,
                is_buybonus=True,
                distributions=[
                    Distribution(
                        criteria="wincap",
                        quota=0.001,
                        win_criteria=self.wincap,
                        conditions=cap_conditions,
                    ),
                    Distribution(
                        criteria="freegame",
                        quota=0.999,
                        conditions=feature_conditions,
                    ),
                ],
            ),
        ]
