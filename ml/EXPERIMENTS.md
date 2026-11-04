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
