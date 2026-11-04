"""Walk-forward training + evaluation for HOPIUM.

- One LightGBM model per horizon, pooled across coins (coin_id is a feature).
- Expanding window: train on everything before month M (minus an embargo of
  24h so no training label peeks into the test month), test on month M, roll.
- Isotonic calibration fit on the last 20% (by time) of each training window.
- Final model: trained on all data, calibrated on the most recent 20%.
"""
from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from config import FEE, HORIZONS, MODELS, SIGNAL_THRESHOLD
from features import FEATURES, add_labels, load_all

PARAMS = dict(objective="binary", learning_rate=0.02, num_leaves=15, min_child_samples=400,
              feature_fraction=0.7, bagging_fraction=0.7, bagging_freq=1, lambda_l2=10.0,
              n_estimators=300, verbose=-1)
MIN_TRAIN_MONTHS = 12
EMBARGO = pd.Timedelta(hours=24)
LEAK_GATE = 0.65


class CalibratedModel:
    def __init__(self, booster, iso):
        self.booster, self.iso = booster, iso

    def predict_proba(self, X):
        return self.iso.predict(self.booster.predict_proba(X[FEATURES])[:, 1])


def fit(train: pd.DataFrame) -> CalibratedModel:
    train = train.sort_values("ts")
    cut = int(len(train) * 0.8)
    fit_part, cal_part = train.iloc[:cut], train.iloc[cut:]
    clf = lgb.LGBMClassifier(**PARAMS)
    clf.fit(fit_part[FEATURES], fit_part.y, categorical_feature=["coin_id"])
    iso = IsotonicRegression(y_min=0.02, y_max=0.98, out_of_bounds="clip")
    iso.fit(clf.predict_proba(cal_part[FEATURES])[:, 1], cal_part.y)
    # refit booster on the full window (calibrator learned on held-out tail)
    full = lgb.LGBMClassifier(**PARAMS)
    full.fit(train[FEATURES], train.y, categorical_feature=["coin_id"])
    return CalibratedModel(full, iso)


def brier(p, y):
    return float(np.mean((p - y) ** 2))


