# HOPIUM engine experiments

Every configuration ever run is logged here automatically by `research/harness.py` (full JSON in
`research/results.jsonl`), failures included. Numbers are nested walk-forward results on the DEV period
(test months 2024-09 to 2026-04). The final holdout (2026-05-01 onwards) is excluded in code and is
evaluated once, for one config, by `research/holdout.py`.

Columns: `net/trade` = mean return per trade after 0.2% round-trip fees. `total` = compounded return of
an equal-weight portfolio of one sleeve per coin. `big-move dir acc` = direction accuracy of the score on
rows whose move exceeded k (leakage gate: > 65% fails).

## Walk-forward log (dev period only, holdout untouched)

| key | h | k | model | features | sides | regime | tuned | trades | net/trade @0.2% | total @0.20% | @0.15% | @0.10% | Sharpe | big-move dir acc | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cd7a3978 | 1h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 237 | +0.2% | +21.7% | +27.0% | +32.7% | 1.46 | 53.3% | stage1 grid |
| 130e1da5 | 1h | 0.3% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 241 | +0.0% | +1.8% | +5.9% | +10.3% | 0.19 | 53.1% | stage1 grid |
| eea78b96 | 4h | 0.3% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 503 | -0.1% | -17.4% | -10.2% | -2.4% | -0.69 | 53.9% | stage1 grid |
| 4fdaac82 | 1h | 1.0% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 89 | +0.2% | +5.1% | +6.8% | +8.5% | 0.74 | 54.0% | stage1 grid |
| 84e5863b | 4h | 1.0% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 667 | -0.0% | -11.3% | -0.9% | +11.0% | -0.24 | 53.7% | stage1 grid |
| 3158bc95 | 4h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 389 | -0.0% | -6.9% | -0.6% | +6.2% | -0.18 | 53.7% | stage1 grid |
| bac0b959 | 12h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 670 | -0.1% | -21.1% | -11.8% | -1.2% | -0.34 | 52.3% | stage1 grid |
| 6237dd3a | 12h | 0.3% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 779 | -0.0% | -19.1% | -7.6% | +5.5% | -0.24 | 52.2% | stage1 grid |
| 90f0a74e | 24h | 0.3% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 840 | -0.2% | -46.2% | -38.1% | -28.7% | -0.91 | 51.9% | stage1 grid |
| 57408c26 | 12h | 1.0% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 1000 | -0.1% | -34.0% | -22.7% | -9.5% | -0.69 | 52.9% | stage1 grid |
| c28f07e8 | 24h | 1.0% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 1030 | +0.0% | -2.5% | +16.0% | +37.9% | 0.15 | 52.0% | stage1 grid |
| 29a51ce0 | 24h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 1091 | -0.2% | -62.3% | -54.8% | -45.8% | -1.33 | 51.8% | stage1 grid |
