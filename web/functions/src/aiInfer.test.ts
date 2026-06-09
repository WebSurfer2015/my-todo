/**
 * Tests for the parse + post-process helpers in aiInfer.ts.
 *
 * These cover the "API security boundary" — the model's raw output
 * passes through parseX (shape validation) and then through
 * postProcessX (cross-input filtering). Together they guarantee
 * that what the client receives can't contain hallucinated ids,
 * unknown store names, or malformed numbers regardless of what the
 * model returns.
 *
 * The auth gate (isAgentEnabled), the quota gate (reserveDailyCall),
 * and the Anthropic SDK call are integration territory and are NOT
 * covered here — they need the Firebase emulator + the SDK mocked.
 */
import { describe, expect, it } from 'vitest'
import {
  parseBreakdownOutput,
  parseClassifyDeptOutput,
  parseSuggestFieldsOutput,
  parseLinkStoreOutput,
  postProcessClassifyDept,
  postProcessLinkStore,
} from './aiInfer'

// Strip the code-fence wrapper that some models add even when the
// prompt asks for plain JSON — the parsers are supposed to handle it.
const fenced = (json: string) => '```json\n' + json + '\n```'

// ─── parseBreakdownOutput ──────────────────────────────────────

describe('parseBreakdownOutput', () => {
  it('extracts subtasks from valid JSON', () => {
    const out = parseBreakdownOutput('{"subtasks":[{"text":"Buy milk"},{"text":"Pay bill"}]}')
    expect(out.subtasks).toEqual([{ text: 'Buy milk' }, { text: 'Pay bill' }])
  })
  it('strips ```json``` fences before parsing', () => {
    const out = parseBreakdownOutput(fenced('{"subtasks":[{"text":"X"}]}'))
    expect(out.subtasks).toEqual([{ text: 'X' }])
  })
  it('throws on malformed JSON', () => {
    expect(() => parseBreakdownOutput('not json')).toThrow()
  })
  it('throws on empty subtasks array', () => {
    expect(() => parseBreakdownOutput('{"subtasks":[]}')).toThrow()
  })
  it('throws when subtasks is missing', () => {
    expect(() => parseBreakdownOutput('{}')).toThrow()
  })
  it('skips non-string text entries', () => {
    const out = parseBreakdownOutput(
      '{"subtasks":[{"text":"ok"},{"text":42},{"foo":"bar"}]}',
    )
    expect(out.subtasks).toEqual([{ text: 'ok' }])
  })
  it('caps individual text at 80 chars', () => {
    const long = 'x'.repeat(200)
    const out = parseBreakdownOutput(`{"subtasks":[{"text":"${long}"}]}`)
    expect(out.subtasks[0].text.length).toBe(80)
  })
  it('caps number of subtasks at 8', () => {
    const items = Array.from({ length: 20 }, (_, i) => `{"text":"step ${i}"}`).join(',')
    const out = parseBreakdownOutput(`{"subtasks":[${items}]}`)
    expect(out.subtasks.length).toBe(8)
  })
})

// ─── parseClassifyDeptOutput ───────────────────────────────────

