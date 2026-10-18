import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for the privacy promise in docs/PRIVACY.md and the App
 * Store privacy label: "We do not use any analytics or advertising SDKs (no
 * Google Analytics / Firebase Analytics, no ad trackers)". Firebase Analytics
 * was removed 2026-10-17; this fails loudly if it — or another behavioral /
 * ad SDK — comes back as a dependency or an import.
 */

const here = dirname(fileURLToPath(import.meta.url))
const mobileRoot = join(here, '..', '..')
const srcRoot = join(here, '..')

const FORBIDDEN_PACKAGES = [
  '@react-native-firebase/analytics',
  'expo-firebase-analytics',
  'expo-tracking-transparency', // ATT prompt → implies cross-app tracking
  'react-native-fbsdk-next',
  '@segment/analytics-react-native',
  'mixpanel-react-native',
  '@amplitude/analytics-react-native',
  'posthog-react-native',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('privacy guard: no analytics / ad SDKs', () => {
  it('none in mobile/package.json dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(mobileRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(FORBIDDEN_PACKAGES.filter((p) => p in deps)).toEqual([])
  })

  it('none imported anywhere in mobile/src', () => {
    const offenders = walk(srcRoot).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return FORBIDDEN_PACKAGES.some((p) => text.includes(`'${p}'`) || text.includes(`"${p}"`))
    })
    expect(offenders).toEqual([])
  })

  it('the analytics seam stays a dependency-free no-op', () => {
    const seam = readFileSync(join(srcRoot, 'adapters', 'analytics.ts'), 'utf8')
    expect(seam).not.toMatch(/^\s*import\s/m)
  })
})
