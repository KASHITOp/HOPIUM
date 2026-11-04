# HOPIUM engine results

**Live model:** `v3-12h-logreg-20261104` &nbsp; **Public label (rule C):** Does not beat trading fees in testing.

## The short version

1. The old model (v2) predicted any up/down move. It was right 52.8% of the time on the 1h horizon, but its
   average edge (+0.013% per trade before fees) was about 15x smaller than the 0.2% round-trip fee. Trading it
   lost 92.6% in simulation.
2. v3 predicts only moves big enough to pay for fees (more than +k or less than -k) and picks trade thresholds
   on net profit after fees. **39 configurations** were tried in nested walk-forward on the dev period
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
|---|---|---|---|---|---|---|---|---|---|
| Old v2 1h (any move, p>0.58) | 4136 | 39% | n/a | -0.187% | -92.6% | n/a | n/a | -5.75 | 92.7% |
| Walk-forward `a2dedaa2` 12h, k=1.0%, logreg, long+short | 988 | 50% | +2.25% / -1.83% | +0.203% | +91.0% | +128.7% | +173.9% | 1.27 (0.02 to 2.50) | 23.1% |
| Walk-forward `cd7a3978` 1h, k=0.5%, lgbm, long+short | 237 | 60% | +1.21% / -1.22% | +0.246% | +21.7% | +27.0% | +32.7% | 1.46 (0.26 to 2.84) | 7.0% |
| Walk-forward `4fdaac82` 1h, k=1.0%, lgbm, long+short | 89 | 56% | +1.28% / -1.24% | +0.178% | +5.1% | +6.8% | +8.5% | 0.74 (-0.64 to 1.84) | 3.7% |
| **FINAL HOLDOUT** `a2dedaa2` (2026-05-01 to 2026-11-03) | 0 | n/a | n/a / n/a | n/a | +0.0% | +0.0% | +0.0% | n/a | n/a |

Holdout: 13452 coin-hours scored, threshold chosen on inner validation = **None** (none
profitable), so 0 trades. Win rate, Sharpe and drawdown are undefined with zero trades.

## Chosen config in detail (walk-forward)

Selection rule, fixed in advance: highest net P&L after 0.2% fees among configs with at least 150 trades,
positive in at least 2 of 3 coins and in the majority of calendar years (12 of 39 qualified).

- Config: `a2dedaa2` 12h, k=1.0%, logreg, long+short, features: base, flow, mtf, volreg, cross, cal, fund
- Trades 988, win rate 49.8%, average win +2.25%, average loss -1.83%
- Gross edge per trade +0.403%, net after 0.2% fees +0.203%
- Long share of trades: 69%
- Months with trades that were positive: 10/16; best month = 33% of total profit
- Big-move direction accuracy: 54.0% (n = 24273); leakage gate (> 65%) passed

| Coin | Trades | Sum of net trade returns |
|---|---|---|
| BTC | 240 | -8.8% |
| ETH | 342 | +79.6% |
| SOL | 406 | +130.2% |

| Year | Trades | Sum of net trade returns |
|---|---|---|
| 2024 | 71 | +55.6% |
| 2025 | 913 | +149.8% |
| 2026 | 4 | -4.4% |

**Where the profit came from:** ETH and SOL. BTC lost money. Almost all trades and profit fall in Dec 2024 to
Sep 2025; from Oct 2025 the monthly results turned negative and from Jan 2026 the model mostly refused to trade.
The same family failed when changed slightly: long-only lost 36%, the logreg+LightGBM ensemble lost 53%, and a
regime filter lost 31%. A real but fragile, regime-dependent edge, not a robust one.

| Test month | Threshold (chosen on inner validation) | Trades | Sum of net returns |
|---|---|---|---|
| 2024-09 | 0.35 | 2 | +7.0% |
| 2024-10 | 0.5 | 0 | +0.0% |
| 2024-11 | 0.4 | 4 | +8.8% |
| 2024-12 | 0.16 | 65 | +39.8% |
| 2025-01 | 0.16 | 64 | +36.5% |
| 2025-02 | 0.2 | 56 | +35.6% |
| 2025-03 | 0.16 | 66 | +24.9% |
| 2025-04 | 0.2 | 38 | +66.2% |
| 2025-05 | 0.06 | 145 | -9.6% |
| 2025-06 | 0.0 | 180 | -12.5% |
| 2025-07 | 0.04 | 149 | +29.0% |
| 2025-08 | 0.13 | 66 | +4.8% |
| 2025-09 | 0.16 | 32 | +6.9% |
| 2025-10 | 0.16 | 48 | -14.8% |
| 2025-11 | 0.16 | 68 | -14.5% |
| 2025-12 | 0.4 | 1 | -2.7% |
| 2026-01 | none profitable | 0 | +0.0% |
| 2026-02 | none profitable | 0 | +0.0% |
| 2026-03 | none profitable | 0 | +0.0% |
| 2026-04 | 0.2 | 4 | -4.4% |

## The live model

`v3-12h-logreg-20261104` is the chosen config retrained on all data through 2026-11-03 19:00 UTC. Its
threshold (0.16) comes from inner validation (last 90 days). Those 90 days sit inside the holdout window, so
this threshold is **not** a holdout result and says nothing about future profit. The live track record on the site
is the real test.

## Method (anti-overfitting)

- Final holdout (label windows reaching 2026-05-01 or later) excluded in code and evaluated exactly once
  (`research/HOLDOUT_USED.json`).
- Outer walk-forward: 20 test months; training ends (h + 25) hours before each test month.
- Thresholds, regime cells and hyperparameters chosen on the last 90 days of each training window only.
- Every config run is logged in `EXPERIMENTS.md` and `research/results.jsonl`: 39 in total.
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
