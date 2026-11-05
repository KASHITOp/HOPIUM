from hopium.commit import ZERO, canonical, fmt_num, fmt_ts, link, sha256, verify_chain

ROW = {"id": 7, "coin": "BTC", "horizon": "12h", "signal": "NO_CALL", "prob_up": 0.123456, "p_big_up": 0.123456,
       "p_big_down": 0.2, "score": -0.076544, "threshold": 0.16, "k": 0.01, "price_at_call": 70123.45,
       "candle_close_time": "2026-11-05T14:00:00+00:00", "target_time": "2026-11-06T02:00:00+00:00",
       "inserted_at": "2026-11-05T14:03:12.12345+00:00", "model_version": "v3-12h-logreg-20261104",
       "provenance": "live_prospective", "job_started_at": None, "input_cutoff_at": None, "generated_at": None,
       "run_id": None, "late_rule": None}


def test_formats():
    assert fmt_num(0.16) == "0.16" and fmt_num(100) == "100" and fmt_num(-0.0) == "0" and fmt_num(1e-7) == "0.0000001"
    assert fmt_ts("2026-11-05T14:00:00Z") == "2026-11-05T14:00:00.000000Z"
    assert fmt_ts("2026-11-05 14:03:12.12345+00") == "2026-11-05T14:03:12.123450Z"


def test_non_utc_rejected():
    import pytest
    with pytest.raises(ValueError):
        fmt_ts("2026-11-05T14:00:00+05:30")


def test_deterministic_and_key_order_independent():
    assert canonical(ROW) == canonical(dict(reversed(list(ROW.items()))))
    assert sha256(canonical(ROW)) == "%s" % sha256(canonical(dict(ROW)))


def _chain(rows):
    out, prev = [], ZERO
    for i, r in enumerate(rows):
        t = canonical(r); ph = sha256(t); ch = link(prev, ph)
        out.append({"seq": i + 1, "prediction_id": r["id"], "canonical": t, "payload_hash": ph, "prev_hash": prev, "chain_hash": ch})
        prev = ch
    return out


def test_chain_verifies_and_tamper_fails():
    rows = [ROW, ROW | {"id": 8, "coin": "ETH"}, ROW | {"id": 9, "coin": "SOL"}]
    c = _chain(rows)
    preds = {r["id"]: r for r in rows}
    assert verify_chain(c, preds) == []
    assert verify_chain(c, preds | {8: rows[1] | {"signal": "UP"}})          # edited row
    bad = [dict(x) for x in c]; bad[1]["canonical"] = bad[1]["canonical"].replace("ETH", "BTC")
    assert verify_chain(bad)                                                # edited payload
    assert verify_chain([c[0], c[2]])                                       # deleted link
    assert verify_chain([c[0], c[2] | {"seq": 2}])                          # reordered/renumbered
    dup = [c[0], c[0] | {"seq": 2}]
    assert verify_chain(dup)                                                # duplicate
