import json

import pytest
import requests

from hopium import notify as n

H = 3600
T0 = 1_794_700_800.0  # 2026-11-14 00:00:00 UTC (an exact hour)


def pred(i, coin, h, signal="NO_CALL", **kw):
    p = {"id": i, "coin": coin, "signal": signal, "prob_up": 0.3, "score": 0.02, "price_at_call": 65068.01,
         "price_at_target": None, "move": None, "outcome": None, "graded_at": None,
         "candle_close_time": n.iso(h), "inserted_at": n.iso(h + 120), "target_time": n.iso(h + 12 * H)}
    p.update(kw)
    return p


def full_hours(start, end, skip=()):
    rows, i = [], 1
    for h in range(int(start), int(end) + 1, H):
        if h in skip:
            continue
        for c in n.COINS:
            rows.append(pred(i, c, h)); i += 1
    return rows


def test_missed_hour_only_after_hh25_with_reason():
    gap = T0 + 3 * H
    preds = full_hours(T0, T0 + 5 * H, skip={gap})
    runs = [{"id": 1, "job": "predict", "candle_close_time": n.iso(gap), "status": "missed", "detail": "started 31 min late", "logged_at": n.iso(gap + 1900)}]
    assert n.missed_hours(preds, runs, gap + 24 * 60, T0) == {}
    m = n.missed_hours(preds, runs, gap + 26 * 60, T0)
    assert list(m) == [f"missed:{n.iso(gap)}"]
    assert m[f"missed:{n.iso(gap)}"]["coins"] == ["BTC", "ETH", "SOL"]
    assert "started 31 min late" in m[f"missed:{n.iso(gap)}"]["reason"]
    # a single missing coin counts, and a gap with no job says so
    preds2 = [p for p in full_hours(T0, T0 + 5 * H) if not (p["coin"] == "SOL" and p["candle_close_time"] == n.iso(T0 + 4 * H))]
    m2 = n.missed_hours(preds2, [], T0 + 5 * H + 30 * 60, T0)
    assert m2[f"missed:{n.iso(T0 + 4 * H)}"]["coins"] == ["SOL"]
    assert "no predict job" in m2[f"missed:{n.iso(T0 + 4 * H)}"]["reason"]


def test_failures_from_run_log_ots_and_steps():
    now = T0 + 10 * H
    runs = [{"id": 7, "job": "grade", "status": "error", "detail": "boom", "logged_at": n.iso(now - H)},
            {"id": 8, "job": "predict", "status": "ok", "detail": None, "logged_at": n.iso(now - H)},
            {"id": 9, "job": "predict", "status": "error", "detail": "old", "logged_at": n.iso(now - 30 * H)}]
    witness = [{"id": 3, "status": "failed", "detail": "calendar down", "logged_at": n.iso(now - 600)}]
    f = n.failures(runs, witness, {"predict": "success", "grade": "failure"}, "https://run/1", now)
    assert set(f) == {"failed:run_log:7", "failed:ots:3", "failed:step:https://run/1:grade"}


def test_cron_gap_uses_owner_triggered_runs_in_the_first_ten_minutes():
    now = T0 + 3 * H + 20 * 60
    runs = [{"created_at": n.iso(h + 61), "triggering_actor": {"login": "owner"}} for h in (T0, T0 + H, T0 + 3 * H)]
    runs += [{"created_at": n.iso(T0 + 2 * H + 120), "triggering_actor": {"login": "github-actions[bot]"}}]  # heartbeat only
    gaps = n.cron_gaps(runs, "owner", now, T0)
    assert list(gaps) == [f"cron:{n.iso(T0 + 2 * H)}"]
    assert n.cron_gaps(None, "owner", now, T0) == {}  # not detectable without GitHub access


def test_rate_limit_one_alert_per_type_per_hour_and_nothing_lost():
    s = n.empty_state()
    inc = {"missed:a": {}, "failed:x": {}}
    allowed, _ = n.gate(s, inc, T0)
    assert set(allowed) == {"missed:a", "failed:x"}
    n.mark_sent(s, allowed, T0)
    inc2 = {**inc, "missed:b": {}, "chain:z": {}}
    allowed2, _ = n.gate(s, inc2, T0 + 1800)
    assert set(allowed2) == {"chain:z"}            # missed:b held, already-sent ones not repeated
    n.mark_sent(s, allowed2, T0 + 1800)
    allowed3, _ = n.gate(s, inc2, T0 + H)
    assert set(allowed3) == {"missed:b"}           # released after an hour


