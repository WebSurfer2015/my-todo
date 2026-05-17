#!/usr/bin/env python3
"""App Store Connect release helper.

Runs the things ASC's web UI makes you do by hand whenever you ship a new
version: link the just-uploaded build, set the privacy policy URL, push
description/keywords/promotional text to every locale, push the per-
version "What's New" copy. Idempotent — safe to re-run after any field is
already correct.

CONFIG
  - release_copy.json   stable long-form copy per locale (description,
                        keywords, promotionalText). Edit only when the
                        positioning shifts; otherwise leave alone.
  - whats_new.json      per-version "What's New" copy per locale. Edit
                        each release.

USAGE
  # See what versions / builds exist
  python3 asc_release.py list-versions
  python3 asc_release.py list-builds

  # Create a new appStoreVersion page (when ASC didn't auto-create one
  # off the build upload). Idempotent — no-ops if the version already
  # exists.
  python3 asc_release.py create-version --version 1.2.0

  # Full pre-submit prep on the in-flight version (privacy URL + locale
  # copy + what's new + build link). Picks the editable version
  # automatically; can override with --version <uuid>.
  python3 asc_release.py prepare

  # Or run sub-steps individually
  python3 asc_release.py link-build
  python3 asc_release.py set-privacy
  python3 asc_release.py set-copy
  python3 asc_release.py set-whats-new
  python3 asc_release.py status

  # Submit the in-flight version to Apple review (after prepare + a
  # manual eyeball of screenshots / age rating in ASC web UI)
  python3 asc_release.py submit-for-review

REQUIRES
  - /Users/yingnming/.appstoreconnect/AuthKey_<KEY_ID>.p8
  - System Python with pyjwt installed (the /usr/bin/python3 has it).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt  # pyjwt

# ── ASC project identity ───────────────────────────────────────────────
KEY_ID = "QD85GLBAA2"
ISSUER_ID = "34c60769-93e6-4cda-9faf-010ca1a57725"
KEY_PATH = "/Users/yingnming/.appstoreconnect/AuthKey_QD85GLBAA2.p8"
APP_ID = "6767378689"
API = "https://api.appstoreconnect.apple.com"

SCRIPT_DIR = Path(__file__).resolve().parent
COPY_PATH = SCRIPT_DIR / "release_copy.json"
WHATS_NEW_PATH = SCRIPT_DIR / "whats_new.json"

# Editable in-flight version states — anything else (READY_FOR_SALE,
# IN_REVIEW, etc.) is locked and can't be relinked or have its locale
# fields rewritten.
EDITABLE_VERSION_STATES = {
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
    "DEVELOPER_REMOVED_FROM_SALE",
}

# ── JWT + HTTP plumbing ────────────────────────────────────────────────
_TOKEN: str | None = None
_TOKEN_EXP: float = 0.0


def token() -> str:
    """Cached JWT, refreshed before the 20-minute expiry."""
    global _TOKEN, _TOKEN_EXP
    if _TOKEN and time.time() < _TOKEN_EXP - 30:
        return _TOKEN
    with open(KEY_PATH, "rb") as f:
        pk = f.read()
    exp = time.time() + 1200
    _TOKEN = jwt.encode(
        {"iss": ISSUER_ID, "iat": int(time.time()),
         "exp": int(exp), "aud": "appstoreconnect-v1"},
        pk, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"},
    )
    _TOKEN_EXP = exp
    return _TOKEN


def asc(method: str, path: str, body: dict | None = None) -> dict | None:
    """Authenticated request to ASC. Returns parsed JSON (or None on
    204). Surfaces ASC error bodies verbatim on non-2xx so the user can
    read them."""
    url = path if path.startswith("http") else API + path
    headers = {"Authorization": f"Bearer {token()}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} on {method} {url}", file=sys.stderr)
        try:
            err = json.loads(e.read())
            print("  " + json.dumps(err, indent=2), file=sys.stderr)
        except Exception:
            pass
        raise


# ── ASC lookups ────────────────────────────────────────────────────────
def find_editable_version() -> dict:
    """Return the appStoreVersions record currently in an editable state.
    Raises if there isn't exactly one."""
    body = asc("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=20")
    versions = body.get("data", []) if body else []
    editable = [v for v in versions
                if v["attributes"].get("appStoreState") in EDITABLE_VERSION_STATES]
    if not editable:
        raise SystemExit(
            "No editable appStoreVersion. States:\n  "
            + "\n  ".join(
                f"{v['attributes'].get('versionString')} "
                f"({v['attributes'].get('appStoreState')})  {v['id']}"
                for v in versions))
    if len(editable) > 1:
        for v in editable:
            print(f"  {v['attributes']['versionString']}  "
                  f"state={v['attributes']['appStoreState']}  id={v['id']}")
        raise SystemExit(
            f"Multiple editable versions ({len(editable)}). "
            "Pick one with --version <uuid>.")
    return editable[0]


