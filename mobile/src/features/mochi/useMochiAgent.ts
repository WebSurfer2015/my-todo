import { useCallback, useEffect, useRef, useState } from 'react'
import auth from '@react-native-firebase/auth'
import { isoDate } from '../../core-bindings/utils'
import {
  COLD_START_RETRY_MS,
  type ProposedOperation,
} from '../../../../core/src/ports/aiContracts'

// The op union lives in core (ports/aiContracts) so the pure planner
// (core/src/logic/mochiOps) can type against it; re-exported for callers.
export type {
  AgentPriority,
  AgentRecurrence,
  AgentReminder,
  ProposedOperation,
} from '../../../../core/src/ports/aiContracts'

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
 * Confirm/Try again row). The ProposedOperation union (core/src/ports/
 * aiContracts.ts) mirrors the server's (functions/src/agentTools.ts) — a
 * parity test guards them against drift.
 */

const AGENT_CHAT_URL =
  'https://us-central1-my-todos-1b079.cloudfunctions.net/agentChat'

// Bound every turn's fetch — a stalled connection would otherwise leave
// the "thinking…" spinner stuck forever. Manual setTimeout + AbortController
// (AbortSignal.timeout() isn't reliable in Hermes/RN 0.81).
// Longer than the server's 25s Anthropic timeout (+ auth/quota/cold start) so
// a slow-but-successful turn isn't shown as a failure and charged twice.
const AGENT_FETCH_TIMEOUT_MS = 35000

export interface AgentResponse {
  reply: string
  operations: ProposedOperation[]
  awaitingConfirmation: boolean
  usage: { input: number; output: number }
  model: string
  /** Server signature over this assistant turn. Echoed back with the turn
   * in later histories so the server can verify its own past replies. */
  sig?: string
}

