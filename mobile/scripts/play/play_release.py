#!/usr/bin/env python3
"""Google Play Console release helper.

Mirrors mobile/scripts/asc/asc_release.py for Play. Pushes localized
listings (title + short description + full description) and per-release
release notes via the Google Play Developer API. AAB upload is left to
EAS (`eas submit --platform android`) or to manual Play Console upload;
this script doesn't touch binaries.

CONFIG
  - release_copy.json   Play-specific per-locale title + shortDescription
                        + ASC→Play locale map. Edit when positioning
                        shifts.
  - whats_new.json      Per-version per-locale release notes (≤500 chars
                        each — Play's limit). Edit each release.
  - ../asc/release_copy.json   reused for fullDescription per locale
                               (kept aligned with App Store).

USAGE
  python3 play_release.py status
  python3 play_release.py list-tracks
  python3 play_release.py set-listings
  python3 play_release.py set-listings --locale en-US     # single locale
  python3 play_release.py set-release-notes --version 1.3.0 --track internal
  python3 play_release.py prepare --version 1.3.0 --track internal
  python3 play_release.py discard-edit --edit-id <id>     # safety

PRECONDITIONS  (manual, one-time)
  - Play Console developer account verified
  - App listing created in Play Console with packageName matching
    release_copy.json's `packageName`
  - Each Play locale we push must exist in Play Console → Store listing
    → Manage translations (the API can't add locales, only fill them)
  - For set-release-notes / prepare: an AAB for the target version must
    already exist on the target track (upload via Play Console first
    time; subsequent ones via EAS submit)

REQUIRES
  - ~/.googleplay/sagely-publisher.json (service account JSON, chmod 600)
    Granted the "Release apps to production" role in Play Console →
    Setup → API access.
  - pyjwt + cryptography (same install path as mobile/scripts/asc/).
    System Python (/usr/bin/python3) on macOS already has both.
"""
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import jwt  # pyjwt; needs cryptography backend for RS256

# ── Play project identity ─────────────────────────────────────────────
SA_PATH = "/Users/yingnming/.googleplay/sagely-publisher.json"
API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"

SCRIPT_DIR = Path(__file__).resolve().parent
PLAY_COPY_PATH = SCRIPT_DIR / "release_copy.json"
PLAY_WHATSNEW_PATH = SCRIPT_DIR / "whats_new.json"
ASC_COPY_PATH = SCRIPT_DIR.parent / "asc" / "release_copy.json"

# ── OAuth2 token (cached in-process) ───────────────────────────────────
_TOKEN: str | None = None
_TOKEN_EXP: float = 0.0


def token() -> str:
    """Service-account JWT-bearer flow → OAuth2 access token, cached."""
    global _TOKEN, _TOKEN_EXP
    if _TOKEN and time.time() < _TOKEN_EXP - 30:
        return _TOKEN
    try:
        st = os.stat(SA_PATH)
    except FileNotFoundError:
        raise SystemExit(
            f"Service account key not found at {SA_PATH}. "
            "Create one at https://console.cloud.google.com → IAM → "
            "Service Accounts → Create. Grant the 'Release apps to "
            "production' role under Play Console → Setup → API access, "
            "download the JSON key, save it to that path, chmod 600."
        )
    if st.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise SystemExit(
            f"Service account key {SA_PATH} is group/world-accessible "
            f"(mode={oct(st.st_mode & 0o777)}). Run: chmod 600 {SA_PATH}"
        )
    with open(SA_PATH, "rb") as f:
        sa = json.load(f)
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": sa["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": now,
            "exp": now + 3600,
        },
        sa["private_key"],
        algorithm="RS256",
    )
    data = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": assertion,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())
    _TOKEN = body["access_token"]
    _TOKEN_EXP = now + int(body.get("expires_in", 3600))
    return _TOKEN


def play(method: str, path: str, body: dict | None = None,
         query: dict | None = None) -> dict | None:
    """Authenticated request to Play Developer API. Returns parsed JSON
    (or None on 204). Surfaces error bodies verbatim on non-2xx."""
    url = API_BASE + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {"Authorization": f"Bearer {token()}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json; charset=UTF-8"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} on {method} {url}", file=sys.stderr)
        try:
            err = json.loads(e.read())
            print("  " + json.dumps(err, indent=2, ensure_ascii=False),
                  file=sys.stderr)
        except Exception:
            pass
        raise


