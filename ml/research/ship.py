"""Build the live v3 engine bundle from the chosen config.

Train on ALL labelled data (dev + holdout). Choose the trade threshold on the last 90 days exactly as the
walk-forward protocol does. If the protocol finds no profitable threshold (as on the holdout), fall back to
the median threshold of the walk-forward folds that traded, and say so in the bundle. Public label is set
by the pre-agreed ship rule from research/holdout_result.json.

python -m research.ship a2dedaa2
"""
import json
import pickle
import sys
import warnings
from datetime import datetime, timezone

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
from hopium.config import MODELS, ROOT  # noqa: E402
from hopium.features import add_labels  # noqa: E402
from research.harness import INNER_DAYS, Config, choose, feature_frame, fit_model  # noqa: E402

LABELS = {"A": "Beat fees in testing. Not yet proven live.",
          "B": "Too few test trades to judge. Unproven.",
          "C": "Does not beat trading fees in testing."}


def ship_rule(hold: dict) -> str:
    net, n = hold.get("net_0.20%", 0.0), hold.get("trades", 0)
    if net > 0 and n >= 100:
        return "A"
    if net > 0:
        return "B"
    return "C"


def main(key: str):
    rows = [json.loads(l) for l in open(ROOT / "research" / "results.jsonl")]
    wf = [r for r in rows if r["key"] == key][-1]
    cfg = Config(**{k: (tuple(v) if k == "groups" else v) for k, v in wf["config"].items()})
    hold = json.loads((ROOT / "research" / "holdout_result.json").read_text())
    assert hold["key"] == key, "holdout was run on a different config"

    d = add_labels(feature_frame(), cfg.h).dropna(subset=["fwd_move"]).reset_index(drop=True)
    emb = pd.Timedelta(hours=cfg.h + 25)
    val_start = d.ts.max() - pd.Timedelta(days=INNER_DAYS)
    val, inner = d[d.ts >= val_start], d[d.ts < val_start - emb]
    pv = fit_model(cfg, inner).predict_proba(val[cfg.features()])
    t, cells = choose(val, pv[:, 2] - pv[:, 0], cfg)
    source = "inner validation (last 90 days)"
    if t is None:
        ts = [f["t"] for f in wf["folds"] if f["t"] is not None and f["trades"] > 0]
        t, source = float(np.median(ts)), f"fallback: median of {len(ts)} walk-forward fold thresholds (protocol found none profitable)"
    model = fit_model(cfg, d)
    stamp = datetime.now(timezone.utc)
    version = f"v3-{cfg.h}h-{cfg.model}-{stamp:%Y%m%d}"
    rule = ship_rule(hold)
    bundle = {"model": model, "config": wf["config"], "threshold": t, "threshold_source": source,
              "cells": cells, "version": version, "trained_through": str(d.ts.max()),
              "label_code": rule, "label": LABELS[rule]}
    with open(MODELS / "engine_v3.pkl", "wb") as fh:
        pickle.dump(bundle, fh)
    meta = {k: v for k, v in bundle.items() if k != "model"} | {
        "built_at": stamp.isoformat(), "walk_forward": {k: wf[k] for k in wf if k not in ("folds", "config")},
        "walk_forward_folds": wf["folds"], "holdout": {k: v for k, v in hold.items() if k != "config"}}
    (MODELS / "engine_v3.json").write_text(json.dumps(meta, indent=1, default=str))
    print(json.dumps({k: meta[k] for k in ("version", "threshold", "threshold_source", "label_code", "label",
                                           "trained_through")}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
