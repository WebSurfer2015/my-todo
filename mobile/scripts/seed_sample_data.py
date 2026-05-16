#!/usr/bin/env python3
"""Seed Sagely demo data for the sample user (sagely.todo@gmail.com).

Authenticates against Firebase Auth (Identity Toolkit REST) with email +
password, then writes a fresh `users/<uid>/state/categories` and
`users/<uid>/state/todos` document to Firestore via REST. Re-run any time
to refresh the data based on today's date — dates in the dataset are
computed relative to the day the script runs.

Layout written (matches firestoreAdapter.ts):
  users/<uid>/state/<key>:
    value     stringValue  JSON string of { version: 1, data: [...] }
    updatedAt integerValue ms-since-epoch

Counts:
  2 today, 5 this week, 10 next week, 2 no date, 2 carried over (overdue),
  2 completed (today, in Done bin), 2 trashed (legacy, no completionDate).
  Within the set: 2 todos have steps with their own due dates, and 2 use
  rolling recurrence (one weekly, one monthly).

Usage:
  SAGELY_DEMO_PASSWORD=<password> python3 scripts/seed_sample_data.py
  # or omit and it'll prompt interactively.
"""
from __future__ import annotations

import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta

# Pulled from mobile/GoogleService-Info.plist (iOS client) and
# mobile/google-services.json (Android). Either key works for the
# Identity Toolkit + Firestore REST endpoints since they're rate-limited
# per project, not per platform. Project is the dev/prod merged
# `my-todos-1b079` Firestore.
PROJECT_ID = "my-todos-1b079"
WEB_API_KEY = "AIzaSyBJatuUC6_j78Sa29BzNCuAmyJi_gYmREw"
EMAIL = "sagely.todo@gmail.com"

SCHEMA_VERSION = 1

# Lifetime pebble baseline — added on top of today's task+subtask pebbles
# so the Profile cairn reads as "well-used" instead of a fresh install in
# marketing screenshots. Override with SAGELY_DEMO_PEBBLES=<n> env var
# (e.g. set to 0 for a truly clean cairn, or 200 for a heavy user).
LIFETIME_PEBBLES_BASE = int(os.environ.get("SAGELY_DEMO_PEBBLES", "42"))


# ── helpers ───────────────────────────────────────────────────────────────
def iso(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def http(method: str, url: str, body: dict | None = None, headers: dict | None = None,
         retry_on_429: int = 4):
    """Single HTTP round-trip with exponential backoff retries on Firestore's
    RESOURCE_EXHAUSTED (HTTP 429) responses. The free-tier quota recovers
    within seconds, so 0.5s/1s/2s/4s spacing usually clears it before the
    last attempt. Other HTTP errors surface immediately."""
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"} if data is not None else {}
    if headers:
        h.update(headers)
    last_text = ""
    for attempt in range(retry_on_429 + 1):
        req = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            last_text = e.read().decode("utf-8", "replace")
            if e.code == 429 and attempt < retry_on_429:
                wait = 0.5 * (2 ** attempt)
                print(f"  429 on {method} {url.rsplit('/', 1)[-1]} — retrying in {wait:.1f}s "
                      f"(attempt {attempt + 1}/{retry_on_429 + 1})", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"HTTP {e.code} on {method} {url}\n{last_text}", file=sys.stderr)
            raise
    # Unreachable — the loop either returns or raises.
    raise RuntimeError(f"http() retry loop exhausted: {last_text}")


def sign_in(email: str, password: str) -> tuple[str, str]:
    """Returns (uid, idToken)."""
    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
        f"?key={WEB_API_KEY}"
    )
    _, body = http(
        "POST",
        url,
        {"email": email, "password": password, "returnSecureToken": True},
    )
    return body["localId"], body["idToken"]


def firestore_put(uid: str, id_token: str, key: str, envelope: dict) -> None:
    """PATCH users/<uid>/state/<key> with the versioned envelope."""
    url = (
        f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
        f"/databases/(default)/documents/users/{uid}/state/{key}"
        "?updateMask.fieldPaths=value&updateMask.fieldPaths=updatedAt"
    )
    payload = {
        "fields": {
            "value": {"stringValue": json.dumps(envelope)},
            "updatedAt": {"integerValue": str(int(time.time() * 1000))},
        }
    }
    http("PATCH", url, payload, {"Authorization": f"Bearer {id_token}"})