describe('parseClassifyDeptOutput', () => {
  it('returns all-null/empty on malformed JSON (no throw)', () => {
    const out = parseClassifyDeptOutput('not json')
    expect(out).toEqual({
      groupId: null,
      newGroupLabel: null,
      storeHint: null,
      recommendedStores: [],
    })
  })
  it('extracts groupId when valid', () => {
    expect(
      parseClassifyDeptOutput('{"groupId":"produce"}').groupId,
    ).toBe('produce')
  })
  it('drops groupId that is empty / too long', () => {
    expect(parseClassifyDeptOutput('{"groupId":""}').groupId).toBeNull()
    const long = 'x'.repeat(100)
    expect(parseClassifyDeptOutput(`{"groupId":"${long}"}`).groupId).toBeNull()
  })
  it('blocks stand-in labels (other / misc / food / etc.)', () => {
    for (const label of ['Other', 'Misc', 'Food', 'Stuff', 'Items', 'General']) {
      const out = parseClassifyDeptOutput(`{"newGroupLabel":"${label}"}`)
      expect(out.newGroupLabel).toBeNull()
    }
  })
  it('accepts a real new dept label', () => {
    expect(
      parseClassifyDeptOutput('{"newGroupLabel":"Pet"}').newGroupLabel,
    ).toBe('Pet')
  })
  it('mutually excludes groupId + newGroupLabel (groupId wins)', () => {
    const out = parseClassifyDeptOutput(
      '{"groupId":"pantry","newGroupLabel":"Spices"}',
    )
    expect(out.groupId).toBe('pantry')
    expect(out.newGroupLabel).toBeNull()
  })
  it('parses a well-formed storeHint', () => {
    const out = parseClassifyDeptOutput(
      '{"storeHint":{"name":"Costco","isNew":false}}',
    )
    expect(out.storeHint).toEqual({ name: 'Costco', isNew: false })
  })
  it('drops storeHint when isNew is missing', () => {
    expect(
      parseClassifyDeptOutput('{"storeHint":{"name":"Costco"}}').storeHint,
    ).toBeNull()
  })
  it('caps recommendedStores at 3 + dedupes case-insensitively', () => {
    const out = parseClassifyDeptOutput(
      '{"recommendedStores":["A","a","B","C","D","E"]}',
    )
    // Dedupe drops 'a' (matches 'A'); slice cap is 3 BEFORE dedupe, so
    // input ["A","a","B"] → ["A","B"]. The function slices to 3 first.
    expect(out.recommendedStores.length).toBeLessThanOrEqual(3)
    expect(out.recommendedStores).toContain('A')
  })
  it('drops non-string entries in recommendedStores', () => {
    // NOTE: parser slices to 3 BEFORE filtering, so non-string holes
    // count against the budget. "Other" at index 3 doesn't survive.
    const out = parseClassifyDeptOutput(
      '{"recommendedStores":["OK",42,null,"Other"]}',
    )
    expect(out.recommendedStores).toEqual(['OK'])
  })
})

// ─── parseSuggestFieldsOutput ──────────────────────────────────

describe('parseSuggestFieldsOutput', () => {
  it('returns all-null on malformed JSON', () => {
    const out = parseSuggestFieldsOutput('not json')
    expect(out).toEqual({
      category: null,
      newCategoryLabel: null,
      priority: null,
      dueDate: null,
      recurrence: null,
      reminder: null,
      cleanedText: null,
    })
  })
  it('parses a non-empty cleanedText', () => {
    const out = parseSuggestFieldsOutput('{"cleanedText":"Walk Conner"}')
    expect(out.cleanedText).toBe('Walk Conner')
  })
  it('drops blank/whitespace cleanedText to null', () => {
    expect(parseSuggestFieldsOutput('{"cleanedText":"   "}').cleanedText).toBeNull()
    expect(parseSuggestFieldsOutput('{"cleanedText":42}').cleanedText).toBeNull()
  })
  it('parses category + priority + dueDate', () => {
    const out = parseSuggestFieldsOutput(
      '{"category":"home","priority":"high","dueDate":"2026-05-20"}',
    )
    expect(out.category).toBe('home')
    expect(out.priority).toBe('high')
    expect(out.dueDate).toBe('2026-05-20')
  })
  it('rejects bad priority values', () => {
    expect(
      parseSuggestFieldsOutput('{"priority":"urgent"}').priority,
    ).toBeNull()
  })
  it('rejects malformed dueDate', () => {
    expect(
      parseSuggestFieldsOutput('{"dueDate":"tomorrow"}').dueDate,
    ).toBeNull()
  })
  it('accepts dueDate with T-suffix time', () => {
    expect(
      parseSuggestFieldsOutput('{"dueDate":"2026-05-20T15:00"}').dueDate,
    ).toBe('2026-05-20T15:00')
  })
  it('parses recurrence with byWeekday + endDate', () => {
    const out = parseSuggestFieldsOutput(
      '{"recurrence":{"freq":"weekly","byWeekday":[1,5],"endDate":"2026-12-31"}}',
    )
    expect(out.recurrence?.freq).toBe('weekly')
    expect(out.recurrence?.byWeekday).toEqual([1, 5])
    expect(out.recurrence?.endDate).toBe('2026-12-31')
  })
  it('strips byWeekday when freq is not weekly', () => {
    const out = parseSuggestFieldsOutput(
      '{"recurrence":{"freq":"daily","byWeekday":[1]}}',
    )
    expect(out.recurrence?.byWeekday).toBeUndefined()
  })
  it('parses a one-shot reminder', () => {
    const out = parseSuggestFieldsOutput(
      '{"reminder":{"at":"2026-05-20T15:00"}}',
    )
    expect(out.reminder?.at).toBe('2026-05-20T15:00')
  })
  it('drops recurring reminders without an "until" cap', () => {
    const out = parseSuggestFieldsOutput(
      '{"reminder":{"at":"2026-05-20T09:00","intervalMinutes":30}}',
    )
    // intervalMinutes without until is dropped (too noisy).
    expect(out.reminder?.intervalMinutes).toBeUndefined()
  })
  it('blocks stand-in newCategoryLabel values', () => {
    for (const v of ['Tasks', 'Stuff', 'Misc', 'TODOs']) {
      const out = parseSuggestFieldsOutput(`{"newCategoryLabel":"${v}"}`)
      expect(out.newCategoryLabel).toBeNull()
    }
  })
})

