"""Generate ml/RESULTS.md from results.jsonl, holdout_result.json, engine_v3.json and v2 metrics."""
import json

from hopium.config import ROOT

R = {}
for line in open(ROOT / "research" / "results.jsonl"):
    r = json.loads(line)
    R[r["key"]] = r
hold = json.loads((ROOT / "research" / "holdout_result.json").read_text())
eng = json.loads((ROOT / "models" / "engine_v3.json").read_text())
v2 = json.loads((ROOT / "models" / "metrics.json").read_text())["horizons"]
TOP = ["a2dedaa2", "cd7a3978", "4fdaac82"]   # best config of each stage-1 family (h/k), by walk-forward net @0.2%
pct = lambda v, d=1: "n/a" if v is None else f"{v * 100:+.{d}f}%"


def row(name, r):
    ci = r.get("sharpe_ci95") or [None, None]
    sh = f"{r.get('sharpe', 0):.2f} ({ci[0]:.2f} to {ci[1]:.2f})" if ci[0] is not None else "n/a"
    return (f"| {name} | {r.get('trades', 0)} | {f"{r['win_rate'] * 100:.0f}%" if r.get('win_rate') is not None else 'n/a'} | "
            f"{pct(r.get('avg_win'), 2)} / {pct(r.get('avg_loss'), 2)} | {pct(r.get('mean_net_trade'), 3)} | "
            f"{pct(r.get('net_0.20%'))} | {pct(r.get('net_0.15%'))} | {pct(r.get('net_0.10%'))} | {sh} | "
            f"{f'{r[chr(109)+"ax_dd"] * 100:.1f}%' if r.get('max_dd') is not None else 'n/a'} |")


def desc(r):
    c = r["config"]
    return f"`{r['key']}` {c['h']}h, k={c['k'] * 100:.1f}%, {c['model']}, {c['sides'].replace('_', '+')}"


qual = [r for r in R.values() if r["trades"] >= 150
        and sum(v["net_sum"] > 0 for v in r.get("per_coin", {}).values()) >= 2
        and sum(v["net_sum"] > 0 for v in r.get("per_year", {}).values()) > len(r.get("per_year", {})) / 2]
win = R["a2dedaa2"]
L = []
L.append(f"""# HOPIUM engine results

**Live model:** `{eng['version']}` &nbsp; **Public label (rule {eng['label_code']}):** {eng['label']}

## The short version

1. The old model (v2) predicted any up/down move. It was right 52.8% of the time on the 1h horizon, but its
   average edge (+0.013% per trade before fees) was about 15x smaller than the 0.2% round-trip fee. Trading it
   lost 92.6% in simulation.
2. v3 predicts only moves big enough to pay for fees (more than +k or less than -k) and picks trade thresholds
   on net profit after fees. **{len(R)} configurations** were tried in nested walk-forward on the dev period
   (Sep 2024 to Apr 2026). The best one, a 12h logistic model with k = 1%, made +91.0% after 0.2% fees over 988
   trades. Its Sharpe confidence interval (0.02 to 2.50) barely clears zero, and with 39 configs tried some of that
   is selection luck.
3. **On the locked 6-month holdout (May to Nov 2026) it made 0 trades.** The threshold chosen on the 90 days
   before the holdout found nothing profitable, so the model sat out. Net P&L on the holdout: 0.0%. By the
   pre-agreed rule that is outcome C: **it does not beat trading fees in testing.**
4. The walk-forward edge was concentrated in Dec 2024 to Apr 2025 and faded through 2025. The model kept making
   forecasts, it just stopped finding trades worth the fees. We ship it as an honest forecaster with a public
   track record, not as a money printer.

## Comparison

Fees are per round trip. P&L columns are the compounded return of an equal-weight portfolio (one sleeve per coin),
non-overlapping trades held exactly h hours. Sharpe is annualised from daily returns with a 95% block-bootstrap
interval. Walk-forward rows cover test months 2024-09 to 2026-04; the old model's simulation covers 2024-09 to
2026-11 (it predates the holdout).

| Model | Trades | Win rate | Avg win / avg loss | Net per trade @0.2% | Net @0.20% | @0.15% | @0.10% | Sharpe (95% CI) | Max DD |
|---|---|---|---|---|---|---|---|---|---|""")
o = v2["1h"]["pnl_long_short"]
L.append(f"| Old v2 1h (any move, p>0.58) | {o['trades']} | {o['win_rate'] * 100:.0f}% | n/a | "
         f"{pct(o['avg_trade_after_fees'], 3)} | {pct(o['total_return'])} | n/a | n/a | {o['sharpe_daily_annualised']:.2f} | "
         f"{o['max_drawdown'] * 100:.1f}% |")
