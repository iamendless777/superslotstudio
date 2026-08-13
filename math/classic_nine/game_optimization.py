"""Working optimizer targets; revise after exploratory simulation."""

import os

from optimization_program.optimization_config import (
    ConstructConditions,
    ConstructParameters,
    ConstructScaling,
    verify_optimization_input,
)


class OptimizationSetup:
    def __init__(self, game_config):
        parameters = ConstructParameters(
            num_show=int(os.environ.get("SIGNAL_NINE_OPT_SHOW", "5000")),
            num_per_fence=int(
                os.environ.get("SIGNAL_NINE_OPT_PER_FENCE", "10000")
            ),
            min_m2m=4,
            max_m2m=8,
            pmb_rtp=1.0,
            sim_trials=int(
                os.environ.get("SIGNAL_NINE_OPT_TRIALS", "5000")
            ),
            test_spins=[50, 100, 200],
            test_weights=[0.3, 0.4, 0.3],
            score_type="rtp",
        ).return_dict()
        neutral_scaling = ConstructScaling(
            [
                {
                    "criteria": "freegame",
                    "scale_factor": 1.0,
                    "win_range": (1, 10_000),
                    "probability": 1.0,
                }
            ]
        ).return_dict()
        bonus_tail_scaling = ConstructScaling(
            [
                {
                    "criteria": "freegame",
                    "scale_factor": 1.6,
                    "win_range": (50, 200),
                    "probability": 1.0,
                },
                {
                    "criteria": "freegame",
                    "scale_factor": 1.4,
                    "win_range": (200, 500),
                    "probability": 1.0,
                },
                {
                    "criteria": "freegame",
                    "scale_factor": 0.15,
                    "win_range": (500, 10_000),
                    "probability": 1.0,
                },
            ]
        ).return_dict()
        game_config.opt_params = {
            "base": {
                "conditions": {
                    "wincap": ConstructConditions(
                        rtp=0.001,
                        av_win=10_000,
                        search_conditions=10_000,
                    ).return_dict(),
                    "0": ConstructConditions(
                        rtp=0,
                        av_win=0,
                        search_conditions=0,
                    ).return_dict(),
                    "freegame": ConstructConditions(
                        rtp=0.30,
                        hr=170,
                        search_conditions={"symbol": "scatter"},
                    ).return_dict(),
                    "basegame": ConstructConditions(
                        rtp=0.664,
                        hr=4,
                    ).return_dict(),
                },
                "scaling": neutral_scaling,
                "parameters": parameters,
            },
            "bonus": {
                "conditions": {
                    "wincap": ConstructConditions(
                        rtp=0.001,
                        av_win=10_000,
                        search_conditions=10_000,
                    ).return_dict(),
                    "freegame": ConstructConditions(
                        rtp=0.964,
                        hr="x",
                    ).return_dict(),
                },
                "scaling": bonus_tail_scaling,
                "parameters": parameters,
            },
        }
        verify_optimization_input(game_config, game_config.opt_params)
