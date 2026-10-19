/**
 * Maestro flows select seeded to-do rows by text. A row is ONE VoiceOver
 * element whose label is "<title>, <state>, <date>, …" — so an exact
 * `text: "<title>"` never matches it (flow 17 silently broke that way). Every
 * selector naming a seeded title must be a regex (".*<title>.*").
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const flowsDir = join(root, '.maestro', 'flows')

/** Seeded to-do titles: every `base("<title>"` in the seed script. */
function seededTitles(): string[] {
  const seed = readFileSync(join(root, 'scripts', 'seed_sample_data.py'), 'utf8')
  return [...seed.matchAll(/\bbase\("([^"]+)"/g)].map((m) => m[1])
}

/** Every double-quoted YAML value in a flow, with its line number. */
function quotedValues(yaml: string): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = []
  yaml.split('\n').forEach((l, i) => {
    if (l.trimStart().startsWith('#')) return
    for (const m of l.matchAll(/"([^"]*)"/g)) out.push({ value: m[1], line: i + 1 })
  })
  return out
}

describe('Maestro flows select seeded rows by regex', () => {
  const titles = seededTitles()
  const flows = readdirSync(flowsDir).filter((f) => f.endsWith('.yaml'))

  it('finds the seed titles and the flows', () => {
    expect(titles).toContain('Email therapist about Friday')
    expect(titles).toContain('Review reading group chapter')
    expect(flows.length).toBeGreaterThan(5)
  })

  it('no flow selects a seeded title by exact text', () => {
    const offenders: string[] = []
    for (const f of flows) {
      for (const { value, line } of quotedValues(readFileSync(join(flowsDir, f), 'utf8'))) {
        if (titles.includes(value)) offenders.push(`${f}:${line} "${value}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
