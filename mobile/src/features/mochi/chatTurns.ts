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

/** "Showing 10 of 23 — say more to narrow it" when a pick-list was cut
 * short; null when every match is listed (or the server didn't say). */
export function pickTruncationNote(shown: number, totalMatches: number | undefined): string | null {
  if (typeof totalMatches !== 'number' || !(totalMatches > shown)) return null
  return `Showing ${shown} of ${totalMatches} — say more to narrow it`
}
