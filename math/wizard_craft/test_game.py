"""Focused WIZARD CRAFT tests against the official Stake Engine math SDK."""

import unittest
from fractions import Fraction

from game_config import GameConfig
from game_optimization import OptimizationSetup
from gamestate import GameState
from analyze_tier_rebalance import aggregate_rows, evaluate
from build_tier_lookups import (
    MAX_BOOK_WEIGHT,
    MIN_CAP_BUCKET_WEIGHT,
    apportion,
    continuous_bucket_weights,
)
from review_mode_overlap import anticipation_active, event_signature


class WizardCraftConfigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = GameConfig()

    def test_identity_dimensions_and_cap(self):
        self.assertEqual(self.config.game_id, "wizard_craft")
        self.assertEqual(self.config.provider_number, 1)
        self.assertEqual(self.config.num_reels, 5)
        self.assertEqual(self.config.num_rows, [4] * 5)
        self.assertEqual(self.config.wincap, 25_000)

    def test_modes_match_the_approved_ladder(self):
        modes = {mode.get_name(): mode for mode in self.config.bet_modes}
        self.assertEqual(
            set(modes),
            {"baseBattle", "runeSpark", "siegeSigns", "openGrimoire"},
        )
        self.assertEqual(
            {name: mode.get_cost() for name, mode in modes.items()},
            {
                "baseBattle": 1.0,
                "runeSpark": 3.0,
                "siegeSigns": 10.0,
                "openGrimoire": 100.0,
            },
        )
        self.assertTrue(modes["openGrimoire"].get_buybonus())
        self.assertTrue(modes["openGrimoire"].get_auto_close_disabled())

    def test_tier_spin_counts_and_symbols(self):
        self.assertEqual(self.config.freespin_triggers["basegame"], {3: 8, 4: 10, 5: 12})
        self.assertEqual(self.config.special_symbols["wild"], ["WIZARD", "DRAGON"])
        self.assertEqual(self.config.special_symbols["scatter"], ["RUNE"])

    def test_hypothesis_two_compresses_paytable_and_tiers_high_values(self):
        self.assertEqual(self.config.paytable[(5, "CROWN")], 2)
        self.assertTrue(
            all(round(payout * 10) == payout * 10 for payout in self.config.paytable.values())
        )
        conditions = self.config.bet_modes[0].get_distributions()[1]._conditions
        self.assertEqual(max(conditions["vs_values_base"]), 10)
        self.assertEqual(max(conditions["vs_values_tier_1"]), 10)
        self.assertEqual(max(conditions["vs_values_tier_2"]), 25)
        self.assertEqual(max(conditions["vs_values_tier_3"]), 50)

    def test_optimizer_allocations_sum_to_mode_rtp(self):
        OptimizationSetup(self.config)
        for mode in self.config.bet_modes:
            target = sum(
                condition["rtp"]
                for condition in self.config.opt_params[mode.get_name()][
                    "conditions"
                ].values()
            )
            self.assertAlmostEqual(target, mode.get_rtp())

    def test_candidate_pool_oversamples_tier_three_without_changing_targets(self):
        modes = {
            mode.get_name(): mode
            for mode in self.config.bet_modes
        }
        for mode in modes.values():
            conditions = mode.get_distributions()[1]._conditions
            self.assertEqual(
                conditions["candidate_tier_weights"],
                {1: 45, 2: 30, 3: 25},
            )
        self.assertEqual(
            modes["baseBattle"].get_distributions()[1]._conditions[
                "target_tier_weights"
            ],
            {1: 80, 2: 17, 3: 3},
        )
        self.assertEqual(
            modes["openGrimoire"].get_distributions()[1]._conditions[
                "target_tier_weights"
            ],
            {1: 55, 2: 30, 3: 15},
        )


