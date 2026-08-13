"""Safe WIZARD CRAFT official-SDK entry point; generation is opt-in."""

import os

from game_config import GameConfig
from game_optimization import OptimizationSetup
from gamestate import GameState
from optimization_program.run_script import OptimizationExecution
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs


if __name__ == "__main__":
    exploratory = os.environ.get("WIZARD_CRAFT_EXPLORATORY") == "1"
    optimize = os.environ.get("WIZARD_CRAFT_OPTIMIZE") == "1"
    if not exploratory and not optimize:
        raise RuntimeError(
            "Set WIZARD_CRAFT_EXPLORATORY=1 or WIZARD_CRAFT_OPTIMIZE=1"
        )
    config = GameConfig()
    gamestate = GameState(config)
    count = int(os.environ.get("WIZARD_CRAFT_SIMS", "1000"))
    modes = os.environ.get(
        "WIZARD_CRAFT_MODES",
        "baseBattle,runeSpark,siegeSigns,openGrimoire",
    ).split(",")
    unknown = set(modes) - {mode.get_name() for mode in config.bet_modes}
    if unknown:
        raise ValueError(f"Unknown WIZARD_CRAFT_MODES: {sorted(unknown)}")
    if exploratory:
        create_books(
            gamestate,
            config,
            {mode: count for mode in modes},
            int(os.environ.get("WIZARD_CRAFT_BATCH_SIZE", "1000")),
            int(os.environ.get("WIZARD_CRAFT_THREADS", "1")),
            True,
            False,
        )
        generate_configs(gamestate)
    if optimize:
        OptimizationSetup(config)
        generate_configs(gamestate)
        OptimizationExecution().run_all_modes(
            config,
            modes,
            int(os.environ.get("WIZARD_CRAFT_RUST_THREADS", "4")),
        )
        generate_configs(gamestate)