def firestore_get(uid: str, id_token: str, key: str) -> dict | None:
    """GET users/<uid>/state/<key>; returns the parsed inner envelope dict
    (the `data` field of `{version, data}`) or None when the doc is missing."""
    url = (
        f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
        f"/databases/(default)/documents/users/{uid}/state/{key}"
    )
    try:
        _, body = http("GET", url, None, {"Authorization": f"Bearer {id_token}"})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    raw = body.get("fields", {}).get("value", {}).get("stringValue")
    if not raw:
        return None
    try:
        env = json.loads(raw)
    except Exception:
        return None
    return env.get("data") if isinstance(env, dict) and "data" in env else env


# ── dataset ───────────────────────────────────────────────────────────────
def build_categories() -> list[dict]:
    # Seed defaults match core/src/categories.ts SEED_CATEGORIES; Shopping
    # is a custom 5th category with the cart icon (mobile/src/icons.ts).
    return [
        {"id": "home",     "color": "#34C759", "icon": "home"},
        {"id": "work",     "color": "#007AFF", "icon": "briefcase"},
        {"id": "school",   "color": "#AF52DE", "icon": "graduation-cap"},
        {"id": "shopping", "label": "Shopping", "color": "#FF9500", "icon": "cart"},
    ]


def newid() -> str:
    return str(uuid.uuid4())


def end_of_this_week(today: date) -> date:
    """Upcoming Saturday (inclusive). Sun→Sat week, matching the app's
    `endOfWeekLocal()` in core/src/utils.ts:19-28."""
    # Python's weekday(): Mon=0..Sun=6. Convert to JS getDay (Sun=0..Sat=6).
    js_dow = (today.weekday() + 1) % 7
    offset = 6 if js_dow == 0 else 6 - js_dow
    return today + timedelta(days=offset)


def cluster_dates(start_offset: int, end_inclusive_offset: int,
                  today: date, count: int) -> list[date]:
    """Return `count` dates inside [today+start_offset, today+end_inclusive_offset],
    distributing round-robin so multiple items land on the same day when the
    window is shorter than `count`. Returns an empty list when the window has
    no slots (start > end)."""
    slots = end_inclusive_offset - start_offset + 1
    if slots <= 0:
        return []
    return [today + timedelta(days=start_offset + (i % slots))
            for i in range(count)]


