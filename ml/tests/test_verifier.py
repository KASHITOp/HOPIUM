import importlib.util
from pathlib import Path

from hopium.commit import ZERO, canonical, link, sha256

spec = importlib.util.spec_from_file_location("vr", Path(__file__).parents[2] / "tools" / "verify_receipt.py")
vr = importlib.util.module_from_spec(spec); spec.loader.exec_module(vr)
from tests.test_commit import ROW  # noqa: E402


def bundle(row, outcome="HIT", exit_=70300.0):
    t = canonical(row); ph = sha256(t)
    rec = {"seq": 1, "prediction_id": row["id"], "canonical": t, "payload_hash": ph, "prev_hash": ZERO, "chain_hash": link(ZERO, ph)}
    m = (exit_ - row["price_at_call"]) / row["price_at_call"]
    return {"prediction": row, "commitment": {"record": rec, "chain_prefix": [rec], "witness": None, "status": "committed"},
            "grading": {"flat_threshold": 0.001, "fee_round_trip": 0.002, "entry": {"stored": row["price_at_call"], "source": ""},
                        "exit": {"stored": exit_, "source": ""}, "stored": {"move": m, "outcome": outcome}}}


def test_standalone_canonical_matches_pipeline():
    assert vr.canonical(ROW) == canonical(ROW)


def test_honest_bundle_passes():
    r = vr.verify(bundle(ROW | {"signal": "UP"}), offline=True)
    assert r["payload"][0] == r["chain"][0] == r["outcome"][0] == "PASS" and r["witness"][0] == "NONE"


def test_edited_row_and_wrong_grade_fail():
    b = bundle(ROW | {"signal": "UP"})
    b["prediction"] = b["prediction"] | {"signal": "DOWN"}
    r = vr.verify(b, offline=True)
    assert r["payload"][0] == "FAIL"
    assert vr.verify(bundle(ROW | {"signal": "UP"}, outcome="MISS"), offline=True)["outcome"][0] == "FAIL"


def test_small_correct_move_is_flat_not_hit():
    r = vr.verify(bundle(ROW | {"signal": "UP"}, outcome="FLAT", exit_=70150.0), offline=True)
    assert r["outcome"][0] == "PASS" and "FLAT" in r["outcome"][1] and "-" in r["outcome"][1].split("net after fees")[1]
