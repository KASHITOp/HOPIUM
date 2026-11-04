"""ONE-TIME final holdout evaluation.

Trains the chosen config on all dev data (label windows ending before 2026-05-01), picks its threshold /
regime / hyperparameters on the last 90 days of dev exactly as in walk-forward, then trades the holdout
(2026-05-01 onwards) once. Refuses to run a second time: the lock file records which config used it.

python -m research.holdout <config-key-from-results.jsonl>
"""
import json
import sys
import warnings

import pandas as pd

warnings.filterwarnings("ignore")
from hopium.config import ROOT  # noqa: E402
from hopium.features import add_labels  # noqa: E402
from research.harness import (HOLDOUT_START, INNER_DAYS, SELECT_FEE, TUNE_GRID, Config, choose,  # noqa: E402
                              dev_frame, feature_frame, fit_predict, summarize, trades)

LOCK = ROOT / "research" / "HOLDOUT_USED.json"


def main(key: str):
    if LOCK.exists():
        sys.exit(f"Holdout already used: {LOCK.read_text()}")
    rows = [json.loads(l) for l in open(ROOT / "research" / "results.jsonl")]
    match = [r for r in rows if r["key"] == key]
    if not match:
        sys.exit(f"no config with key {key}")
    cfg = Config(**{k: (tuple(v) if k == "groups" else v) for k, v in match[-1]["config"].items()})
    LOCK.write_text(json.dumps({"key": key, "config": match[-1]["config"],
                                "used_at": pd.Timestamp.now(tz="UTC").isoformat()}, indent=1))
    emb = pd.Timedelta(hours=cfg.h + 25)
    dev = dev_frame(cfg.h)
    val_start = dev.ts.max() - pd.Timedelta(days=INNER_DAYS)
    val, inner = dev[dev.ts >= val_start], dev[dev.ts < val_start - emb]
    params = cfg.lgbm
    if cfg.tune and cfg.model in ("lgbm", "ensemble"):
        best = None
        for p in TUNE_GRID:
            pv = fit_predict(cfg, inner, val, p)
            tt, cc = choose(val, pv[:, 2] - pv[:, 0], cfg)
            tr = trades(val, pv[:, 2] - pv[:, 0], cfg.h, tt, cfg.sides, cc)
            net = float((tr.move - SELECT_FEE).sum()) if len(tr) else 0.0
            if best is None or net > best[0]:
                best = (net, p, tt, cc)
        _, params, t, cells = best
    else:
        pv = fit_predict(cfg, inner, val, params)
        t, cells = choose(val, pv[:, 2] - pv[:, 0], cfg)
    full = add_labels(feature_frame(), cfg.h).dropna(subset=["fwd_move"])
    hold = full[full.ts >= HOLDOUT_START].reset_index(drop=True)
    pt = fit_predict(cfg, dev, hold, params)
    score = pt[:, 2] - pt[:, 0]
    tr = trades(hold, score, cfg.h, t, cfg.sides, cells)
    tr["ts"] = pd.to_datetime(tr.ts, utc=True)
    tr["move"] = tr.move.astype(float)
    res = {"key": key, "config": match[-1]["config"], "threshold": t, "cells": sorted(cells) if cells else None,
           "params": params, "holdout": f"{hold.ts.min()} .. {hold.ts.max()}", "rows": len(hold)} | \
        summarize(tr, HOLDOUT_START, hold.ts.max() + pd.Timedelta(days=1))
    (ROOT / "research" / "holdout_result.json").write_text(json.dumps(res, indent=1, default=str))
    tr.to_csv(ROOT / "research" / "holdout_trades.csv", index=False)
    print(json.dumps(res, indent=1, default=str))


if __name__ == "__main__":
    main(sys.argv[1])
