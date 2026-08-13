"""Safe Signal Nine entry point; expensive steps are off by default."""

import os

from game_config import GameConfig
from game_optimization import OptimizationSetup
from gamestate import GameState
from optimization_program.run_script import OptimizationExecution
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs
from utils.game_analytics.run_analysis import create_stat_sheet
from utils.rgs_verification import execute_all_tests


if __name__ == "__main__":
    exploratory = os.environ.get("SIGNAL_NINE_EXPLORATORY") == "1"
    optimize = os.environ.get("SIGNAL_NINE_OPTIMIZE") == "1"
    num_threads = int(os.environ.get("SIGNAL_NINE_THREADS", "1"))
    rust_threads = 8
    batching_size = int(os.environ.get("SIGNAL_NINE_BATCH_SIZE", "1000"))
    compression = True
    profiling = False
    num_sim_args = {
        "base": int(os.environ.get("SIGNAL_NINE_BASE_SIMS", "1000")),
        "bonus": int(os.environ.get("SIGNAL_NINE_BONUS_SIMS", "1000")),
    }
    run_conditions = {
        "run_sims": exploratory,
        "run_optimization": optimize,
        "run_analysis": False,
        "run_format_checks": False,
    }
    target_modes = list(num_sim_args)
    requested_opt_modes = os.environ.get("SIGNAL_NINE_OPT_MODES")
    if requested_opt_modes:
        target_modes = [
            mode.strip()
            for mode in requested_opt_modes.split(",")
            if mode.strip()
        ]
        unknown_modes = set(target_modes) - set(num_sim_args)
        if not target_modes or unknown_modes:
            raise ValueError(
                f"Invalid SIGNAL_NINE_OPT_MODES: {requested_opt_modes}"
            )

    config = GameConfig()
    gamestate = GameState(config)
    if run_conditions["run_optimization"] or run_conditions["run_analysis"]:
        OptimizationSetup(config)

    if run_conditions["run_sims"]:
        create_books(
            gamestate,
            config,
            num_sim_args,
            batching_size,
            num_threads,
            compression,
            profiling,
        )
        generate_configs(gamestate)

    if run_conditions["run_optimization"]:
        generate_configs(gamestate)
        OptimizationExecution().run_all_modes(
            config,
            target_modes,
            rust_threads,
        )
        generate_configs(gamestate)
    if run_conditions["run_analysis"]:
        create_stat_sheet(gamestate, custom_keys=[{"symbol": "scatter"}])
    if run_conditions["run_format_checks"]:
        execute_all_tests(config)