class WizardCraftMechanicTest(unittest.TestCase):
    def setUp(self):
        self.state = GameState(GameConfig())

    def test_siege_signs_reveal_has_a_guaranteed_rune(self):
        self.state.betmode = "siegeSigns"
        self.state.criteria = "basegame"
        self.state.reset_book()
        self.state.draw_wizard_board()
        self.assertGreaterEqual(self.state.count_special_symbols("scatter"), 1)

    def test_tier_one_never_creates_sticky_reels(self):
        self.state.betmode = "openGrimoire"
        self.state.criteria = "freegame"
        self.state.duel_tier = 1
        self.state.gametype = self.state.config.freegame_type
        self.state.fs = 1
        self.state.draw_wizard_board()
        self.state.expand_feature_vs_reels()
        self.assertEqual(self.state.sticky_vs_reels, {})

    def test_direct_feature_selects_tier_without_a_base_board(self):
        self.state.betmode = "openGrimoire"
        self.state.criteria = "freegame"
        self.state.reset_book()
        self.assertIn(self.state.choose_tier(), {1, 2, 3})

    def test_additive_vs_values_multiply_only_contributing_reels(self):
        self.state.betmode = "baseBattle"
        self.state.criteria = "basegame"
        self.state.board = [
            [self.state.create_symbol("CROWN") for _ in range(4)]
            for _ in range(5)
        ]
        self.state.spin_vs_reels = {0: 2, 2: 5}
        self.state.evaluate_wizard_ways()
        crown = next(win for win in self.state.win_data["wins"] if win["symbol"] == "CROWN")
        self.assertEqual(crown["meta"]["globalMult"], 7)
        self.assertEqual(
            crown["meta"]["contributingVsReels"],
            [{"reel": 0, "multiplier": 2}, {"reel": 2, "multiplier": 5}],
        )

    def test_tier_rebalance_evaluation_preserves_group_masses(self):
        groups = {
            "tier1": [(100, 1), (200, 1)],
            "tier2": [(300, 1)],
            "tier3": [(400, 1)],
        }
        result = evaluate(
            {
                name: aggregate_rows(rows)
                for name, rows in groups.items()
            },
            {"tier1": 0.55, "tier2": 0.30, "tier3": 0.15},
            tilt=0,
            cost=1,
        )
        self.assertAlmostEqual(result["rtp"], 2.325)
        self.assertGreater(result["minimumConditionalEffectiveBooks"], 0)

    def test_integer_apportionment_preserves_total_and_largest_remainder(self):
        result = apportion(
            10,
            {
                "tier1": Fraction(55, 100),
                "tier2": Fraction(30, 100),
                "tier3": Fraction(15, 100),
            },
        )
        self.assertEqual(sum(result.values()), 10)
        self.assertEqual(result, {"tier1": 6, "tier2": 3, "tier3": 1})

    def test_integer_builder_caps_unique_book_concentration(self):
        rows = [
            (0, 10_000, 100),
            (1, 1, 200),
            (2, 1, 300),
        ]
        _, allocations = continuous_bucket_weights(
            rows,
            MAX_BOOK_WEIGHT * 2,
            tilt=-100,
        )
        self.assertEqual(sum(allocations), MAX_BOOK_WEIGHT * 2)
        self.assertLessEqual(max(allocations), MAX_BOOK_WEIGHT)

    def test_integer_builder_reserves_attainable_cap_probability(self):
        rows = [(0, 1, 100), (1, 1, 2_500_000)]
        buckets, allocations = continuous_bucket_weights(rows, 10**15, tilt=-100)
        cap_index = next(
            index for index, (payout, _) in enumerate(buckets)
            if payout == 2_500_000
        )
        self.assertEqual(allocations[cap_index], MIN_CAP_BUCKET_WEIGHT)

    def test_overlap_signature_captures_tier_and_choreography(self):
        book = {
            "criteria": "freegame",
            "events": [
                {"type": "startDuel", "tier": 3},
                {"type": "reveal"},
                {"type": "expandVsReel"},
                {"type": "wincap"},
            ],
        }
        self.assertEqual(
            event_signature(book),
            ("freegame", 3, 1, 0, 1, 0, 0, 1),
        )
        self.assertFalse(anticipation_active([0, 0, 0, 0, 0]))
        self.assertTrue(anticipation_active([0, 0, 1, 0, 0]))


if __name__ == "__main__":
    unittest.main()
