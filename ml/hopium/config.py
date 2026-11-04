"""Shared constants. Grading/label thresholds here must match supabase/schema.sql and web/lib/grading.ts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # /ml
DATA = ROOT / "data"
MODELS = ROOT / "models"
DATA.mkdir(exist_ok=True)
MODELS.mkdir(exist_ok=True)

COINS = ["BTC", "ETH", "SOL"]
HORIZONS = {"1h": 1, "4h": 4}

FLAT_THRESHOLD = 0.001      # |move| < 0.1% => FLAT (excluded from training and from hit rate)
UP_THRESHOLD = 0.58         # prob_up > 0.58 => UP
DOWN_THRESHOLD = 0.42       # prob_up < 0.42 => DOWN, otherwise NO_CALL
FEE = 0.001                 # 0.1% per side
MAX_LATE_MINUTES = 20       # predictions inserted later than this after candle close are skipped
HISTORY_DAYS = 3 * 365 + 60

# Price source for features, entry, exit and grading: Binance spot 1h candle close.
BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"]
COINBASE = "https://api.exchange.coinbase.com"   # history fallback only, never used for live calls or grading
FUTURES_ARCHIVE = "https://data.binance.vision/data/futures/um"  # research only (see DATA.md)