def get_version(version_id: str | None) -> dict:
    """Resolve --version arg; default to the single editable version."""
    if version_id:
        body = asc("GET", f"/v1/appStoreVersions/{version_id}")
        return body["data"]
    return find_editable_version()


def list_version_localizations(version_id: str) -> list[dict]:
    body = asc("GET",
               f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations")
    return body.get("data", []) if body else []


def find_editable_app_info() -> dict:
    """The appInfo for the editable version (privacy URL, age rating,
    primary category live here). There are usually two appInfo records —
    one for the live version, one for the in-flight."""
    body = asc("GET", f"/v1/apps/{APP_ID}/appInfos")
    infos = body.get("data", []) if body else []
    editable_states = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW",
                       "READY_FOR_DISTRIBUTION", "DEVELOPER_REJECTED",
                       "REJECTED", "METADATA_REJECTED"}
    editable = [i for i in infos
                if i["attributes"].get("appStoreState") in editable_states]
    if not editable:
        # Fall back to first; may already be on the live appInfo if no
        # in-flight version exists.
        if not infos:
            raise SystemExit("No appInfo records found.")
        return infos[0]
    return editable[0]


def list_builds(limit: int = 10, version_number: str | None = None) -> list[dict]:
    """Recent builds for the app, newest first. Optionally filter to a
    specific build number via filter[version]."""
    parts = [f"filter[app]={APP_ID}", "sort=-uploadedDate", f"limit={limit}"]
    if version_number:
        parts.append(f"filter[version]={version_number}")
    body = asc("GET", f"/v1/builds?{'&'.join(parts)}")
    return body.get("data", []) if body else []


# ── Commands ───────────────────────────────────────────────────────────
def cmd_list_versions(_args):
    body = asc("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=20")
    print(f"{'version':<10}  {'state':<26}  uuid")
    print("-" * 78)
    for v in body.get("data", []):
        a = v["attributes"]
        print(f"{a.get('versionString',''):<10}  "
              f"{a.get('appStoreState',''):<26}  {v['id']}")


def cmd_list_builds(args):
    print(f"{'build#':<8}  {'state':<22}  {'uploaded':<26}  uuid")
    print("-" * 92)
    for b in list_builds(limit=args.limit):
        a = b["attributes"]
        print(f"{a.get('version','?'):<8}  "
              f"{a.get('processingState','?'):<22}  "
              f"{a.get('uploadedDate',''):<26}  {b['id']}")


def cmd_status(args):
    """One-shot summary of the editable version's readiness."""
    v = get_version(args.version)
    vid = v["id"]
    va = v["attributes"]
    print(f"Version {va['versionString']}  state={va.get('appStoreState')}  id={vid}")

    # Linked build
    body = asc("GET", f"/v1/appStoreVersions/{vid}?include=build")
    inc = body.get("included", [])
    if inc:
        ba = inc[0]["attributes"]
        print(f"  → linked build #{ba.get('version')}  "
              f"state={ba.get('processingState')}  id={inc[0]['id']}")
    else:
        print("  → no build linked")

    # Locales completeness
    print("\nLocalizations:")
    for l in list_version_localizations(vid):
        a = l["attributes"]
        flags = []
        for k, label in [("description", "desc"), ("keywords", "kw"),
                         ("promotionalText", "promo"), ("supportUrl", "support"),
                         ("whatsNew", "whatsNew")]:
            if a.get(k):
                flags.append(f"{label}={len(a[k]) if k != 'supportUrl' else '✓'}")
            else:
                flags.append(f"{label}=∅")
        print(f"  {a.get('locale',''):<8}  {', '.join(flags)}")

    # Privacy URL
    info = find_editable_app_info()
    body = asc("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations")
    locales_missing_privacy = [
        l for l in body.get("data", [])
        if not l["attributes"].get("privacyPolicyUrl")]
    print(f"\nPrivacy URL: "
          f"{'✓ set on all locales' if not locales_missing_privacy else '✗ missing on ' + ', '.join(l['attributes']['locale'] for l in locales_missing_privacy)}")


