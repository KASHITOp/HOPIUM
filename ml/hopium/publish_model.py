"""Insert the live engine's metrics row into model_runs (idempotent: one row per model_version).

python -m hopium.publish_model
"""
import json
import sys

from . import db
from .config import MODELS


def main() -> int:
    m = json.loads((MODELS / "engine_v3.json").read_text())
    wf, ho = m["walk_forward"], m["holdout"]
    row = {
        "model_version": m["version"], "trained_at": m["built_at"],
        "oos_accuracy": wf["big_move_direction_acc"], "oos_n": wf["big_move_n"],
        "brier": -1.0,   # sentinel: Brier is not computed for the 3-class engine (column is NOT NULL)
        "baseline_accuracy": {"coin_flip": 0.5},
        "calibration": [], "feature_importance": {},
        "backtest_equity": {"walk_forward_folds": m["walk_forward_folds"]},
        "details": {"label_code": m["label_code"], "label": m["label"], "threshold": m["threshold"],
                    "threshold_source": m["threshold_source"], "config": m["config"],
                    "trained_through": m["trained_through"],
                    "walk_forward": {k: wf.get(k) for k in ("trades", "net_0.20%", "net_0.15%", "net_0.10%",
                                                            "mean_net_trade", "win_rate", "avg_win", "avg_loss",
                                                            "sharpe", "sharpe_ci95", "max_dd", "per_coin", "per_year",
                                                            "months_positive", "dev_period")},
                    "holdout": {k: ho.get(k) for k in ("holdout", "rows", "trades", "threshold", "net_0.20%",
                                                       "net_0.15%", "net_0.10%")}},
    }
    out = db.insert("model_runs", [row], on_conflict="model_version")
    print("model_runs:", "inserted" if out else "already present", m["version"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