// ─── parseLinkStoreOutput ──────────────────────────────────────

describe('parseLinkStoreOutput', () => {
  it('extracts linkedItemIds when valid', () => {
    expect(
      parseLinkStoreOutput('{"linkedItemIds":["a","b","c"]}').linkedItemIds,
    ).toEqual(['a', 'b', 'c'])
  })
  it('returns empty list on malformed JSON', () => {
    expect(parseLinkStoreOutput('boom').linkedItemIds).toEqual([])
  })
  it('drops non-string entries', () => {
    expect(
      parseLinkStoreOutput('{"linkedItemIds":["a",42,null,"b"]}')
        .linkedItemIds,
    ).toEqual(['a', 'b'])
  })
  it('dedupes ids', () => {
    expect(
      parseLinkStoreOutput('{"linkedItemIds":["a","a","b"]}').linkedItemIds,
    ).toEqual(['a', 'b'])
  })
  it('caps id length at 64', () => {
    const long = 'x'.repeat(100)
    const out = parseLinkStoreOutput(
      `{"linkedItemIds":["${long}","ok"]}`,
    )
    // 100-char id is dropped (over the cap); 'ok' kept.
    expect(out.linkedItemIds).toEqual(['ok'])
  })
})

// ─── postProcessClassifyDept ───────────────────────────────────

describe('postProcessClassifyDept', () => {
  const input = {
    text: 'apple',
    departments: [
      { id: 'produce', label: 'Produce' },
      { id: 'pantry', label: 'Pantry' },
    ],
    stores: ['Stop & Shop', 'Costco', 'CVS'],
  }

  it('rewrites a newGroupLabel that matches an existing dept', () => {
    const out = postProcessClassifyDept(
      { groupId: null, newGroupLabel: 'produce', storeHint: null, recommendedStores: [] },
      input,
    )
    expect(out.groupId).toBe('produce')
    expect(out.newGroupLabel).toBeNull()
  })
  it('leaves newGroupLabel alone when it does not match', () => {
    const out = postProcessClassifyDept(
      { groupId: null, newGroupLabel: 'Pet', storeHint: null, recommendedStores: [] },
      input,
    )
    expect(out.groupId).toBeNull()
    expect(out.newGroupLabel).toBe('Pet')
  })
  it('filters recommendedStores to those in the input list (canonical casing)', () => {
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: null,
        recommendedStores: ['stop & shop', 'CVS', 'Whole Foods'], // 'Whole Foods' not in list
      },
      input,
    )
    expect(out.recommendedStores).toEqual(['Stop & Shop', 'CVS'])
  })
  it('dedupes recommendedStores after canonicalization', () => {
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: null,
        recommendedStores: ['stop & shop', 'STOP & SHOP', 'cvs'],
      },
      input,
    )
    expect(out.recommendedStores).toEqual(['Stop & Shop', 'CVS'])
  })
  it('drops recommendedStores when storeHint resolves to a live store', () => {
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: { name: 'Costco', isNew: false },
        recommendedStores: ['Stop & Shop', 'CVS'],
      },
      input,
    )
    expect(out.recommendedStores).toEqual([])
  })
  it('keeps recommendedStores when storeHint is a new-store proposal', () => {
    // Model invented a store ("Whole Foods") that the user hasn't
    // configured. Client can't auto-select that, so recs should
    // remain as a fallback rather than wiping to zero picks.
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: { name: 'Whole Foods', isNew: true },
        recommendedStores: ['Stop & Shop', 'CVS'],
      },
      input,
    )
    expect(out.recommendedStores).toEqual(['Stop & Shop', 'CVS'])
  })
  it('keeps recommendedStores when storeHint references a non-live store (isNew=false)', () => {
    // Edge: model returns isNew=false but the name doesn't exist
    // in the user's live stores. Client can't auto-select, so don't
    // wipe the recs fallback.
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: { name: 'Trader Joe\'s', isNew: false },  // not in `input.stores`
        recommendedStores: ['Stop & Shop', 'CVS'],
      },
      input,
    )
    expect(out.recommendedStores).toEqual(['Stop & Shop', 'CVS'])
  })
  it('handles empty input.stores gracefully', () => {
    const out = postProcessClassifyDept(
      {
        groupId: 'produce',
        newGroupLabel: null,
        storeHint: null,
        recommendedStores: ['Costco'],
      },
      { ...input, stores: [] },
    )
    expect(out.recommendedStores).toEqual([])
  })
})

