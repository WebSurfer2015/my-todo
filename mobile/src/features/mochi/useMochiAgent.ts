import { useCallback, useEffect, useRef, useState } from 'react'
import auth from '@react-native-firebase/auth'
import { isoDate } from '../../core-bindings/utils'
import { COLD_START_RETRY_MS } from '../../../../core/src/ports/aiContracts'

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

// Bound every turn's fetch — a stalled connection would otherwise leave
// the "thinking…" spinner stuck forever. Manual setTimeout + AbortController
// (AbortSignal.timeout() isn't reliable in Hermes/RN 0.81).
const AGENT_FETCH_TIMEOUT_MS = 25000

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
  | {
      kind: 'deleteTodo'
      args: { todoId: string }
    }
  | {
      kind: 'deleteGroceryItem'
      args: { groceryId: string }
    }
  | {
      kind: 'pickTodos'
      args: {
        action: 'delete' | 'markDone' | 'edit' | 'addSteps'
        todoIds: string[]
        query?: string
        edit?: {
          text?: string
          dueDate?: string
          priority?: AgentPriority
          category?: string
          notes?: string
          recurrence?: AgentRecurrence
          reminders?: AgentReminder[]
        }
        steps?: Array<{ text: string }>
      }
    }
  | {
      kind: 'editGroceryItem'
      args: {
        groceryId: string
        text?: string
        stores?: string[]
        groupId?: string
      }
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
  /** Shopping items (id + text) so the agent can target deleteGroceryItem at
   * a real id; the server validates proposed ids against this set. */
  groceries: Array<{ id: string; text: string }>
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

/** What kind of failure the last send hit — drives the recovery UI.
 *  - 'rate'  → transient throttle; "Try again" can work.
 *  - 'quota' → hard daily cap; retrying won't help (resets after midnight).
 *  - 'fail'  → network / server error; "Try again" can work. */
export type MochiErrorKind = 'rate' | 'quota' | 'fail' | null

export function useMochiAgent() {
  const [isThinking, setIsThinking] = useState(false)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<MochiErrorKind>(null)

  // The in-flight turn's controller — aborted on unmount (close the sheet
  // mid-request) and when a fresh send supersedes a pending one, so the
  // model call stops billing once nobody's waiting on it.
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => controllerRef.current?.abort(), [])

  const send = useCallback(
    async (turn: string, context: AgentContext): Promise<SendResult> => {
      const text = turn.trim()
      if (!text) return { ok: false, error: 'empty' }

      const user = auth().currentUser
      if (!user) {
        setError('Sign in to use Mochi.')
        return { ok: false, error: 'unauthenticated' }
      }

      // A fresh send supersedes any pending one — abort it first.
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      // Optimistically append the user turn; build the wire history from it
      // so the server sees this turn too (setState is async).
      const history: ChatTurn[] = [...messages, { role: 'user', content: text }]
      setMessages(history)
      setIsThinking(true)
      setError(null)
      setErrorKind(null)
      // Tracks whether the abort below came from our timeout (a real
      // failure to surface) vs an unmount / supersede (stay silent).
      let timedOut = false
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
          signal: controller.signal,
        }
        // Each fetch attempt gets its own 25s timeout that aborts the shared
        // controller; cleared the moment the fetch settles.
        const runFetch = async (): Promise<Response> => {
          const timer = setTimeout(() => {
            timedOut = true
            controller.abort()
          }, AGENT_FETCH_TIMEOUT_MS)
          try {
            return await fetch(AGENT_CHAT_URL, init)
          } finally {
            clearTimeout(timer)
          }
        }
        let res = await runFetch()
        if (res.status === 429) {
          // Two very different 429s: a HARD daily-quota cap (the callable
          // throws resource-exhausted → body.error.status === RESOURCE_EXHAUSTED)
          // vs a transient throttle. Retrying only helps the latter.
          const peek = (await res.json().catch(() => null)) as {
            error?: { status?: string; message?: string }
          } | null
          if (peek?.error?.status === 'RESOURCE_EXHAUSTED') {
            setError("That's all your Mochi for today — it resets after midnight.")
            setErrorKind('quota')
            return { ok: false, error: 'quota' }
          }
          // Transient — back off once and retry before surfacing anything.
          await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS))
          res = await runFetch()
        }
        if (!res.ok) {
          setError(
            res.status === 429
              ? "Mochi's catching its breath — try again in a moment."
              : `Mochi couldn't reach us (${res.status}).`,
          )
          setErrorKind(res.status === 429 ? 'rate' : 'fail')
          return { ok: false, error: String(res.status) }
        }
        const body = (await res.json()) as {
          result?: AgentResponse
          error?: { message?: string }
        }
        if (body.error) {
          setError(body.error.message || 'Something went wrong.')
          setErrorKind('fail')
          return { ok: false, error: body.error.message }
        }
        if (!body.result) {
          setError('Empty reply from Mochi.')
          setErrorKind('fail')
          return { ok: false, error: 'empty' }
        }
        const result = body.result
        // A repeating to-do anchors its series on dueDate (the first
        // occurrence). The model often omits it for "every N days"-style
        // asks, which leaves the series unanchored and the date chip empty —
        // default the first occurrence to today so the repeat is well-formed
        // and the card shows a real start date.
        const operations = result.operations?.map((op) =>
          op.kind === 'createTodo' && op.args.recurrence && !op.args.dueDate
            ? { ...op, args: { ...op.args, dueDate: isoDate(new Date()) } }
            : op,
        )
        // A follow-up turn (Mochi needs more info: no operations, not
        // awaiting confirmation) is a question — make it read like one.
        const isFollowUpQuestion =
          !result.awaitingConfirmation && (!operations || operations.length === 0)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: isFollowUpQuestion ? toQuestion(result.reply) : result.reply,
            operations,
            awaitingConfirmation: result.awaitingConfirmation,
          },
        ])
        return { ok: true, data: result }
      } catch (e) {
        if (timedOut) {
          // The connection stalled past the timeout — surface the calm
          // network copy so the spinner doesn't just vanish silently.
          setError("Couldn't reach Mochi — check your connection and try again.")
          setErrorKind('fail')
          return { ok: false, error: 'timeout' }
        }
        if (controller.signal.aborted) {
          // Superseded by a newer send, or the sheet closed mid-request —
          // not a real failure, so surface nothing.
          return { ok: false, error: 'aborted' }
        }
        // Raw fetch errors ("Network request failed") aren't calm or
        // actionable — show on-brand copy, keep the real message for logs.
        const raw = e instanceof Error ? e.message : 'Network error.'
        setError("Couldn't reach Mochi — check your connection and try again.")
        setErrorKind('fail')
        return { ok: false, error: raw }
      } finally {
        // Only the live request controls the spinner — a superseded send
        // must not flip it off under a newer in-flight one.
        if (controllerRef.current === controller) setIsThinking(false)
      }
    },
    [messages],
  )

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    setErrorKind(null)
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

  return { send, reset, isThinking, messages, error, errorKind, pushLocalExchange }
}
