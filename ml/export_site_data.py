"""Export static JSON for the site: honest backtest summary + lab dataset."""
import json

import numpy as np
import pandas as pd

from config import COINS, FEE, MODELS, ROOT, SIGNAL_THRESHOLD
from features import load_all

OUT = ROOT.parent / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def r(x, n=5):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), n)


def main():
    m = json.load(open(MODELS / "metrics.json"))
    slim = {"trained_at": m["trained_at"], "fee_per_side": FEE, "threshold": SIGNAL_THRESHOLD, "horizons": {}}
    for h, e in m["horizons"].items():
        slim["horizons"][h] = {k: e[k] for k in ["accuracy", "brier", "baselines", "confident_calls", "calibration",
                                                 "accuracy_by_month", "accuracy_by_coin", "pnl_sim", "oos_start",
                                                 "oos_end", "oos_rows", "feature_importance_gain"]}
    (OUT / "metrics.json").write_text(json.dumps(slim))

    d = load_all()
    cutoff = d.ts.max() - pd.Timedelta(days=365)
    for coin in COINS:
        g = d[(d.coin == coin) & (d.ts >= cutoff)].sort_values("ts")
        cols = {"t": (g.ts.astype("int64") // 10**9).tolist(),
                "c": [r(x, 4) for x in g.close],
                "rsi": [r(x, 2) for x in g.rsi_14],
                "macd": [r(x, 6) for x in g.macd_hist],
                "mom": [r(x, 5) for x in g.ret_24],
                "bb": [r(x, 3) for x in g.bb_pctb],
                "vol": [r(x, 3) for x in g.vol_z],
                "vwap": [r(x, 5) for x in g.vwap_dist],
                "fng": [r(x, 0) for x in g.fng]}
        (OUT / f"lab_{coin}.json").write_text(json.dumps(cols, separators=(",", ":")))
    print("exported to", OUT)


if __name__ == "__main__":
    main()
