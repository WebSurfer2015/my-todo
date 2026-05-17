/**
 * Sagely Cloud Functions — Phase 0 spike of the Mochi agent.
 *
 * Only `agentChat` is exposed for now: a callable function that proxies a
 * single user turn to Claude with tool_use enabled, validates the
 * returned operations against the shared schema, and returns them to
 * the client for preview + explicit user confirm.
 *
 * Auth is handled automatically by onCall (request.auth is set iff the
 * client passes a valid Firebase ID token). The function does no
 * Firestore writes — the client applies operations through the
 * existing store mutations after the user confirms. That keeps the
 * security model identical to the non-agent paths.
 *
 * Required secret: ANTHROPIC_API_KEY (set via
 *   `firebase functions:secrets:set ANTHROPIC_API_KEY`).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import Anthropic from '@anthropic-ai/sdk'
import {
  AGENT_TOOLS,
  validateOperation,
  type ProposedOperation,
} from './agentTools'

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Sonnet is the right default — strong tool_use, cheap enough for
// per-turn pricing to make sense in a freemium tier. Override per-call
// if a future tool demands more reasoning depth.
const MODEL = 'claude-sonnet-4-6'

interface ChatContext {
  /** Today as ISO yyyy-mm-dd in the user's local timezone. The client
   * sends this; we never derive it server-side from `Date.now()`
   * because the server is in UTC and the user may not be. */
  today?: string
  /** User's category list — id + label only, no counts/colors. The
   * agent uses these to map natural-language categories ("home") to
   * the user's actual category id. */
  categories?: Array<{ id: string; label: string }>
}

interface ChatRequest {
  turn: string
  context?: ChatContext
}

interface ChatResponse {
  reply: string
  operations: ProposedOperation[]
  /** Token usage for the turn — surfaced so we can build per-user
   * budgets and observability without re-parsing logs. */
  usage: { input: number; output: number }
  model: string
}

const SYSTEM_PROMPT = `You are Mochi, the gentle planning buddy inside the Sagely to-do app.

Voice rules — load-bearing:
- Calm and brief. Soft daily-life tone, not enterprise productivity-speak.
- No exclamation marks anywhere. No "Awesome!", "Let's go!", "Great!".
- No scorekeeping or congratulation. The user finishing something is normal.
- Address the user directly in second person but lightly. "I'll add…" is fine; "You should…" is not.
- One-sentence replies. Don't summarize the task back unless the user asked.

How you help:
- The user gives you natural-language requests about their to-dos.
- You call exactly the tools you need to satisfy the request — no chit-chat
  in the reply when an action is the answer.
- Resolve dates relative to the \`today\` field in context. Use ISO yyyy-mm-dd.
- Map category names case-insensitively to the user's existing category ids
  from context. Leave category empty when nothing matches cleanly — don't
  invent ids.
- When the user gives a vague request, prefer asking back in one short
  question over guessing wrong.`

export const agentChat = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: 'us-central1' },
  async (request): Promise<ChatResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to use Mochi.')
    }

    const data = request.data as Partial<ChatRequest> | undefined
    const turn = data?.turn
    if (typeof turn !== 'string' || turn.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Empty turn.')
    }
    if (turn.length > 2000) {
      throw new HttpsError('invalid-argument', 'Turn too long (max 2000 chars).')
    }

    const ctx = data?.context ?? {}
    const today = typeof ctx.today === 'string' ? ctx.today : ''
    const categories = Array.isArray(ctx.categories)
      ? ctx.categories
          .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
          .slice(0, 50)
      : []
    const knownCategoryIds = new Set(categories.map((c) => c.id))

    const contextBlock =
      [
        today ? `today is ${today}` : null,
        categories.length > 0
          ? `categories (id — label):\n${categories
              .map((c) => `  ${c.id} — ${c.label}`)
              .join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n') || 'no extra context'

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS as Anthropic.Tool[],
      messages: [
        {
          role: 'user',
          content: `Context:\n${contextBlock}\n\nRequest:\n${turn.trim()}`,
        },
      ],
    })

    // Walk the response: gather text reply + every validated tool call.
    const operations: ProposedOperation[] = []
    let reply = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        reply += block.text
      } else if (block.type === 'tool_use') {
        const op = validateOperation(block.name, block.input, knownCategoryIds)
        if (op) operations.push(op)
      }
    }
    reply = reply.trim()
    // Voice-rule enforcement at the boundary: strip any exclamation
    // marks Mochi let slip. Future: full regex sweep + word filter.
    reply = reply.replace(/!/g, '.')
    if (!reply && operations.length > 0) {
      // Mochi acted without saying anything — synthesize a quiet ack
      // so the client always has something to render above the proposal.
      reply = "I drafted this — use it?"
    }

    return {
      reply,
      operations,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: MODEL,
    }
  },
)
