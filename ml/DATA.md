# HOPIUM data decisions

## The rule

**The live model may only use features that the hourly GitHub Actions runner can fetch live, every hour.**
If a field cannot be fetched from a US runner at prediction time, it is not a model feature. A feature
that exists in training but is stale, missing or approximated in production is train/serve skew, and it
makes the backtest a lie.

## Sources

| Source | Endpoint | Reachable from US runners | Used for |
|---|---|---|---|
| Binance spot 1h klines | `data-api.binance.vision/api/v3/klines` | yes (public market-data mirror) | **features, entry, exit, grading** |
| Binance spot 1h klines | `api.binance.com/api/v3/klines` | no (HTTP 451 "restricted location") | second host only, tried after the mirror |
| Coinbase Exchange candles | `api.exchange.coinbase.com/products/{COIN}-USD/candles` | yes | **history fallback only** (see below) |
| Fear & Greed | `api.alternative.me/fng` | yes | feature (previous UTC day's value) |
| Binance USDⓈ-M futures REST (funding, OI) | `fapi.binance.com` | no (geo-blocked) | not used |
| Bybit public API | `api.bybit.com` | no (CloudFront geo-block) | not used |
| Binance futures bulk archives | `data.binance.vision/data/futures/um/...` | yes, but published with a delay (daily files about a day late, funding monthly) | **research only** |

## Why funding rate and open interest are not features

Both were in the first model version, pulled from the bulk archives with an artificial publication lag
(OI lagged 48h, funding = previous calendar month). That kept training honest, but the values were stale
by the time the model used them, and the live runner would have depended on archive files landing on
time. Under the rule above they are out. Removing them changed walk-forward accuracy by less than 0.3
percentage points on the 1h model; they were not carrying the model.

## Price source, exactly

- Every price the model sees or is graded on is a **Binance spot 1h candle close** (USDT pairs).
- **Entry** = close of the last fully closed candle at prediction time (the candle that closes at
  `candle_close_time`, e.g. the 13:00 to 14:00 candle for a 14:00:00 UTC prediction).
- **Exit** = close of the candle that ends at `target_time`.
- **Move** = (exit - entry) / entry. |move| < 0.1% is FLAT. Same definition in training labels
  (`hopium/grading.py`), the database (`outcome_matches_move` constraint) and the site.
- The website's live WebSocket price is display-only and never touches grading.

## Coinbase fallback

Coinbase candles are USD pairs, not USDT, so prices differ slightly (USDT basis). They are used only to
rebuild the parquet history if Binance is unreachable during a retrain. Live predictions and grading
never use them: if Binance is down, the hour is logged as an error or the grade waits.

## Storage

- `ml/data/*.parquet`: raw hourly candles (3+ years) and the Fear & Greed history. Gitignored.
- Supabase `candles_cache`: last 90 days of 1h candles for the site's charts and the lab, refreshed hourly.
