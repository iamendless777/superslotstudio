"""Simulation lifecycle for one Signal Nine RGS round."""

from game_events import enter_signal_bonus_event
from game_override import GameStateOverride


class GameState(GameStateOverride):
    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim, simulation_seed)
        self.repeat = True
        while self.repeat:
            self.reset_book()
            if self.betmode == "bonus":
                self.tot_fs = 9
                enter_signal_bonus_event(self, "bought")
                self.run_freespin()
            else:
                self.draw_signal_board()
                self.evaluate_signal_lines()
                self.win_manager.update_gametype_wins(self.gametype)
                if self.check_fs_condition():
                    self.record(
                        {
                            "kind": self.count_special_symbols("scatter"),
                            "symbol": "scatter",
                            "gametype": self.gametype,
                        }
                    )
                    self.update_freespin_amount()
                    enter_signal_bonus_event(self, "natural")
                    self.run_freespin()

            self.evaluate_finalwin()
            self.check_repeat()
        self.imprint_wins()

    def run_freespin(self):
        self.reset_fs_spin()
        while self.fs < self.tot_fs and not self.wincap_triggered:
            self.update_freespin()
            self.draw_signal_board()
            self.evaluate_signal_lines()

            if self.check_fs_condition():
                self.update_fs_retrigger_amt()
            if self.win_manager.spin_win > 0 and not self.wincap_triggered:
                self.increase_amplifier()
            self.win_manager.update_gametype_wins(self.gametype)

        self.end_freespin()
