"""Incident 2026-11-20: a run must never log 'ok' without a stored row; Deribit retries are time-bounded and fail loudly."""
import pandas as pd
import pytest
import requests

from hopium import db, deribit, grade


class Resp:
    def __init__(self, code, body=None):
        self.status_code, self._b = code, body or {"result": []}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} Server Error", response=self)

    def json(self):
        return self._b


def test_deribit_retries_then_succeeds(monkeypatch):
    calls = iter([Resp(503), Resp(502), Resp(200, {"result": [{"timestamp": 1_700_000_000_000, "interest_1h": 1e-5}]})])
    monkeypatch.setattr(deribit.requests, "get", lambda *a, **k: next(calls))
    slept = []
    t0 = pd.Timestamp("2026-11-20T20:00", tz="UTC")
    df = deribit.funding("BTC", t0 - pd.Timedelta(hours=2), t0, deadline=t0 + pd.Timedelta(minutes=12), sleep=slept.append, now=lambda: t0)
    assert slept == [3, 6] and len(df) == 1


def test_deribit_gives_up_at_deadline_with_real_reason(monkeypatch):
    monkeypatch.setattr(deribit.requests, "get", lambda *a, **k: Resp(503))
    clock = {"t": pd.Timestamp("2026-11-20T20:02", tz="UTC")}
    def sleep(s): clock["t"] += pd.Timedelta(seconds=s)
    t0 = pd.Timestamp("2026-11-20T20:00", tz="UTC")
    with pytest.raises(RuntimeError, match="Deribit funding unavailable for BTC.*503"):
        deribit.funding("BTC", t0 - pd.Timedelta(hours=2), t0, deadline=t0 + pd.Timedelta(minutes=12), sleep=sleep, now=lambda: clock["t"])
    assert clock["t"] <= t0 + pd.Timedelta(minutes=12)


def test_log_run_strict_raises_on_real_write_failure(monkeypatch):
    monkeypatch.setattr(db, "configured", lambda: True)
    def boom(*a, **k): raise RuntimeError("supabase POST run_log -> 503: read-only")
    monkeypatch.setattr(db, "insert", boom)
    with pytest.raises(RuntimeError):
        db.log_run("predict", "ok", "2026-11-20T20:00:00+00:00", "3 inserted", strict=True)
    db.log_run("predict", "error", "2026-11-20T20:00:00+00:00", "x")  # error path never masks the real failure
    def dup(*a, **k): raise RuntimeError('409 duplicate key value violates unique constraint "run_log_predict_once"')
    monkeypatch.setattr(db, "insert", dup)
    db.log_run("predict", "ok", "2026-11-20T20:00:00+00:00", "0 inserted", strict=True)  # second run of the hour: fine


def test_grade_fails_loudly_when_update_not_stored(monkeypatch, tmp_path):
    logs = []
    monkeypatch.setattr(grade, "OPS", tmp_path / "g.json")
    monkeypatch.setattr(grade.db, "select", lambda t, p: [{"id": 1, "coin": "BTC", "horizon": "12h", "signal": "NO_CALL",
                                                          "price_at_call": 100.0, "target_time": "2026-11-20T15:00:00+00:00"}]
                        if "graded_at" in p and p.get("graded_at") == "is.null" else [{"graded_at": None}])
    monkeypatch.setattr(grade, "exit_price", lambda *a: 101.0)
    monkeypatch.setattr(grade.db, "patch", lambda *a: [])
    monkeypatch.setattr(grade.db, "log_run", lambda job, status, **k: logs.append(status))
    assert grade.main() == 1 and logs == ["error"]