def build_todos(today: date) -> list[dict]:
    now_ms = int(time.time() * 1000)

    def base(text, *, priority="medium", category=None, due="", done=False,
             trashed=False, trashed_at=None, completion_date=None,
             subtasks=None, recurrence=None, notes=None):
        td = {
            "id": newid(),
            "text": text,
            "done": done,
            "priority": priority,
            "dueDate": due,
            "trashed": trashed,
            "updatedAt": now_ms,
        }
        if category:
            td["category"] = category
        if trashed_at is not None:
            td["trashedAt"] = trashed_at
        if completion_date:
            td["completionDate"] = completion_date
        if subtasks:
            td["subtasks"] = subtasks
        if recurrence:
            td["recurrence"] = recurrence
        if notes:
            td["notes"] = notes
        return td

    eow = end_of_this_week(today)
    eow_offset = (eow - today).days
    # This Week window: items strictly after today through end-of-week (Sat).
    # On Saturdays the window is empty and the cluster returns [] — the
    # five items below fall through into next-week dates instead, and the
    # caller prints a warning.
    thisweek_dates = cluster_dates(1, eow_offset, today, 5)
    # Next Week window: end-of-week + 1 through end-of-week + 7 (next Sat).
    nextweek_dates = cluster_dates(eow_offset + 1, eow_offset + 7, today, 10)
    # Saturday fallback: place "this week" items on the first day of next
    # week so they're not silently dropped from the dataset.
    if not thisweek_dates:
        thisweek_dates = [today + timedelta(days=1)] * 5

    todos: list[dict] = []

    # — 2 today —
    todos.append(base("Take a 10-minute walk", priority="low",
                      category="home", due=iso(today)))
    todos.append(base("Email therapist about Friday",
                      category="home", due=iso(today)))

    # — 5 this week —
    todos.append(base("Submit project status update",
                      category="work", due=iso(thisweek_dates[0])))
    todos.append(base("Review reading group chapter", priority="low",
                      category="school", due=iso(thisweek_dates[1])))
    todos.append(base("Refill prescription",
                      category="home", due=iso(thisweek_dates[2])))
    # 1st task with steps — subs anchored to parent date ± 1 day
    grocery_due = thisweek_dates[3]
    todos.append(base(
        "Buy groceries",
        category="shopping",
        due=iso(grocery_due),
        notes="Smallest first step: peek in the fridge before leaving.",
        subtasks=[
            {"id": newid(), "text": "Milk, oats, eggs",
             "done": False, "priority": "medium", "dueDate": iso(grocery_due)},
            {"id": newid(), "text": "Apples, spinach",
             "done": False, "priority": "low",
             "dueDate": iso(grocery_due + timedelta(days=1))},
            {"id": newid(), "text": "Bread",
             "done": True, "priority": "low", "dueDate": iso(grocery_due)},
        ],
    ))
    # 1st recurring — monthly bill
    todos.append(base("Pay credit card bill", priority="high",
                      category="home", due=iso(thisweek_dates[4]),
                      recurrence={"freq": "monthly"}))

    # — 10 next week —
    todos.append(base("Annual physical", priority="high",
                      category="home", due=iso(nextweek_dates[0])))
    todos.append(base("Tidy the desk for 5 min", priority="low",
                      category="home", due=iso(nextweek_dates[1])))
    # 2nd task with steps — subs anchored to parent date ± 1 day
    retro_due = nextweek_dates[2]
    todos.append(base(
        "Team retro prep",
        category="work",
        due=iso(retro_due),
        subtasks=[
            {"id": newid(), "text": "Read past meeting notes",
             "done": False, "priority": "medium",
             "dueDate": iso(retro_due - timedelta(days=1)
                            if retro_due - timedelta(days=1) > today
                            else retro_due)},
            {"id": newid(), "text": "Draft 3 wins to share",
             "done": False, "priority": "medium",
             "dueDate": iso(retro_due)},
        ],
    ))
    # 2nd recurring — weekly yoga
    todos.append(base("Yoga class", priority="low",
                      category="home", due=iso(nextweek_dates[3]),
                      recurrence={"freq": "weekly"}))
    todos.append(base("Renew library books", priority="low",
                      category="home", due=iso(nextweek_dates[4])))
    todos.append(base("Read chapter 5", priority="low",
                      category="school", due=iso(nextweek_dates[5])))
    todos.append(base("Call mom", category="home",
                      due=iso(nextweek_dates[6])))
    todos.append(base("Order birthday gift",
                      category="shopping",
                      due=iso(nextweek_dates[7])))
    todos.append(base("Plan weekend trip", priority="low",
                      category="home", due=iso(nextweek_dates[8])))
    todos.append(base("1:1 prep for Monday",
                      category="work", due=iso(nextweek_dates[9])))

    # — 2 no date —
    todos.append(base("Tidy the bookshelf", priority="low",
                      category="home"))
    todos.append(base("Look into journaling apps", priority="low",
                      category="home"))

    # — 2 carried over (overdue) —
    todos.append(base("Send slides to Anna", priority="high",
                      category="work", due=iso(today - timedelta(days=3))))
    todos.append(base("Pick up dry cleaning",
                      category="home", due=iso(today - timedelta(days=2))))

    # — 2 completed (today; will land in the "Today" Done group) —
    today_iso = iso(today)
    todos.append(base("Morning meditation", priority="low",
                      category="home", due=today_iso,
                      done=True, trashed=True,
                      trashed_at=now_ms, completion_date=today_iso))
    todos.append(base("Drink water before coffee", priority="low",
                      category="home", due=today_iso,
                      done=True, trashed=True,
                      trashed_at=now_ms, completion_date=today_iso))

    # — 2 trashed (no completionDate → "Earlier" Done group) —
    five_days_ago_ms = now_ms - 5 * 24 * 60 * 60 * 1000
    todos.append(base("Unread newsletter cleanup", priority="low",
                      category="home", trashed=True,
                      trashed_at=five_days_ago_ms))
    todos.append(base("Old todo from last week", priority="low",
                      category="home", trashed=True,
                      trashed_at=five_days_ago_ms))

    return todos


