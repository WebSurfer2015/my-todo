import { useCallback, useState } from 'react'
import auth from '@react-native-firebase/auth'

/**
 * Multi-turn client for the agentChat Cloud Function. Holds the running
 * conversation, posts the whole history on each turn, and surfaces Mochi's
 * reply + any proposed operations for the UI to render as chat bubbles.
 *
 * The hook does NOT apply operations — that's the caller's job after the
 * user taps Confirm. Keeping apply outside the hook means the existing
 * store mutations stay the single source of truth for writes, and the
 * agent has the same write surface as a manual tap.
 *
 * Conversation flow: each user turn → one server call. The server replies
 * with a short question (operations:[] ⇒ still gathering) OR a final
 * proposal (operations.length>0, awaitingConfirmation true ⇒ render a
 * Confirm/Try again row). The ProposedOperation union below mirrors the
 * server's (web/functions/src/agentTools.ts) — a parity test guards them
 * against drift.
 */

const AGENT_CHAT_URL =
  'https://us-central1-my-todos-1b079.cloudfunctions.net/agentChat'

export type AgentPriority = 'high' | 'medium' | 'low'

/** Mirrors the server's AgentRecurrence (agentTools.ts) — the safe subset
 * the agent can propose. The client maps this onto the real Recurrence. */
export interface AgentRecurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  byWeekday?: number[]
}

/** Mirrors the server's AgentReminder. `at` is a local ISO datetime; the
 * client mints the stable `id` on apply. */
export interface AgentReminder {
  at: string
  offsetMinutes?: number
  intervalMinutes?: number
}

/**
 * Mirrors the server's ProposedOperation union (web/functions/src/
 * agentTools.ts). Keep in lockstep — the server validates + returns these,
 * the client applies them after the user confirms.
 */
export type ProposedOperation =
  | {
      kind: 'createTodo'
      args: {
        text: string
        dueDate?: string
        priority?: AgentPriority
        category?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'editTodo'
      args: {
        todoId: string
        text?: string
        dueDate?: string
        priority?: AgentPriority
        category?: string
        notes?: string
        recurrence?: AgentRecurrence
        reminders?: AgentReminder[]
      }
    }
  | {
      kind: 'addSteps'
      args: { todoId: string; steps: Array<{ text: string }> }
    }
  | {
      kind: 'markDone'
      args: { todoId: string }
    }
  | {
      kind: 'createCategory'
      args: { label: string; color?: string; icon?: string }
    }
  | {
      kind: 'createStore'
      args: { name: string }
    }
  | {
      kind: 'addGroceryItem'
      args: { text: string; stores?: string[]; groupId?: string }
    }

export interface AgentResponse {
  reply: string
  operations: ProposedOperation[]
  awaitingConfirmation: boolean
  usage: { input: number; output: number }
  model: string
}

interface AgentContext {
  today: string
  categories: Array<{ id: string; label: string }>
  /** Open todos (id + text) so the agent can target edit/markDone/addSteps
   * at real ids; the server validates proposed ids against this set. */
  todos: Array<{ id: string; text: string }>
  /** Grocery departments (id + label) so the agent can target
   * addGroceryItem.groupId at a real department. */
  groceryGroups: Array<{ id: string; label: string }>
  /** Grocery store names so the agent can tag items + notice a missing
   * store to offer creating. */
  stores: string[]
}

/** One rendered conversation turn. `assistant` turns may carry proposed
 * operations + the awaiting-confirmation flag; only `role`+`content` go
 * back to the server on the next turn. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  operations?: ProposedOperation[]
  awaitingConfirmation?: boolean
}

interface SendResult {
  ok: boolean
  data?: AgentResponse
  error?: string
}

/** Ensure a follow-up turn reads as a question. Mochi (Haiku) doesn't
 * reliably honor "end questions with ?" from the system prompt, so we
 * normalize deterministically on the client: strip a trailing calm period
 * and add a question mark. */
function toQuestion(s: string): string {
  const trimmed = s.trimEnd()
  if (trimmed.endsWith('?')) return trimmed
  return trimmed.replace(/[.!。\s]+$/, '') + '?'
}

export function useMochiAgent() {
  const [isThinking, setIsThinking] = useState(false)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (turn: string, context: AgentContext): Promise<SendResult> => {
      const text = turn.trim()
      if (!text) return { ok: false, error: 'empty' }

      const user = auth().currentUser
      if (!user) {
        setError('Sign in to use Mochi.')
        return { ok: false, error: 'unauthenticated' }
      }

      // Optimistically append the user turn; build the wire history from it
      // so the server sees this turn too (setState is async).
      const history: ChatTurn[] = [...messages, { role: 'user', content: text }]
      setMessages(history)
      setIsThinking(true)
      setError(null)
      try {
        const idToken = await user.getIdToken()
        const init: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          // Firebase callable functions wrap the payload in `{data: ...}`
          // and return `{result: ...}`. Strip operations off the wire —
          // assistant turns carry text only.
          body: JSON.stringify({
            data: {
              messages: history.map((m) => ({ role: m.role, content: m.content })),
              context,
            },
          }),
        }
        // A 429 (rate limit, usually upstream model throttling) is transient —
        // retry ONCE after a short backoff before surfacing anything, so a
        // brief spike self-heals without the user re-sending.
        let res = await fetch(AGENT_CHAT_URL, init)
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 1500))
          res = await fetch(AGENT_CHAT_URL, init)
        }
        if (!res.ok) {
          // Calm, on-brand copy for the rate limit — no error code; it clears
          // on its own. Other failures keep the diagnostic status.
          setError(
            res.status === 429
              ? "Mochi's catching its breath — try again in a moment."
              : `Mochi couldn't reach us (${res.status}).`,
          )
          return { ok: false, error: String(res.status) }
        }
        const body = (await res.json()) as {
          result?: AgentResponse
          error?: { message?: string }
        }
        if (body.error) {
          setError(body.error.message || 'Something went wrong.')
          return { ok: false, error: body.error.message }
        }
        if (!body.result) {
          setError('Empty reply from Mochi.')
          return { ok: false, error: 'empty' }
        }
        const result = body.result
        // A follow-up turn (Mochi needs more info: no operations, not
        // awaiting confirmation) is a question — make it read like one.
        const isFollowUpQuestion =
          !result.awaitingConfirmation &&
          (!result.operations || result.operations.length === 0)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: isFollowUpQuestion ? toQuestion(result.reply) : result.reply,
            operations: result.operations,
            awaitingConfirmation: result.awaitingConfirmation,
          },
        ])
        return { ok: true, data: result }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error.'
        setError(msg)
        return { ok: false, error: msg }
      } finally {
        setIsThinking(false)
      }
    },
    [messages],
  )

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  /** Append a canned user+assistant exchange WITHOUT calling the server —
   * used by the intent chips so tapping "Add a to-do" auto-sends and gets an
   * instant follow-up question with no AI round (no "thinking…", no cost).
   * The canned assistant turn rides along in history on the next real send. */
  const pushLocalExchange = useCallback((userText: string, assistantText: string) => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content: assistantText },
    ])
  }, [])

  return { send, reset, isThinking, messages, error, pushLocalExchange }
}
