"""Tamper evidence: canonical prediction serialisation (scheme hopium-pred-v1) and the hash chain.

Canonical text = JSON, keys sorted, no whitespace, every value a string or null:
  numbers    -> fixed 12-decimal string with trailing zeros (and a trailing '.') removed, e.g. 0.16, 70123.45, -0.0013
  timestamps -> 'YYYY-MM-DDTHH:MM:SS.ffffffZ' (input must be UTC: 'Z' or '+00:00')
  text       -> as is
payload_hash = sha256(canonical, utf-8) hex.  chain_hash = sha256(prev_hash_hex + payload_hash_hex) hex, prev of #1 = 64 zeros.
The database recomputes payload_hash and assigns seq/prev_hash/chain_hash itself (migration 20261105100000).
Grading columns are NOT in the payload (they are set later); grades are re-derivable from public candles.

python -m hopium.commit     # commit every prediction that has no commitment yet, oldest id first
"""
from __future__ import annotations

import hashlib
import json
import re
import sys

SCHEME = "hopium-pred-v1"
FIELDS = ("id", "coin", "horizon", "signal", "prob_up", "p_big_up", "p_big_down", "score", "threshold", "k",
          "price_at_call", "candle_close_time", "target_time", "inserted_at", "model_version", "provenance",
          "job_started_at", "input_cutoff_at", "generated_at", "run_id", "late_rule")
TIME_FIELDS = {"candle_close_time", "target_time", "inserted_at", "job_started_at", "input_cutoff_at", "generated_at"}
ZERO = "0" * 64
_TS = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|\+00:00|\+00)$")


def fmt_num(x) -> str:
    if isinstance(x, bool):
        raise ValueError("bool is not a number")
    s = format(float(x), ".12f").rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def fmt_ts(s: str) -> str:
    m = _TS.match(str(s))
    if not m:
        raise ValueError(f"not a UTC timestamp: {s!r}")
    return f"{m[1]}T{m[2]}.{(m[3] or '').ljust(6, '0')}Z"


def canonical(row: dict) -> str:
    out = {}
    for f in FIELDS:
        v = row.get(f)
        if v is None:
            out[f] = None
        elif f in TIME_FIELDS:
            out[f] = fmt_ts(v)
        elif isinstance(v, (int, float)) and f != "id":
            out[f] = fmt_num(v)
        else:
            out[f] = str(v)
    return json.dumps(out, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def link(prev_hash: str, payload_hash: str) -> str:
    return sha256(prev_hash + payload_hash)


def verify_chain(commitments: list[dict], predictions: dict[int, dict] | None = None) -> list[str]:
    """Returns a list of problems (empty = chain verifies). Checks seq gaps, links, payload hashes and,
    when the public prediction rows are given, that each canonical text re-derives from the row."""
    errs, prev = [], ZERO
    for i, c in enumerate(sorted(commitments, key=lambda c: c["seq"])):
        if c["seq"] != i + 1:
            errs.append(f"seq gap at {c['seq']}")
        if sha256(c["canonical"]) != c["payload_hash"]:
            errs.append(f"seq {c['seq']}: payload_hash mismatch")
        if c["prev_hash"] != prev or link(prev, c["payload_hash"]) != c["chain_hash"]:
            errs.append(f"seq {c['seq']}: chain link broken")
        if predictions is not None:
            p = predictions.get(c["prediction_id"])
            if p is None:
                errs.append(f"seq {c['seq']}: prediction {c['prediction_id']} missing")
            elif canonical(p) != c["canonical"]:
                errs.append(f"seq {c['seq']}: prediction {c['prediction_id']} differs from its committed payload")
        prev = c["chain_hash"]
    return errs


def main() -> int:
    from . import db
    try:
        db.select("commitments", {"select": "seq", "limit": "1"})
    except Exception as e:
        print("commitments table not available (migration 20261105100000 not applied?); skipping:", str(e)[:200])
        return 0
    done = {c["prediction_id"] for c in db.select("commitments", {"select": "prediction_id"})}
    rows = db.select("predictions", {"select": ",".join(FIELDS), "order": "id.asc"})
    todo = [r for r in rows if r["id"] not in done]
    for r in todo:
        text = canonical(r)
        db.insert("commitments", [{"prediction_id": r["id"], "scheme": SCHEME, "canonical": text,
                                   "payload_hash": sha256(text), "prev_hash": ZERO, "chain_hash": ZERO}],
                  on_conflict="prediction_id")
    print(f"committed {len(todo)} predictions ({len(done)} already committed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
