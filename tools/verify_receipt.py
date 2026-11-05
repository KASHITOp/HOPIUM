#!/usr/bin/env python3
"""Verify a HOPIUM receipt without credentials. Python 3.9+, standard library only.

    python3 tools/verify_receipt.py https://<site>/r/14/evidence        # or a downloaded bundle .json
    python3 tools/verify_receipt.py bundle.json --offline               # skip the Binance price check

Checks, each reported separately:
  1. payload   canonical text (scheme hopium-pred-v1) re-derived from the prediction row hashes to the committed hash
  2. chain     every link from #1 to this receipt recomputes as sha256(prev_hash + payload_hash)
  3. prices    entry/exit closes re-fetched from Binance's public data API match the stored prices
  4. outcome   direction verdict, FLAT rule and net-after-fees re-computed from the prices
  5. witness   whether an OpenTimestamps proof covers this receipt (run `ots verify` on it for the Bitcoin check)
Arithmetic (1-4) is not proof of WHEN anything was published; only a valid witness (5) bounds timing.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request

FIELDS = ("id", "coin", "horizon", "signal", "prob_up", "p_big_up", "p_big_down", "score", "threshold", "k",
          "price_at_call", "candle_close_time", "target_time", "inserted_at", "model_version", "provenance",
          "job_started_at", "input_cutoff_at", "generated_at", "run_id", "late_rule")
TIME = {"candle_close_time", "target_time", "inserted_at", "job_started_at", "input_cutoff_at", "generated_at"}
TS = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|\+00:00|\+00)$")
ZERO = "0" * 64


def fmt_num(x) -> str:
    s = format(float(x), ".12f").rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def fmt_ts(s: str) -> str:
    m = TS.match(str(s))
    if not m:
        raise ValueError(f"not a UTC timestamp: {s!r}")
    return f"{m[1]}T{m[2]}.{(m[3] or '').ljust(6, '0')}Z"


def canonical(row: dict) -> str:
    out = {}
    for f in FIELDS:
        v = row.get(f)
        out[f] = None if v is None else fmt_ts(v) if f in TIME else fmt_num(v) if isinstance(v, (int, float)) and f != "id" else str(v)
    return json.dumps(out, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "hopium-verifier"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def grade(signal: str, entry: float, exit_: float, flat: float, fee: float):
    m = (exit_ - entry) / entry
    if signal == "NO_CALL":
        return m, "SAT_OUT", 0.0
    if abs(m) < flat:
        out = "FLAT"
    else:
        out = "HIT" if (m > 0 if signal == "UP" else m < 0) else "MISS"
    return m, out, (m if signal == "UP" else -m) - fee


def verify(b: dict, offline: bool = False) -> dict[str, tuple[str, str]]:
    res: dict[str, tuple[str, str]] = {}
    p, c = b["prediction"], b["commitment"]
    rec = c.get("record")
    if not rec:
        res["payload"] = ("SKIP", f"no commitment ({c.get('status')})")
        res["chain"] = ("SKIP", "no commitment")
    else:
        text = canonical(p)
        ok = text == rec["canonical"] and sha(text) == rec["payload_hash"]
        res["payload"] = ("PASS" if ok else "FAIL", f"sha256 {sha(text)}" + ("" if ok else f" vs committed {rec['payload_hash']}"))
        prev, errs = ZERO, []
        for i, x in enumerate(sorted(c["chain_prefix"], key=lambda x: x["seq"])):
            if x["seq"] != i + 1:
                errs.append(f"gap at {x['seq']}")
            if sha(x["canonical"]) != x["payload_hash"] or x["prev_hash"] != prev or sha(prev + x["payload_hash"]) != x["chain_hash"]:
                errs.append(f"link {x['seq']}")
            prev = x["chain_hash"]
        tail = c["chain_prefix"][-1]["seq"] if c["chain_prefix"] else None
        if tail != rec["seq"] or prev != rec["chain_hash"]:
            errs.append("prefix does not end at this receipt")
        res["chain"] = ("FAIL" if errs else "PASS", "; ".join(errs) or f"links #1..#{rec['seq']} recompute; head {prev[:16]}...")
    g = b["grading"]
    entry, exit_ = g["entry"]["stored"], g["exit"]["stored"]
    if offline:
        res["prices"] = ("SKIP", "offline")
    else:
        try:
            e_px = float(get(g["entry"]["source"])[0][4])
            x_px = float(get(g["exit"]["source"])[0][4]) if exit_ is not None else None
            ok = abs(e_px - entry) < 1e-9 * entry and (exit_ is None or abs(x_px - exit_) < 1e-9 * exit_)
            res["prices"] = ("PASS" if ok else "FAIL", f"Binance entry {e_px}, exit {x_px} vs stored {entry}, {exit_}")
        except Exception as e:  # network or not yet available
            res["prices"] = ("SKIP", f"could not fetch Binance candles: {e}")
    if exit_ is None:
        res["outcome"] = ("SKIP", "not graded yet")
    else:
        m, out, net = grade(p["signal"], entry, exit_, g["flat_threshold"], g["fee_round_trip"])
        ok = out == g["stored"]["outcome"] and abs(m - g["stored"]["move"]) < 1e-9
        res["outcome"] = ("PASS" if ok else "FAIL", f"move {m:+.4%}, {out}, net after fees {net:+.4%} (stored {g['stored']['outcome']})")
    w = c.get("witness")
    res["witness"] = (("INFO", f"covered by OpenTimestamps stamp of chain #{w['chain_seq']} ({w['receipt_path']}); run: ots verify {w['receipt_path']}")
                      if w else ("NONE", "not independently witnessed; timing rests on the operator's database clock"))
    return res


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = argv[1]
    b = get(src) if src.startswith("http") else json.load(open(src))
    print(f"receipt #{b['prediction']['id']}  {b['prediction']['coin']} {b['prediction']['signal']}  ({b['data_environment']})")
    res = verify(b, offline="--offline" in argv)
    for k, (st, msg) in res.items():
        print(f"  {st:5s} {k:8s} {msg}")
    return 1 if any(st == "FAIL" for st, _ in res.values()) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
