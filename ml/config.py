"""Shared config for HOPIUM ML."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODELS = ROOT / "models"
DATA.mkdir(exist_ok=True)
MODELS.mkdir(exist_ok=True)

COINS = ["BTC", "ETH", "SOL"]
HORIZONS = [1, 4]          # hours
FLAT_THRESHOLD = 0.001     # |move| < 0.1% => flat (excluded from training/grading)
SIGNAL_THRESHOLD = 0.58    # prob above which we make a call
FEE = 0.001                # 0.1% per side
HISTORY_DAYS = 3 * 365 + 60

# Publication lags (hours) so training sees exactly what live inference sees.
# Binance futures REST is geo-blocked from US runners; we use the public
# data.binance.vision archives, which publish daily files ~1 day late and
# funding as monthly files.
OI_LAG_H = 48

# Hosts (spot REST mirror is not geo-blocked; futures archives are public)
SPOT_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"]
ARCHIVE = "https://data.binance.vision/data/futures/um"