# ── Config loaders ─────────────────────────────────────────────────────
def load_play_copy() -> dict:
    if not PLAY_COPY_PATH.exists():
        raise SystemExit(f"missing {PLAY_COPY_PATH}")
    with open(PLAY_COPY_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_play_whats_new() -> dict:
    if not PLAY_WHATSNEW_PATH.exists():
        raise SystemExit(f"missing {PLAY_WHATSNEW_PATH}")
    with open(PLAY_WHATSNEW_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_asc_copy() -> dict:
    if not ASC_COPY_PATH.exists():
        raise SystemExit(
            f"missing {ASC_COPY_PATH} — needed for fullDescription. "
            "Keep ASC and Play in lockstep per docs/POSITIONING.md.")
    with open(ASC_COPY_PATH, encoding="utf-8") as f:
        return json.load(f)


def full_description_for(play_locale: str, play_copy: dict,
                         asc_copy: dict) -> str | None:
    """Look up the localized full description in asc/release_copy.json
    by mapping the Play locale to its ASC equivalent. Returns None when
    no mapping or no entry exists."""
    asc_locale = play_copy["ascLocaleMap"].get(play_locale)
    if not asc_locale:
        return None
    entry = asc_copy["locales"].get(asc_locale)
    return entry["description"] if entry else None


def package_name() -> str:
    return load_play_copy()["packageName"]


# ── Edit lifecycle ─────────────────────────────────────────────────────
def insert_edit() -> str:
    """Create a new edit, return its id. Edits auto-expire after ~7
    days; commit or discard explicitly."""
    pkg = package_name()
    resp = play("POST", f"/applications/{pkg}/edits", body={})
    return resp["id"]


def commit_edit(edit_id: str) -> dict:
    pkg = package_name()
    return play("POST", f"/applications/{pkg}/edits/{edit_id}:commit") or {}


def discard_edit(edit_id: str) -> None:
    pkg = package_name()
    play("DELETE", f"/applications/{pkg}/edits/{edit_id}")


# ── Listings ───────────────────────────────────────────────────────────
def get_listings(edit_id: str) -> list[dict]:
    pkg = package_name()
    body = play("GET", f"/applications/{pkg}/edits/{edit_id}/listings")
    return body.get("listings", []) if body else []


def put_listing(edit_id: str, language: str, title: str, short: str,
                full: str) -> dict:
    pkg = package_name()
    return play(
        "PUT",
        f"/applications/{pkg}/edits/{edit_id}/listings/{language}",
        body={
            "language": language,
            "title": title,
            "shortDescription": short,
            "fullDescription": full,
        },
    )


# ── Tracks / release notes ─────────────────────────────────────────────
def list_tracks(edit_id: str) -> list[dict]:
    pkg = package_name()
    body = play("GET", f"/applications/{pkg}/edits/{edit_id}/tracks")
    return body.get("tracks", []) if body else []


def get_track(edit_id: str, track: str) -> dict:
    pkg = package_name()
    return play("GET", f"/applications/{pkg}/edits/{edit_id}/tracks/{track}")


def put_track(edit_id: str, track: str, releases: list[dict]) -> dict:
    """PUT replaces the track's releases array. Always GET → modify
    in place → PUT back so existing releases (versionCodes, status,
    rollout) aren't clobbered."""
    pkg = package_name()
    return play(
        "PUT",
        f"/applications/{pkg}/edits/{edit_id}/tracks/{track}",
        body={"track": track, "releases": releases},
    )


def attach_release_notes(releases: list[dict], version: str,
                         per_locale: dict[str, str]) -> dict:
    """Find the release matching `version` (or fall back to the most
    recent), splice in per-locale releaseNotes, return the target dict.
    Raises if `releases` is empty."""
    if not releases:
        raise SystemExit(
            "Track has no releases. Upload an AAB to this track first "
            "(Play Console manual upload, or `eas submit --platform "
            "android --track <track>` once the service account is wired).")
    target = next((r for r in releases if r.get("name") == version), None)
    if not target:
        print(f"  no release named {version!r}; falling back to most "
              f"recent: {releases[0].get('name')!r}")
        target = releases[0]
    target["releaseNotes"] = [
        {"language": loc, "text": text}
        for loc, text in per_locale.items()
    ]
    return target


# ── Commands ───────────────────────────────────────────────────────────
def cmd_status(args):
    """Read-only: open an edit, dump listings + tracks, discard."""
    edit_id = insert_edit()
    try:
        play_copy = load_play_copy()
        configured = set(play_copy["locales"].keys())

        listings = get_listings(edit_id)
        live = {l["language"] for l in listings}

        print(f"Package: {package_name()}")
        print(f"\nListing locales")
        print(f"  configured (release_copy.json):  {sorted(configured)}")
        print(f"  live (Play Console):             {sorted(live)}")
        missing = configured - live
        extra = live - configured
        if missing:
            print(f"  MISSING in Play (add via Console → Manage translations): "
                  f"{sorted(missing)}")
        if extra:
            print(f"  EXTRA in Play (not in our config): {sorted(extra)}")

        if listings:
            print(f"\nListing content per locale (live):")
            for l in listings:
                lang = l.get("language", "?")
                print(f"  {lang:<7}  title={len(l.get('title') or '')}  "
                      f"short={len(l.get('shortDescription') or '')}  "
                      f"full={len(l.get('fullDescription') or '')}")

        print(f"\nTracks")
        for t in list_tracks(edit_id):
            name = t.get("track", "?")
            releases = t.get("releases", []) or []
            if not releases:
                print(f"  {name}: (no releases)")
                continue
            for r in releases:
                vn = r.get("name", "?")
                status = r.get("status", "?")
                codes = ",".join(r.get("versionCodes", []) or [])
                notes = len(r.get("releaseNotes", []) or [])
                print(f"  {name}: release {vn}  status={status}  "
                      f"codes=[{codes}]  notes_locales={notes}")
    finally:
        try: discard_edit(edit_id)
        except Exception: pass


def cmd_list_tracks(args):
    edit_id = insert_edit()
    try:
        tracks = list_tracks(edit_id)
        for t in tracks:
            name = t.get("track", "?")
            releases = t.get("releases", []) or []
            if not releases:
                print(f"{name}: (no releases)")
                continue
            for r in releases:
                vn = r.get("name", "?")
                status = r.get("status", "?")
                codes = ",".join(r.get("versionCodes", []) or [])
                print(f"{name}: {vn}  status={status}  codes=[{codes}]")
    finally:
        try: discard_edit(edit_id)
        except Exception: pass


def cmd_set_listings(args):
    """Push title + shortDescription + fullDescription for every locale
    in release_copy.json. Single atomic edit, committed at the end."""
    play_copy = load_play_copy()
    asc_copy = load_asc_copy()
    title = play_copy["title"]

    edit_id = insert_edit()
    print(f"  edit {edit_id}")
    written = 0
    try:
        for play_locale, entry in play_copy["locales"].items():
            if args.locale and play_locale != args.locale:
                continue
            short = entry["shortDescription"]
            full = full_description_for(play_locale, play_copy, asc_copy)
            if not full:
                print(f"  ?  {play_locale}: no fullDescription in "
                      f"asc/release_copy.json (mapped from "
                      f"{play_copy['ascLocaleMap'].get(play_locale)!r}), "
                      f"skipping")
                continue
            put_listing(edit_id, play_locale, title, short, full)
            print(f"  ✓ {play_locale:<7}  title={len(title)}  "
                  f"short={len(short)}  full={len(full)}")
            written += 1
        if written == 0:
            discard_edit(edit_id)
            print("  no locales written; edit discarded")
            return
        commit_edit(edit_id)
        print(f"\n✓ committed ({written} locale{'s' if written != 1 else ''})")
    except Exception:
        try: discard_edit(edit_id)
        except Exception: pass
        raise


def cmd_set_release_notes(args):
    """Push per-locale release notes for `--version` to `--track`.
    Reads the track's releases, attaches releaseNotes to the matching
    release in place, PUTs back. Requires the release to already exist
    on the track (i.e. an AAB has been uploaded)."""
    notes = load_play_whats_new()
    version = args.version
    if version not in notes:
        raise SystemExit(
            f"No Play release notes for {version} in {PLAY_WHATSNEW_PATH}. "
            f"Add an entry under \"{version}\".")
    per_locale = {k: v for k, v in notes[version].items()
                  if not k.startswith("_")}

    edit_id = insert_edit()
    print(f"  edit {edit_id}")
    try:
        t = get_track(edit_id, args.track)
        releases = t.get("releases", []) or []
        target = attach_release_notes(releases, version, per_locale)
        put_track(edit_id, args.track, releases)
        for loc, text in per_locale.items():
            print(f"  ✓ {loc:<7}  release={target.get('name'):<8}  "
                  f"notes={len(text)}")
        commit_edit(edit_id)
        print(f"\n✓ committed")
    except Exception:
        try: discard_edit(edit_id)
        except Exception: pass
        raise


def cmd_prepare(args):
    """set-listings + set-release-notes in one atomic edit. Typical
    per-release one-liner once the AAB is uploaded."""
    play_copy = load_play_copy()
    asc_copy = load_asc_copy()
    notes = load_play_whats_new()
    version = args.version
    if version not in notes:
        raise SystemExit(
            f"No Play release notes for {version} in {PLAY_WHATSNEW_PATH}.")
    per_locale_notes = {k: v for k, v in notes[version].items()
                        if not k.startswith("_")}

    edit_id = insert_edit()
    print(f"== Preparing Play release {version} on '{args.track}' "
          f"(edit {edit_id}) ==\n")
    try:
        # 1) Listings
        print("Listings:")
        title = play_copy["title"]
        for play_locale, entry in play_copy["locales"].items():
            short = entry["shortDescription"]
            full = full_description_for(play_locale, play_copy, asc_copy)
            if not full:
                print(f"  ?  {play_locale}: no fullDescription, skipping")
                continue
            put_listing(edit_id, play_locale, title, short, full)
            print(f"  ✓ {play_locale:<7}  title={len(title)}  "
                  f"short={len(short)}  full={len(full)}")

        # 2) Release notes
        print("\nRelease notes:")
        t = get_track(edit_id, args.track)
        releases = t.get("releases", []) or []
        target = attach_release_notes(releases, version, per_locale_notes)
        put_track(edit_id, args.track, releases)
        for loc, text in per_locale_notes.items():
            print(f"  ✓ {loc:<7}  release={target.get('name'):<8}  "
                  f"notes={len(text)}")

        # 3) Commit
        commit_edit(edit_id)
        print(f"\n✓ committed — check Play Console for the diff before "
              f"promoting from '{args.track}' to higher tracks.")
    except Exception:
        try: discard_edit(edit_id)
        except Exception: pass
        raise


def cmd_discard_edit(args):
    discard_edit(args.edit_id)
    print(f"discarded {args.edit_id}")


# ── CLI ────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status",
                   help="show listing + track state (read-only)")
    sub.add_parser("list-tracks",
                   help="list tracks + releases (read-only)")

    sl = sub.add_parser("set-listings",
                        help="push title + shortDesc + fullDesc per locale")
    sl.add_argument("--locale",
                    help="only push a single locale (e.g. en-US)")

    rn = sub.add_parser("set-release-notes",
                        help="push per-locale release notes for a version "
                             "to a track")
    rn.add_argument("--version", required=True, help="e.g. 1.3.0")
    rn.add_argument("--track", default="internal",
                    choices=["internal", "alpha", "beta", "production"],
                    help="default internal (safest first-push target)")

    pr = sub.add_parser("prepare",
                        help="set-listings + set-release-notes "
                             "(single atomic edit)")
    pr.add_argument("--version", required=True)
    pr.add_argument("--track", default="internal",
                    choices=["internal", "alpha", "beta", "production"])

    de = sub.add_parser("discard-edit",
                        help="discard a dangling edit by id (safety)")
    de.add_argument("--edit-id", required=True)

    args = p.parse_args()
    handlers = {
        "status": cmd_status,
        "list-tracks": cmd_list_tracks,
        "set-listings": cmd_set_listings,
        "set-release-notes": cmd_set_release_notes,
        "prepare": cmd_prepare,
        "discard-edit": cmd_discard_edit,
    }
    handlers[args.cmd](args)


if __name__ == "__main__":
    main()
