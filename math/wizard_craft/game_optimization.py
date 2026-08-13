"""Exploratory optimizer targets for WIZARD CRAFT hypothesis 002."""

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
            num_show=int(os.environ.get("WIZARD_CRAFT_OPT_SHOW", "1000")),
            num_per_fence=int(os.environ.get("WIZARD_CRAFT_OPT_PER_FENCE", "2000")),
            min_m2m=4,
            max_m2m=8,
            pmb_rtp=1.0,
            sim_trials=int(os.environ.get("WIZARD_CRAFT_OPT_TRIALS", "500")),
            test_spins=[50, 100, 200],
            test_weights=[0.3, 0.4, 0.3],
            score_type="rtp",
        ).return_dict()
        scaling = ConstructScaling([
            {
                "criteria": "freegame",
                "scale_factor": 1.0,
                "win_range": (0.1, 25_000),
                "probability": 1.0,
            }
        ]).return_dict()

        allocations = {
            "baseBattle": {"feature_rtp": 0.350, "feature_hr": 180},
            "runeSpark": {"feature_rtp": 0.450, "feature_hr": 90},
            "siegeSigns": {"feature_rtp": 0.550, "feature_hr": 45},
        }
        game_config.opt_params = {}
        for mode, allocation in allocations.items():
            game_config.opt_params[mode] = {
                "conditions": {
                    "wincap": ConstructConditions(
                        rtp=0.001,
                        av_win=25_000,
                        search_conditions=25_000,
                    ).return_dict(),
                    "0": ConstructConditions(
                        rtp=0,
                        av_win=0,
                        search_conditions=0,
                    ).return_dict(),
                    "freegame": ConstructConditions(
                        rtp=allocation["feature_rtp"],
                        hr=allocation["feature_hr"],
                        search_conditions={"symbol": "scatter"},
                    ).return_dict(),
                    "basegame": ConstructConditions(
                        rtp=0.964 - allocation["feature_rtp"],
                        hr=4,
                    ).return_dict(),
                },
                "scaling": scaling,
                "parameters": parameters,
            }
        game_config.opt_params["openGrimoire"] = {
            "conditions": {
                "wincap": ConstructConditions(
                    rtp=0.001,
                    av_win=25_000,
                    search_conditions=25_000,
                ).return_dict(),
                "freegame": ConstructConditions(
                    rtp=0.964,
                    hr="x",
                ).return_dict(),
            },
            "scaling": scaling,
            "parameters": parameters,
        }
        verify_optimization_input(game_config, game_config.opt_params)