def cmd_create_version(args):
    """Create a new appStoreVersion page in PREPARE_FOR_SUBMISSION (e.g.
    1.2.0, 1.2.1). Idempotent — if a version with this string already
    exists for the app, prints its state + id and returns without
    creating a duplicate.

    Useful when ASC doesn't auto-create the App Store version page from
    an EAS auto-submit (which puts the binary on TestFlight but
    sometimes leaves no editable version on the App Store side).
    """
    target = args.version
    body = asc("GET", f"/v1/apps/{APP_ID}/appStoreVersions?limit=50")
    for v in body.get("data", []):
        if v["attributes"].get("versionString") == target:
            print(f"  version {target} already exists  "
                  f"state={v['attributes'].get('appStoreState')}  "
                  f"id={v['id']}")
            return
    resp = asc("POST", "/v1/appStoreVersions", {
        "data": {
            "type": "appStoreVersions",
            "attributes": {
                "versionString": target,
                "platform": args.platform,
                "releaseType": args.release_type,
            },
            "relationships": {
                "app": {"data": {"type": "apps", "id": APP_ID}},
            },
        },
    })
    v = resp["data"]
    print(f"  ✓ created version {target}  "
          f"state={v['attributes'].get('appStoreState')}  "
          f"id={v['id']}")
    print(f"    platform={v['attributes'].get('platform')}  "
          f"releaseType={v['attributes'].get('releaseType')}")
    print(f"\nNext: python3 asc_release.py prepare --version {v['id']}")


def cmd_submit_for_review(args):
    """Submit the editable appStoreVersion to Apple review using the
    newer reviewSubmissions flow (the legacy
    appStoreVersionSubmissions endpoint is soft-deprecated). Three API
    hops: create draft submission → attach version as a submission item
    → flip submitted=true.

    Idempotent-ish: if Apple already has a non-COMPLETE submission for
    this app, creating a new draft will fail with a clear ASC error
    surfaced by the asc() helper. Cancel the in-flight one in the web
    UI first.
    """
    v = get_version(args.version)
    vid = v["id"]
    print(f"Submitting {va_string(v)} ({vid}) for review…")

    print("  1/3 create draft reviewSubmission")
    resp = asc("POST", "/v1/reviewSubmissions", {
        "data": {
            "type": "reviewSubmissions",
            "attributes": {"platform": "IOS"},
            "relationships": {
                "app": {"data": {"type": "apps", "id": APP_ID}},
            },
        },
    })
    sub_id = resp["data"]["id"]
    print(f"      ✓ reviewSubmission {sub_id}")

    print("  2/3 attach version as submission item")
    asc("POST", "/v1/reviewSubmissionItems", {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {
                    "data": {"type": "reviewSubmissions", "id": sub_id},
                },
                "appStoreVersion": {
                    "data": {"type": "appStoreVersions", "id": vid},
                },
            },
        },
    })
    print(f"      ✓ attached {va_string(v)}")

    print("  3/3 flip submitted=true")
    asc("PATCH", f"/v1/reviewSubmissions/{sub_id}", {
        "data": {
            "type": "reviewSubmissions",
            "id": sub_id,
            "attributes": {"submitted": True},
        },
    })
    print(f"      ✓ submitted")
    print(f"\n{va_string(v)} is now in Apple's review queue. "
          f"Watch ASC for status updates.")


def cmd_rename_version(args):
    """Change an existing version page's versionString. Useful when a
    just-canceled review left an editable page on the old version (e.g.
    1.1.0 → DEVELOPER_REJECTED) and you want to reuse it for the next
    version (1.2.0) rather than create a fresh page. Defaults to the
    single editable version if --version is omitted.
    """
    v = get_version(args.version)
    current = v["attributes"].get("versionString")
    target = args.to
    print(f"  current: {current}  state={v['attributes'].get('appStoreState')}")
    if current == target:
        print(f"  already at {target}, no-op")
        return
    resp = asc("PATCH", f"/v1/appStoreVersions/{v['id']}", {
        "data": {
            "type": "appStoreVersions",
            "id": v["id"],
            "attributes": {"versionString": target},
        },
    })
    new = resp["data"]
    print(f"  ✓ renamed {current} → {new['attributes'].get('versionString')}")


