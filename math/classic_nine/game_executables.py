"""Reusable Signal Nine gameplay actions."""

from game_calculations import GameCalculations
from src.calculations.lines import Lines
from src.events.events import (
    fs_trigger_event,
    reveal_event,
    set_total_event,
    set_win_event,
    update_global_mult_event,
    win_info_event,
)


class GameExecutables(GameCalculations):
    """Line evaluation, central Core placement, and feature state."""

    def draw_signal_board(self):
        self.draw_board(emit_event=False)
        if self.gametype == self.config.freegame_type:
            self.board[1][1] = self.create_symbol("CORE")
            self.get_special_symbols_on_board()
        reveal_event(self)

    def evaluate_signal_lines(self):
        self.win_data = Lines.get_lines(
            self.board,
            self.config,
            wild_sym="CORE",
            multiplier_method="global",
            global_multiplier=self.global_multiplier,
        )
        Lines.record_lines_wins(self)
        self.win_manager.update_spinwin(self.win_data["totalWin"])
        if self.win_manager.spin_win > 0:
            win_info_event(self, include_padding_index=False)
            self.evaluate_wincap()
            set_win_event(self)
        set_total_event(self)

    def increase_amplifier(self):
        if self.global_multiplier < 9:
            self.global_multiplier += 1
            update_global_mult_event(self)

    def update_freespin_amount(self, scatter_key="scatter"):
        self.tot_fs = self.config.freespin_triggers[self.gametype][
            self.count_special_symbols(scatter_key)
        ]
        fs_trigger_event(
            self,
            include_padding_index=False,
            basegame_trigger=self.gametype == self.config.basegame_type,
            freegame_trigger=self.gametype == self.config.freegame_type,
        )

    def update_fs_retrigger_amt(self, scatter_key="scatter"):
        self.tot_fs += self.config.freespin_triggers[self.gametype][
            self.count_special_symbols(scatter_key)
        ]
        fs_trigger_event(
            self,
            include_padding_index=False,
            basegame_trigger=False,
            freegame_trigger=True,
        )
