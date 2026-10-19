import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for the #15 accessibility fix.
 *
 * iOS collapses a <Modal> subtree into ONE accessibility leaf when a
 * backdrop <Pressable onPress={onClose}> WRAPS the sheet — which broke
 * VoiceOver and made Maestro unable to tap anything inside the sheets.
 * The fix replaced every such wrapper with a plain <View style={backdrop}>
 * plus a SIBLING <Pressable style={StyleSheet.absoluteFill} />.
 *
 * This test fails if anyone reintroduces the wrapper anti-pattern, i.e.
 * an element whose `style={styles.backdrop}` opening tag is a <Pressable>
 * rather than a <View>. Cheap insurance against silently re-flattening
 * the sheets (the bug has no compile-time or unit signal otherwise).
 */
const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..') // mobile/src

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue
      out.push(...tsxFiles(p))
    } else if (name.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

describe('#15 a11y sheet guard', () => {
  it('no sheet wraps its backdrop in a <Pressable> (must be a sibling <View>)', () => {
    // Capture the element tag that carries a backdrop/overlay style. Overlay
    // names were added after QA (2026-10-18) found PickerModal + the date
    // pop-ups wrapping their content in a TouchableOpacity overlay.
    // `(?:[^>]|=>)*?` lets the scan cross arrow-function props (an `onPress={() =>`
    // used to end the match at its `>`), and `\[?` also catches style arrays.
    const re = /<(\w+)\b(?:[^>]|=>)*?style=\{\[?\s*styles\.(?:backdrop|overlay|dateOverlay)\b/g
    const TOUCHABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableWithoutFeedback', 'TouchableHighlight'])
    const offenders: string[] = []

    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, 'utf8')
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        if (TOUCHABLES.has(m[1])) {
          offenders.push(`${file.replace(SRC, 'src')} → <${m[1]}> wrapping a sheet`)
        }
      }
    }

    expect(
      offenders,
      `Backdrop must be a plain <View> with a SIBLING <Pressable absoluteFill> ` +
        `(see #15). Offending wrappers:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('actually scanned the sheet files (guard is wired, not a no-op)', () => {
    const withBackdrop = tsxFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('styles.backdrop'),
    )
    // We have well over a dozen Modal sheets using a backdrop.
    expect(withBackdrop.length).toBeGreaterThan(8)
  })

  it('the pattern catches arrow-function props and style arrays (no false negatives)', () => {
    const re = /<(\w+)\b(?:[^>]|=>)*?style=\{\[?\s*styles\.(?:backdrop|overlay|dateOverlay)\b/g
    const hits = (src: string) => [...src.matchAll(re)].map((m) => m[1])
    expect(hits('<Pressable onPress={() => close()} style={styles.backdrop}>')).toEqual(['Pressable'])
    expect(hits('<TouchableOpacity style={[styles.overlay, x]} onPress={f}>')).toEqual(['TouchableOpacity'])
    expect(hits('<View style={styles.backdrop}>')).toEqual(['View'])
  })
})
