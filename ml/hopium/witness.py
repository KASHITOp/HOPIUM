"""Independent witness: stamp the current chain head with OpenTimestamps (public calendars -> Bitcoin).

Each run, if the chain head moved since the last successful submission, writes
ml/ops/witness/chain-<seq>.txt containing 'hopium-chain-v1 seq=<n> chain_hash=<hex>' and runs `ots stamp` on it.
The .ots proof is committed to git by the workflow. Every attempt is logged in witness_receipts, failures included
(retried next hour). `ots upgrade` later replaces calendar promises with Bitcoin block attestations.
Anyone can check a proof with `ots verify ml/ops/witness/chain-<n>.txt.ots` (needs the file next to it).
What this proves: the chain head (and so every payload before it) existed no later than the attested Bitcoin block.
It says nothing about rows before the first commitment or about events before the stamp time.
"""
from __future__ import annotations

import shutil
import subprocess
import sys

from .config import ROOT

DIR = ROOT / "ops" / "witness"


def stamp_text(seq: int, chain_hash: str) -> str:
    return f"hopium-chain-v1 seq={seq} chain_hash={chain_hash}\n"


def main() -> int:
    from . import db
    try:
        head = db.select("commitments", {"select": "seq,chain_hash", "order": "seq.desc", "limit": "1"})
    except Exception as e:
        print("commitments table not available; witness not configured:", str(e)[:200])
        return 0
    if not head:
        print("no commitments yet; nothing to witness")
        return 0
    seq, h = head[0]["seq"], head[0]["chain_hash"]
    DIR.mkdir(parents=True, exist_ok=True)
    if shutil.which("ots"):
        for p in DIR.glob("*.ots"):          # best effort: swap calendar promises for Bitcoin attestations
            subprocess.run(["ots", "upgrade", str(p)], capture_output=True, timeout=60)
    last = db.select("witness_receipts", {"select": "chain_seq", "status": "eq.submitted",
                                          "order": "chain_seq.desc", "limit": "1"})
    if last and last[0]["chain_seq"] >= seq:
        print(f"chain head {seq} already witnessed")
        return 0
    f = DIR / f"chain-{seq}.txt"
    f.write_text(stamp_text(seq, h))
    rel = str(f.relative_to(ROOT.parent))
    if not shutil.which("ots"):
        db.insert("witness_receipts", [{"chain_seq": seq, "chain_hash": h, "service": "opentimestamps",
                                        "status": "failed", "detail": "ots client not installed"}])
        return 1
    r = subprocess.run(["ots", "stamp", str(f)], capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0 and (DIR / f"chain-{seq}.txt.ots").exists()
    db.insert("witness_receipts", [{"chain_seq": seq, "chain_hash": h, "service": "opentimestamps",
                                    "status": "submitted" if ok else "failed",
                                    "receipt_path": rel + ".ots" if ok else None,
                                    "detail": None if ok else (r.stderr or r.stdout)[-1500:]}])
    print(("stamped" if ok else "FAILED to stamp"), f"chain head {seq} {h}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
