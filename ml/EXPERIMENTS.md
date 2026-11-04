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
| 7c7d420e | 1h | 0.5% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 492 | -0.0% | -9.4% | -1.7% | +7.2% | -0.37 | 53.0% | stage1 grid |
| 8ab7e780 | 1h | 0.3% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 559 | -0.0% | -1.7% | +8.7% | +20.6% | -0.01 | 52.6% | stage1 grid |
| 87b963fe | 4h | 0.3% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 763 | -0.1% | -13.8% | -0.3% | +15.6% | -0.30 | 52.3% | stage1 grid |
| db10b329 | 1h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 214 | +0.0% | +0.2% | +3.7% | +7.5% | 0.06 | 54.5% | stage1 grid |
| 4512b238 | 4h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 433 | -0.0% | -7.6% | -0.5% | +7.4% | -0.19 | 53.5% | stage1 grid |
| 6efa35e5 | 4h | 0.5% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 684 | -0.1% | -13.3% | -2.7% | +9.7% | -0.34 | 52.6% | stage1 grid |
| 819e42c1 | 12h | 0.5% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 1067 | +0.0% | -12.0% | +5.8% | +27.4% | -0.03 | 52.7% | stage1 grid |
| bd904b57 | 12h | 0.3% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 922 | -0.1% | -23.1% | -9.9% | +5.8% | -0.29 | 52.5% | stage1 grid |
| a2dedaa2 | 12h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 988 | +0.2% | +91.0% | +128.7% | +173.9% | 1.27 | 54.0% | stage1 grid |
| 37cbcdc4 | 24h | 0.3% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 436 | -0.0% | -13.0% | -6.3% | +0.9% | -0.11 | 51.1% | stage1 grid |
| 93535d29 | 24h | 0.5% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 535 | -0.2% | -39.5% | -33.8% | -27.6% | -0.87 | 51.1% | stage1 grid |
| 03224c30 | 24h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 648 | +0.0% | -11.8% | -2.0% | +8.9% | -0.13 | 51.7% | stage1 grid |
| d951cea9 | 12h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_short | Y | - | 1573 | -0.1% | -30.7% | -10.1% | +16.7% | -0.47 | 54.0% | stage2 A regime |
| 64b1ba87 | 12h | 1.0% | logreg | base+flow+mtf+volr+cros+cal | long_short | - | - | 920 | +0.1% | +42.8% | +68.3% | +98.6% | 0.80 | 54.2% | stage2 A no-funding |
| 24606ea3 | 12h | 1.0% | ensemble | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 1008 | -0.2% | -53.0% | -44.2% | -33.5% | -1.13 | 53.7% | stage2 A ensemble |
| 702604c7 | 12h | 1.0% | logreg | base+flow+mtf+volr+cros+cal+fund | long_only | - | - | 941 | -0.1% | -36.2% | -25.2% | -12.3% | -0.65 | 54.0% | stage2 A long-only |
| 438e9c0f | 12h | 1.0% | logreg | base+mtf+volr+cros+cal+fund | long_short | - | - | 948 | +0.1% | +35.9% | +61.3% | +91.5% | 0.72 | 54.2% | stage2 A no-flow |
| fa2533d3 | 1h | 0.5% | ensemble | base+flow+mtf+volr+cros+cal+fund | long_short | - | - | 456 | +0.1% | +8.5% | +17.8% | +28.3% | 0.45 | 53.1% | stage2 B ensemble |
| dfd76f0a | 1h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_short | Y | - | 523 | +0.0% | +4.3% | +14.1% | +25.1% | 0.27 | 53.3% | stage2 B regime |
| 6fa5c4d9 | 1h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal+fund | long_only | - | - | 241 | +0.2% | +16.4% | +21.3% | +26.5% | 1.21 | 53.3% | stage2 B long-only |
| 56ac49af | 1h | 0.5% | lgbm | base+flow+mtf+volr+cros+cal | long_short | - | - | 446 | +0.0% | +6.4% | +15.3% | +25.1% | 0.37 | 52.8% | stage2 B no-funding |
