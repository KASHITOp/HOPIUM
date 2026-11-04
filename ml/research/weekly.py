"""Weekly retrain for the live engine: refresh data, re-run the chosen config's walk-forward (dev period only,
holdout stays excluded), enforce the leakage gate, rebuild the live bundle.

python -m research.weekly
"""
import json
import sys
import warnings

warnings.filterwarnings("ignore")
import pandas as pd  # noqa: E402

from hopium import deribit, fetch  # noqa: E402
from hopium.config import COINS, DATA, MODELS  # noqa: E402
from research import harness, ship  # noqa: E402


def main() -> int:
    key = json.loads((MODELS / "engine_v3.json").read_text())["walk_forward"]["key"]
    fetch.run()
    start = pd.Timestamp("2023-09-01", tz="UTC")
    for c in COINS:
        deribit.funding(c, start).to_parquet(DATA / f"deribit_funding_{c}.parquet", index=False)
    (DATA / "feat_v3.parquet").unlink(missing_ok=True)
    rows = [json.loads(l) for l in open(harness.EXP_JSONL)]
    cfg_d = [r for r in rows if r["key"] == key][-1]["config"] | {"note": "weekly retrain check"}
    cfg = harness.Config(**{k: (tuple(v) if k == "groups" else v) for k, v in cfg_d.items()})
    res = harness.run(cfg)
    if "LEAK_GATE" in res:
        sys.exit(res["LEAK_GATE"])
    ship.main(cfg.key())
    return 0


if __name__ == "__main__":
    sys.exit(main())