def calib_curve(p, y, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum() >= 30:
            out.append({"bin": round((lo + hi) / 2, 2), "pred": float(p[m].mean()),
                        "actual": float(y[m].mean()), "n": int(m.sum())})
    return out


def simulate(df: pd.DataFrame, h: int, thr=SIGNAL_THRESHOLD):
    """Per coin, take non-overlapping trades: long if p>thr, short if p<1-thr.
    Round-trip fees 2*FEE. Includes flat moves (real P&L). Equal-weight coins."""
    res = {}
    curves = []
    for coin, g in df.groupby("coin"):
        g = g.sort_values("ts")
        busy_until = None
        rets = []
        for ts, p, r in zip(g.ts.values, g.p.values, g.fwd_ret.values):
            if busy_until is not None and ts < busy_until:
                continue
            side = 1 if p > thr else (-1 if p < 1 - thr else 0)
            if side:
                rets.append((ts, side * r - 2 * FEE))
                busy_until = ts + np.timedelta64(h, "h")
        r = pd.Series([x[1] for x in rets], index=pd.to_datetime([x[0] for x in rets], utc=True), dtype=float)
        eq = (1 + r).cumprod()
        res[coin] = {"trades": int(len(r)), "win_rate": float((r > 0).mean()) if len(r) else None,
                     "avg_ret_after_fees": float(r.mean()) if len(r) else None,
                     "total_return": float(eq.iloc[-1] - 1) if len(r) else 0.0}
        curves.append(eq.rename(coin))
    bh = {coin: float(g.sort_values("ts").close.iloc[-1] / g.sort_values("ts").close.iloc[0] - 1)
          for coin, g in df.groupby("coin")}
    tot = float(np.mean([v["total_return"] for v in res.values()]))
    return {"per_coin": res, "portfolio_total_return": tot, "buy_and_hold": bh,
            "buy_and_hold_portfolio": float(np.mean(list(bh.values())))}


def walk_forward(data: pd.DataFrame, h: int):
    d = add_labels(data, h)
    d = d.dropna(subset=["fwd_ret"])
    months = pd.period_range(d.ts.min().strftime("%Y-%m"), d.ts.max().strftime("%Y-%m"), freq="M")
    preds = []
    for m in months[MIN_TRAIN_MONTHS:]:
        start = m.start_time.tz_localize("UTC")
        end = (m + 1).start_time.tz_localize("UTC")
        train = d[(d.ts < start - EMBARGO) & d.y.notna()]
        test = d[(d.ts >= start) & (d.ts < end)].copy()
        if test.empty:
            continue
        model = fit(train)
        test["p"] = model.predict_proba(test)
        test["fold"] = str(m)
        preds.append(test)
        tt = test[test.y.notna()]
        print(f"  h={h} {m}: n={len(tt)} acc={((tt.p > .5) == tt.y).mean():.3f}")
    return pd.concat(preds)


def evaluate(oos: pd.DataFrame, h: int):
    t = oos[oos.y.notna()].copy()
    y, p = t.y.values, t.p.values
    acc = float(((p > 0.5) == y).mean())
    # baselines
    last = (t.ret_1 > 0).astype(float).values
    conf = t[(t.p > SIGNAL_THRESHOLD) | (t.p < 1 - SIGNAL_THRESHOLD)]
    conf_acc = float(((conf.p > 0.5) == conf.y).mean()) if len(conf) else None
    per_fold = t.groupby("fold").apply(lambda g: float(((g.p > .5) == g.y).mean()), include_groups=False)
    per_coin = t.groupby("coin").apply(lambda g: float(((g.p > .5) == g.y).mean()), include_groups=False)
    return {
        "horizon_h": h,
        "oos_rows": int(len(t)), "oos_start": str(t.ts.min()), "oos_end": str(t.ts.max()),
        "flat_rows_excluded": int(oos.y.isna().sum()),
        "accuracy": acc,
        "brier": brier(p, y),
        "baselines": {
            "coin_flip": {"accuracy": 0.5, "brier": 0.25},
            "always_up": {"accuracy": float(y.mean()), "brier": brier(np.ones_like(y), y)},
            "same_as_last_candle": {"accuracy": float((last == y).mean())},
            "base_rate_prob": {"brier": brier(np.full_like(y, y.mean()), y)},
        },
        "confident_calls": {"threshold": SIGNAL_THRESHOLD, "n": int(len(conf)),
                            "share_of_hours": float(len(conf) / len(t)), "accuracy": conf_acc},
        "accuracy_by_month": per_fold.to_dict(),
        "accuracy_by_coin": per_coin.to_dict(),
        "calibration": calib_curve(p, y),
        "pnl_sim": simulate(oos, h),
    }


def main():
    data = load_all()
    metrics = {"trained_at": datetime.now(timezone.utc).isoformat(), "features": FEATURES,
               "params": PARAMS, "fee_per_side": FEE, "horizons": {}}
    for h in HORIZONS:
        print(f"walk-forward h={h}")
        oos = walk_forward(data, h)
        ev = evaluate(oos, h)
        if ev["accuracy"] > LEAK_GATE:
            raise SystemExit(f"QUALITY GATE: OOS accuracy {ev['accuracy']:.3f} > {LEAK_GATE}. Assume leakage. Not saving.")
        metrics["horizons"][str(h)] = ev
        oos[["ts", "coin", "close", "p", "y", "fwd_ret", "fold"]].to_parquet(MODELS / f"oos_{h}h.parquet", index=False)
        # final model on everything
        d = add_labels(data, h)
        final = fit(d[d.y.notna()])
        with open(MODELS / f"model_{h}h.pkl", "wb") as fh:
            pickle.dump(final, fh)
        imp = pd.Series(final.booster.booster_.feature_importance("gain"), index=FEATURES)
        ev["feature_importance_gain"] = (imp / imp.sum()).sort_values(ascending=False).round(4).to_dict()
        print(json.dumps({k: ev[k] for k in ["accuracy", "brier", "baselines", "confident_calls"]}, indent=1))
    with open(MODELS / "metrics.json", "w") as fh:
        json.dump(metrics, fh, indent=1, default=str)
    print("saved", MODELS / "metrics.json")


if __name__ == "__main__":
    main()
