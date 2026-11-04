import pandas as pd
import pytest

from hopium.lifecycle import LATE_RULE, eligible, stamp, strip

C = pd.Timestamp("2026-11-04T11:00:00Z")
m = lambda x: C + pd.Timedelta(minutes=x)


@pytest.mark.parametrize("mins,ok", [(0, True), (2.2, True), (18.0, True), (18.01, False), (25, False), (-1, False)])
def test_late_rule_boundaries(mins, ok):
    assert eligible(C, m(mins))[0] is ok


def test_skip_reason_recorded():
    ok, why = eligible(C, m(22.1))
    assert not ok and why.startswith("late:22.1m")


def test_stamp_orders_and_labels():
    r = stamp({"candle_close_time": C.isoformat()}, m(0.5), m(1.5), C)
    assert r["provenance"] == "live_prospective" and r["late_rule"] == LATE_RULE
    assert r["input_cutoff_at"] <= r["candle_close_time"] and r["job_started_at"] <= r["generated_at"]


def test_stamp_rejects_misordered():
    with pytest.raises(ValueError):
        stamp({"candle_close_time": C.isoformat()}, m(2), m(1), C)
    with pytest.raises(ValueError):
        stamp({"candle_close_time": C.isoformat()}, m(0), m(1), m(1))


def test_strip_removes_trust_columns_only():
    r = stamp({"candle_close_time": C.isoformat(), "coin": "BTC"}, m(0), m(1), C)
    assert strip([r]) == [{"candle_close_time": C.isoformat(), "coin": "BTC"}]
