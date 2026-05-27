# Component file splits — design plan

The 7 largest component files account for ~10,000 lines of the
mobile codebase. They're all "one file, many sub-views" — the
right pattern, just executed at too large a scale.

| File | Lines | Sub-views inside |
|---|---|---|
| `TaskDetailsSheet.tsx` | 2427 | edit + date / reminder / repeat / completed-by / subtask-edit / steps review |
| `ComposeSheet.tsx` | 1526 | main + category / priority / date / recurrence / reminder / steps |
| `TaskItem.tsx` | 1467 | swipe + checkbox + edit / sub-row + reminder pill |
| `ProfileSheet.tsx` | 1187 | identity + avatar picker + journey + delete account |
| `GroceryView.tsx` | 1153 | filter row + grouped list + row + edit + store picker host |
| `CategorySheet.tsx` | 1056 | pick + manage + color picker + icon picker + add |
| `StorePicker.tsx` | 1024 | pick + manage + drag-reorder + inline-add + AI link banner |

## Why not one PR per file

Each file is its own design decision: which sub-view becomes a
sibling file, which becomes a nested module, what props get passed
down, where state lives. Rushing all 7 into one giant PR
guarantees:

1. Reviewer fatigue → bugs slip through.
2. Style drift between extractions.
3. The first extraction's pattern doesn't get learned-from before
   the second one starts.

## Pattern

For each file, the split should look like:

```
ComposeSheet/
  index.tsx         (the sheet shell: Modal, header, ScrollView, sub-view dispatch)
  ComposeMain.tsx   (the title + notes + field rows + AI pills)
  ComposeCategory.tsx
  ComposePriority.tsx
  ComposeDate.tsx
  ComposeRecurrence.tsx
  ComposeReminder.tsx
  ComposeSteps.tsx
  styles.ts         (the makeStyles function moved out)
  types.ts          (Props interface + any sub-view types)
```

The index re-exports `default` so import sites (`import ComposeSheet
from './ComposeSheet'`) don't change.

## Extraction order

Easiest first, hardest last (so the pattern is solid by the time
we hit the giant ones):

1. **StorePicker.tsx** (1024 lines, 3 sub-views) — newest code,
   tightest scope, was already split-friendly during the multi-
   store work.
2. **CategorySheet.tsx** (1056) — well-organized, similar shape to
   StorePicker.
3. **ProfileSheet.tsx** (1187) — independent of the rest of the
   compose flow.
4. **GroceryView.tsx** (1153) — needs the `useGroceriesSlice`
   refactor first ideally.
5. **TaskItem.tsx** (1467) — heavily used; risk = highest user-
   facing impact if regression.
6. **ComposeSheet.tsx** (1526) — many AI integrations + dupe
   overlay + steps panel.
7. **TaskDetailsSheet.tsx** (2427) — biggest, most sub-views, most
   coupling. Last.

Target: every file ≤ 500 LOC after the split (with `styles.ts` and
`types.ts` not counting against the limit).

## Rules

- **No behavior change per PR.** Only file moves + re-export
  plumbing. Style tweaks land separately.
- **Style isolation.** Pull `makeStyles(theme)` out FIRST — it's
  often half the file's line count.
- **Sub-view files are dumb.** Each sub-view receives state + setters
  via props. No `useStore()` calls inside sub-views.
- **`index.tsx` is the only stateful module.** It owns `useState`
  / `useEffect` / hook composition.
- **Test after each extraction.** Manual smoke of the affected
  surface in the simulator before opening the PR.

## CI gate

Add a `max-lines` ESLint rule (warning, not error) that flags
component files over 600 lines. Catch regression before it ships.
