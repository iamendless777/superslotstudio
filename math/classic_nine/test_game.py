"""Focused configuration and mechanic tests against the official math SDK."""

import json
import tempfile
import unittest
from pathlib import Path

import zstandard

from game_config import GameConfig
from game_optimization import OptimizationSetup
from gamestate import GameState
from build_replay_catalog import scenario_matches
from review_exploratory import review_mode


class SignalNineConfigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = GameConfig()

    def test_identity_and_dimensions(self):
        self.assertEqual(self.config.game_id, "classic_nine")
        self.assertEqual(self.config.provider_number, 1)
        self.assertEqual(self.config.num_reels, 3)
        self.assertEqual(self.config.num_rows, [3, 3, 3])
        self.assertFalse(self.config.include_padding)

    def test_paylines_and_symbols_match_product_spec(self):
        self.assertEqual(len(self.config.paylines), 5)
        self.assertEqual(self.config.paytable[(3, "PULSE")], 0.5)
        self.assertEqual(self.config.paytable[(3, "CORE")], 12.0)
        self.assertEqual(self.config.special_symbols["wild"], ["CORE"])
        self.assertEqual(self.config.special_symbols["scatter"], ["PORTAL"])

    def test_modes_match_product_spec(self):
        modes = {mode.get_name(): mode for mode in self.config.bet_modes}
        self.assertEqual(set(modes), {"base", "bonus"})
        self.assertEqual(modes["base"].get_cost(), 1.0)
        self.assertEqual(modes["bonus"].get_cost(), 100.0)
        self.assertFalse(modes["base"].get_buybonus())
        self.assertTrue(modes["bonus"].get_buybonus())
        self.assertTrue(modes["bonus"].get_auto_close_disabled())

    def test_optimizer_targets_sum_to_each_mode_rtp(self):
        OptimizationSetup(self.config)
        for mode in self.config.bet_modes:
            target = sum(
                condition["rtp"]
                for condition in self.config.opt_params[mode.get_name()][
                    "conditions"
                ].values()
            )
            self.assertAlmostEqual(target, mode.get_rtp())

    def test_bonus_optimizer_suppresses_non_cap_tail(self):
        OptimizationSetup(self.config)
        base_scaling = self.config.opt_params["base"]["scaling"]
        bonus_scaling = self.config.opt_params["bonus"]["scaling"]
        self.assertEqual(base_scaling[0]["scale_factor"], 1.0)
        self.assertEqual(
            bonus_scaling[-1],
            {
                "criteria": "freegame",
                "scale_factor": 0.15,
                "win_range": (500, 10_000),
                "probability": 1.0,
            },
        )


class SignalNineMechanicTest(unittest.TestCase):
    def setUp(self):
        self.state = GameState(GameConfig())

    def test_central_core_and_amplifier_cap(self):
        self.state.gametype = self.state.config.freegame_type
        self.state.board = [
            [self.state.create_symbol("PULSE") for _ in range(3)]
            for _ in range(3)
        ]
        self.state.board[1][1] = self.state.create_symbol("CORE")
        self.assertTrue(self.state.board[1][1].wild)

        self.state.global_multiplier = 8
        self.state.increase_amplifier()
        self.assertEqual(self.state.global_multiplier, 9)
        self.state.increase_amplifier()
        self.assertEqual(self.state.global_multiplier, 9)

    def test_base_round_uses_unpadded_win_positions(self):
        self.state.betmode = "base"
        self.state.criteria = "basegame"
        self.state.run_spin(0)
        book = self.state.book.to_json()
        positions = [
            position
            for event in book["events"]
            if event["type"] == "winInfo"
            for win in event["wins"]
            for position in win["positions"]
        ]
        self.assertTrue(positions)
        self.assertTrue(all(0 <= position["row"] <= 2 for position in positions))

    def test_natural_feature_has_nine_scans_and_central_core(self):
        self.state.betmode = "base"
        self.state.criteria = "freegame"
        self.state.run_spin(2)
        book = self.state.book.to_json()
        types = [event["type"] for event in book["events"]]
        self.assertIn("freeSpinTrigger", types)
        self.assertIn("enterBonus", types)
        self.assertLess(
            types.index("freeSpinTrigger"),
            types.index("enterBonus"),
        )
        free_reveals = [
            event
            for event in book["events"]
            if event["type"] == "reveal"
            and event["gameType"] == self.state.config.freegame_type
        ]
        self.assertEqual(len(free_reveals), 9)
        self.assertTrue(
            all(event["board"][1][1]["name"] == "CORE" for event in free_reveals)
        )

    def test_bought_feature_starts_without_a_base_scan(self):
        self.state.betmode = "bonus"
        self.state.criteria = "freegame"
        self.state.run_spin(1)
        book = self.state.book.to_json()
        self.assertEqual(
            book["events"][0],
            {"index": 0, "type": "enterBonus", "reason": "bought"},
        )
        self.assertTrue(
            any(event["type"] == "updateFreeSpin" for event in book["events"])
        )
        self.assertTrue(
            all(event.get("globalMult", 1) <= 9 for event in book["events"])
        )