def cmd_link_build(args):
    """Wait for the latest (or specified) build to be VALID, then link
    it to the editable version."""
    v = get_version(args.version)
    vid = v["id"]
    target_number = args.build  # None → latest available
    deadline = time.time() + args.timeout
    while True:
        builds = list_builds(limit=5, version_number=target_number)
        if builds:
            b = builds[0]
            state = b["attributes"].get("processingState", "?")
            bn = b["attributes"].get("version", "?")
            print(f"  build #{bn}  state={state}  id={b['id']}")
            if state == "VALID":
                break
            if state in ("INVALID", "FAILED"):
                raise SystemExit(f"build #{bn} is {state}")
        else:
            print(f"  build {target_number or '(latest)'} not yet uploaded")
        if time.time() >= deadline:
            raise SystemExit(f"timed out after {args.timeout}s waiting for build")
        time.sleep(args.poll)

    print(f"\nlinking {va_string(v)} → build #{bn} ({b['id']})")
    asc("PATCH",
        f"/v1/appStoreVersions/{vid}/relationships/build",
        {"data": {"type": "builds", "id": b["id"]}})
    print("  ✓ linked")


def va_string(v: dict) -> str:
    return v["attributes"].get("versionString", "?")


def cmd_set_privacy(args):
    """Push the privacy policy URL to every locale of the editable
    appInfo. URL comes from --url or from release_copy.json's
    `privacyPolicyUrl` field."""
    url = args.url or load_copy()["privacyPolicyUrl"]
    info = find_editable_app_info()
    body = asc("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations")
    for l in body.get("data", []):
        asc("PATCH",
            f"/v1/appInfoLocalizations/{l['id']}",
            {"data": {"type": "appInfoLocalizations", "id": l["id"],
                      "attributes": {"privacyPolicyUrl": url}}})
        print(f"  ✓ {l['attributes']['locale']:>8} → {url}")


def cmd_set_copy(args):
    """Push description / keywords / promotionalText / supportUrl from
    release_copy.json to every locale of the version. en-US is included
    by default; pass --skip-en to leave it alone."""
    copy = load_copy()
    v = get_version(args.version)
    vid = v["id"]
    for l in list_version_localizations(vid):
        loc = l["attributes"]["locale"]
        if args.skip_en and loc == "en-US":
            continue
        per = copy["locales"].get(loc) or copy["locales"].get(_locale_root(loc))
        if not per:
            print(f"  ?  {loc}: no copy on hand, skipping")
            continue
        attrs = {
            "description": per["description"],
            "keywords": per["keywords"],
            "promotionalText": per["promotionalText"],
            "supportUrl": copy["supportUrl"],
        }
        asc("PATCH",
            f"/v1/appStoreVersionLocalizations/{l['id']}",
            {"data": {"type": "appStoreVersionLocalizations", "id": l["id"],
                      "attributes": attrs}})
        print(f"  ✓ {loc:>8}  desc={len(attrs['description'])} "
              f"kw={len(attrs['keywords'])} "
              f"promo={len(attrs['promotionalText'])}")


def cmd_set_whats_new(args):
    """Push per-locale What's New from whats_new.json for the version
    string of the editable (or specified) version."""
    v = get_version(args.version)
    vid = v["id"]
    version_string = v["attributes"]["versionString"]
    notes = load_whats_new()
    if version_string not in notes:
        raise SystemExit(
            f"No What's New copy for {version_string} in {WHATS_NEW_PATH}. "
            f"Add an entry under \"{version_string}\".")
    locale_notes = notes[version_string]
    for l in list_version_localizations(vid):
        loc = l["attributes"]["locale"]
        text = locale_notes.get(loc) or locale_notes.get(_locale_root(loc))
        if not text:
            print(f"  ?  {loc}: no whatsNew on hand, skipping")
            continue
        asc("PATCH",
            f"/v1/appStoreVersionLocalizations/{l['id']}",
            {"data": {"type": "appStoreVersionLocalizations", "id": l["id"],
                      "attributes": {"whatsNew": text}}})
        print(f"  ✓ {loc:>8}  whatsNew={len(text)}")


