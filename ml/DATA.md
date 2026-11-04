# HOPIUM data decisions

## The rule

**The live model may only use features that the hourly GitHub Actions runner can fetch live, every hour.**
If a field cannot be fetched from a US runner at prediction time, it is not a model feature. A feature
that exists in training but is stale, missing or approximated in production is train/serve skew, and it
makes the backtest a lie.

## Sources

Reachability measured from a GitHub-hosted runner by `.github/workflows/probe.yml` (run #1, 2026-11-04):

| Source | Endpoint | From US runner | Used for |
|---|---|---|---|
| Binance spot 1h klines | `data-api.binance.vision/api/v3/klines` | **200** | **features, entry, exit, grading** (primary) |
| Binance spot 1h klines | `api.binance.com/api/v3/klines` | 451 | not used live |
| Binance USDⓈ-M futures | `fapi.binance.com` | 451 | not used |
| Bybit | `api.bybit.com` | 403 | not used |
| Deribit perpetual funding | `www.deribit.com/api/v2/public/get_funding_rate_history` | **200** | **live feature group `fund`** (hourly, history since 2019) |
| Kraken Futures | `futures.kraken.com` | **200** | allowed, not yet a feature (funding history only from 2025-10) |
| Coinbase Exchange candles | `api.exchange.coinbase.com` | **200** | candle fallback (history rebuild only) |
| Fear & Greed | `api.alternative.me/fng` | **200** | feature (previous UTC day's value) |
| Binance futures bulk archives | `data.binance.vision/data/futures/um/...` | n/a | research only (published with a delay) |

## Funding: Deribit, not Binance

Binance funding/OI are unreachable live, so v2 dropped them. Deribit's public funding endpoint answers from
the runner and has hourly history back years, so v3 uses it (`funding_1h`, `funding_24h`, `funding_z`).
Each Deribit row is stamped at the END of its funding hour, so it is joined at that time or later only.
Open interest has no public history on Deribit or Kraken, so OI remains out. Top future upgrade: an
always-on collector (e.g. a Mumbai-region edge function) that records Binance funding/OI every hour
so a history builds up.

## Why Binance funding rate and open interest are not features

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
