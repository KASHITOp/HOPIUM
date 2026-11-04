"""Minimal Supabase REST client with retries. Service key only ever lives in GitHub Actions secrets."""
from __future__ import annotations

import os
import re
import time

import requests

URL = ""  # set below via normalize_url
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")



def normalize_url(raw: str) -> str:
    """Accept the API URL (https://<ref>.supabase.co), a dashboard link (.../project/<ref>) or a bare ref."""
    raw = (raw or "").strip().rstrip("/")
    m = re.search(r"/project/([a-z0-9]{15,})", raw) or re.fullmatch(r"([a-z0-9]{15,})", raw)
    if m:
        return f"https://{m.group(1)}.supabase.co"
    m = re.match(r"(https://[a-z0-9]+\.supabase\.co)", raw)
    return m.group(1) if m else raw


URL = normalize_url(os.environ.get("SUPABASE_URL", ""))


def configured() -> bool:
    return bool(URL and KEY)


def _req(method, path, *, params=None, json=None, prefer=None, tries=4):
    if not configured():
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    for i in range(tries):
        try:
            r = requests.request(method, f"{URL}/rest/v1/{path}", params=params, json=json, headers=h, timeout=30)
            if r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code} {r.text[:200]}")
            if r.status_code >= 400:   # client errors (constraint violations) are not retried
                raise RuntimeError(f"supabase {method} {path} -> {r.status_code}: {r.text[:500]}")
            return r.json() if r.text else None
        except requests.RequestException as e:
            if i == tries - 1:
                raise
            print(f"  retry {i + 1} after error: {e}")
            time.sleep(2 ** (i + 1))


def select(table, params):
    return _req("GET", table, params=params)


def insert(table, rows, on_conflict=None, ignore_duplicates=True):
    params = {"on_conflict": on_conflict} if on_conflict else None
    res = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
    return _req("POST", table, params=params, json=rows, prefer=f"return=representation,resolution={res}")


def patch(table, filters, body):
    return _req("PATCH", table, params=filters, json=body, prefer="return=representation")


def delete(table, filters):
    return _req("DELETE", table, params=filters, prefer="return=minimal")


def log_run(job, status, candle_close_time=None, detail=None):
    if not configured():
        print(f"[run_log] {job} {status} {candle_close_time} {detail}")
        return
    row = {"job": job, "status": status, "detail": (detail or "")[:2000]}
    if candle_close_time is not None:
        row["candle_close_time"] = candle_close_time
    try:
        insert("run_log", [row])
    except Exception as e:  # logging must never mask the real failure
        print(f"  could not write run_log: {e}")
