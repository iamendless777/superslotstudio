"""WIZARD CRAFT per-book state overrides."""

from game_executables import GameExecutables


class GameStateOverride(GameExecutables):
    def reset_book(self):
        super().reset_book()
        self.duel_tier = None
        self.sticky_vs_reels = {}
        self.spin_vs_reels = {}
        self.guaranteed_sticky_spin = None
        self.guaranteed_sticky_reel = None

    def assign_special_sym_function(self):
        self.special_symbol_functions = {}

    def run_sims(self, *args, **kwargs):
        self._payout_ints = []
        return super().run_sims(*args, **kwargs)

    def check_repeat(self):
        super().check_repeat()
        if self.repeat:
            return
        expected = self.get_current_betmode_distributions().get_win_criteria()
        if expected is None and self.criteria in {"basegame", "freegame"}:
            if self.final_win <= 0:
                self.repeat = True
