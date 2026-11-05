"""Model and rule registry (WS8). Source of truth: ml/models/registry.json (append-only, reviewed in git).
Pushes each entry to public.model_registry (insert, ignore duplicates: rows are immutable) and fills activated_at
once, from the first live prediction carrying that version (database insert time, not self-reported).
Refuses to register if the artifact on disk does not hash to the recorded sha256.

python -m hopium.registry
"""
from __future__ import annotations

import hashlib
import json
import sys

from .config import ROOT

REG = ROOT / "models" / "registry.json"
COLS = ("model_version", "artifact_sha256", "code_commit", "feature_schema", "training_period", "training_cutoff",
        "decision_rule", "grading_rule", "change_kind", "change_reason", "research_artifacts")


def entries() -> list[dict]:
    return json.loads(REG.read_text())["models"]


def check_artifact(e: dict) -> bool:
    p = ROOT.parent / e["artifact_path"]
    return p.exists() and hashlib.sha256(p.read_bytes()).hexdigest() == e["artifact_sha256"]


def append_current(reason: str) -> bool:
    """Called by the weekly retrain after rebuilding the bundle: appends an entry for a NEW version only.
    Same config + feature groups as the previous entry -> retrain_same_procedure; otherwise procedure_change."""
    import os
    m = json.loads((ROOT / "models" / "engine_v3.json").read_text())
    doc = json.loads(REG.read_text())
    if any(e["model_version"] == m["version"] for e in doc["models"]):
        return False
    prev, cfg = doc["models"][-1], m["config"]
    schema = "features_v3 groups=" + "+".join(cfg.get("groups", []))
    rule = (f"dec-v3: score=p_big_up-p_big_down; UP if score>threshold, DOWN if score<-threshold, else NO_CALL; "
            f"threshold {m['threshold']} ({m['threshold_source']}), k={cfg.get('k')}")
    same = schema == prev["feature_schema"] and rule.split("; threshold")[0] == prev["decision_rule"].split("; threshold")[0]
    pkl = ROOT / "models" / "engine_v3.pkl"
    doc["models"].append({
        "model_version": m["version"], "artifact_sha256": hashlib.sha256(pkl.read_bytes()).hexdigest(),
        "artifact_path": "ml/models/engine_v3.pkl", "code_commit": os.environ.get("GITHUB_SHA", "unknown"),
        "feature_schema": schema, "training_period": "all available history through " + str(m["trained_through"]),
        "training_cutoff": str(m["trained_through"]).replace(" ", "T"), "decision_rule": rule,
        "grading_rule": prev["grading_rule"], "change_kind": "retrain_same_procedure" if same else "procedure_change",
        "change_reason": reason, "research_artifacts": prev.get("research_artifacts")})
    REG.write_text(json.dumps(doc, indent=1))
    return True


def main() -> int:
    if "--append-current" in sys.argv:
        print("registry entry appended" if append_current("Scheduled weekly retrain (research/weekly.py)") else "version already registered")
    from . import db
    try:
        db.select("model_registry", {"select": "model_version", "limit": "1"})
    except Exception as e:
        print("model_registry not available (migration 20261105100000 not applied?); skipping:", str(e)[:200])
        return 0
    for e in entries():
        if not check_artifact(e):
            print(f"artifact hash mismatch for {e['model_version']}; not registering")
            continue
        db.insert("model_registry", [{k: e[k] for k in COLS}], on_conflict="model_version")
        row = db.select("model_registry", {"select": "activated_at", "model_version": f"eq.{e['model_version']}"})
        first = db.select("predictions", {"select": "inserted_at", "model_version": f"eq.{e['model_version']}",
                                          "order": "inserted_at.asc", "limit": "1"})
        if row and row[0]["activated_at"] is None and first:
            db.patch("model_registry", {"model_version": f"eq.{e['model_version']}"}, {"activated_at": first[0]["inserted_at"]})
        print("registry:", e["model_version"], "ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
