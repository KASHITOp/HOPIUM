"""Private Discord notifier (owner only). Reads public tables and GitHub run history, posts to a Discord webhook.

    python -m hopium.notify check     # alerts + call alerts + graded follow-ups (end of hourly.yml, and HH:26 watch)
    python -m hopium.notify digest    # daily digest, 03:31 UTC
    python -m hopium.notify weekly --week 2026-46   # weekly printer report link + LinkedIn caption
    python -m hopium.notify test      # one test message

The webhook comes ONLY from env DISCORD_WEBHOOK_URL and is never printed: errors are reported as exception class and
HTTP status only. If it is missing the command exits 0 and writes a note to the GitHub job summary.

Incidents (one alert per incident type per hour, batched into one message):
  missed     a scheduled hour with no stored prediction for some coin by HH:25 (the DB rejects inserts > 20 min late,
             so nothing can still arrive). Reason from run_log when a job logged one.
  failed     run_log rows with status 'error' (predict / grade / retrain), failed hourly.yml steps, failed OTS stamps
  cron       pg_cron dispatch not seen: no hourly.yml run triggered by the owner's token between HH:00 and HH:10
             (pg_cron dispatches with that token at HH:01; the heartbeat backup runs as github-actions[bot])
  chain      hash-chain verification failure (recomputed from the public commitments and prediction rows)
State lives in ml/ops/notify_state.json (committed), so each incident, call and grade is announced once.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

H = 3600
STATE_PATH = Path(__file__).resolve().parent.parent / "ops" / "notify_state.json"
SITE = os.environ.get("SITE_URL", "https://hopium-phi.vercel.app").rstrip("/")
COINS = ("BTC", "ETH", "SOL")
FEE = 0.002
GREEN, RED, GREY, INK = 0x6FA27E, 0xD4614C, 0x898377, 0xD6CEBD
LOOKBACK_H = 6          # incidents, calls and grades older than this are never announced (no floods after downtime)
RATE_LIMIT_S = H        # max one alert per incident type per hour
DEADLINE_MIN = 25       # a slot with no row by HH:25 is missed
CRON_WINDOW_MIN = 10


# ----------------------------------------------------------------------------- time helpers
def ts(s: str | None) -> float | None:
    if not s:
        return None
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def iso(t: float) -> str:
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hm(t: float) -> str:
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%d %b %H:%M UTC")


def lean(p: dict) -> float:
    s = p.get("score")
    if s is None:
        s = p["prob_up"] * 2 - 1
    return 0.5 + abs(s) / 2


def pct(x: float, d: int = 2) -> str:
    return f"{x * 100:+.{d}f}%"


# ----------------------------------------------------------------------------- detection (pure)
def missed_hours(preds: list[dict], runs: list[dict], now: float, launch: float | None) -> dict[str, dict]:
    """Hours in the lookback whose deadline (HH:25) has passed with at least one coin missing."""
    if launch is None:
        return {}
    have = {(p["coin"], ts(p["candle_close_time"])) for p in preds}
    why = {ts(r["candle_close_time"]): r for r in runs if r.get("job") == "predict" and r.get("candle_close_time")}
    out = {}
    top = int(now // H) * H
    for h in range(top - LOOKBACK_H * H, top + 1, H):
        if h < launch or now < h + DEADLINE_MIN * 60:
            continue
        missing = [c for c in COINS if (c, float(h)) not in have]
        if missing:
            r = why.get(float(h))
            reason = (f"job logged '{r['status']}': {(r.get('detail') or '')[:160]}" if r else "no predict job logged (scheduler gap)")
            out[f"missed:{iso(h)}"] = {"hour": h, "coins": missing, "reason": reason}
    return out


def failures(runs: list[dict], witness: list[dict], steps: dict[str, str], run_url: str | None, now: float) -> dict[str, dict]:
    out = {}
    for r in runs:
        t = ts(r["logged_at"])
        if r.get("status") == "error" and t and t > now - LOOKBACK_H * H:
            out[f"failed:run_log:{r['id']}"] = {"what": f"{r['job']} job error", "at": t, "detail": (r.get("detail") or "")[:200]}
    for w in witness:
        t = ts(w["logged_at"])
        if w.get("status") == "failed" and t and t > now - LOOKBACK_H * H:
            out[f"failed:ots:{w['id']}"] = {"what": "OpenTimestamps stamp failed", "at": t, "detail": (w.get("detail") or "")[:200]}
    for step, outcome in steps.items():
        if outcome == "failure":
            out[f"failed:step:{run_url}:{step}"] = {"what": f"hourly.yml step '{step}' failed", "at": now, "detail": run_url or ""}
    return out


def cron_gaps(runs: list[dict] | None, owner: str, now: float, launch: float | None) -> dict[str, dict]:
    """Hours whose HH:00-HH:10 window passed without an hourly.yml run triggered by the owner (pg_cron's token)."""
    if runs is None or launch is None:
        return {}
    seen = set()
    for r in runs:
        if (r.get("triggering_actor") or {}).get("login") != owner:
            continue
        t = ts(r["created_at"])
        if t is not None and t - (t // H) * H < CRON_WINDOW_MIN * 60:
            seen.add(int(t // H) * H)
    out = {}
    top = int(now // H) * H
    for h in range(top - LOOKBACK_H * H, top + 1, H):
        if h >= launch and now >= h + CRON_WINDOW_MIN * 60 and h not in seen:
            out[f"cron:{iso(h)}"] = {"hour": h}
    return out


def site_lag(site_max_id: int | None, db_rows: list[dict], now: float) -> dict[str, dict]:
    """The public site must show every row stored more than 20 min ago (it reads the same DB, uncached)."""
    if site_max_id is None:
        return {}
    old = [p for p in db_rows if (ts(p["inserted_at"]) or now) < now - 20 * 60]
    if not old:
        return {}
    newest = max(p["id"] for p in old)
    return {f"site:{newest}": {"site": site_max_id, "db": newest}} if site_max_id < newest else {}


def site_max_id() -> int | None:
    try:
        r = requests.get(f"{SITE}/receipts/csv", timeout=30)
        r.raise_for_status()
        ids = [int(l.split(",", 1)[0]) for l in r.text.splitlines()[1:] if l[:1].isdigit()]
        return max(ids) if ids else None
    except Exception as e:
        print(f"site check skipped: {type(e).__name__}")
        return None


def chain_problems(errs: list[str] | None) -> dict[str, dict]:
    if not errs:
        return {}
    sig = hashlib.sha256("\n".join(errs).encode()).hexdigest()[:16]
    return {f"chain:{sig}": {"count": len(errs), "first": errs[:3]}}


# ----------------------------------------------------------------------------- messages (pure)
def incident_embeds(new: dict[str, dict]) -> list[dict]:
    by = {}
    for k, v in sorted(new.items(), key=lambda kv: kv[0]):
        by.setdefault(k.split(":")[0], []).append(v)
    embeds = []
    if "missed" in by:
        lines = [f"`{hm(v['hour'])}` {', '.join(v['coins'])}: {v['reason']}" for v in by["missed"]]
        embeds.append({"title": "🧾 Printer jammed: missed slot", "color": RED,
                       "description": "No stored prediction by HH:25. These slots stay empty forever.\n" + "\n".join(lines)[:3800]})
    if "failed" in by:
        lines = [f"`{hm(v['at'])}` {v['what']}" + (f": {v['detail']}" if v["detail"] else "") for v in by["failed"]]
        embeds.append({"title": "🔧 Job failed", "color": RED, "description": "\n".join(lines)[:3800]})
    if "cron" in by:
        lines = [f"`{hm(v['hour'])}` no pg_cron dispatch seen" for v in by["cron"]]
        embeds.append({"title": "⏰ pg_cron dispatch missing", "color": RED,
                       "description": "No hourly.yml run triggered by the owner token between HH:00 and HH:10. The heartbeat "
                                      "backup may still have covered it; check `cron.job_run_details`.\n" + "\n".join(lines)})
    if "site" in by:
        v = by["site"][0]
        embeds.append({"title": "🪞 Public site is behind the database", "color": RED,
                       "description": f"Site shows receipts up to #{v['site']}, database has #{v['db']} (stored > 20 min ago). "
                                      f"Visitors see stale numbers. Check {SITE}/coverage"})
    if "chain" in by:
        v = by["chain"][0]
        embeds.append({"title": "⛓️ Hash chain does not verify", "color": RED,
                       "description": f"{v['count']} problems. First: " + "; ".join(v["first"]) + f"\nCheck {SITE}/how-it-works#status"})
    return embeds


def call_embed(p: dict) -> dict:
    up = p["signal"] == "UP"
    return {
        "title": f"{'📈' if up else '📉'} {p['coin']} {p['signal']} (12h)",
        "color": GREEN if up else RED,
        "url": f"{SITE}/r/{p['id']}",
        "description": "The model actually said something. Receipt printed before the outcome exists.",
        "fields": [
            {"name": "lean", "value": f"{lean(p) * 100:.1f}%", "inline": True},
            {"name": "reference price", "value": f"${p['price_at_call']:,}", "inline": True},
            {"name": "grades at", "value": hm(ts(p["target_time"])), "inline": True},
            {"name": "receipt", "value": f"{SITE}/r/{p['id']}", "inline": False},
        ],
    }


VERDICT = {"HIT": ("✅ CALLED IT", GREEN, "Even a stopped clock."), "MISS": ("💀 REKT", RED, "Filed under learning experiences."),
           "FLAT": ("😐 DEAD MONEY", GREY, "The market shrugged. Under 0.1%, not counted either way.")}


def graded_embed(p: dict) -> dict:
    word, color, quip = VERDICT.get(p["outcome"], ("graded", GREY, ""))
    side = 1 if p["signal"] == "UP" else -1
    return {
        "title": f"{word}: {p['coin']} {p['signal']} #{p['id']}", "color": color, "url": f"{SITE}/r/{p['id']}",
        "description": quip,
        "fields": [
            {"name": "move", "value": pct(p["move"]), "inline": True},
            {"name": "sim. trade after 0.2% fees", "value": pct(side * p["move"] - FEE), "inline": True},
            {"name": "entry / exit", "value": f"${p['price_at_call']:,} / ${p['price_at_target']:,}", "inline": True},
        ],
    }


def coverage(preds: list[dict], now: float, launch: float | None, hours: int = 24) -> tuple[int, int]:
    """(published, expected) over settled slots (close at least 20 min ago) in the last `hours` hours."""
    if launch is None:
        return 0, 0
    have = {(p["coin"], ts(p["candle_close_time"])) for p in preds}
    exp = pub = 0
    top = int(now // H) * H
    for h in range(top - (hours - 1) * H, top + 1, H):
        if h < launch or now - h < 20 * 60:
            continue
        for c in COINS:
            exp += 1
            pub += (c, float(h)) in have
    return pub, exp


def digest_embed(preds: list[dict], runs: list[dict], witness: list[dict], chain_errs: list[str] | None, now: float, launch: float | None) -> dict:
    since = now - 24 * H
    calls = [p for p in preds if p["signal"] != "NO_CALL" and ts(p["candle_close_time"]) > since]
    graded = [p for p in preds if p["signal"] != "NO_CALL" and p.get("outcome") and (ts(p.get("graded_at")) or 0) > since]
    n = {o: sum(p["outcome"] == o for p in graded) for o in ("HIT", "MISS", "FLAT")}
    sat = sum(p["signal"] == "NO_CALL" and ts(p["candle_close_time"]) > since for p in preds)
    pub, exp = coverage(preds, now, launch)
    missed = [h for h in range(int(since // H) * H + H, int(now // H) * H + 1, H)
              if launch and h >= launch and now - h >= DEADLINE_MIN * 60
              and any((c, float(h)) not in {(p["coin"], ts(p["candle_close_time"])) for p in preds} for c in COINS)]
    errs = [r for r in runs if r.get("status") == "error" and (ts(r["logged_at"]) or 0) > since]
    ots_fail = [w for w in witness if w.get("status") == "failed" and (ts(w["logged_at"]) or 0) > since]
    incidents = []
    if missed:
        incidents.append(f"missed hours: {', '.join(hm(h) for h in missed)}")
    if errs:
        incidents.append(f"{len(errs)} job errors ({', '.join(sorted({r['job'] for r in errs}))})")
    if ots_fail:
        incidents.append(f"{len(ots_fail)} failed OTS stamps")
    if chain_errs:
        incidents.append(f"hash chain: {len(chain_errs)} problems")
    cov = f"{(pub * 1000 // exp) / 10:.1f}% ({pub} of {exp} slots)" if exp else "n/a"  # floored, never flattering
    graded_line = f"{n['HIT']} hits, {n['MISS']} misses, {n['FLAT']} flat" if graded else "nothing graded"
    quip = ("Quiet day at the printer. Sitting out is a position too." if not calls else
            "Some calls were made. Nobody should trade on them.")
    return {
        "title": f"🗞️ Daily digest, {hm(now)}", "color": INK, "url": f"{SITE}/receipts",
        "description": quip,
        "fields": [
            {"name": "calls (last 24h)", "value": ", ".join(f"{p['coin']} {p['signal']} #{p['id']}" for p in calls)[:1000] or "none", "inline": False},
            {"name": "sat out", "value": f"{sat} coin-hours", "inline": True},
            {"name": "graded (last 24h)", "value": graded_line, "inline": True},
            {"name": "coverage (24h)", "value": cov, "inline": True},
            {"name": "incidents", "value": "\n".join(incidents)[:1000] or "none", "inline": False},
            {"name": "chain", "value": "not checked" if chain_errs is None else "verifies" if not chain_errs else "DOES NOT VERIFY", "inline": True},
        ],
        "footer": {"text": "Small samples, overlapping calls. Not financial advice."},
    }


def caption_from_report(md: str) -> str | None:
    m = re.search(r"## LinkedIn caption\s+```text\n(.*?)\n```", md, re.S)
    return m.group(1).strip() if m else None


def weekly_embed(key: str, md: str) -> dict:
    cap = caption_from_report(md) or "(caption not found in the report)"
    return {"title": f"🧾 Weekly printer report {key}", "color": INK, "url": f"{SITE}/reports/{key}",
            "description": f"{SITE}/reports/{key}\n\nLinkedIn caption, ready to copy:\n```\n{cap}\n```"[:4000]}


# ----------------------------------------------------------------------------- state + rate limit (pure)
def empty_state() -> dict:
    return {"version": 1, "reported": [], "last_sent": {}, "last_call_id": None, "last_graded_at": None, "digest_sent_for": None}


def gate(state: dict, incidents: dict[str, dict], now: float) -> tuple[dict[str, dict], dict]:
    """New incidents allowed to be sent now (max one alert per type per hour); suppressed ones stay unreported."""
    new = {k: v for k, v in incidents.items() if k not in state["reported"]}
    allowed = {}
    for k, v in new.items():
        typ = k.split(":")[0]
        last = state["last_sent"].get(typ)
        if last is None or now - last >= RATE_LIMIT_S:
            allowed[k] = v
    return allowed, state


def mark_sent(state: dict, sent: dict[str, dict], now: float) -> dict:
    for k in sent:
        state["reported"].append(k)
        state["last_sent"][k.split(":")[0]] = now
    state["reported"] = state["reported"][-500:]
    return state


def new_calls(preds: list[dict], state: dict, now: float) -> list[dict]:
    floor = state.get("last_call_id") or 0
    return sorted([p for p in preds if p["signal"] != "NO_CALL" and p["id"] > floor
                   and ts(p["inserted_at"]) > now - LOOKBACK_H * H], key=lambda p: p["id"])


def new_grades(preds: list[dict], state: dict, now: float) -> list[dict]:
    floor = ts(state.get("last_graded_at")) or 0
    return sorted([p for p in preds if p["signal"] != "NO_CALL" and p.get("outcome") and p.get("move") is not None
                   and (ts(p.get("graded_at")) or 0) > max(floor, now - LOOKBACK_H * H)], key=lambda p: p["id"])


# ----------------------------------------------------------------------------- IO
class Discord:
    def __init__(self, url: str | None):
        self.url = url

    def post(self, content: str | None, embeds: list[dict]) -> bool:
        """Posts in chunks of 10 embeds. Never prints the URL or any exception text that could contain it."""
        chunks = [embeds[i:i + 10] for i in range(0, len(embeds), 10)] or [[]]
        for i, chunk in enumerate(chunks):
            body = {"username": "HOPIUM printer", "embeds": chunk, "allowed_mentions": {"parse": []}}
            if content and i == 0:
                body["content"] = content
            for attempt in range(4):
                try:
                    r = requests.post(self.url, json=body, timeout=20)
                except requests.RequestException as e:
                    print(f"discord: {type(e).__name__} (attempt {attempt + 1})")
                    time.sleep(2 * (attempt + 1))
                    continue
                if r.status_code == 429:
                    time.sleep(min(10.0, float((r.json() or {}).get("retry_after", 2))))
                    continue
                print(f"discord: HTTP {r.status_code}")
                if r.status_code >= 300:
                    return False
                break
            else:
                return False
        return True


def summary(note: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write(note + "\n")
    print(note)


def load_state() -> dict | None:
    try:
        return {**empty_state(), **json.loads(STATE_PATH.read_text())}
    except FileNotFoundError:
        return None


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")


def fetch(since_days: int = 3):
    from . import db
    pred_cols = "id,coin,signal,prob_up,score,price_at_call,price_at_target,move,outcome,candle_close_time,inserted_at,target_time,graded_at"
    since = iso(time.time() - since_days * 86400)
    preds = db.select_all("predictions", {"select": pred_cols, "candle_close_time": f"gte.{since}", "order": "id.asc"})
    first = db.select("predictions", {"select": "candle_close_time", "order": "candle_close_time.asc", "limit": "1"})
    runs = db.select_all("run_log", {"select": "*", "logged_at": f"gte.{since}", "order": "id.asc"})
    try:
        witness = db.select_all("witness_receipts", {"select": "id,status,detail,logged_at", "logged_at": f"gte.{since}", "order": "id.asc"})
    except Exception:
        witness = []
    return preds, runs, witness, (ts(first[0]["candle_close_time"]) if first else None)


def verify_chain_live() -> list[str] | None:
    """Recompute the whole chain from public rows. None = not checkable (tables missing or DB unreachable)."""
    from . import db
    from .commit import FIELDS, verify_chain
    try:
        cs = db.select_all("commitments", {"select": "*", "order": "seq.asc"})
        ps = db.select_all("predictions", {"select": ",".join(FIELDS), "order": "id.asc"})
    except Exception as e:
        print(f"chain check skipped: {type(e).__name__}")
        return None
    return verify_chain(cs, {p["id"]: p for p in ps})


def github_runs(now: float) -> list[dict] | None:
    tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not tok or not repo:
        return None
    try:
        r = requests.get(f"https://api.github.com/repos/{repo}/actions/workflows/hourly.yml/runs",
                         params={"created": f">={iso(now - (LOOKBACK_H + 1) * H)}", "per_page": "100", "event": "workflow_dispatch"},
                         headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}, timeout=20)
        r.raise_for_status()
        return r.json().get("workflow_runs", [])
    except requests.RequestException as e:
        print(f"github runs unavailable: {type(e).__name__}")
        return None


def parse_steps(s: str) -> dict[str, str]:
    return dict(kv.split("=", 1) for kv in s.split(",") if "=" in kv)


# ----------------------------------------------------------------------------- commands
def cmd_check(d: Discord, now: float) -> int:
    preds, runs, witness, launch = fetch()
    errs = verify_chain_live()
    incidents = {**missed_hours(preds, runs, now, launch),
                 **failures(runs, witness, parse_steps(os.environ.get("STEP_OUTCOMES", "")), os.environ.get("RUN_URL"), now),
                 **cron_gaps(github_runs(now), os.environ.get("GITHUB_REPOSITORY_OWNER", ""), now, launch),
                 **chain_problems(errs),
                 **site_lag(site_max_id(), preds, now)}
    state = load_state()
    if state is None:  # first run: everything that already happened counts as announced
        state = empty_state()
        state["reported"] = sorted(incidents)
        state["last_call_id"] = max([p["id"] for p in preds], default=0)
        state["last_graded_at"] = max([p["graded_at"] for p in preds if p.get("graded_at")], default=None)
        save_state(state)
        print(f"notifier initialised: {len(incidents)} existing incidents, calls up to #{state['last_call_id']} marked as announced")
        return 0
    allowed, _ = gate(state, incidents, now)
    calls, grades = new_calls(preds, state, now), new_grades(preds, state, now)
    embeds = incident_embeds(allowed) + [call_embed(p) for p in calls] + [graded_embed(p) for p in grades]
    held = len({k for k in incidents if k not in state["reported"]} - set(allowed))
    print(f"incidents: {len(incidents)} open, {len(allowed)} to send, {held} held by the 1/hour limit; calls {len(calls)}; grades {len(grades)}")
    if embeds and not d.post(None, embeds):
        return 1  # state not advanced: retried next run
    mark_sent(state, allowed, now)
    if calls:
        state["last_call_id"] = calls[-1]["id"]
    if grades:
        state["last_graded_at"] = max(p["graded_at"] for p in grades)
    # digest fallback: GitHub's own cron is often late or skipped
    today = iso(now)[:10]
    if state.get("digest_sent_for") != today and now >= int(now // 86400) * 86400 + 3 * H + 31 * 60:
        if d.post(None, [digest_embed(preds, runs, witness, errs, now, launch)]):
            state["digest_sent_for"] = today
    save_state(state)
    return 0


def cmd_digest(d: Discord, now: float) -> int:
    preds, runs, witness, launch = fetch()
    state = load_state() or empty_state()
    today = iso(now)[:10]
    if state.get("digest_sent_for") == today:
        print("digest already sent today")
        return 0
    if not d.post(None, [digest_embed(preds, runs, witness, verify_chain_live(), now, launch)]):
        return 1
    state["digest_sent_for"] = today
    save_state(state)
    return 0


def cmd_weekly(d: Discord, key: str) -> int:
    md = (Path(__file__).resolve().parents[2] / "reports" / f"{key}.md").read_text()
    return 0 if d.post(None, [weekly_embed(key, md)]) else 1


def cmd_test(d: Discord) -> int:
    ok = d.post(None, [{"title": "🧪 HOPIUM notifier test", "color": INK, "url": SITE,
                        "description": "If you can read this, the webhook works. The printer will now bother you about "
                                       "missed hours, failed jobs, pg_cron, the hash chain, every UP/DOWN call and its verdict, "
                                       "a daily digest at 03:31 UTC and the weekly report on Mondays.",
                        "footer": {"text": "Test message. No receipts were harmed."}}])
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "digest", "weekly", "test"])
    ap.add_argument("--week")
    a = ap.parse_args(argv)
    url = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not url:
        summary("Discord notifier skipped: secret DISCORD_WEBHOOK_URL is not set.")
        return 0
    d, now = Discord(url), time.time()
    if a.cmd == "check":
        return cmd_check(d, now)
    if a.cmd == "digest":
        return cmd_digest(d, now)
    if a.cmd == "weekly":
        return cmd_weekly(d, a.week)
    return cmd_test(d)


if __name__ == "__main__":
    sys.exit(main())
