#!/usr/bin/env python3
"""Clear the Sagely demo account to an EMPTY state (sagely.todo@gmail.com).

Companion to seed_sample_data.py — reuses its auth + Firestore REST helpers
to overwrite the demo account's state with empty collections, so the
empty-state UIs render:
  - Todos tab  → "You're all caught up."   (flow 12)
  - Shopping   → "No stores yet."          (flow 10)

Keeps the profile's name / avatar / pebble counts; only zeroes the grocery
stores + pins. Run the same way as the seed script (same env vars), then
re-run seed_sample_data.py afterward to restore the demo dataset.

Usage:
  SAGELY_FIREBASE_WEB_API_KEY=<key> SAGELY_DEMO_EMAIL=<email> \\
  SAGELY_DEMO_PASSWORD=<password> python3 scripts/clear_sample_data.py
"""
from __future__ import annotations

import getpass
import os
import sys

import seed_sample_data as seed


def main() -> int:
    password = os.environ.get("SAGELY_DEMO_PASSWORD") or getpass.getpass(
        "Demo account password: "
    )
    uid, id_token = seed.sign_in(seed.EMAIL, password)
    print(f"Signed in as {seed.EMAIL} ({uid}). Clearing to empty state…")

    empty = lambda: {"version": seed.SCHEMA_VERSION, "data": []}

    # Keep categories so the category system stays intact; everything else
    # goes empty. (Empty todos → "You're all caught up.")
    seed.firestore_put(uid, id_token, "categories",
                       {"version": seed.SCHEMA_VERSION, "data": seed.build_categories()})
    seed.firestore_put(uid, id_token, "todos", empty())
    seed.firestore_put(uid, id_token, "groceryGroups", empty())
    seed.firestore_put(uid, id_token, "groceries", empty())
    seed.firestore_put(uid, id_token, "todoReferences", empty())

    # Profile: keep name/avatar/pebbles, but zero the grocery stores + pins
    # so Shopping shows the "No stores yet." empty state (flow 10).
    profile = seed.firestore_get(uid, id_token, "profile") or {}
    if not isinstance(profile, dict):
        profile = {}
    profile["groceryStores"] = []
    profile["pinnedGroceryStores"] = []
    profile["pinnedGroceryDepts"] = []
    seed.firestore_put(uid, id_token, "profile",
                       {"version": seed.SCHEMA_VERSION, "data": profile})

    print("Done — account is now empty. Cold-launch the sim to rehydrate; "
          "re-run seed_sample_data.py to restore the demo dataset.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
