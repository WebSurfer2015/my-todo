#!/usr/bin/env python3
"""
Upload App Store screenshots to App Store Connect for version 1.0 (id baked in).

Usage:
  python3 asc_upload_screenshots.py <directory>
  python3 asc_upload_screenshots.py <directory> --locale en-US
  python3 asc_upload_screenshots.py <directory> --replace

The script:
  1. Scans <directory> for *.png / *.jpg / *.jpeg, sorted by filename.
  2. Detects each image's dimensions and routes to the matching ASC display
     type (currently APP_IPHONE_65 and APP_IPAD_PRO_3GEN_129; extend
     SUPPORTED_SIZES below if you add more device classes).
  3. Reuses an existing AppScreenshotSet for that display type if present;
     otherwise creates one.
  4. Uploads each file via the ASC two-step protocol (POST appScreenshots →
     PUT to upload URL → PATCH uploaded=true with MD5).
  5. Sets the screenshot order to match filename sort order.

With --replace, deletes any existing screenshots in matching sets first
(useful when re-uploading a corrected batch).
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

import jwt  # pyjwt
from PIL import Image

# ── Config ─────────────────────────────────────────────────────────────────
KEY_ID = "QD85GLBAA2"
ISSUER_ID = "34c60769-93e6-4cda-9faf-010ca1a57725"
KEY_PATH = "/Users/yingnming/.appstoreconnect/AuthKey_QD85GLBAA2.p8"
APP_STORE_VERSION_ID = "5024a18a-6446-4818-8b94-a743314ef904"  # 1.0
DEFAULT_LOCALE = "en-US"
API = "https://api.appstoreconnect.apple.com"

# (width, height) → ASC screenshotDisplayType. Apple validates dimensions
# strictly per slot — a 1290×2796 image will be rejected in the 6.5" slot
# even though it was historically accepted there. Use the slot that matches
# the actual device class.
SUPPORTED_SIZES = {
    # iPhone 6.5" (iPhone XS Max, 11 Pro Max)
    (1242, 2688): "APP_IPHONE_65",
    (2688, 1242): "APP_IPHONE_65",
    # iPhone 6.7" (iPhone 12/13/14/15 Pro Max)
    (1290, 2796): "APP_IPHONE_67",
    (2796, 1290): "APP_IPHONE_67",
    (1284, 2778): "APP_IPHONE_67",
    (2778, 1284): "APP_IPHONE_67",
    # iPhone 6.9" (iPhone 16/17 Pro Max) — APP_IPHONE_69 isn't a valid
    # ASC slot yet; native captures from these devices need to be
    # downscaled to 1290×2796 (APP_IPHONE_67) before upload.
    # iPad Pro 12.9" 3rd gen (and 4th/5th/6th — same resolution)
    (2048, 2732): "APP_IPAD_PRO_3GEN_129",
    (2732, 2048): "APP_IPAD_PRO_3GEN_129",
}

# ── ASC client ─────────────────────────────────────────────────────────────
def make_token() -> str:
    with open(KEY_PATH, "rb") as f:
        pk = f.read()
    return jwt.encode(
        {
            "iss": ISSUER_ID,
            "iat": int(time.time()),
            "exp": int(time.time()) + 1200,
            "aud": "appstoreconnect-v1",
        },
        pk,
        algorithm="ES256",
        headers={"kid": KEY_ID, "typ": "JWT"},
    )


_token: Optional[str] = None


def _get_token() -> str:
    global _token
    if _token is None:
        _token = make_token()
    return _token


def _send(method, url, data, headers):
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r) as resp:
        raw = resp.read()
        return resp.status, (json.loads(raw) if raw else None)


def req(method: str, path_or_url: str, body=None, headers=None):
    url = path_or_url if path_or_url.startswith("http") else API + path_or_url
    data = json.dumps(body).encode() if body is not None else None
    base = {"Content-Type": "application/json"} if data is not None else {}
    if headers:
        base.update(headers)
    for attempt in (1, 2):
        h = {"Authorization": f"Bearer {_get_token()}", **base}
        try:
            return _send(method, url, data, h)
        except urllib.error.HTTPError as e:
            # Refresh once on 401 (expired/invalid JWT); otherwise surface.
            if e.code == 401 and attempt == 1:
                global _token
                _token = make_token()
                continue
            body_text = e.read().decode("utf-8", "replace")
            print(f"HTTP {e.code} on {method} {path_or_url}\n{body_text}", file=sys.stderr)
            raise


def upload_chunk(method: str, url: str, headers: dict, payload: bytes):
    """Apple's signed upload URL — no Bearer auth, custom headers from API.

    Retries on transient TLS/socket errors that intermittently surface from
    Apple's upload edge (BrokenPipe, ConnectionReset, SSL bad-record-mac).
    Each retry uses a fresh connection.
    """
    import ssl
    last_err: Exception | None = None
    for attempt in range(5):
        try:
            r = urllib.request.Request(url, data=payload, method=method, headers=headers)
            with urllib.request.urlopen(r, timeout=60) as resp:
                return resp.status
        except (BrokenPipeError, ConnectionResetError, ssl.SSLError,
                urllib.error.URLError, TimeoutError) as e:
            last_err = e
            if attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise
    raise last_err  # unreachable


# ── ASC operations ─────────────────────────────────────────────────────────
def find_localization(locale: str) -> str:
    _, body = req(
        "GET",
        f"/v1/appStoreVersions/{APP_STORE_VERSION_ID}/appStoreVersionLocalizations",
    )
    for loc in body.get("data", []):
        if loc["attributes"].get("locale") == locale:
            return loc["id"]
    raise SystemExit(f"No appStoreVersionLocalization for locale {locale}")


def find_or_create_set(localization_id: str, display_type: str) -> str:
    _, body = req(
        "GET",
        f"/v1/appStoreVersionLocalizations/{localization_id}/appScreenshotSets",
    )
    for s in body.get("data", []):
        if s["attributes"].get("screenshotDisplayType") == display_type:
            return s["id"]
    _, created = req(
        "POST",
        "/v1/appScreenshotSets",
        {
            "data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": display_type},
                "relationships": {
                    "appStoreVersionLocalization": {
                        "data": {
                            "type": "appStoreVersionLocalizations",
                            "id": localization_id,
                        }
                    }
                },
            }
        },
    )
    return created["data"]["id"]


def list_set_items(set_id: str) -> list[dict]:
    _, body = req("GET", f"/v1/appScreenshotSets/{set_id}/appScreenshots?limit=200")
    return body.get("data", [])


def delete_screenshot(shot_id: str):
    req("DELETE", f"/v1/appScreenshots/{shot_id}")


def reserve_screenshot(set_id: str, file_name: str, file_size: int) -> dict:
    _, body = req(
        "POST",
        "/v1/appScreenshots",
        {
            "data": {
                "type": "appScreenshots",
                "attributes": {"fileName": file_name, "fileSize": file_size},
                "relationships": {
                    "appScreenshotSet": {
                        "data": {"type": "appScreenshotSets", "id": set_id}
                    }
                },
            }
        },
    )
    return body["data"]


def commit_screenshot(shot_id: str, md5_hex: str):
    req(
        "PATCH",
        f"/v1/appScreenshots/{shot_id}",
        {
            "data": {
                "type": "appScreenshots",
                "id": shot_id,
                "attributes": {"uploaded": True, "sourceFileChecksum": md5_hex},
            }
        },
    )


def reorder_set(set_id: str, ordered_ids: list[str]):
    req(
        "PATCH",
        f"/v1/appScreenshotSets/{set_id}/relationships/appScreenshots",
        {"data": [{"type": "appScreenshots", "id": sid} for sid in ordered_ids]},
    )


# ── Main flow ──────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("directory", help="Folder containing PNG/JPG screenshots")
    ap.add_argument("--locale", default=DEFAULT_LOCALE)
    ap.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing screenshots in matching sets first",
    )
    args = ap.parse_args()

    src = Path(args.directory).expanduser().resolve()
    if not src.is_dir():
        sys.exit(f"Not a directory: {src}")

    files = sorted(
        p
        for p in src.iterdir()
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg"}
    )
    if not files:
        sys.exit(f"No PNG/JPG files in {src}")

    # Group by detected display type
    by_type: dict[str, list[Path]] = {}
    skipped: list[tuple[Path, tuple]] = []
    for p in files:
        with Image.open(p) as im:
            size = im.size
        dt = SUPPORTED_SIZES.get(size)
        if dt is None:
            skipped.append((p, size))
            continue
        by_type.setdefault(dt, []).append(p)

    if skipped:
        print("Skipping (unsupported size):")
        for p, sz in skipped:
            print(f"  {p.name}  {sz[0]}x{sz[1]}")
        print(
            "  Supported: "
            + ", ".join(f"{w}x{h}→{t}" for (w, h), t in SUPPORTED_SIZES.items())
        )

    if not by_type:
        sys.exit("Nothing to upload.")

    print(f"\nLocale: {args.locale}")
    loc_id = find_localization(args.locale)
    print(f"  localization id = {loc_id}")

    for display_type, paths in by_type.items():
        print(f"\n== {display_type} — {len(paths)} screenshot(s) ==")
        set_id = find_or_create_set(loc_id, display_type)
        print(f"  set id = {set_id}")

        pre_existing_ids: list[str] = []
        if args.replace:
            existing = list_set_items(set_id)
            if existing:
                print(f"  --replace: deleting {len(existing)} existing screenshot(s)")
                for s in existing:
                    delete_screenshot(s["id"])
        else:
            pre_existing_ids = [s["id"] for s in list_set_items(set_id)]

        new_ids: list[str] = []
        for path in paths:
            data = path.read_bytes()
            md5_hex = hashlib.md5(data).hexdigest()
            print(f"  upload {path.name} ({len(data)} bytes md5={md5_hex})")
            shot = reserve_screenshot(set_id, path.name, len(data))
            shot_id = shot["id"]
            ops = shot["attributes"]["uploadOperations"]
            for op in ops:
                method = op["method"]
                url = op["url"]
                length = op["length"]
                offset = op["offset"]
                op_headers = {h["name"]: h["value"] for h in op["requestHeaders"]}
                upload_chunk(method, url, op_headers, data[offset : offset + length])
            commit_screenshot(shot_id, md5_hex)
            new_ids.append(shot_id)
            print(f"    ✓ shot id = {shot_id}")

        ordered = new_ids if args.replace else pre_existing_ids + new_ids
        if len(ordered) > 1:
            reorder_set(set_id, ordered)
            print(f"  ordered {len(ordered)} screenshot(s)")

    print("\nDone. Verify in App Store Connect → app 6767378689 → 1.0 → Screenshots.")


if __name__ == "__main__":
    main()
