import { useCallback, useState } from 'react'
import auth from '@react-native-firebase/auth'

/**
 * Minimal client for the agentChat Cloud Function. Posts a single turn,
 * surfaces the reply + the proposed operations Claude returned, and
 * exposes them for the UI to render in a confirmation panel. The hook
 * does NOT apply the operations — that's the caller's job after the
 * user explicitly confirms. Keeping apply outside the hook means the
 * existing store mutations stay the single source of truth for writes,
 * and the agent has the same write surface as a manual tap.
 *
 * Scope: single-turn (no conversation history), direct HTTPS POST (no
 * firebase-functions native module yet). All four ops (createTodo /
 * editTodo / addSteps / markDone) are live; the server validates + returns
 * them and SheetContext applies each via the same store mutations a manual
 * edit uses. The ProposedOperation union below mirrors the server's
 * (agentTools.ts) — a parity test guards them against drift.
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

export interface AgentResponse {
  reply: string
  operations: ProposedOperation[]
  usage: { input: number; output: number }
  model: string
}

interface AgentContext {
  today: string
  categories: Array<{ id: string; label: string }>
  /** Open todos (id + text) so the agent can target edit/markDone/addSteps
   * at real ids; the server validates proposed ids against this set. */
  todos: Array<{ id: string; text: string }>
}

interface SendResult {
  ok: boolean
  data?: AgentResponse
  error?: string
}

export function useMochiAgent() {
  const [isThinking, setIsThinking] = useState(false)
  const [proposal, setProposal] = useState<AgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (turn: string, context: AgentContext): Promise<SendResult> => {
      const user = auth().currentUser
      if (!user) {
        setError('Sign in to use Mochi.')
        return { ok: false, error: 'unauthenticated' }
      }
      setIsThinking(true)
      setError(null)
      try {
        const idToken = await user.getIdToken()
        const res = await fetch(AGENT_CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          // Firebase callable functions wrap the payload in `{data: ...}`
          // and return `{result: ...}`. Plain HTTPS without the
          // @react-native-firebase/functions native module works fine
          // when both sides honor this contract.
          body: JSON.stringify({ data: { turn, context } }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          setError(`Mochi couldn't reach us (${res.status}).`)
          return { ok: false, error: text || String(res.status) }
        }
        const body = (await res.json()) as { result?: AgentResponse; error?: { message?: string } }
        if (body.error) {
          setError(body.error.message || 'Something went wrong.')
          return { ok: false, error: body.error.message }
        }
        if (!body.result) {
          setError('Empty reply from Mochi.')
          return { ok: false, error: 'empty' }
        }
        setProposal(body.result)
        return { ok: true, data: body.result }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Network error.'
        setError(msg)
        return { ok: false, error: msg }
      } finally {
        setIsThinking(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setProposal(null)
    setError(null)
  }, [])

  return { send, reset, isThinking, proposal, error }
}
