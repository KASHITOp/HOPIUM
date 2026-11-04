"""Walk-forward training, evaluation and the leakage quality gate.

- One LightGBM model per horizon, pooled across coins (coin_id is a feature).
- Expanding window: train on everything before month M minus a 24h embargo (so no training label can
  peek into the test month), test on month M, roll forward. 12 months minimum training history.
- Isotonic calibration fit on the most recent 20% (by time) of each training window, never on test data.
- Gate: OOS accuracy > 65% => assume leakage, exit non-zero, publish nothing.

python -m hopium.train [--publish]
"""
from __future__ import annotations

import argparse
import json
import pickle
import sys
from datetime import datetime, timezone

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from . import db
from .config import DOWN_THRESHOLD, FEE, HORIZONS, MODELS, UP_THRESHOLD
from .features import FEATURES, add_labels, load_all
from .model import CalibratedModel

PARAMS = dict(objective="binary", learning_rate=0.02, num_leaves=15, min_child_samples=400,
              feature_fraction=0.7, bagging_fraction=0.7, bagging_freq=1, lambda_l2=10.0,
              n_estimators=300, verbose=-1)
MIN_TRAIN_MONTHS = 12
EMBARGO = pd.Timedelta(hours=24)
LEAK_GATE = 0.65


def fit(train: pd.DataFrame, version: str = "wf") -> CalibratedModel:
    train = train.sort_values("ts")
    cut = int(len(train) * 0.8)
    fit_part, cal_part = train.iloc[:cut], train.iloc[cut:]
    first = lgb.LGBMClassifier(**PARAMS).fit(fit_part[FEATURES], fit_part.y, categorical_feature=["coin_id"])
    iso = IsotonicRegression(y_min=0.02, y_max=0.98, out_of_bounds="clip")
    iso.fit(first.predict_proba(cal_part[FEATURES])[:, 1], cal_part.y)
    # Refit trees on the whole window; the calibrator was learned out-of-sample on the tail.
    full = lgb.LGBMClassifier(**PARAMS).fit(train[FEATURES], train.y, categorical_feature=["coin_id"])
    return CalibratedModel(full, iso, version)


def walk_forward(data: pd.DataFrame, h: int) -> pd.DataFrame:
    d = add_labels(data, h).dropna(subset=["fwd_move"])
    months = pd.period_range(d.ts.min().strftime("%Y-%m"), d.ts.max().strftime("%Y-%m"), freq="M")
    preds = []
    for m in months[MIN_TRAIN_MONTHS:]:
        start = m.start_time.tz_localize("UTC")
        end = (m + 1).start_time.tz_localize("UTC")
        train = d[(d.ts < start - EMBARGO) & d.y.notna()]
        test = d[(d.ts >= start) & (d.ts < end)].copy()
        if test.empty:
            continue
        test["p"] = fit(train).predict_proba(test)
        test["fold"] = str(m)
        preds.append(test)
        tt = test[test.y.notna()]
        print(f"  {h}h {m}: n={len(tt):5d} acc={((tt.p > .5) == tt.y).mean():.3f}")
    return pd.concat(preds, ignore_index=True)


# ------------------------------------------------------------------ metrics
def brier(p, y):
    return float(np.mean((p - y) ** 2))


def calibration_bins(p, y, edges=(0, .35, .42, .46, .50, .54, .58, .65, 1)):
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            out.append({"lo": lo, "hi": hi, "pred": float(p[m].mean()), "actual": float(y[m].mean()), "n": int(m.sum())})
    return out


def max_drawdown(eq: pd.Series) -> float:
    return float((1 - eq / eq.cummax()).max()) if len(eq) else 0.0


def simulate(df: pd.DataFrame, h: int, up_only: bool = False) -> dict:
    """Per coin, equal sleeves. Long when p > 0.58, short when p < 0.42 (unless up_only). Each trade is
    entered at the call candle close and closed at target_time; no overlapping trades within a sleeve.
    0.1% fee per side, no leverage. FLAT moves are included (they are real P&L)."""
    trades = []
    for coin, g in df.groupby("coin"):
        busy = None
        for ts, p, mv in zip(g.ts, g.p, g.fwd_move):
            if busy is not None and ts < busy:
                continue
            side = 1 if p > UP_THRESHOLD else (-1 if (p < DOWN_THRESHOLD and not up_only) else 0)
            if side:
                trades.append({"coin": coin, "exit": ts + pd.Timedelta(hours=h + 1), "r": side * mv - 2 * FEE})
                busy = ts + pd.Timedelta(hours=h)
    t = pd.DataFrame(trades)
    coins = sorted(df.coin.unique())
    if t.empty:
        return {"trades": 0}
    # portfolio = mean of per-coin compounded sleeves, sampled daily
    days = pd.date_range(df.ts.min().normalize(), df.ts.max().normalize() + pd.Timedelta(days=1), freq="D")
    sleeves = []
    for coin in coins:
        tc = t[t.coin == coin].sort_values("exit")
        eq = (1 + tc.r).cumprod()
        eq.index = tc.exit
        sleeves.append(eq.groupby(eq.index.ceil("D")).last().reindex(days).ffill().fillna(1.0))
    port = pd.concat(sleeves, axis=1).mean(axis=1)
    daily = port.pct_change().dropna()
    bh = {}
    for coin, g in df.groupby("coin"):
        g = g.sort_values("ts")
        bh[coin] = float(g.close.iloc[-1] / g.close.iloc[0] - 1)
    return {
        "trades": int(len(t)), "win_rate": float((t.r > 0).mean()),
        "avg_trade_after_fees": float(t.r.mean()),
        "avg_trade_before_fees": float(t.r.mean() + 2 * FEE),
        "total_return": float(port.iloc[-1] - 1), "max_drawdown": max_drawdown(port),
        "sharpe_daily_annualised": float(daily.mean() / daily.std() * np.sqrt(365)) if daily.std() > 0 else 0.0,
        "buy_and_hold": bh, "buy_and_hold_equal_weight": float(np.mean(list(bh.values()))),
        "equity_daily": [{"t": d.strftime("%Y-%m-%d"), "v": round(float(v), 5)} for d, v in port.items()],
    }


