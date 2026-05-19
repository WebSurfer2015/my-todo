#!/usr/bin/env node
/**
 * Probe every Firebase config file in this workspace to catch the exact
 * failure mode that broke sign-in on 2026-05-18: a re-downloaded plist
 * landed at the repo root but the Xcode/Android build artifacts were never
 * re-synced, so the installed app kept booting with an expired API_KEY and
 * every signInWithCredential call surfaced as auth/internal-error.
 *
 * Run after replacing GoogleService-Info.plist or google-services.json,
 * and any time sign-in starts misbehaving:
 *
 *   npm run check:firebase
 *
 * Checks:
 *   1. Each config file's API_KEY against Identity Toolkit.
 *   2. Root plist vs iOS build plist (must match byte-for-byte).
 *   3. Root google-services.json vs android/app/google-services.json.
 *
 * Exits 0 only if every key is live AND every paired file matches.
 * Failing fast here is the entire point of the script — never silently
 * pass a broken config.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(MOBILE_ROOT, "..");

const PAIRS = [
  {
    label: "iOS",
    root: resolve(MOBILE_ROOT, "GoogleService-Info.plist"),
    build: resolve(MOBILE_ROOT, "ios/TodosforEveryone/GoogleService-Info.plist"),
    extractKey: extractPlistApiKey,
    extractClient: extractPlistClientId,
  },
  {
    label: "Android",
    root: resolve(MOBILE_ROOT, "google-services.json"),
    build: resolve(MOBILE_ROOT, "android/app/google-services.json"),
    extractKey: extractJsonApiKey,
    extractClient: extractJsonClientId,
  },
];

const IDENTITY_TOOLKIT = "https://identitytoolkit.googleapis.com/v1/recaptchaParams";

let failures = 0;

for (const pair of PAIRS) {
  console.log(`\n[${pair.label}] ${rel(pair.root)} vs ${rel(pair.build)}`);

  const rootExists = existsSync(pair.root);
  const buildExists = existsSync(pair.build);
  if (!rootExists) {
    fail(`  missing: ${rel(pair.root)}`);
    continue;
  }
  if (!buildExists) {
    fail(`  missing: ${rel(pair.build)} — run 'npx expo prebuild --platform ${pair.label.toLowerCase()} --no-install' to sync from root`);
    continue;
  }

  const rootContent = readFileSync(pair.root, "utf8");
  const buildContent = readFileSync(pair.build, "utf8");
  const rootKey = pair.extractKey(rootContent);
  const buildKey = pair.extractKey(buildContent);

  if (!rootKey) {
    fail(`  could not extract API_KEY from ${rel(pair.root)}`);
    continue;
  }
  if (!buildKey) {
    fail(`  could not extract API_KEY from ${rel(pair.build)}`);
    continue;
  }

  if (rootKey !== buildKey) {
    const rootM = statSync(pair.root).mtime.toISOString();
    const buildM = statSync(pair.build).mtime.toISOString();
    fail(
      `  API_KEY drift: root has ${redact(rootKey)} (${rootM}); build has ${redact(buildKey)} (${buildM}). ` +
        `Run 'cp ${rel(pair.root)} ${rel(pair.build)}' (or 'npx expo prebuild --platform ${pair.label.toLowerCase()} --no-install'), then 'npm run ${pair.label === "iOS" ? "ios" : "android"}' to rebuild.`,
    );
  } else {
    ok(`  API_KEY match: both use ${redact(rootKey)}`);
  }

  const rootClient = pair.extractClient(rootContent);
  const buildClient = pair.extractClient(buildContent);
  if (rootClient && buildClient && rootClient !== buildClient) {
    fail(
      `  OAuth client_id drift: root has ${redact(rootClient)}; build has ${redact(buildClient)}. ` +
        `Sign-in idToken audience will not match Firebase expectations. ` +
        `Run 'cp ${rel(pair.root)} ${rel(pair.build)}' then rebuild.`,
    );
  } else if (rootClient && buildClient) {
    ok(`  OAuth client_id match: ${redact(rootClient)}`);
  }

  // Probe both keys independently so we catch the case where they
  // match but are both dead.
  for (const [label, key] of new Map([
    [`root  (${rel(pair.root)})`, rootKey],
    [`build (${rel(pair.build)})`, buildKey],
  ])) {
    const status = await probeKey(key);
    if (status.ok) {
      ok(`  ${label}: API_KEY live`);
    } else {
      fail(
        `  ${label}: API_KEY rejected — ${status.reason}. ` +
          `Re-download from Firebase Console (Project Settings -> Your apps -> ${pair.label} bundle).`,
      );
    }
  }
}

console.log("");
if (failures === 0) {
  console.log("Firebase config OK.");
  process.exit(0);
} else {
  console.error(`${failures} problem(s) found. See docs/AUTH-RECOVERY.md.`);
  process.exit(1);
}

// ---- helpers ---------------------------------------------------------

async function probeKey(apiKey) {
  try {
    const res = await fetch(`${IDENTITY_TOOLKIT}?key=${encodeURIComponent(apiKey)}`);
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    const reason =
      body?.error?.details?.find?.((d) => d?.reason)?.reason ??
      body?.error?.message ??
      `HTTP ${res.status}`;
    return { ok: false, reason };
  } catch (err) {
    return { ok: false, reason: `network error: ${err?.message ?? String(err)}` };
  }
}

function extractPlistApiKey(content) {
  const m = content.match(/<key>API_KEY<\/key>\s*<string>([^<]+)<\/string>/);
  return m?.[1] ?? null;
}

function extractJsonApiKey(content) {
  try {
    const obj = JSON.parse(content);
    const key = obj?.client?.[0]?.api_key?.[0]?.current_key;
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}

function extractPlistClientId(content) {
  const m = content.match(/<key>CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/);
  return m?.[1] ?? null;
}

function extractJsonClientId(content) {
  try {
    const obj = JSON.parse(content);
    const list = obj?.client?.[0]?.oauth_client;
    if (!Array.isArray(list)) return null;
    // client_type 3 = web; that's the OAuth client whose id Firebase
    // verifies against idToken aud claims.
    const web = list.find((c) => c?.client_type === 3);
    const id = web?.client_id ?? list[0]?.client_id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

function rel(p) {
  return relative(REPO_ROOT, p);
}

function redact(key) {
  if (!key || key.length < 12) return "<short>";
  return `${key.slice(0, 14)}...`;
}

function ok(msg) {
  console.log(msg);
}

function fail(msg) {
  failures += 1;
  console.error(msg);
}
