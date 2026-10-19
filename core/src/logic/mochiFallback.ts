/**
 * Graceful-fallback capture for Mochi (P1.4 / P1.7). Over the invisible
 * fair-use ceiling the chat hands the user's words to the manual Compose form
 * instead of walling. Mid-conversation, the latest message alone is often
 * just an answer to Mochi's follow-up ("Friday", "the Costco one") — so
 * rebuild the still-open request from the conversation.
 *
 * The open request = the trailing run of user turns in which every
 * intervening Mochi turn was a follow-up QUESTION (no proposed operations,
 * ends with "?" — useMochiAgent normalizes follow-ups to end in "?"). A Mochi
 * turn that proposed operations, or made a statement, closes the previous
 * request. The first turn of the open request leads the to-do text and the
 * answers follow it ("call mom — Friday"), so nothing the user typed is lost
 * and all of it is visible + editable in Compose (which has no notes field).
 *
 * PURE + platform-free: structural turn type, no React / RN.
 */

export interface FallbackChatTurn {
  role: 'user' | 'assistant'
  content: string
  operations?: readonly unknown[]
  /** Set by the client when it KNOWS the turn is a follow-up question. */
  isFollowUp?: boolean
}

export interface FallbackCapture {
  text: string
}

function isFollowUpQuestion(turn: FallbackChatTurn): boolean {
  if (turn.role !== 'assistant') return false
  // Prefer the explicit tag: the client's toQuestion() makes every no-op reply
  // end in "?", so the text alone can't tell a statement from a question.
  if (turn.isFollowUp !== undefined) return turn.isFollowUp
  return !(turn.operations && turn.operations.length > 0) && turn.content.trimEnd().endsWith('?')
}

/** `history` = turns BEFORE `latest` (the message that couldn't be sent). */
export function buildFallbackCapture(
  history: readonly FallbackChatTurn[],
  latest: string,
): FallbackCapture {
  const latestText = latest.trim()
  const openTurns: string[] = [latestText]
  // A retry of a failed send leaves the same unanswered user turn at the end
  // of history — don't count it twice ("call mom — call mom").
  let end = history.length
  const tail = history[end - 1]
  if (tail?.role === 'user' && tail.content.trim() === latestText) end--
  for (let i = end - 1; i >= 0; i--) {
    const turn = history[i]
    if (turn.role === 'user') {
      const text = turn.content.trim()
      if (text) openTurns.unshift(text)
    } else if (!isFollowUpQuestion(turn)) {
      break
    }
  }
  const [first = '', ...answers] = openTurns.filter(Boolean)
  return { text: answers.length > 0 ? `${first} — ${answers.join(', ')}` : first }
}

/**
 * When Mochi's fair-use day resets: the next 00:00 UTC (the server counts
 * per UTC day — functions/src/quota.ts). Shown to the user in local time
 * ("resting until 8 PM") rather than a vague "tomorrow", which would be
 * wrong in the Americas, where UTC midnight falls in the evening.
 */
export function mochiRestEndsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}
