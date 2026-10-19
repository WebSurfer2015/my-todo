/**
 * Pure chat-turn helpers for ChatSheet (kept out of the component so they're
 * unit-testable without React Native).
 */
import type { ChatTurn } from './useMochiAgent'

/**
 * Proposal turns that can no longer be acted on: an assistant turn still
 * awaiting confirmation (neither applied nor declined) once a NEWER assistant
 * turn has arrived. Acting on it would apply a suggestion the conversation
 * has moved past, so it renders read-only with a quiet note.
 */
export function supersededProposalTurns(
  messages: ReadonlyArray<Pick<ChatTurn, 'role' | 'operations' | 'awaitingConfirmation'>>,
  resolved: Readonly<Record<number, unknown>>,
): Set<number> {
  const out = new Set<number>()
  let newerAssistant = false
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'assistant') continue
    if (newerAssistant && m.awaitingConfirmation && m.operations?.length && resolved[i] === undefined) {
      out.add(i)
    }
    newerAssistant = true
  }
  return out
}

/** The pick-list header: `20 match "milk"` when every match is listed, or —
 * when the server cut the list short — one consistent line,
 * `37 match "milk" · showing 20 — say more to narrow it` (the count is the
 * TOTAL; it used to say "20 match" above "Showing 20 of 37"). */
export function pickMatchHeader(shown: number, totalMatches: number | undefined, query?: string): string {
  const cutShort = typeof totalMatches === 'number' && totalMatches > shown
  const n = cutShort ? totalMatches : shown
  const head = query ? `${n} match "${query}"` : `${n} ${n === 1 ? 'match' : 'matches'}`
  return cutShort ? `${head} · showing ${shown} — say more to narrow it` : head
}