def cmd_prepare(args):
    """End-to-end pre-submit prep: privacy URL → locale copy → what's
    new → wait for build → link build."""
    v = get_version(args.version)
    print(f"== Preparing {va_string(v)} ({v['id']}) ==\n")
    print("Privacy URL:")
    cmd_set_privacy(argparse.Namespace(url=None))
    print("\nLocale copy:")
    cmd_set_copy(argparse.Namespace(version=v["id"], skip_en=False))
    print("\nWhat's New:")
    cmd_set_whats_new(argparse.Namespace(version=v["id"]))
    print("\nBuild link:")
    cmd_link_build(argparse.Namespace(
        version=v["id"], build=args.build,
        timeout=args.timeout, poll=args.poll,
    ))
    print("\nFinal status:")
    cmd_status(argparse.Namespace(version=v["id"]))


# ── config files ────────────────────────────────────────────────────────
def load_copy() -> dict:
    if not COPY_PATH.exists():
        raise SystemExit(f"missing {COPY_PATH}")
    with open(COPY_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_whats_new() -> dict:
    if not WHATS_NEW_PATH.exists():
        raise SystemExit(f"missing {WHATS_NEW_PATH}")
    with open(WHATS_NEW_PATH, encoding="utf-8") as f:
        return json.load(f)


def _locale_root(loc: str) -> str:
    """es-MX → es. ASC accepts region-suffixed locales (es-ES, es-MX,
    fr-FR) but our copy is often shared across regions of the same
    language."""
    return loc.split("-", 1)[0]


# ── CLI ─────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-versions", help="list app versions")

    cv = sub.add_parser("create-version",
                        help="create a new appStoreVersion page (idempotent)")
    cv.add_argument("--version", required=True, help="e.g. 1.2.0")
    cv.add_argument("--platform", default="IOS",
                    choices=["IOS", "MAC_OS", "TV_OS", "VISION_OS"],
                    help="default IOS")
    cv.add_argument("--release-type", default="AFTER_APPROVAL",
                    choices=["MANUAL", "AFTER_APPROVAL", "SCHEDULED"],
                    help="default AFTER_APPROVAL (auto-release once Apple approves)")

    rv = sub.add_parser("rename-version",
                        help="change an editable version's versionString (e.g. 1.1.0 → 1.2.0 after a canceled review)")
    rv.add_argument("--version", help="appStoreVersion uuid (default: editable one)")
    rv.add_argument("--to", required=True, help="new version string e.g. 1.2.0")

    sr = sub.add_parser("submit-for-review",
                        help="submit the editable version to Apple review")
    sr.add_argument("--version", help="appStoreVersion uuid (default: editable one)")

    lb = sub.add_parser("list-builds", help="list recent builds")
    lb.add_argument("--limit", type=int, default=10)

    st = sub.add_parser("status", help="show in-flight version readiness")
    st.add_argument("--version", help="appStoreVersion uuid (default: editable one)")

    sp = sub.add_parser("set-privacy", help="set privacy policy URL on all locales")
    sp.add_argument("--url", help="override URL (default: from release_copy.json)")

    sc = sub.add_parser("set-copy", help="push description/keywords/promo/support from release_copy.json")
    sc.add_argument("--version")
    sc.add_argument("--skip-en", action="store_true",
                    help="don't touch en-US")

    sw = sub.add_parser("set-whats-new",
                        help="push What's New per locale from whats_new.json")
    sw.add_argument("--version")

    lk = sub.add_parser("link-build",
                        help="wait for build to be VALID then link to version")
    lk.add_argument("--version")
    lk.add_argument("--build", help="build number (default: most recent)")
    lk.add_argument("--timeout", type=int, default=900,
                    help="seconds to wait for VALID (default 900)")
    lk.add_argument("--poll", type=int, default=30,
                    help="poll interval seconds (default 30)")

    pr = sub.add_parser("prepare",
                        help="full pre-submit: privacy + copy + what's new + link")
    pr.add_argument("--version")
    pr.add_argument("--build", help="build number (default: most recent)")
    pr.add_argument("--timeout", type=int, default=900)
    pr.add_argument("--poll", type=int, default=30)

    args = p.parse_args()
    handlers = {
        "list-versions": cmd_list_versions,
        "create-version": cmd_create_version,
        "rename-version": cmd_rename_version,
        "submit-for-review": cmd_submit_for_review,
        "list-builds": cmd_list_builds,
        "status": cmd_status,
        "set-privacy": cmd_set_privacy,
        "set-copy": cmd_set_copy,
        "set-whats-new": cmd_set_whats_new,
        "link-build": cmd_link_build,
        "prepare": cmd_prepare,
    }
    handlers[args.cmd](args)


if __name__ == "__main__":
    main()