def test_call_and_graded_announcements_once_each():
    now = T0 + 20 * H
    up = pred(50, "BTC", now - H, "UP", score=0.3)
    graded = pred(40, "ETH", now - 13 * H, "DOWN", score=-0.2, outcome="MISS", move=0.0061, price_at_target=65465.0, graded_at=n.iso(now - 600))
    rows = [up, graded, pred(51, "SOL", now - H)]
    s = n.empty_state() | {"last_call_id": 49, "last_graded_at": n.iso(now - 2 * H)}
    assert [p["id"] for p in n.new_calls(rows, s, now)] == [50]
    assert [p["id"] for p in n.new_grades(rows, s, now)] == [40]
    s["last_call_id"], s["last_graded_at"] = 50, graded["graded_at"]
    assert n.new_calls(rows, s, now) == [] and n.new_grades(rows, s, now) == []
    e = n.call_embed(up)
    vals = {f["name"]: f["value"] for f in e["fields"]}
    assert vals["lean"] == "65.0%" and vals["reference price"] == "$65,068.01" and vals["receipt"].endswith("/r/50")
    g = n.graded_embed(graded)
    assert "REKT" in g["title"] and {f["name"]: f["value"] for f in g["fields"]}["sim. trade after 0.2% fees"] == "-0.81%"


def test_no_floods_after_downtime():
    now = T0 + 40 * H
    old = pred(5, "BTC", now - 20 * H, "UP")
    assert n.new_calls([old], n.empty_state(), now) == []


def test_digest_numbers():
    now = T0 + 27 * H + 31 * 60
    preds = full_hours(T0, T0 + 27 * H, skip={T0 + H})
    preds[-1] |= {"signal": "UP", "score": 0.3}
    preds.append(pred(999, "ETH", T0 + 2 * H, "UP", outcome="HIT", move=0.02, graded_at=n.iso(T0 + 14 * H + 300)))
    e = n.digest_embed(preds, [], [], [], now, T0)
    f = {x["name"]: x["value"] for x in e["fields"]}
    assert f["coverage (24h)"] == "100.0% (72 of 72 slots)"   # the gap at T0+1h is older than 24h
    assert f["graded (last 24h)"] == "1 hits, 0 misses, 0 flat"
    assert "SOL UP" in f["calls (last 24h)"] and f["incidents"] == "none" and f["chain"] == "verifies"
    e2 = n.digest_embed(full_hours(T0, T0 + 27 * H, skip={T0 + 20 * H}), [], [], None, now, T0)
    f2 = {x["name"]: x["value"] for x in e2["fields"]}
    assert f2["coverage (24h)"] == "95.8% (69 of 72 slots)" and "missed hours" in f2["incidents"] and f2["chain"] == "not checked"


def test_weekly_caption_extracted_from_report():
    md = "# r\n\n## LinkedIn caption\n\n```text\nHOPIUM weekly printer report, week 2026-46. Not financial advice.\n```\n\nRule: x\n"
    assert n.caption_from_report(md) == "HOPIUM weekly printer report, week 2026-46. Not financial advice."
    assert "/reports/2026-46" in n.weekly_embed("2026-46", md)["description"]


def test_chain_problem_signature_is_stable():
    a = n.chain_problems(["seq 3: chain link broken"])
    assert a == n.chain_problems(["seq 3: chain link broken"]) and n.chain_problems([]) == {}


def test_missing_secret_skips_and_notes_summary(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("DISCORD_WEBHOOK_URL", raising=False)
    s = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(s))
    assert n.main(["test"]) == 0
    assert "DISCORD_WEBHOOK_URL is not set" in s.read_text()


SECRET = "https://discord.com/api/webhooks/123/very-secret-token"


def test_webhook_never_printed_even_on_errors(monkeypatch, capsys):
    def boom(url, **kw):
        raise requests.ConnectionError(f"failed to reach {url}")
    monkeypatch.setattr(n.requests, "post", boom)
    monkeypatch.setattr(n.time, "sleep", lambda s: None)
    assert n.Discord(SECRET).post(None, [{"title": "x"}]) is False
    out = capsys.readouterr()
    assert "very-secret-token" not in out.out + out.err and "ConnectionError" in out.out


def test_post_batches_embeds_in_tens(monkeypatch):
    sent = []

    class R:
        status_code = 204

    monkeypatch.setattr(n.requests, "post", lambda url, json=None, timeout=None: sent.append(json) or R())
    assert n.Discord(SECRET).post(None, [{"title": str(i)} for i in range(23)])
    assert [len(b["embeds"]) for b in sent] == [10, 10, 3]
    assert all(b["allowed_mentions"] == {"parse": []} for b in sent)