# ── main ──────────────────────────────────────────────────────────────────
def main() -> int:
    password = os.environ.get("SAGELY_DEMO_PASSWORD")
    if not password:
        password = getpass.getpass(f"Password for {EMAIL}: ")
    if not password:
        print("no password provided", file=sys.stderr)
        return 2

    print(f"Signing in as {EMAIL}…", flush=True)
    uid, id_token = sign_in(EMAIL, password)
    print(f"  uid = {uid}")

    today = date.today()
    print(f"Building dataset for {today.isoformat()}…")
    eow = end_of_this_week(today)
    if (eow - today).days == 0:
        print("  ⚠  Today is Saturday — 'This Week' bucket has 0 remaining "
              "days; the 5 'this week' items will cluster on Sunday and "
              "show up under Upcoming.")
    cats = build_categories()
    todos = build_todos(today)

    summary = {
        "today": 0, "thisWeek": 0, "nextWeek": 0, "noDate": 0,
        "carriedOver": 0, "completed": 0, "trashed": 0,
        "withSteps": 0, "recurring": 0,
    }
    today_iso = today.isoformat()
    end_of_week = eow.isoformat()
    end_of_nextweek = (eow + timedelta(days=7)).isoformat()
    for t in todos:
        if t.get("subtasks"):
            summary["withSteps"] += 1
        if t.get("recurrence"):
            summary["recurring"] += 1
        if t["trashed"] and t.get("done"):
            summary["completed"] += 1
        elif t["trashed"]:
            summary["trashed"] += 1
        elif not t["dueDate"]:
            summary["noDate"] += 1
        elif t["dueDate"] < today_iso:
            summary["carriedOver"] += 1
        elif t["dueDate"] == today_iso:
            summary["today"] += 1
        elif t["dueDate"] <= end_of_week:
            summary["thisWeek"] += 1
        elif t["dueDate"] <= end_of_nextweek:
            summary["nextWeek"] += 1

    print(f"  {len(cats)} categories, {len(todos)} todos")
    for k, v in summary.items():
        print(f"    {k:>14}: {v}")

    # Pebble counts — the seed bypasses the in-app toggle path, so
    # incrementPebble() never runs and lifetime/today counters stay at zero.
    # Mirror what those toggles would have produced: one task pebble per
    # completed top-level todo (done && trashed && completionDate == today),
    # one subtask pebble per checked sub on a non-trashed parent.
    task_pebbles_today = sum(
        1 for t in todos
        if t.get("done") and t.get("trashed") and t.get("completionDate") == today_iso
    )
    subtask_pebbles_today = 0
    for t in todos:
        if t.get("trashed"):
            continue
        for s in t.get("subtasks", []) or []:
            if s.get("done"):
                subtask_pebbles_today += 1
    lifetime_pebbles = (
        LIFETIME_PEBBLES_BASE + task_pebbles_today + subtask_pebbles_today
    )

    summary["taskPebbles"] = task_pebbles_today
    summary["subtaskPebbles"] = subtask_pebbles_today
    summary["lifetimePebbles"] = lifetime_pebbles

    print(f"  {len(cats)} categories, {len(todos)} todos")
    for k, v in summary.items():
        print(f"    {k:>14}: {v}")

    print("Writing to Firestore…")
    firestore_put(uid, id_token, "categories",
                  {"version": SCHEMA_VERSION, "data": cats})
    firestore_put(uid, id_token, "todos",
                  {"version": SCHEMA_VERSION, "data": todos})

    # Merge pebble fields into the existing profile so we don't clobber
    # the user's name/avatar/quote. Missing profile → start from an empty
    # dict; the app's migrateProfile fills the rest at read time.
    profile = firestore_get(uid, id_token, "profile") or {}
    if not isinstance(profile, dict):
        profile = {}
    profile["lifetimePebbles"] = lifetime_pebbles
    profile["todayTaskPebbles"] = task_pebbles_today
    profile["todaySubtaskPebbles"] = subtask_pebbles_today
    profile["pebblesDate"] = today_iso
    firestore_put(uid, id_token, "profile",
                  {"version": SCHEMA_VERSION, "data": profile})

    print(f"\nDone — open the simulator signed in as {EMAIL} to see the data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
