"""Research harness for the 3-class "move big enough to pay fees" engine.

Protocol (fixed before any experiment was run):
  * FINAL HOLDOUT = every row whose label window reaches 2026-05-01 00:00 UTC or later. dev_frame() drops
    those rows; nothing in this file can see them. research/holdout.py evaluates ONE config, ONCE.
  * Outer walk-forward: test months 2024-09 .. 2026-04 (20 folds). Train on everything before the test month
    minus an embargo of (h + 25) hours so no training label overlaps the test month.
  * Inner validation (nested): the last 90 days of each outer training window. A model fit on the data before
    that (again embargoed) picks the trade threshold, the regime filter and any hyperparameters. The outer
    test month is never used to choose anything.
  * Trades: per coin, non-overlapping, held exactly h hours (entry = close at call, exit = close at target).
    Selection objective = net P&L after 0.2% round trip. Results also reported at 0.15% and 0.10%.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from hopium.config import COINS, DATA, ROOT
from hopium.features import add_labels
from hopium.features_v3 import GROUPS, build_v3
from hopium.model import EngineModel

HOLDOUT_START = pd.Timestamp("2026-05-01", tz="UTC")
TEST_MONTHS = pd.period_range("2024-09", "2026-04", freq="M")
FEES = {"0.20%": 0.002, "0.15%": 0.0015, "0.10%": 0.001}
SELECT_FEE = 0.002
INNER_DAYS = 90
T_GRID = [0.0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.13, 0.16, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50]
MIN_VAL_TRADES = 15
EXP_MD = ROOT / "EXPERIMENTS.md"
EXP_JSONL = ROOT / "research" / "results.jsonl"


@dataclass
class Config:
    h: int = 4
    k: float = 0.005
    model: str = "lgbm"                 # lgbm | logreg | ensemble
    groups: tuple = ("base", "flow", "mtf", "volreg", "cross", "cal", "fund")
    sides: str = "long_short"           # long_short | long_only
    regime: bool = False                # pick tradable regime cells on inner validation
    tune: bool = False                  # nested hyperparameter choice on inner validation
    lgbm: dict = field(default_factory=lambda: dict(num_leaves=15, min_child_samples=300))
    note: str = ""

    def features(self):
        return [f for g in self.groups for f in GROUPS[g]]

    def key(self):
        d = asdict(self)
        d.pop("note")
        return hashlib.sha1(json.dumps(d, sort_keys=True).encode()).hexdigest()[:8]


# ----------------------------------------------------------------------------- data
_FEAT = None


def feature_frame() -> pd.DataFrame:
    global _FEAT
    if _FEAT is None:
        p = DATA / "feat_v3.parquet"
        if p.exists():
            _FEAT = pd.read_parquet(p)
        else:
            load = lambda n: pd.read_parquet(DATA / f"{n}.parquet")
            candles = {c: load(f"candles_{c}") for c in COINS}
            funding = {c: load(f"deribit_funding_{c}") for c in COINS}
            _FEAT = build_v3(candles, load("fng"), funding)
            _FEAT.to_parquet(p, index=False)
    return _FEAT


def dev_frame(h: int) -> pd.DataFrame:
    """Labelled rows whose label window ends strictly before the holdout. The holdout is invisible here."""
    d = add_labels(feature_frame(), h).dropna(subset=["fwd_move"])
    return d[d.ts + pd.Timedelta(hours=h + 1) < HOLDOUT_START].reset_index(drop=True)


def label3(move: np.ndarray, k: float) -> np.ndarray:
    """0 = BIG_DOWN (move < -k), 1 = NOTHING, 2 = BIG_UP (move > +k). Mirrors hopium/grading.py v3."""
    return np.where(move > k, 2, np.where(move < -k, 0, 1))


# ----------------------------------------------------------------------------- models
def fit_model(cfg: Config, train: pd.DataFrame, lgbm_params=None) -> EngineModel:
    X, y = train[cfg.features()], label3(train.fwd_move.to_numpy(), cfg.k)
    return EngineModel(cfg.model, lgbm_params or cfg.lgbm).fit(X, y)


def fit_predict(cfg: Config, train: pd.DataFrame, test: pd.DataFrame, lgbm_params=None) -> np.ndarray:
    """columns: P(BIG_DOWN), P(NOTHING), P(BIG_UP)"""
    return fit_model(cfg, train, lgbm_params).predict_proba(test[cfg.features()])


# ----------------------------------------------------------------------------- trading
def regime_cell(df: pd.DataFrame) -> np.ndarray:
    """6 cells: volatility tercile (rvol_pct) x trend sign (trend_1d)."""
    v = np.digitize(df.rvol_pct.fillna(0.5).to_numpy(), [1 / 3, 2 / 3])
    t = (df.trend_1d.fillna(0).to_numpy() > 0).astype(int)
    return v * 2 + t


def trades(df: pd.DataFrame, score: np.ndarray, h: int, t: float | None, sides: str,
           cells: set | None = None) -> pd.DataFrame:
    """Non-overlapping trades per coin. score = P(BIG_UP) - P(BIG_DOWN). Gross move per trade; fees applied later."""
    if t is None:
        return pd.DataFrame(columns=["coin", "ts", "side", "move"])
    cell = regime_cell(df)
    rows = []
    for coin in df.coin.unique():
        idx = np.where(df.coin.to_numpy() == coin)[0]
        idx = idx[np.argsort(df.ts.to_numpy()[idx])]
        busy = None
        for i in idx:
            ts = df.ts.iat[i]
            if busy is not None and ts < busy:
                continue
            s = score[i]
            side = 1 if s > t else (-1 if (s < -t and sides == "long_short") else 0)
            if side and (cells is None or cell[i] in cells):
                rows.append((coin, ts, side, side * df.fwd_move.iat[i]))
                busy = ts + pd.Timedelta(hours=h)
    return pd.DataFrame(rows, columns=["coin", "ts", "side", "move"])


def choose(df_val: pd.DataFrame, score: np.ndarray, cfg: Config):
    """Pick threshold (and regime cells) on INNER validation only. Returns (t, cells) or (None, None)."""
    best = (0.0, None, None)    # must beat zero net P&L to trade at all
    for t in T_GRID:
        tr = trades(df_val, score, cfg.h, t, cfg.sides)
        if len(tr) < MIN_VAL_TRADES:
            continue
        cells = None
        if cfg.regime:
            cell_of = dict(zip(zip(df_val.coin, df_val.ts), regime_cell(df_val)))
            tr["cell"] = [cell_of[(c, s)] for c, s in zip(tr.coin, tr.ts)]
            g = tr.groupby("cell").move.agg(["sum", "count"])
            g["net"] = g["sum"] - SELECT_FEE * g["count"]
            cells = set(g[(g.net > 0) & (g["count"] >= 5)].index)
            if not cells:
                continue
            tr = tr[tr.cell.isin(cells)]
        net = float((tr.move - SELECT_FEE).sum())
        if net > best[0]:
            best = (net, t, cells)
    return best[1], best[2]


# ----------------------------------------------------------------------------- metrics
def portfolio(tr: pd.DataFrame, fee: float, start, end) -> pd.Series:
    """Equal-weight sleeves per coin, each compounding its own trades; daily equity."""
    days = pd.date_range(pd.Timestamp(start).normalize(), pd.Timestamp(end).normalize(), freq="D")
    sleeves = []
    for coin in COINS:
        t = tr[tr.coin == coin].sort_values("ts")
        if t.empty:
            sleeves.append(pd.Series(1.0, index=days))
            continue
        eq = (1 + t.move - fee).cumprod()
        eq.index = t.ts.dt.ceil("D")
        sleeves.append(eq.groupby(level=0).last().reindex(days).ffill().fillna(1.0))
    return pd.concat(sleeves, axis=1).mean(axis=1)


def sharpe_ci(eq: pd.Series, n_boot=1000, block=20, seed=0):
    r = eq.pct_change().dropna().to_numpy()
    if len(r) < 30 or r.std() == 0:
        return 0.0, (0.0, 0.0)
    sh = lambda x: x.mean() / x.std() * np.sqrt(365) if x.std() > 0 else 0.0
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(len(r) / block))
    boots = []
    for _ in range(n_boot):
        starts = rng.integers(0, len(r) - block, nb)
        boots.append(sh(np.concatenate([r[s:s + block] for s in starts])[:len(r)]))
    return float(sh(r)), (float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5)))


def summarize(tr: pd.DataFrame, start, end) -> dict:
    out = {"trades": int(len(tr))}
    if tr.empty:
        return out | {f"net_{k}": 0.0 for k in FEES}
    for name, fee in FEES.items():
        eq = portfolio(tr, fee, start, end)
        out[f"net_{name}"] = float(eq.iloc[-1] - 1)
        if fee == SELECT_FEE:
            net = tr.move - fee
            sh, ci = sharpe_ci(eq)
            out |= {
                "mean_net_trade": float(net.mean()), "mean_gross_trade": float(tr.move.mean()),
                "win_rate": float((net > 0).mean()), "avg_win": float(net[net > 0].mean()) if (net > 0).any() else 0.0,
                "avg_loss": float(net[net <= 0].mean()) if (net <= 0).any() else 0.0,
                "sharpe": sh, "sharpe_ci95": ci, "max_dd": float((1 - eq / eq.cummax()).max()),
                "long_share": float((tr.side > 0).mean()),
                "per_coin": {c: {"n": int((tr.coin == c).sum()), "net_sum": float(net[tr.coin == c].sum())} for c in COINS},
                "per_year": {str(y): {"n": int(len(g)), "net_sum": float((g.move - fee).sum())}
                             for y, g in tr.groupby(tr.ts.dt.year)},
            }
            m = (tr.move - fee).groupby(tr.ts.dt.to_period("M")).sum()
            tot = float(m.sum())
            out["best_month_share_of_profit"] = float(m.max() / tot) if tot > 0 else None
            out["months_positive"] = f"{int((m > 0).sum())}/{len(m)}"
    return out


# ----------------------------------------------------------------------------- walk-forward
TUNE_GRID = [dict(num_leaves=7, min_child_samples=600), dict(num_leaves=15, min_child_samples=300),
             dict(num_leaves=31, min_child_samples=150)]


def run(cfg: Config, log: bool = True) -> dict:
    t0 = time.time()
    d = dev_frame(cfg.h)
    emb = pd.Timedelta(hours=cfg.h + 25)
    all_tr, dir_hits, dir_n, folds = [], 0, 0, []
    for m in TEST_MONTHS:
        start, end = m.start_time.tz_localize("UTC"), (m + 1).start_time.tz_localize("UTC")
        test = d[(d.ts >= start) & (d.ts < end)]
        train = d[d.ts < start - emb]
        val_start = train.ts.max() - pd.Timedelta(days=INNER_DAYS)
        val = train[train.ts >= val_start]
        inner = train[train.ts < val_start - emb]
        # nested choices on inner validation
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
        # outer model on the full window, applied to the unseen month
        pt = fit_predict(cfg, train, test, params)
        score = pt[:, 2] - pt[:, 0]
        tr = trades(test, score, cfg.h, t, cfg.sides, cells)
        all_tr.append(tr)
        big = np.abs(test.fwd_move.to_numpy()) > cfg.k
        dir_hits += int(((score > 0) == (test.fwd_move.to_numpy() > 0))[big].sum())
        dir_n += int(big.sum())
        folds.append({"month": str(m), "t": t, "cells": sorted(cells) if cells else None, "trades": len(tr),
                      "net_sum": float((tr.move - SELECT_FEE).sum()) if len(tr) else 0.0})
    tr = pd.concat([x for x in all_tr if len(x)] or [all_tr[0]], ignore_index=True)
    tr["ts"] = pd.to_datetime(tr.ts, utc=True)
    tr["move"] = tr.move.astype(float)
    res = {"key": cfg.key(), "config": asdict(cfg), "dev_period": f"{TEST_MONTHS[0]}..{TEST_MONTHS[-1]}",
           "big_move_direction_acc": dir_hits / dir_n if dir_n else None, "big_move_n": dir_n,
           "folds_trading": sum(f["trades"] > 0 for f in folds), "folds": folds,
           "secs": round(time.time() - t0)} | summarize(tr, TEST_MONTHS[0].start_time.tz_localize("UTC"),
                                                         (TEST_MONTHS[-1] + 1).start_time.tz_localize("UTC"))
    if res["big_move_direction_acc"] and res["big_move_direction_acc"] > 0.65:
        res["LEAK_GATE"] = "FAILED: big-move direction accuracy > 65%, assume leakage"
    if log:
        record(res)
    return res


def record(res: dict):
    EXP_JSONL.parent.mkdir(exist_ok=True)
    with open(EXP_JSONL, "a") as fh:
        fh.write(json.dumps(res, default=str) + "\n")
    c = res["config"]
    pct = lambda v: "n/a" if v is None else f"{v * 100:+.1f}%"
    line = (f"| {res['key']} | {c['h']}h | {c['k'] * 100:.1f}% | {c['model']} | {'+'.join(g[:4] for g in c['groups'])} | "
            f"{c['sides']} | {'Y' if c['regime'] else '-'} | {'Y' if c['tune'] else '-'} | {res['trades']} | "
            f"{pct(res.get('mean_net_trade'))} | {pct(res.get('net_0.20%'))} | {pct(res.get('net_0.15%'))} | "
            f"{pct(res.get('net_0.10%'))} | {res.get('sharpe', 0):.2f} | "
            f"{(res['big_move_direction_acc'] or 0) * 100:.1f}% | {c['note']} |\n")
    if not EXP_MD.exists() or "| key |" not in EXP_MD.read_text():
        with open(EXP_MD, "a") as fh:
            fh.write("\n## Walk-forward log (dev period only, holdout untouched)\n\n"
                     "| key | h | k | model | features | sides | regime | tuned | trades | net/trade @0.2% | "
                     "total @0.20% | @0.15% | @0.10% | Sharpe | big-move dir acc | note |\n"
                     "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n")
    with open(EXP_MD, "a") as fh:
        fh.write(line)
    print(line.strip(), f"({res['secs']}s)", flush=True)