interface AgentContext {
  today: string
  categories: Array<{ id: string; label: string }>
  /** Non-trashed todos (id + text, `done` flag, step texts) so the agent can
   * target edit/markDone/markUndone/skipTodo/subtaskAction at real ids; the
   * server validates proposed ids against this set. */
  todos: Array<{ id: string; text: string; done?: boolean; subtasks?: string[] }>
  /** Trashed todos (id + text) — the allow-list for restoreTodo. */
  trashedTodos: Array<{ id: string; text: string }>
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
 * operations + the awaiting-confirmation flag; only `role`+`content` (+ the
 * server's `sig` on assistant turns) go back to the server on the next turn. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  operations?: ProposedOperation[]
  awaitingConfirmation?: boolean
  /** Assistant turn that asks the user for more info (no operations, not
   * awaiting confirmation). Tagged at receipt from the server's raw reply
   * (normalizeNoOpReply) — a question is NOT always marked by a "?" (Haiku
   * often omits it), and a statement may still read like one. */
  isFollowUp?: boolean
  /** Canned reply added on-device by an intent chip (no server call). */
  isLocal?: boolean
  /** The server's signature for a real assistant reply (never on a local
   * canned turn); sent back with the turn so the server can verify it. */
  sig?: string
}

interface SendResult {
  ok: boolean
  data?: AgentResponse
  error?: string
}

/** The wire shape of one history turn: `sig` only on signed assistant turns. */
export function toWireTurn(m: ChatTurn): { role: 'user' | 'assistant'; content: string; sig?: string } {
  return m.role === 'assistant' && m.sig
    ? { role: m.role, content: m.content, sig: m.sig }
    : { role: m.role, content: m.content }
}

/** Starts like a question (English — the v2.0.0 launch language): a
 * wh-word, or an auxiliary followed by its subject ("Do you…", "Should I…",
 * "Is that…"). A bare auxiliary isn't enough — "Will do — added it." and
 * "Can do!" are statements. */
const QUESTION_START =
  /^(?:(?:what|when|which|where|who|whom|whose|how|why)\b|(?:do|does|did|is|are|was|were|can|could|would|should|shall|will|don't|doesn't|didn't|isn't|aren't|won't)\s+(?:i|you|we|they|he|she|it|that|this|these|those|there|the|a|an|your|my|any)\b|anything\s+else\b|want\s+me\b)/i

/** Normalize a no-operation Mochi reply. Haiku doesn't reliably end its
 * follow-up questions with "?", so a reply that STARTS like a question gets
 * one. Anything else is a statement ("I couldn't find that to-do.") and is
 * left alone — the old version appended "?" to every no-op reply, which
 * turned statements into questions and mis-tagged them as follow-ups. */
function normalizeNoOpReply(reply: string): { text: string; isQuestion: boolean } {
  const trimmed = reply.trimEnd()
  if (trimmed.endsWith('?')) return { text: trimmed, isQuestion: true }
  if (QUESTION_START.test(trimmed.trimStart())) {
    return { text: trimmed.replace(/[.!。\s]+$/, '') + '?', isQuestion: true }
  }
  return { text: trimmed, isQuestion: false }
}

/** What kind of failure the last send hit — drives the recovery UI.
 *  - 'rate'  → transient throttle; "Try again" can work.
 *  - 'quota' → over the invisible fair-use ceiling; retrying won't help —
 *              ChatSheet falls back to manual compose (P1.7).
 *  - 'fail'  → network / server error; "Try again" can work.
 *  - 'blocked' → non-retryable rejection (AI off in profile, bad request). */
export type MochiErrorKind = 'rate' | 'quota' | 'fail' | 'blocked' | null

export function useMochiAgent() {
  const [isThinking, setIsThinking] = useState(false)
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<MochiErrorKind>(null)

  // The in-flight turn's controller — aborted on unmount (close the sheet
  // mid-request) and when a fresh send supersedes a pending one, so a late
  // reply can't land in state. Aborting only drops the CLIENT side: the
  // server's model call still runs to completion and is still billed (and
  // still counts toward the fair-use cap).
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
      // "Try again" (or re-typing the same text) after a failed send would
      // otherwise append the SAME user turn twice — the model sees the request
      // twice and the fallback builds "call mom — call mom". Reuse the
      // unanswered trailing turn instead.
      const last = messages[messages.length - 1]
      const isRetryOfLast = last?.role === 'user' && last.content.trim() === text
      const history: ChatTurn[] = isRetryOfLast
        ? messages
        : [...messages, { role: 'user', content: text }]
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
          // assistant turns carry text (+ the server's sig) only.
          body: JSON.stringify({
            data: {
              messages: history.map(toWireTurn),
              // Fair use counts conversations: tell the server this request
              // starts one when no SERVER reply exists yet (an intent chip's
              // canned local exchange would otherwise make it look like a
              // follow-up).
              conversationStart: !history.some((m) => m.role === 'assistant' && !m.isLocal),
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
        // Closed / superseded while the request was in flight — nothing from
        // this response may reach state (no reply, no quota fallback).
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
        if (res.status === 429) {
          // Two very different 429s: a HARD daily-quota cap (the callable
          // throws resource-exhausted → body.error.status === RESOURCE_EXHAUSTED)
          // vs a transient throttle. Retrying only helps the latter.
          const peek = (await res.json().catch(() => null)) as {
            error?: { status?: string; message?: string }
          } | null
          if (peek?.error?.status === 'RESOURCE_EXHAUSTED') {
            // De-metered: no "you're out" wall or reset countdown. ChatSheet
            // normally falls back to manual compose on 'quota' (P1.7); this
            // copy only shows when no fallback is wired.
            setError('Mochi needs a little rest — you can add this one yourself.')
            setErrorKind('quota')
            return { ok: false, error: 'quota' }
          }
          // Transient — back off once and retry before surfacing anything.
          await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS))
          res = await runFetch()
          // The retry can itself hit the fair-use ceiling — same 'quota'
          // classification so ChatSheet takes the graceful fallback (P1.7).
          if (res.status === 429) {
            const again = (await res.clone().json().catch(() => null)) as {
              error?: { status?: string }
            } | null
            if (again?.error?.status === 'RESOURCE_EXHAUSTED') {
              setError('Mochi needs a little rest — you can add this one yourself.')
              setErrorKind('quota')
              return { ok: false, error: 'quota' }
            }
          }
        }
        if (!res.ok && res.status >= 400 && res.status < 500 && res.status !== 429) {
          // Non-retryable rejections (AI turned off in the profile → 400
          // FAILED_PRECONDITION; malformed request → INVALID_ARGUMENT). "Try
          // again" can't help, so show what's actually wrong, not "couldn't
          // reach us".
          const rejected = (await res.json().catch(() => null)) as {
            error?: { status?: string; message?: string }
          } | null
          setError(
            rejected?.error?.status === 'FAILED_PRECONDITION'
              ? 'AI help is turned off — you can switch it back on in Settings.'
              : 'Mochi got tangled up — try starting a new chat.',
          )
          setErrorKind('blocked')
          return { ok: false, error: rejected?.error?.status ?? String(res.status) }
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
        const body = (await res.json().catch(() => null)) as {
          result?: AgentResponse
          error?: { message?: string }
        } | null
        if (controller.signal.aborted) return { ok: false, error: 'aborted' }
        if (!body) {
          // 200 with a malformed/empty body — treat as a transient failure
          // rather than throwing an unhandled JSON parse error.
          setError('Something went wrong.')
          setErrorKind('fail')
          return { ok: false, error: 'bad-response' }
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
        const noOps =
          !result.awaitingConfirmation && (!operations || operations.length === 0)
        const reply = noOps ? normalizeNoOpReply(result.reply) : { text: result.reply, isQuestion: false }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: reply.text,
            operations,
            awaitingConfirmation: result.awaitingConfirmation,
            ...(typeof result.sig === 'string' && result.sig ? { sig: result.sig } : {}),
            // Only a real question asks the user for more of the same request.
            isFollowUp: reply.isQuestion,
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
    // Closing the sheet must cancel the in-flight turn: ChatSheet stays
    // mounted (visible prop), so the unmount abort never fires, and a late
    // reply would otherwise auto-create a to-do or open Compose after the user
    // left.
    controllerRef.current?.abort()
    controllerRef.current = null
    setIsThinking(false)
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
      // The canned reply is always a follow-up question ("What should I add?").
      { role: 'assistant', content: assistantText, isFollowUp: true, isLocal: true },
    ])
  }, [])

  return { send, reset, isThinking, messages, error, errorKind, pushLocalExchange }
}