for k in TOP:
    L.append(row(f"Walk-forward {desc(R[k])}", R[k]))
L.append(row(f"**FINAL HOLDOUT** `a2dedaa2` (2026-05-01 to 2026-11-03)", hold) + "")
L.append(f"""
Holdout: {hold['rows']} coin-hours scored, threshold chosen on inner validation = **{hold['threshold']}** (none
profitable), so 0 trades. Win rate, Sharpe and drawdown are undefined with zero trades.

## Chosen config in detail (walk-forward)

Selection rule, fixed in advance: highest net P&L after 0.2% fees among configs with at least 150 trades,
positive in at least 2 of 3 coins and in the majority of calendar years ({len(qual)} of {len(R)} qualified).

- Config: {desc(win)}, features: {', '.join(win['config']['groups'])}
- Trades {win['trades']}, win rate {win['win_rate'] * 100:.1f}%, average win {pct(win['avg_win'], 2)}, average loss {pct(win['avg_loss'], 2)}
- Gross edge per trade {pct(win['mean_gross_trade'], 3)}, net after 0.2% fees {pct(win['mean_net_trade'], 3)}
- Long share of trades: {win['long_share'] * 100:.0f}%
- Months with trades that were positive: {win['months_positive']}; best month = {win['best_month_share_of_profit'] * 100:.0f}% of total profit
- Big-move direction accuracy: {win['big_move_direction_acc'] * 100:.1f}% (n = {win['big_move_n']}); leakage gate (> 65%) passed

| Coin | Trades | Sum of net trade returns |
|---|---|---|""")
for c, v in win["per_coin"].items():
    L.append(f"| {c} | {v['n']} | {pct(v['net_sum'])} |")
L.append("\n| Year | Trades | Sum of net trade returns |\n|---|---|---|")
for y, v in win["per_year"].items():
    L.append(f"| {y} | {v['n']} | {pct(v['net_sum'])} |")
L.append("""
**Where the profit came from:** ETH and SOL. BTC lost money. Almost all trades and profit fall in Dec 2024 to
Sep 2025; from Oct 2025 the monthly results turned negative and from Jan 2026 the model mostly refused to trade.
The same family failed when changed slightly: long-only lost 36%, the logreg+LightGBM ensemble lost 53%, and a
regime filter lost 31%. A real but fragile, regime-dependent edge, not a robust one.

| Test month | Threshold (chosen on inner validation) | Trades | Sum of net returns |
|---|---|---|---|""")
for f in win["folds"]:
    L.append(f"| {f['month']} | {f['t'] if f['t'] is not None else 'none profitable'} | {f['trades']} | {pct(f['net_sum'])} |")
L.append(f"""
## The live model

`{eng['version']}` is the chosen config retrained on all data through {eng['trained_through'][:16]} UTC. Its
threshold ({eng['threshold']}) comes from {eng['threshold_source']}. Those 90 days sit inside the holdout window, so
this threshold is **not** a holdout result and says nothing about future profit. The live track record on the site
is the real test.

## Method (anti-overfitting)

- Final holdout (label windows reaching 2026-05-01 or later) excluded in code and evaluated exactly once
  (`research/HOLDOUT_USED.json`).
- Outer walk-forward: 20 test months; training ends (h + 25) hours before each test month.
- Thresholds, regime cells and hyperparameters chosen on the last 90 days of each training window only.
- Every config run is logged in `EXPERIMENTS.md` and `research/results.jsonl`: {len(R)} in total.
- No-lookahead tests: perturbing future candles, order flow, funding or Fear & Greed leaves all past features
  bit-identical (`tests/`).

## Conclusions

- Retargeting to fee-sized moves raised the gross edge per trade from +0.013% to about +0.4% on the best config,
  enough to beat fees in 2024 and 2025 walk-forward testing.
- That edge did not survive into 2026. On the untouched holdout the model, following its own rules, made no trades.
- Lower fees matter: the same walk-forward trades return +129% at 0.15% and +174% at 0.10% round trip.
- Next upgrades most likely to help: a longer history of live derivatives data (an always-on collector for Binance
  funding/open interest), regime detection trained on more than one cycle, and a live track record long enough to
  judge.
""")
(ROOT / "RESULTS.md").write_text("\n".join(L))
print("wrote RESULTS.md")