class SignalNineStreamingReviewTest(unittest.TestCase):
    def write_fixture(self, directory, payouts, lookup_count=None):
        publish_path = Path(directory)
        books = [
            {
                "id": sim_id,
                "payoutMultiplier": payout,
                "events": [
                    {"index": 0, "type": "finalWin", "amount": payout},
                ],
                "criteria": "0" if payout == 0 else "basegame",
                "baseGameWins": payout / 100,
                "freeGameWins": 0,
            }
            for sim_id, payout in enumerate(payouts)
        ]
        payload = "".join(f"{json.dumps(book)}\n" for book in books).encode()
        compressed = zstandard.ZstdCompressor().compress(payload)
        (publish_path / "books_base.jsonl.zst").write_bytes(compressed)
        rows = payouts[:lookup_count]
        (publish_path / "lookUpTable_base_0.csv").write_text(
            "".join(f"{sim_id},1,{payout}\n" for sim_id, payout in enumerate(rows)),
            encoding="utf-8",
        )
        return publish_path

    def test_streaming_review_preserves_exact_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            publish_path = self.write_fixture(directory, [0, 50, 50])
            result = review_mode(publish_path, "base")
        self.assertEqual(result["outcomes"], 3)
        self.assertEqual(result["uniquePayoutMultipliers"], 2)
        self.assertEqual(result["events"]["total"], 3)
        self.assertEqual(result["unitWeightReturn"]["decimal"], "0.333333")

    def test_streaming_review_rejects_length_mismatch(self):
        with tempfile.TemporaryDirectory() as directory:
            publish_path = self.write_fixture(
                directory,
                [0, 50],
                lookup_count=1,
            )
            with self.assertRaisesRegex(RuntimeError, "lengths differ"):
                review_mode(publish_path, "base")


class SignalNineReplayCatalogTest(unittest.TestCase):
    def book(self, payout, criteria="freegame", event_types=()):
        return {
            "payoutMultiplier": payout,
            "criteria": criteria,
            "events": [
                {"index": index, "type": event_type}
                for index, event_type in enumerate(event_types)
            ],
        }

    def test_scenario_thresholds_and_non_cap_feature_selection(self):
        self.assertTrue(
            scenario_matches(
                "base",
                "bigWin",
                self.book(10_000),
            )
        )
        self.assertTrue(
            scenario_matches(
                "bonus",
                "bigWin",
                self.book(50_000),
            )
        )
        self.assertFalse(
            scenario_matches(
                "bonus",
                "bigWin",
                self.book(49_990),
            )
        )
        self.assertFalse(
            scenario_matches(
                "base",
                "bonusTrigger",
                self.book(1_000, "wincap", ("enterBonus",)),
            )
        )
        self.assertTrue(
            scenario_matches(
                "base",
                "retrigger",
                self.book(1_000, "freegame", ("freeSpinRetrigger",)),
            )
        )


if __name__ == "__main__":
    unittest.main()
