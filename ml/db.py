"""Tiny Supabase REST client (service key, server-side only)."""
import os

import requests

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def _h(extra=None):
    if not URL or not KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    h.update(extra or {})
    return h


def insert(table, rows, ignore_duplicates=True):
    pref = "return=representation" + (",resolution=ignore-duplicates" if ignore_duplicates else "")
    r = requests.post(f"{URL}/rest/v1/{table}", json=rows, headers=_h({"Prefer": pref}), timeout=30)
    r.raise_for_status()
    return r.json()


def select(table, params):
    r = requests.get(f"{URL}/rest/v1/{table}", params=params, headers=_h(), timeout=30)
    r.raise_for_status()
    return r.json()
