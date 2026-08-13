"""Official-SDK exploratory lifecycle for one WIZARD CRAFT round."""

import random

from game_events import enter_bonus_event, feature_trigger_event, start_duel_event
from game_override import GameStateOverride


class GameState(GameStateOverride):
    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim, simulation_seed)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            if self.betmode == "openGrimoire":
                self.duel_tier = self.choose_tier()
                self.tot_fs = {1: 8, 2: 10, 3: 12}[self.duel_tier]
                enter_bonus_event(self, "bought")
                self.run_freespin()
            else:
                self.draw_wizard_board()
                self.expand_base_vs_reels()
                self.evaluate_wizard_ways()
                self.clear_temporary_vs_reels()
                self.win_manager.update_gametype_wins(self.gametype)
                if self.check_fs_condition():
                    self.duel_tier = self.choose_tier()
                    self.tot_fs = {1: 8, 2: 10, 3: 12}[self.duel_tier]
                    self.record({
                        "kind": self.count_special_symbols("scatter"),
                        "symbol": "scatter",
                        "tier": self.duel_tier,
                        "gametype": self.gametype,
                    })
                    feature_trigger_event(self)
                    enter_bonus_event(self, "natural")
                    self.run_freespin()

            self.evaluate_finalwin()
            self.check_repeat()
        self.imprint_wins()

    def run_freespin(self):
        self.reset_fs_spin()
        if self.duel_tier == 3:
            self.guaranteed_sticky_spin = random.randint(1, 3)
            self.guaranteed_sticky_reel = random.randrange(self.config.num_reels)
        start_duel_event(self)
        while self.fs < self.tot_fs and not self.wincap_triggered:
            self.update_freespin()
            self.draw_wizard_board()
            self.expand_feature_vs_reels()
            self.evaluate_wizard_ways()
            self.clear_temporary_vs_reels()
            if self.check_fs_condition():
                self.update_fs_retrigger_amt()
            self.win_manager.update_gametype_wins(self.gametype)
        self.end_freespin()