// ─── postProcessLinkStore ──────────────────────────────────────

describe('postProcessLinkStore', () => {
  const input = {
    storeName: 'Costco',
    items: [
      { id: 'a', text: 'milk' },
      { id: 'b', text: 'eggs' },
      { id: 'c', text: 'bread' },
    ],
  }
  it('keeps only ids that exist in input.items', () => {
    const out = postProcessLinkStore({ linkedItemIds: ['a', 'x', 'b'] }, input)
    expect(out.linkedItemIds).toEqual(['a', 'b'])
  })
  it('returns [] when no ids match', () => {
    const out = postProcessLinkStore({ linkedItemIds: ['x', 'y'] }, input)
    expect(out.linkedItemIds).toEqual([])
  })
  it('handles missing linkedItemIds gracefully', () => {
    const out = postProcessLinkStore({ linkedItemIds: undefined as unknown as string[] }, input)
    expect(out.linkedItemIds).toEqual([])
  })
})

// ─── cost-guard config ─────────────────────────────────────────────────
// Locks in AI cost discipline (memory: "design every AI feature for
// lowest token usage"). If someone bumps a hot-path mode to a pricier
// model or loosens a token cap, these fail and force a deliberate review.
import { MODES, type Mode } from './aiInfer'

describe('AI mode cost guards', () => {
  const HOT_PATH: Mode[] = [
    'suggest-todo-fields', // fires on every typing pause — cheapest must-win
    'classify-grocery-dept',
    'link-store-to-items',
  ]

  it('defines a config for every mode', () => {
    const modes = Object.keys(MODES) as Mode[]
    expect(modes.sort()).toEqual(
      [
        'breakdown-subtasks',
        'classify-grocery-dept',
        'link-store-to-items',
        'suggest-todo-fields',
      ].sort(),
    )
  })

  it('keeps hot-path modes on the cheap Haiku model', () => {
    for (const m of HOT_PATH) {
      expect(MODES[m].model, `${m} must stay on Haiku`).toMatch(/haiku/)
    }
  })

  it('never uses an Opus-tier model anywhere (cost ceiling)', () => {
    for (const m of Object.keys(MODES) as Mode[]) {
      expect(MODES[m].model, `${m} must not use Opus`).not.toMatch(/opus/)
    }
  })

  it('caps max_tokens tightly per mode', () => {
    for (const m of Object.keys(MODES) as Mode[]) {
      expect(MODES[m].maxTokens, `${m} maxTokens`).toBeGreaterThan(0)
      expect(MODES[m].maxTokens, `${m} maxTokens too loose`).toBeLessThanOrEqual(512)
    }
    // The hottest path (fires every keypause) stays the tightest.
    expect(MODES['suggest-todo-fields'].maxTokens).toBeLessThanOrEqual(100)
  })
})