def evaluate(oos: pd.DataFrame, h: int) -> dict:
    t = oos[oos.y.notna()]
    y, p = t.y.to_numpy(), t.p.to_numpy()
    conf = t[(t.p > UP_THRESHOLD) | (t.p < DOWN_THRESHOLD)]
    acc_by = lambda col: {str(k): {"acc": float(((g.p > .5) == g.y).mean()), "n": int(len(g))}
                          for k, g in t.groupby(col)}
    return {
        "horizon": f"{h}h", "oos_start": str(t.ts.min()), "oos_end": str(t.ts.max()),
        "oos_n": int(len(t)), "flat_excluded": int(oos.y.isna().sum()),
        "accuracy": float(((p > 0.5) == y).mean()),
        "brier": brier(p, y),
        "baselines": {
            "coin_flip": {"accuracy": 0.5, "brier": 0.25},
            "always_up": {"accuracy": float(y.mean())},
            "same_as_last_candle": {"accuracy": float(((t.ret_1 > 0).astype(float).to_numpy() == y).mean())},
            "base_rate_brier": brier(np.full_like(y, y.mean()), y),
        },
        "calls": {"n": int(len(conf)), "share": float(len(conf) / len(t)),
                  "accuracy": float(((conf.p > 0.5) == conf.y).mean()) if len(conf) else None,
                  "up_n": int((conf.p > UP_THRESHOLD).sum()), "down_n": int((conf.p < DOWN_THRESHOLD).sum())},
        "accuracy_by_month": acc_by("fold"),
        "accuracy_by_coin": acc_by("coin"),
        "calibration": calibration_bins(p, y),
        "pnl_long_short": simulate(oos, h),
        "pnl_up_only": simulate(oos, h, up_only=True),
    }


def main(publish: bool = False):
    data = load_all()
    stamp = datetime.now(timezone.utc)
    version = "lgbm-" + stamp.strftime("%Y%m%d-%H%M")
    metrics = {"model_version": version, "trained_at": stamp.isoformat(), "features": FEATURES,
               "params": PARAMS, "fee_per_side": FEE, "horizons": {}}
    for name, h in HORIZONS.items():
        print(f"walk-forward {name}")
        ev = evaluate(walk_forward(data, h), h)
        print(f"  {name}: OOS acc {ev['accuracy']:.4f} (n={ev['oos_n']}), brier {ev['brier']:.4f}")
        if ev["accuracy"] > LEAK_GATE:
            sys.exit(f"QUALITY GATE FAILED: {name} OOS accuracy {ev['accuracy']:.3f} > {LEAK_GATE}. "
                     "Assume leakage. Nothing saved or published.")
        d = add_labels(data, h)
        final = fit(d[d.y.notna()], version)
        imp = pd.Series(final.booster.booster_.feature_importance("gain"), index=FEATURES)
        ev["feature_importance"] = (imp / imp.sum()).sort_values(ascending=False).round(4).to_dict()
        metrics["horizons"][name] = ev
        with open(MODELS / f"model_{name}.pkl", "wb") as fh:
            pickle.dump(final, fh)
    (MODELS / "metrics.json").write_text(json.dumps(metrics, indent=1, default=str))
    print("saved", MODELS / "metrics.json")
    if publish:
        rows = []
        for name, ev in metrics["horizons"].items():
            rows.append({
                "model_version": f"{version}-{name}", "trained_at": metrics["trained_at"],
                "oos_accuracy": ev["accuracy"], "oos_n": ev["oos_n"], "brier": ev["brier"],
                "baseline_accuracy": {k: v.get("accuracy") for k, v in ev["baselines"].items() if isinstance(v, dict)},
                "calibration": ev["calibration"], "feature_importance": ev["feature_importance"],
                "backtest_equity": {"long_short": ev["pnl_long_short"].get("equity_daily", []),
                                    "up_only": ev["pnl_up_only"].get("equity_daily", [])},
                "details": {k: v for k, v in ev.items() if k not in ("calibration", "feature_importance")}
                | {"pnl_long_short": {k: v for k, v in ev["pnl_long_short"].items() if k != "equity_daily"},
                   "pnl_up_only": {k: v for k, v in ev["pnl_up_only"].items() if k != "equity_daily"}},
            })
        db.insert("model_runs", json.loads(json.dumps(rows, default=str)), on_conflict="model_version")
        db.log_run("retrain", "ok", detail=version)
        print("published", [r["model_version"] for r in rows])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--publish", action="store_true")
    main(ap.parse_args().publish)
