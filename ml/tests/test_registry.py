from hopium.registry import COLS, check_artifact, entries


def test_current_bundle_is_registered_with_matching_hash():
    import json
    from hopium.config import MODELS
    live = json.loads((MODELS / "engine_v3.json").read_text())["version"]
    es = {e["model_version"]: e for e in entries()}
    assert live in es, "live bundle must have a registry entry before it can publish"
    assert check_artifact(es[live])


def test_entries_complete_and_unique():
    es = entries()
    assert len({e["model_version"] for e in es}) == len(es)
    for e in es:
        assert all(e.get(k) for k in COLS if k not in ("research_artifacts",))
        assert e["change_kind"] in ("initial", "retrain_same_procedure", "procedure_change")


def test_tampered_artifact_detected():
    e = dict(entries()[0]); e["artifact_sha256"] = "0" * 64
    assert not check_artifact(e)
