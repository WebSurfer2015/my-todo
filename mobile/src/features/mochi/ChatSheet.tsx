import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { Sparkles, Bell, Check, Mic, Square } from 'lucide-react-native'
import { useLang } from '../../app/LangContext'
import { useAuth } from '../../app/AuthContext'
import { isUndoLive, useUndoLive } from '../../app/mochiUndo'
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from '../../app/theme'
import { useReducedMotion } from '../../app/useReducedMotion'
import { useSheetDismiss, sheetGrabZone } from '../../ui/useSheetDismiss'
import { useMochiAgent, type ChatTurn, type ProposedOperation } from './useMochiAgent'
import { pickMatchHeader, supersededProposalTurns } from './chatTurns'
import MochiThinking from './MochiThinking'
import EditableCaptureCard, { type CapturedTodoPatch } from './EditableCaptureCard'
import { type UndoFn, type UndoResult } from './undoOutcome'
import { useInlineUndo, useInlineUndos } from './useInlineUndo'
import { PARTIAL_UNDO_MESSAGE } from '../../store/slices/useTodosSlice'
import { snapDueDateToRecurrence } from '../../../../core/src/logic/derive'
import { buildFallbackCapture } from '../../../../core/src/logic/mochiFallback'
import { markMochiResting, mochiRestLabel, mochiRestUntil, type MochiRestScope } from './mochiRest'
import { todayLocal, isoDate } from '../../core-bindings/utils'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import type { AgentRecurrence } from '../../../../core/src/ports/aiContracts'
import { deferPresets } from '../task/DeferModal'
import CategoryIcon from '../../ui/CategoryIcon'
import { formatCalendarDate, recurrenceShortLabel, type RecurrenceFreqStrings } from '../../../../core/src/logic/labels'
import { addedReplyText } from './captureCardEditable'
import { useSpeechInput } from './useSpeechInput'
import { SPEECH_COPY } from './speechInput'

/** What applying a confirmed turn did. `pending` is set when the turn raised
 * confirm Alerts (a repeating to-do's delete scope):
 * it resolves once they're all answered — `applied` false means the user kept
 * everything as is, so the card must not say "✓ Done". */
export interface MochiApplyResult {
  undo: UndoFn | null
  pending?: Promise<{ undo: UndoFn | null; applied: boolean; keptSome: boolean }>
}


interface Props {
  visible: boolean
  onClose: () => void
  /** Text carried over from Compose ("Ask Mochi instead") — pre-fills the
   * input when the sheet opens so the user's words aren't lost. */
  initialInput?: string
  /** Send `initialInput` straight away instead of pre-filling (first-run
   * onboarding: the user already pressed send on its screen). */
  autoSendInitial?: boolean
  /** First name (or display name) for the greeting line. */
  greetingName: string
  /** Honor the user's reduce-motion preference — skip the entrance + breathing
   * animations when true. */
  reduceMotion?: boolean
  categories: CategoryDef[]
  /** Open todos. id + text go to the agent so it can target editTodo /
   * markDone / addSteps at real ids; priority/category/dueDate are used
   * locally to show an edit's RESULTING state (existing value for fields
   * the edit leaves unchanged). */
  todos: Array<{
    id: string
    text: string
    priority?: string
    category?: string
    dueDate?: string
    done?: boolean
    /** Step texts, so subtaskAction can target one. */
    subtasks?: string[]
    /** Surfaced so the pick-list can differentiate identical-titled tasks. */
    recurrence?: AgentRecurrence
    /** Present when this to-do is one instance of a generated series — drives
     * the "Delete series" option on the delete card. */
    seriesId?: string
    /** Current reminders, so an edit that leaves them alone shows them. */
    reminders?: Array<{ at: string }>
  }>
  /** Trashed todos (id + text) so Mochi can restore one and the preview can
   * name it. */
  trashedTodos: Array<{ id: string; text: string }>
  /** Grocery departments (id + label) so Mochi can target addGroceryItem. */
  groceryGroups: Array<{ id: string; label: string }>
  /** Shopping items (id + text) so Mochi can target deleteGroceryItem and the
   * preview can show which item it'll remove. */
  groceries: Array<{ id: string; text: string }>
  /** The user's most frequently-bought staples, top-first — shown as quick
   * re-add chips on the opening screen. Each `prefill` seeds the capture box.
   * Empty for a new account, in which case the teaching examples show. */
  frequentChips: Array<{ label: string; prefill: string }>
  /** Grocery store names so Mochi can tag items / detect a missing store. */
  stores: string[]
  /** Apply one confirmed turn's validated operations (as a batch, so a to-do
   * can land in a category the same turn creates). The parent maps each
   * kind to the existing store mutation so the agent shares the manual write
   * surface — confirm-before-apply keeps the user in control. Returns the
   * turn's combined inline Undo, or null. */
  onApplyOperations: (ops: ProposedOperation[]) => MochiApplyResult
  /** Optimistically apply a single new to-do / grocery item. Returns the live
   * id (for inline chip-editing; null for groceries), the to-do's resolved
   * category id, and an `undo` the card renders inline. The no-Confirm
   * capture path. `undo` is exact and silent (a repeating capture removes the
   * whole created series + any category it created); it returns false when
   * nothing was undone (e.g. a newer turn retired this Undo), so the card only
   * reads "Removed" once something was removed. */
  onCaptureWithUndo: (op: ProposedOperation) => { id: string | null; category?: string; undo: UndoFn }
  /** Edit a field on a just-captured to-do straight from its card. */
  onEditCapturedTodo: (
    id: string,
    patch: CapturedTodoPatch,
  ) => void
  /** Apply a pick-list proposal to the user's chosen subset of ids. The parent
   * runs the action (delete / markDone / edit / addSteps) per id via the same
   * store mutations a manual edit uses — delete still warns it's permanent. */
  onApplyPickedTodos: (
    op: Extract<ProposedOperation, { kind: 'pickTodos' }>,
    selectedIds: string[],
  ) => UndoFn | null
  /** Move one to-do to the Trash — `scope:'series'` also moves all future
   * occurrences. Reversible, so the cards don't confirm. */
  onDeleteTodo: (id: string, scope: 'one' | 'series') => UndoFn | null
  /** Bulk-act on the pick-list's ticked items: skip / defer (to dueDate) /
   * delete. The card owns the date picker + delete confirm. */
  onPickAction: (action: 'skip' | 'defer' | 'delete', ids: string[], dueDate?: string) => UndoFn | null
  /** Review a proposed NEW todo in the manual ComposeSheet instead of
   * applying it directly — the chat parsed the words, the manual form (the
   * same code a manual add uses) lets the user confirm/edit and save. When
   * provided, a single-createTodo confirmation routes here. */
  onReviewCreateTodo?: (
    args: Extract<ProposedOperation, { kind: 'createTodo' }>['args'],
    opts?: { note?: string },
  ) => void
  /** Switch back to the manual compose form. Renders an "Enter manually
   * instead" action; omit to hide it. `remember: false` opens Compose as a
   * one-off without making manual the remembered capture mode (Mochi's
   * resting "Add it myself"). */
  onEnterManually?: (opts?: { remember?: boolean }) => void
}

/** Example chips — tapping one PRE-FILLS the capture box (it doesn't ask a
 * question). The user tweaks and sends, so capture leads instead of a
 * back-and-forth. These double as a "here's what I can do" teaser, and are the
 * fallback when the account has no frequent-staple history yet. `label` is what
 * the chip shows; `prefill` is what lands in the box. */
const EXAMPLE_CHIPS: Array<{ label: string; prefill: string }> = [
  { label: 'Buy milk tomorrow', prefill: 'Buy milk tomorrow' },
  { label: 'Run Mon/Wed/Fri 11am', prefill: 'Run Mon/Wed/Fri 11am' },
  { label: 'Call mom this weekend', prefill: 'Call mom this weekend' },
]

/** Fade-and-rise entrance for a chat row. New bubbles ease up into place so the
 * conversation feels alive; static when reduce-motion is on. */
function Appear({
  reduceMotion,
  style,
  children,
}: {
  reduceMotion: boolean
  style?: object
  children: React.ReactNode
}) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  useEffect(() => {
    if (reduceMotion) return
    Animated.timing(v, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [reduceMotion, v])
  return (
    <Animated.View
      style={[
        style,
        reduceMotion
          ? null
          : {
              opacity: v,
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
              ],
            },
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** The voice-input mic. Idle: a soft 40pt circle so it reads as a button.
 * Listening: a filled accent circle with a Stop square and a slow, gentle
 * pulse ring — static when Reduce Motion is on (the in-app switch via
 * `reduceMotion`, or the OS setting via useReducedMotion). Same 40pt footprint
 * in every state, so nothing shifts. */
function MicButton({
  listening,
  disabled,
  reduceMotion,
  onPress,
  styles,
  theme,
}: {
  listening: boolean
  disabled: boolean
  reduceMotion: boolean
  onPress: () => void
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
}) {
  const osReduceMotion = useReducedMotion()
  const still = reduceMotion || osReduceMotion
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    pulse.setValue(0)
    if (!listening || still) return
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [listening, still, pulse])
  return (
    <View style={styles.micWrap}>
      {listening && !still && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.micPulse,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
      )}
      <Pressable
        style={({ pressed }) => [
          styles.micBtn,
          listening && styles.micBtnListening,
          disabled && styles.sendBtnDisabled,
          pressed && !disabled && { transform: [{ scale: 0.9 }] },
        ]}
        onPress={onPress}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={listening ? SPEECH_COPY.stopLabel : SPEECH_COPY.micLabel}
        accessibilityState={{ disabled }}
      >
        {listening ? (
          <Square size={14} color={theme.primaryOn} fill={theme.primaryOn} strokeWidth={2.5} />
        ) : (
          <Mic size={20} color={theme.label2} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  )
}

/**
 * Mochi chatbot: a calm, multi-turn capture surface. Mochi greets, asks a
 * follow-up per missing field, can create a missing category/store, and
 * gives a final confirmation (a proposal card) the user applies with
 * Confirm. Every write goes through the same store mutations a manual tap
 * uses.
 */
export default function ChatSheet({
  visible,
  onClose,
  onEnterManually,
  greetingName,
  reduceMotion = false,
  categories,
  todos,
  trashedTodos,
  groceryGroups,
  groceries,
  frequentChips,
  stores,
  onApplyOperations,
  onCaptureWithUndo,
  onEditCapturedTodo,
  onApplyPickedTodos,
  onDeleteTodo,
  onPickAction,
  onReviewCreateTodo,
  initialInput,
  autoSendInitial = false,
}: Props) {
  const { t } = useLang()
  // Mochi's rest is per account (mochiRest is keyed by uid).
  const uid = useAuth().user?.uid ?? null
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  // Swipe-the-grabber-down to dismiss. confirmsClose: requestClose confirms
  // before clearing a non-empty conversation, so settle back rather than slide.
  const { translateY, panHandlers } = useSheetDismiss(visible, requestClose, {
    confirmsClose: true,
  })
  const { send, reset, isThinking, messages, error, errorKind } = useMochiAgent()
  const [input, setInput] = useState('')
  // On-device voice input: the live transcript fills the box; nothing sends
  // until the user taps Send. 'unavailable' (no native module / no on-device
  // recognizer) hides the mic — keyboard dictation still exists.
  const speech = useSpeechInput({ onTranscript: setInput })
  // Last user turn, for the "Try again" recovery action on an error.
  const lastSentRef = useRef('')
  // Per-proposal resolution so a confirmed/declined turn swaps its action
  // row for a quiet footer. Keyed by message index (append-only, stable).
  // 'pending' = waiting on a confirm Alert; 'kept' = every Alert was cancelled
  // and nothing else applied (the card says "Kept as is", never "✓ Done").
  const [resolved, setResolved] = useState<Record<number, 'applied' | 'declined' | 'pending' | 'kept'>>({})
  // Set when some (not all) of a turn's confirm Alerts were cancelled.
  const [keptSome, setKeptSome] = useState<Record<number, true>>({})
  // Optimistic-capture bookkeeping. appliedRef is a SYNCHRONOUS guard so the
  // auto-apply effect can never double-apply a turn (e.g. under a re-run before
  // setResolved commits). confirmedRef is the same kind of guard for the
  // Confirm button: a fast double tap lands before the re-render hides it, so
  // without it the turn would apply twice. undoFnsRef holds each applied
  // turn's inline undo; `undone` records what pressing it did.
  const appliedRef = useRef<Set<number>>(new Set())
  const confirmedRef = useRef<Set<number>>(new Set())
  const undoFnsRef = useRef<Record<number, UndoFn>>({})
  // Live id of each auto-applied to-do, so its card chips can edit it in place.
  const capturedIdRef = useRef<Record<number, string | null>>({})
  // …and its resolved category id (a same-turn new category has no id in the
  // proposal itself).
  const capturedCategoryRef = useRef<Record<number, string | undefined>>({})
  // Turn i's inline Undo runs at most once (a fast double tap can't run a
  // combined Undo twice) and records what it did — 'nothing' included, so the
  // footer says "Nothing to undo" rather than keeping a dead Undo button.
  const { results: undone, run: runTurnUndo, clear: clearUndone } = useInlineUndos()
  const runUndo = useCallback(
    (i: number): Promise<UndoResult | null> => runTurnUndo(i, undoFnsRef.current[i]),
    [runTurnUndo],
  )
  // A single to-do / shopping item Mochi already added (auto-capture, or a
  // confirmed one) — its card says "Added…", the footer is only Undo, and the
  // reply reads in the past tense.
  const isAppliedCapture = (m: ChatTurn, i: number): boolean =>
    m.role === 'assistant' &&
    m.operations?.length === 1 &&
    (m.operations[0].kind === 'createTodo' || m.operations[0].kind === 'addGroceryItem') &&
    resolved[i] === 'applied'
  const inputRef = useRef<TextInput>(null)
  const scrollRef = useRef<ScrollView>(null)

  // Pre-fill what the user had typed in Compose — or, from onboarding, send
  // it right away (once per open; handleSend via a ref so the effect only
  // re-runs on open).
  const handleSendRef = useRef<(raw?: string) => void>(() => {})
  useEffect(() => {
    if (!visible || !initialInput) return
    if (autoSendInitial) handleSendRef.current(initialInput)
    else setInput(initialInput)
  }, [visible, initialInput, autoSendInitial])

  // Keep the latest turn in view as the conversation grows / Mochi thinks.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(id)
  }, [messages, isThinking])

  // Optimistic capture: a SINGLE new to-do / grocery item is applied the
  // moment Mochi proposes it (no Confirm tap), with an inline Undo. Multi-op
  // turns and edits/mark-done keep the explicit Confirm. The appliedRef guard
  // makes this idempotent — a turn is applied exactly once. Only while the
  // sheet is VISIBLE: a reply that lands after the chat was hidden is never
  // auto-created behind the user's back — it's marked handled and, if the
  // chat is shown again, waits for an explicit Confirm.
  useEffect(() => {
    messages.forEach((m, i) => {
      if (m.role !== 'assistant' || appliedRef.current.has(i)) return
      const ops = m.operations
      if (!m.awaitingConfirmation || !ops || ops.length !== 1) return
      const op = ops[0]
      if (op.kind !== 'createTodo' && op.kind !== 'addGroceryItem') return
      appliedRef.current.add(i)
      if (!visible) return
      const res = onCaptureWithUndo(op)
      undoFnsRef.current[i] = res.undo
      capturedIdRef.current[i] = res.id
      capturedCategoryRef.current[i] = res.category
      setResolved((prev) => ({ ...prev, [i]: 'applied' }))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    })
  }, [messages, onCaptureWithUndo, visible])

  // P1.4/P1.7 graceful local fallback: over the INVISIBLE fair-use ceiling,
  // never wall or paywall — hand the raw text to the manual compose form so
  // the task still gets added (de-metered model, docs/MOCHI-MONETIZATION-MODEL.md).
  // The companion is never metered; only the AI breakdown gracefully degrades.
  // Mid-conversation the latest turn may be just an answer ("Friday"), so
  // rebuild the still-open request ("call mom — Friday").
  // `messages` here is the pre-send snapshot, so it excludes `turn`.
  // Phase 2 (2026-10-18): don't yank the user out of the chat. Mochi says
  // it's resting (with the real local reset time) and offers "Add it
  // myself", which carries their words into Compose.
  const [restingCapture, setRestingCapture] = useState<{ text: string } | null>(null)
  // { until, label } while resting; null otherwise. Set from events/effects
  // (never computed from the clock during render).
  const [resting, setResting] = useState<{ until: number; label: string } | null>(null)
  const isResting = resting !== null
  const restLabel = resting?.label ?? ''
  useEffect(() => {
    if (!visible) return
    setRestingCapture(null)
    const until = mochiRestUntil(uid, Date.now(), 'chat')
    setResting(until ? { until, label: mochiRestLabel(until) } : null)
  }, [visible, uid])
  // Wake up when the rest ends while the sheet is open.
  useEffect(() => {
    if (!resting) return
    const id = setTimeout(() => setResting(null), Math.max(0, resting.until - Date.now()))
    return () => clearTimeout(id)
  }, [resting])
  // Closing the sheet (it stays mounted), Mochi thinking or resting all end
  // listening — the mic is disabled in those states.
  const stopSpeech = speech.stop
  useEffect(() => {
    if (!visible || isThinking || isResting) stopSpeech({ discard: true })
  }, [visible, isThinking, isResting, stopSpeech])
  const micDisabled = isThinking || isResting
  function toggleSpeech() {
    if (micDisabled) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    if (speech.status === 'listening') speech.stop()
    else void speech.start(input)
  }
  // Forget this conversation's local bookkeeping (the hook's reset() aborts
  // any in-flight turn and clears the messages).
  // Bumped on every clear, so a late confirm-Alert answer can't land on a
  // NEW conversation's turn at the same index.
  const conversationGenRef = useRef(0)
  function clearConversation() {
    conversationGenRef.current += 1
    reset()
    setInput('')
    setResolved({})
    setKeptSome({})
    clearUndone()
    appliedRef.current.clear()
    confirmedRef.current.clear()
    undoFnsRef.current = {}
    capturedIdRef.current = {}
    capturedCategoryRef.current = {}
  }

  // Switching to the manual form abandons this conversation: abort an
  // in-flight request (a late reply would otherwise auto-create the to-do
  // behind Compose — a duplicate of what the user is typing) and clear it.
  function enterManually() {
    clearConversation()
    onEnterManually?.()
  }

  function fallBackToManual(turn: string, scope: MochiRestScope = 'all') {
    const until = markMochiResting(uid, new Date(), scope)
    setResting({ until, label: mochiRestLabel(until) })
    setRestingCapture(buildFallbackCapture(messages, turn))
  }
  function addItMyself() {
    if (restingCapture && onReviewCreateTodo) {
      onReviewCreateTodo(restingCapture, { note: `Mochi's resting until ${restLabel}. I kept your words.` })
      close()
    } else {
      // A one-off while Mochi rests — don't flip the remembered FAB mode.
      onEnterManually?.({ remember: false })
    }
  }

  function handleSend(raw: string = input) {
    const turn = raw.trim()
    if (!turn || isThinking) return
    // Send ends listening; a late result must not refill the cleared box.
    speech.stop({ discard: true })
    if (mochiRestUntil(uid, Date.now(), 'chat')) {
      // Still resting from earlier today — don't spend a call.
      fallBackToManual(turn, 'chat')
      setInput('')
      return
    }
    Haptics.selectionAsync().catch(() => {})
    setInput('')
    lastSentRef.current = turn
    // The server is the only fair-use gate: its RESOURCE_EXHAUSTED takes the
    // graceful fallback (P1.4/P1.7) instead of surfacing a quota wall.
    void send(turn, {
      today: todayLocal(),
      // Strip to id + label only — no need to leak counts/colors to the model.
      categories: categories.map((c) => ({ id: c.id, label: categoryLabel(c, t) })),
      // Strip to id + text for the agent — it doesn't need the local fields.
      todos: todos.map((td) => ({
        id: td.id,
        text: td.text,
        done: td.done,
        subtasks: td.subtasks,
      })),
      trashedTodos: trashedTodos.map((td) => ({ id: td.id, text: td.text })),
      groceryGroups,
      groceries: groceries.map((g) => ({ id: g.id, text: g.text })),
      stores,
    }).then((res) => {
      if (res.error === 'quota') fallBackToManual(turn, res.chatOnly ? 'chat' : 'all')
    })
  }

  handleSendRef.current = handleSend

  function handleConfirm(index: number, ops: ProposedOperation[]) {
    // Synchronous double-tap guard — apply a turn once.
    if (confirmedRef.current.has(index)) return
    confirmedRef.current.add(index)
    // Gentle success beat — the satisfying "Mochi got it" moment.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    // A single new-todo turn is handed to the manual ComposeSheet (the same
    // code a manual add uses) so the user reviews + saves through one path —
    // identical outcome, no separate apply logic. Close the chat so Compose
    // lands on top. Other turns keep the direct-apply path.
    if (onReviewCreateTodo && ops.length === 1 && ops[0].kind === 'createTodo') {
      onReviewCreateTodo(ops[0].args)
      setResolved((prev) => ({ ...prev, [index]: 'applied' }))
      close()
      return
    }
    // Keep the Undos (mark done / delete / skip) so the turn shows an inline
    // "✓ Done · Undo" — the store's snackbar is hidden behind this Modal.
    const res = onApplyOperations(ops)
    if (!res.pending) {
      if (res.undo) undoFnsRef.current[index] = res.undo
      setResolved((prev) => ({ ...prev, [index]: 'applied' }))
      return
    }
    // Confirm Alerts are up — only claim "Done" once they're answered.
    setResolved((prev) => ({ ...prev, [index]: 'pending' }))
    const generation = conversationGenRef.current
    void res.pending.then((out) => {
      // The chat was cleared while the Alert was up — this turn is gone.
      if (conversationGenRef.current !== generation) return
      if (out.undo) undoFnsRef.current[index] = out.undo
      if (out.keptSome && out.applied) setKeptSome((prev) => ({ ...prev, [index]: true }))
      setResolved((prev) =>
        prev[index] === 'pending' ? { ...prev, [index]: out.applied ? 'applied' : 'kept' } : prev,
      )
    })
  }

  function close() {
    clearConversation()
    onClose()
  }

  // Backdrop / Android-back. A multi-turn conversation is higher-stakes to
  // lose than a single field, so confirm before clearing a non-empty thread.
  function requestClose() {
    if (messages.length === 0) {
      close()
      return
    }
    // Calm, accurate copy: ending clears only the chat — nothing the user
    // saved. Not a destructive action, so a neutral button.
    Alert.alert(t.endChatTitle, t.endChatBody, [
      { text: t.keepChatting, style: 'cancel' },
      { text: t.endChat, onPress: close },
    ])
  }

  const greeting = greetingName.trim()
    ? `Hi ${greetingName.trim()} — what should I add?`
    : 'What should I add?'

  // Opening-screen chips: the user's frequent staples first (top 3), padded
  // with teaching examples (skipping any that duplicate a staple's prefill) so
  // there are always three and a fresh account still learns what Mochi can do.
  const openingChips = useMemo(() => {
    const out = [...frequentChips]
    for (const ex of EXAMPLE_CHIPS) {
      if (out.length >= 3) break
      if (!out.some((c) => c.prefill === ex.prefill)) out.push(ex)
    }
    return out.slice(0, 3)
  }, [frequentChips])

  const categoryLookup = (id: string) => {
    const c = categories.find((cat) => cat.id === id)
    return c ? categoryLabel(c, t) : id
  }
  const todoTextLookup = (id: string) =>
    todos.find((td) => td.id === id)?.text ?? 'that to-do'
  const todoLookup = (id: string) => todos.find((td) => td.id === id)
  const groupLookup = (id: string) =>
    groceryGroups.find((g) => g.id === id)?.label ?? id
  const groceryTextLookup = (id: string) =>
    groceries.find((g) => g.id === id)?.text ?? 'that item'
  const trashedTextLookup = (id: string) =>
    trashedTodos.find((td) => td.id === id)?.text ?? 'that to-do'
  // Resolve a pick-list's ids to full local todos (dropping any that vanished),
  // so the checklist rows can show due date / category / recurrence.
  const pickCandidates = (ids: string[]) =>
    ids.map((id) => todos.find((td) => td.id === id)).filter((t): t is PickCandidate => !!t)
  // Unresolved proposals a newer Mochi turn has replaced — read-only now.
  const superseded = supersededProposalTurns(messages, resolved)
  const renderPreview = (op: ProposedOperation, added = false) => (
    <OperationPreview
      op={op}
      added={added}
      categoryLabelLookup={categoryLookup}
      todoTextLookup={todoTextLookup}
      todoLookup={todoLookup}
      groupLabelLookup={groupLookup}
      groceryTextLookup={groceryTextLookup}
      trashedTextLookup={trashedTextLookup}
      styles={styles}
      theme={theme}
    />
  )

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onShow={() => inputRef.current?.focus()}
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
            collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessible={false} />
          {/* accessibilityViewIsModal: trap VoiceOver inside the sheet (iOS);
              pairs with the sibling-backdrop #15 fix that prevents a11y flatten. */}
          <Animated.View accessibilityViewIsModal style={[styles.sheet, { transform: [{ translateY }] }]}>
            <View style={sheetGrabZone} {...panHandlers}>
              <View style={styles.handle} />
            </View>
            {/* Close pinned left, title optically centered, no right action. */}
            <View style={styles.headerRow}>
              <View style={styles.titleRow}>
                <Sparkles size={16} color={theme.primary} strokeWidth={2.2} />
                <Text style={styles.title}>Ask Mochi</Text>
              </View>
              {/* Same path as the backdrop / swipe: confirms before
                  clearing a non-empty conversation. */}
              <TouchableOpacity
                onPress={requestClose}
                hitSlop={10}
                style={styles.cancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            {onEnterManually && (
              <TouchableOpacity
                style={styles.enterManuallyRow}
                onPress={enterManually}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Enter manually instead"
              >
                <Text style={styles.enterManuallyText}>Enter manually instead</Text>
              </TouchableOpacity>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              // Large text: the opening greeting + chips can outgrow the space
              // the keyboard leaves. Keep the chips (the tappable part) beside
              // the input when the body shrinks, and hint that it scrolls —
              // the greeting stays one scroll up instead of a chip being cut.
              onLayout={() => {
                if (messages.length > 0) return
                scrollRef.current?.scrollToEnd({ animated: false })
                scrollRef.current?.flashScrollIndicators()
              }}
            >
              {/* Greeting + example chips — only before the first user turn.
                  Chips PRE-FILL the box (capture-first) rather than asking. */}
              {messages.length === 0 && (
                <View>
                  <Text style={styles.greeting}>{greeting}</Text>
                  <Text style={styles.captureHint}>
                    Type it however you like — I'll turn it into a to-do.
                  </Text>
                  <View style={styles.chipsRow}>
                    {openingChips.map((chip) => (
                      <TouchableOpacity
                        key={chip.label}
                        style={styles.intentChip}
                        activeOpacity={0.7}
                        onPress={() => {
                          // Pre-fill the box; the user tweaks + sends. No AI
                          // round here — capture leads.
                          Haptics.selectionAsync().catch(() => {})
                          setInput(chip.prefill)
                          inputRef.current?.focus()
                        }}
                      >
                        <Text style={styles.intentChipText}>{chip.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <Appear key={i} reduceMotion={reduceMotion} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userBubbleText}>{m.content}</Text>
                    </View>
                  </Appear>
                ) : (
                  <Appear key={i} reduceMotion={reduceMotion} style={styles.mochiRow}>
                    <View style={styles.mochiAvatar}>
                      <Sparkles size={14} color={theme.primary} strokeWidth={2.2} />
                    </View>
                    <View style={styles.mochiBubble}>
                      {!!m.content && (
                        <Text style={styles.mochiLine}>
                          {isAppliedCapture(m, i) ? addedReplyText(m.content) : m.content}
                        </Text>
                      )}
                      {m.operations?.map((op, j) => (
                        <View key={j} style={styles.proposalCard}>
                          {/* A replaced proposal is read-only: preview only. */}
                          {superseded.has(i) ? (
                            renderPreview(op)
                          ) : /* A just-captured to-do gets editable chips (tap
                              to fix category/date/priority on the live task). */
                          op.kind === 'createTodo' &&
                          resolved[i] === 'applied' &&
                          capturedIdRef.current[i] ? (
                            <EditableCaptureCard
                              args={{ ...op.args, category: capturedCategoryRef.current[i] ?? op.args.category }}
                              id={capturedIdRef.current[i]!}
                              categories={categories}
                              recurrenceText={repeatText(op.args.recurrence, t.recurrence)}
                              onEdit={onEditCapturedTodo}
                              onRemove={() => runUndo(i)}
                              undoLive={isUndoLive(undoFnsRef.current[i])}
                            />
                          ) : op.kind === 'addGroceryItem' && isAppliedCapture(m, i) ? (
                            renderPreview(op, true)
                          ) : op.kind === 'pickTodos' ? (
                            // Several tasks matched — let the user tick which
                            // ones to action. Owns its own confirm row.
                            <PickTodosCard
                              op={op}
                              candidates={pickCandidates(op.args.todoIds)}
                              categoryLabelLookup={categoryLookup}
                              onConfirm={(ids) => {
                                setResolved((prev) => ({ ...prev, [i]: 'applied' }))
                                return onApplyPickedTodos(op, ids)
                              }}
                              onDeleteTodo={(id, scope) => {
                                setResolved((prev) => ({ ...prev, [i]: 'applied' }))
                                return onDeleteTodo(id, scope)
                              }}
                              onPickAction={(act, ids, dueDate) => {
                                setResolved((prev) => ({ ...prev, [i]: 'applied' }))
                                return onPickAction(act, ids, dueDate)
                              }}
                              styles={styles}
                              theme={theme}
                            />
                          ) : op.kind === 'deleteTodo' && m.operations!.length === 1 ? (
                            // Owns its own action row: frozen title + a series
                            // instance gets an explicit "Delete series" choice.
                            // Only for a delete-only turn — in a mixed turn its
                            // own button resolved the WHOLE turn, so the other
                            // actions were never applied; there it renders as a
                            // preview under the shared Confirm.
                            <DeleteTodoCard
                              text={todoTextLookup(op.args.todoId)}
                              isSeries={!!todoLookup(op.args.todoId)?.seriesId}
                              onDelete={(scope) => {
                                setResolved((prev) => ({ ...prev, [i]: 'applied' }))
                                return onDeleteTodo(op.args.todoId, scope)
                              }}
                              styles={styles}
                            />
                          ) : (
                            renderPreview(op)
                          )}
                        </View>
                      ))}
                      {/* EditableCaptureCard, PickTodosCard and DeleteTodoCard
                          render their OWN action rows — skip the generic one. */}
                      {superseded.has(i) ? (
                        <Text style={styles.appliedNote}>Replaced by the newer suggestion</Text>
                      ) : m.operations?.length === 1 &&
                        m.operations[0].kind === 'addGroceryItem' &&
                        isAppliedCapture(m, i) ? (
                        // Already added — the card header says so; the footer
                        // is only Undo (then what the Undo did).
                        undone[i] ? (
                          <Text style={styles.appliedNote}>
                            {undone[i] === 'partial'
                              ? PARTIAL_UNDO_MESSAGE
                              : undone[i] === 'nothing'
                                ? 'Nothing to undo'
                                : 'Removed'}
                          </Text>
                        ) : undoFnsRef.current[i] && isUndoLive(undoFnsRef.current[i]) ? (
                          <View style={[styles.appliedRow, { justifyContent: 'flex-end' }]}>
                            <TouchableOpacity
                              hitSlop={8}
                              onPress={() => {
                                void runUndo(i)
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Undo adding this"
                            >
                              <Text style={styles.undoText}>Undo</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null
                      ) : m.operations &&
                        m.operations.length > 0 &&
                        !(
                          m.operations.length === 1 &&
                          ((m.operations[0].kind === 'createTodo' &&
                            resolved[i] === 'applied' &&
                            capturedIdRef.current[i]) ||
                            m.operations[0].kind === 'pickTodos' ||
                            m.operations[0].kind === 'deleteTodo')
                        ) && (
                        resolved[i] === 'pending' ? (
                          <Text style={styles.appliedNote}>Waiting for your answer…</Text>
                        ) : resolved[i] === 'kept' ? (
                          <Text style={styles.appliedNote}>Kept as is</Text>
                        ) : resolved[i] === 'applied' ? (
                          // Applied turns carry an inline Undo when the store
                          // could hand one back; otherwise just ✓ Done.
                          // Only the latest applied turn keeps its Undo.
                          undoFnsRef.current[i] && (undone[i] || isUndoLive(undoFnsRef.current[i])) ? (
                            undone[i] ? (
                              <Text style={styles.appliedNote}>
                                {undone[i] === 'partial'
                                  ? PARTIAL_UNDO_MESSAGE
                                  : undone[i] === 'nothing'
                                    ? `${capturedIdRef.current[i] ? '✓ Added' : '✓ Done'} · Nothing to undo`
                                    : capturedIdRef.current[i] ? 'Removed' : 'Undone'}
                              </Text>
                            ) : (
                              <View style={styles.appliedRow}>
                                <Text style={[styles.appliedNote, { marginTop: 0 }]}>
                                  {capturedIdRef.current[i]
                                    ? '✓ Added'
                                    : keptSome[i]
                                      ? '✓ Done · some kept as is'
                                      : '✓ Done'}
                                </Text>
                                <TouchableOpacity
                                  hitSlop={8}
                                  onPress={() => {
                                    void runUndo(i)
                                  }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Undo this"
                                >
                                  <Text style={styles.undoText}>Undo</Text>
                                </TouchableOpacity>
                              </View>
                            )
                          ) : (
                            <Text style={styles.appliedNote}>
                              {keptSome[i] ? '✓ Done · some kept as is' : '✓ Done'}
                            </Text>
                          )
                        ) : m.awaitingConfirmation ? (
                          (() => {
                            const ops = m.operations!
                            // To-do "deletes" only move to Done (30 days, Undo)
                            // and a shopping removal has its inline Undo too —
                            // neutral buttons that say what they do. No red:
                            // nothing here is beyond an Undo.
                            const cta =
                              onReviewCreateTodo && ops.length === 1 && ops[0].kind === 'createTodo'
                                ? { label: 'Review & add', tone: 'primary' as const }
                                : ops.every((o) => o.kind === 'deleteTodo')
                                  ? {
                                      label: ops.length === 1 ? 'Move to Done' : `Move ${ops.length} to Done`,
                                      tone: 'neutral' as const,
                                    }
                                  : ops.every((o) => o.kind === 'deleteGroceryItem')
                                    ? { label: 'Remove from shopping', tone: 'neutral' as const }
                                    : { label: 'Confirm', tone: 'primary' as const }
                            return (
                              <View style={styles.actionsRow}>
                                <TouchableOpacity
                                  style={[
                                    styles.btn,
                                    cta.tone === 'neutral' ? styles.btnNeutral : styles.btnPrimary,
                                  ]}
                                  onPress={() => handleConfirm(i, ops)}
                                  accessibilityRole="button"
                                >
                                  <Text
                                    style={
                                      cta.tone === 'neutral' ? styles.btnNeutralText : styles.btnPrimaryText
                                    }
                                  >
                                    {cta.label}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )
                          })()
                        ) : null
                      )}
                    </View>
                  </Appear>
                ),
              )}

              {isThinking && (
                <View style={styles.mochiRow}>
                  <MochiThinking label="Reading your message…" />
                </View>
              )}

              {isResting && (
                <View style={styles.mochiRow}>
                  <View style={styles.mochiAvatar}>
                    <Sparkles size={14} color={theme.primary} strokeWidth={2.2} />
                  </View>
                  <View style={styles.mochiBubble}>
                    <Text style={styles.mochiLine}>
                      {restingCapture
                        ? `I'm resting until ${restLabel}. Your words are safe — you can add this yourself right now.`
                        : `I'm resting until ${restLabel}. You can still add things yourself.`}
                    </Text>
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnPrimary]}
                        onPress={addItMyself}
                        accessibilityRole="button"
                      >
                        <Text style={styles.btnPrimaryText}>
                          {restingCapture ? 'Add it myself' : 'Add a to-do'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {error && (
                <View style={styles.errorBlock}>
                  <Text style={styles.errorLine}>{error}</Text>
                  <View style={styles.errorActions}>
                    {/* The fair-use ceiling ('quota') can't be retried — only
                        offer "Try again" for transient/network failures. A
                        'quota' error normally never shows here: handleSend
                        falls back to manual compose (P1.7). */}
                    {errorKind !== 'quota' && errorKind !== 'blocked' && !!lastSentRef.current && (
                      <TouchableOpacity
                        style={styles.errorBtn}
                        onPress={() => handleSend(lastSentRef.current)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.errorBtnText}>Try again</Text>
                      </TouchableOpacity>
                    )}
                    {onEnterManually && (
                      <TouchableOpacity
                        style={styles.errorBtn}
                        onPress={enterManually}
                        accessibilityRole="button"
                      >
                        <Text style={styles.errorBtnText}>Enter manually</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* The depleting usage meter was removed in the de-meter — the
                companion is never metered (docs/MOCHI-MONETIZATION-MODEL.md).
                Over the invisible fair-use ceiling the client should fall back
                to local capture (graceful fallback — see the send guard; full
                behavior tracked in docs/REPOSITIONING-ROADMAP.md P1.4). */}
            {/* Voice status sits ABOVE the field: below it, the keyboard
                covers it while the sheet is up. */}
            {speech.status === 'listening' && (
              <Text
                style={[styles.speechNote, styles.speechNoteEnd]}
                accessibilityLiveRegion="polite"
                accessibilityLabel={SPEECH_COPY.listeningA11y}
              >
                {SPEECH_COPY.listening}
              </Text>
            )}
            {speech.status === 'error' && (
              <Text style={[styles.speechNote, styles.speechNoteEnd]} accessibilityLiveRegion="polite">
                {SPEECH_COPY.missed}
              </Text>
            )}
            {speech.status === 'denied' && (
              <Text style={styles.speechNote}>
                {SPEECH_COPY.denied}{' '}
                <Text
                  style={styles.speechLink}
                  onPress={() => Linking.openSettings().catch(() => {})}
                  accessibilityRole="link"
                >
                  {SPEECH_COPY.openSettings}
                </Text>
              </Text>
            )}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={
                  isResting
                    ? `Mochi's resting until ${restLabel}`
                    : messages.length > 0
                      ? 'Message Mochi…'
                      : speech.status !== 'unavailable'
                        ? 'Type or tap the mic…'
                        : "Type what's on your mind…"
                }
                placeholderTextColor={theme.label2}
                autoCapitalize="sentences"
                value={input}
                // Multiline so long input WRAPS, but a Return submits like
                // the send action: the soft/hardware Enter appends "\n",
                // which we intercept here and send instead of inserting a
                // newline. (onSubmitEditing never fires for multiline.)
                onChangeText={(text) => {
                  if (text.endsWith('\n')) handleSend(text.replace(/\n+$/, ''))
                  else setInput(text)
                }}
                multiline
                maxLength={2000}
                blurOnSubmit={false}
                editable={!isThinking && !isResting}
              />
              {speech.status !== 'unavailable' && (
                <MicButton
                  listening={speech.status === 'listening'}
                  disabled={micDisabled}
                  reduceMotion={reduceMotion}
                  onPress={toggleSpeech}
                  styles={styles}
                  theme={theme}
                />
              )}
              <Pressable
                style={({ pressed }) => [
                  styles.sendBtn,
                  !input.trim() && styles.sendBtnDisabled,
                  // Living send: a small press-dip when there's something to send.
                  pressed && !!input.trim() && { transform: [{ scale: 0.88 }] },
                ]}
                onPress={() => handleSend()}
                disabled={!input.trim() || isThinking}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** A local to-do enriched enough to tell identical-titled tasks apart. */
type PickCandidate = {
  id: string
  text: string
  priority?: string
  category?: string
  dueDate?: string
  recurrence?: AgentRecurrence
  /** Set when this is one instance of a generated series. */
  seriesId?: string
}

const PICK_VERB: Record<'delete' | 'markDone' | 'edit' | 'addSteps', string> = {
  delete: 'delete',
  markDone: 'complete',
  edit: 'edit',
  addSteps: 'add steps to',
}
const PICK_CTA: Record<'delete' | 'markDone' | 'edit' | 'addSteps', string> = {
  delete: 'Move to Done',
  markDone: 'Mark done',
  edit: 'Apply to',
  addSteps: 'Add steps to',
}
/** The applied note after a pick: "3 moved to Done", "1 done", "3 updated". */
const PICK_DONE: Record<'delete' | 'markDone' | 'edit' | 'addSteps', (n: number) => string> = {
  delete: (n) => `${n} moved to Done`,
  markDone: (n) => `${n} done`,
  edit: (n) => `${n} updated`,
  addSteps: (n) => `${n} updated`,
}

/** The core cadence label ("Weekly", "Every 2 weeks", "Weekly · Mon, Wed"),
 * or null when the proposal doesn't repeat. */
function repeatText(r: AgentRecurrence | undefined, strings: RecurrenceFreqStrings): string | null {
  return r ? recurrenceShortLabel(r, strings) : null
}

/** One-line summary of an edit patch for the pick-list header. */
function pickEditSummary(
  edit: Extract<ProposedOperation, { kind: 'pickTodos' }>['args']['edit'],
  categoryLabelLookup: (id: string) => string,
  t: { locale: string; recurrence: RecurrenceFreqStrings },
): string | null {
  if (!edit) return null
  const parts: string[] = []
  if (edit.text !== undefined) parts.push(`rename to "${edit.text}"`)
  if (edit.dueDate !== undefined) {
    parts.push(edit.dueDate ? `complete by ${formatCalendarDate(edit.dueDate, { locale: t.locale })}` : 'clear the date')
  }
  if (edit.priority) parts.push(`${edit.priority} priority`)
  if (edit.category) parts.push(categoryLabelLookup(edit.category))
  const repeat = repeatText(edit.recurrence, t.recurrence)
  if (repeat) parts.push(repeat)
  if (edit.reminders && edit.reminders.length > 0) parts.push('set reminder')
  if (edit.notes !== undefined) parts.push(edit.notes ? 'update notes' : 'clear notes')
  return parts.length > 0 ? `Set: ${parts.join(' · ')}` : null
}

/** A square checkbox. */
function PickCheck({
  checked,
  theme,
  styles,
}: {
  checked: boolean
  theme: ThemeColors
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={[styles.pickCheckbox, checked && styles.pickCheckboxOn]}>
      {checked && <Check size={13} color={theme.primaryOn} strokeWidth={3} />}
    </View>
  )
}

/**
 * Several existing tasks matched what the user asked to act on — render them as
 * a checklist so the user ticks exactly which to delete / complete / edit /
 * add-steps. Rows show due date + category + recurrence so identical titles are
 * distinguishable. Owns its own confirm row; for delete, the parent's apply
 * still fires the permanent-delete warning.
 */
/** "✓ <note> · Undo" for an action applied from the chat. The store's own
 * Undo snackbar renders BEHIND the chat Modal and expires unseen, so the
 * chat carries the Undo inline (like a captured to-do's "✓ Added · Undo"). */
function AppliedWithUndo({
  note,
  undo,
  styles,
}: {
  note: string
  undo: UndoFn | null
  styles: ReturnType<typeof makeStyles>
}) {
  // "Undone" only once the Undo really put something back.
  const { state, run } = useInlineUndo(undo)
  // Retired once a newer Mochi turn applied changes.
  const live = useUndoLive(undo)
  if (state === 'undone') return <Text style={styles.appliedNote}>Undone</Text>
  if (state === 'partial') return <Text style={styles.appliedNote}>{PARTIAL_UNDO_MESSAGE}</Text>
  if (state === 'nothing') return <Text style={styles.appliedNote}>✓ {note} · Nothing to undo</Text>
  if (!undo || !live) return <Text style={styles.appliedNote}>✓ {note}</Text>
  return (
    <View style={styles.appliedRow}>
      <Text style={[styles.appliedNote, { marginTop: 0 }]}>✓ {note}</Text>
      <TouchableOpacity
        hitSlop={8}
        onPress={() => {
          void run()
        }}
        accessibilityRole="button"
        accessibilityLabel={`Undo: ${note}`}
      >
        <Text style={styles.undoText}>Undo</Text>
      </TouchableOpacity>
    </View>
  )
}

function PickTodosCard({
  op,
  candidates,
  categoryLabelLookup,
  onConfirm,
  onDeleteTodo,
  onPickAction,
  styles,
  theme,
}: {
  op: Extract<ProposedOperation, { kind: 'pickTodos' }>
  candidates: PickCandidate[]
  categoryLabelLookup: (id: string) => string
  onConfirm: (selectedIds: string[]) => UndoFn | null
  onDeleteTodo: (id: string, scope: 'one' | 'series') => UndoFn | null
  onPickAction: (action: 'skip' | 'defer' | 'delete', ids: string[], dueDate?: string) => UndoFn | null
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
}) {
  const { t } = useLang()
  const { action, query } = op.args
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<{ note: string; undo: UndoFn | null } | null>(null)
  const [seriesDeleted, setSeriesDeleted] = useState<{ undo: UndoFn | null } | null>(null)
  // Defer: closed → the DeferModal-style preset rows → (Pick a date) a picker.
  const [deferOpen, setDeferOpen] = useState<false | 'presets' | 'picker'>(false)
  // delete lists let the user choose Skip / Defer / Delete on the ticked
  // items; markDone / edit / addSteps get one primary button for what the user
  // actually asked ("Mark done 3") — markDone used to land in the delete row
  // with no Mark-done button at all.
  const simpleActions = action === 'delete'

  // When a delete search lands entirely inside ONE generated series, offer to
  // drop the whole series instead of ticking every instance. `mode` starts on
  // that choice; "Pick which ones" drops into the normal checklist.
  const seriesId =
    action === 'delete' &&
    candidates.length >= 2 &&
    candidates.every((c) => c.seriesId) &&
    new Set(candidates.map((c) => c.seriesId)).size === 1
      ? candidates[0].seriesId
      : undefined
  const [mode, setMode] = useState<'choose' | 'list'>(seriesId ? 'choose' : 'list')

  const allOn = candidates.length > 0 && selected.size === candidates.length
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => {
    Haptics.selectionAsync().catch(() => {})
    setSelected(allOn ? new Set() : new Set(candidates.map((c) => c.id)))
  }
  const selectedIds = () => candidates.filter((c) => selected.has(c.id)).map((c) => c.id)
  // Synchronous once-only guard: a fast double tap lands before the re-render
  // swaps the buttons for the "✓ done" row, and would apply twice.
  const actedRef = useRef(false)
  const actOnce = () => {
    if (actedRef.current) return false
    actedRef.current = true
    return true
  }
  const confirm = () => {
    if (selected.size === 0 || !actOnce()) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    const undo = onConfirm(selectedIds())
    setDone({ note: PICK_DONE[action](selected.size), undo })
  }
  const doSkip = () => {
    if (selected.size === 0 || !actOnce()) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    const undo = onPickAction('skip', selectedIds())
    setDone({ note: `${selected.size} skipped`, undo })
  }
  const doDelete = () => {
    if (selected.size === 0 || !actOnce()) return
    const ids = selectedIds()
    // Reversible (30-day Trash + Undo), so no confirm dialog.
    const undo = onPickAction('delete', ids)
    setDone({ note: PICK_DONE.delete(ids.length), undo })
  }
  const deferTo = (d: Date) => {
    setDeferOpen(false)
    if (selected.size > 0 && actOnce()) {
      const ids = selectedIds()
      const undo = onPickAction('defer', ids, isoDate(d))
      setDone({ note: `${ids.length} deferred`, undo })
    }
  }
  const onDeferDate = (e: DateTimePickerEvent, d?: Date) => {
    if (e.type === 'set' && d) deferTo(d)
    else if (e.type === 'dismissed') setDeferOpen('presets')
  }

  const deleteSeries = () => {
    if (!seriesId || !actOnce()) return
    // Reversible (30-day Trash), so no confirm dialog.
    setSeriesDeleted({ undo: onDeleteTodo(candidates[0].id, 'series') })
  }

  if (seriesDeleted) {
    return <AppliedWithUndo note="Series tucked into Done" undo={seriesDeleted.undo} styles={styles} />
  }
  if (done) {
    return <AppliedWithUndo note={done.note} undo={done.undo} styles={styles} />
  }

  // Series-delete fork: drop the whole repeat, or pick individual occurrences.
  if (mode === 'choose' && seriesId) {
    return (
      <View>
        <Text style={styles.proposalKind}>Delete repeating to-do</Text>
        <Text style={styles.proposalTitle}>{candidates[0].text}</Text>
        <Text style={styles.pickSubtitle}>
          {candidates.length} occurrences of this series match.
        </Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnNeutral]}
            onPress={() => setMode('list')}
            accessibilityRole="button"
          >
            <Text style={styles.btnNeutralText}>Pick which ones</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnNeutral]}
            onPress={deleteSeries}
            accessibilityRole="button"
          >
            <Text style={styles.btnNeutralText}>Move series to Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const editSummary = action === 'edit' ? pickEditSummary(op.args.edit, categoryLabelLookup, t) : null
  const stepsNote =
    action === 'addSteps' && op.args.steps
      ? `Add ${op.args.steps.length} step${op.args.steps.length === 1 ? '' : 's'}`
      : null

  return (
    <View>
      <Text style={styles.proposalKind}>Choose which to {PICK_VERB[action]}</Text>
      <Text style={styles.pickSubtitle}>
        {pickMatchHeader(candidates.length, op.args.totalMatches, query)}
      </Text>
      {!!editSummary && <Text style={styles.pickSummary}>{editSummary}</Text>}
      {!!stepsNote && <Text style={styles.pickSummary}>{stepsNote}</Text>}

      <TouchableOpacity style={styles.pickSelectAll} onPress={toggleAll} hitSlop={6}>
        <PickCheck checked={allOn} theme={theme} styles={styles} />
        <Text style={styles.pickSelectAllText}>{allOn ? 'Clear all' : 'Select all'}</Text>
      </TouchableOpacity>

      <ScrollView style={styles.pickList} nestedScrollEnabled>
        {candidates.map((c) => {
          const meta = [
            c.dueDate ? `Complete by ${formatCalendarDate(c.dueDate, { locale: t.locale })}` : null,
            c.category ? categoryLabelLookup(c.category) : null,
            repeatText(c.recurrence, t.recurrence),
          ]
            .filter(Boolean)
            .join(' · ')
          const on = selected.has(c.id)
          return (
            <TouchableOpacity
              key={c.id}
              style={styles.pickRow}
              onPress={() => toggle(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.text}${meta ? `, ${meta}` : ''}`}
            >
              <PickCheck checked={on} theme={theme} styles={styles} />
              <View style={styles.pickRowBody}>
                <Text style={styles.pickRowText} numberOfLines={2}>
                  {c.text}
                </Text>
                {!!meta && <Text style={styles.pickRowMeta}>{meta}</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {simpleActions ? (
        // Skip / Defer / Delete on the ticked items.
        <>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral, selected.size === 0 && styles.btnDisabled]}
              disabled={selected.size === 0}
              onPress={doSkip}
              accessibilityRole="button"
            >
              <Text style={styles.btnNeutralText}>Skip{selected.size > 0 ? ` ${selected.size}` : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral, selected.size === 0 && styles.btnDisabled]}
              disabled={selected.size === 0}
              onPress={() => setDeferOpen(deferOpen ? false : 'presets')}
              accessibilityRole="button"
            >
              <Text style={styles.btnNeutralText}>Defer{selected.size > 0 ? ` ${selected.size}` : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral, selected.size === 0 && styles.btnDisabled]}
              disabled={selected.size === 0}
              onPress={doDelete}
              accessibilityRole="button"
            >
              <Text style={styles.btnNeutralText}>
                {selected.size > 0 ? `Move ${selected.size} to Done` : 'Move to Done'}
              </Text>
            </TouchableOpacity>
          </View>
          {deferOpen === 'presets' && (
            <View style={styles.pickDeferCard}>
              {/* Same choices as the Defer sheet (DeferModal). */}
              {deferPresets(t).map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={styles.pickDeferRow}
                  onPress={() => deferTo(p.date)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.label}, ${p.hint}`}
                >
                  <Text style={styles.pickDeferRowLabel}>{p.label}</Text>
                  <Text style={styles.pickDeferRowHint}>· {p.hint}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.pickDeferRow}
                onPress={() => setDeferOpen('picker')}
                accessibilityRole="button"
              >
                <Text style={styles.pickDeferRowLabel}>{t.snooze.pickDate}</Text>
              </TouchableOpacity>
            </View>
          )}
          {deferOpen === 'picker' && (
            <View style={styles.pickDeferWrap}>
              <Text style={styles.pickDeferLabel}>Move {selected.size} to:</Text>
              <DateTimePicker
                value={new Date()}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                themeVariant={theme.statusBar === 'light-content' ? 'dark' : 'light'}
                onChange={onDeferDate}
              />
            </View>
          )}
        </>
      ) : (
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, selected.size === 0 && styles.btnDisabled]}
          disabled={selected.size === 0}
          onPress={confirm}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>
            {PICK_CTA[action]} {selected.size > 0 ? selected.size : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * The delete-an-existing-to-do card. Owns its own action row so the title can
 * be frozen (survives the delete) and so a SERIES instance gets an explicit
 * "Delete series" choice instead of burying it in a post-confirm dialog.
 * Deletes go to the 30-day Trash, so there's no extra confirm.
 */
function DeleteTodoCard({
  text: textProp,
  isSeries: isSeriesProp,
  onDelete,
  styles,
}: {
  text: string
  isSeries: boolean
  onDelete: (scope: 'one' | 'series') => UndoFn | null
  styles: ReturnType<typeof makeStyles>
}) {
  const [text] = useState(textProp)
  const [isSeries] = useState(isSeriesProp)
  const [done, setDone] = useState<null | { scope: 'one' | 'series'; undo: UndoFn | null }>(null)
  // Synchronous double-tap guard — delete once.
  const actedRef = useRef(false)

  const confirmDelete = (scope: 'one' | 'series') => {
    if (actedRef.current) return
    actedRef.current = true
    // Reversible (30-day Done bin + inline Undo), so no confirm dialog.
    setDone({ scope, undo: onDelete(scope) })
  }

  if (done) {
    return (
      <AppliedWithUndo
        note={done.scope === 'series' ? 'Series tucked into Done' : 'Tucked into Done'}
        undo={done.undo}
        styles={styles}
      />
    )
  }

  return (
    <View>
      <Text style={styles.proposalKind}>Delete to-do</Text>
      <Text style={styles.proposalTitle}>{text}</Text>
      <View style={styles.actionsRow}>
        {isSeries ? (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral]}
              onPress={() => confirmDelete('one')}
              accessibilityRole="button"
            >
              <Text style={styles.btnNeutralText}>Move this one to Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnNeutral]}
              onPress={() => confirmDelete('series')}
              accessibilityRole="button"
            >
              <Text style={styles.btnNeutralText}>Move series to Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.btnNeutral]}
            onPress={() => confirmDelete('one')}
            accessibilityRole="button"
          >
            <Text style={styles.btnNeutralText}>Move to Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

/** A field pill. Must be a <View> wrapping a <Text> — a <Text> styled as a
 * pill (background + padding + overflow:hidden) collapses to zero size as a
 * flex-row child on iOS. */
function Chip({
  children,
  icon,
  styles,
}: {
  children: React.ReactNode
  /** Optional leading icon (e.g. a Bell for reminders). */
  icon?: React.ReactNode
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.chip}>
      {icon}
      <Text style={styles.chipText}>{children}</Text>
    </View>
  )
}

/** Renders a confirm-preview for any proposed operation, so the user sees
 * exactly what Mochi will do before tapping Confirm. */
/** "high" → "High" (raw enum values leaked into the proposal cards). */
function capitalize(w: string): string {
  return w ? w[0].toUpperCase() + w.slice(1) : w
}

function OperationPreview({
  op,
  added = false,
  categoryLabelLookup,
  todoTextLookup,
  todoLookup,
  groupLabelLookup,
  groceryTextLookup,
  trashedTextLookup,
  styles,
  theme,
}: {
  op: ProposedOperation
  /** Already applied (an auto-added shopping item) — say so, not "Add …". */
  added?: boolean
  categoryLabelLookup: (id: string) => string
  todoTextLookup: (id: string) => string
  todoLookup: (
    id: string,
  ) => { priority?: string; category?: string; dueDate?: string; reminders?: Array<{ at: string }> } | undefined
  groupLabelLookup: (id: string) => string
  groceryTextLookup: (id: string) => string
  trashedTextLookup: (id: string) => string
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
}) {
  const { t } = useLang()
  const reminderIcon = <Bell size={12} color={theme.primary} strokeWidth={2.4} />
  // "Remind Tomorrow, 9:00 AM" — never the raw "2026-10-20T09:00".
  const reminderText = (at: string) => `Remind ${formatCalendarDate(at, { locale: t.locale })}`
  const repeat = (r: AgentRecurrence | undefined) => repeatText(r, t.recurrence)
  if (op.kind === 'createTodo') {
    const a = op.args
    // Mirror what "Review & add" will actually save: a recurrence anchors the
    // due date to its first matching occurrence (the same snap ComposeSheet
    // runs), so show that instead of "No due date". Only surface fields that
    // are set — no misleading "No category / No due date" negatives, since the
    // manual form fills the rest in on review.
    const effectiveDue = a.recurrence
      ? snapDueDateToRecurrence(a.dueDate || todayLocal(), a.recurrence).slice(0, 10)
      : a.dueDate
    return (
      <View>
        <Text style={styles.proposalKind}>New to-do</Text>
        <Text style={styles.proposalTitle}>{a.text}</Text>
        <View style={styles.proposalMeta}>
          {a.newCategoryLabel ? (
            <Chip styles={styles}>{a.newCategoryLabel}</Chip>
          ) : (
            a.category && <Chip styles={styles}>{categoryLabelLookup(a.category)}</Chip>
          )}
          {effectiveDue && (
            <Chip styles={styles}>{`Complete by ${formatCalendarDate(effectiveDue, { locale: t.locale })}`}</Chip>
          )}
          {/* Priority only when it's not the default — nobody asked for "medium". */}
          {a.priority && a.priority !== 'medium' && <Chip styles={styles}>{`${capitalize(a.priority)} priority`}</Chip>}
          {repeat(a.recurrence) && <Chip styles={styles}>{repeat(a.recurrence)}</Chip>}
          {a.reminders && a.reminders.length > 0 &&
            a.reminders.map((r, i) => (
              <Chip key={i} styles={styles} icon={reminderIcon}>
                {reminderText(r.at)}
              </Chip>
            ))}
        </View>
        {a.notes && <Text style={styles.proposalNotes}>{a.notes}</Text>}
      </View>
    )
  }

  if (op.kind === 'editTodo') {
    const a = op.args
    // Resulting state: the edit's value where provided, else the existing
    // todo's value (an edit leaves unspecified fields unchanged). dueDate
    // is special — an explicit empty string clears it.
    const existing = todoLookup(a.todoId)
    const category = a.category ?? existing?.category
    const dueDate = a.dueDate !== undefined ? a.dueDate : existing?.dueDate
    const priority = a.priority ?? existing?.priority ?? 'medium'
    // Reminders: the edit only touches them when it carries a non-empty list
    // (which REPLACES the current ones); otherwise the to-do keeps its own.
    const replacesReminders = !!a.reminders && a.reminders.length > 0
    const reminders = replacesReminders ? a.reminders! : (existing?.reminders ?? [])
    return (
      <View>
        <Text style={styles.proposalKind}>Edit to-do</Text>
        <Text style={styles.proposalTitle}>
          {a.text ? a.text : todoTextLookup(a.todoId)}
        </Text>
        <View style={styles.proposalMeta}>
          <Chip styles={styles}>
            {a.newCategoryLabel
              ? a.newCategoryLabel
              : category
                ? categoryLabelLookup(category)
                : 'No category'}
          </Chip>
          <Chip styles={styles}>
            {dueDate ? `Complete by ${formatCalendarDate(dueDate, { locale: t.locale })}` : t.noDate}
          </Chip>
          <Chip styles={styles}>{`${capitalize(priority)} priority`}</Chip>
          {repeat(a.recurrence) && <Chip styles={styles}>{repeat(a.recurrence)}</Chip>}
          {reminders.map((r, i) => (
            <Chip key={i} styles={styles} icon={reminderIcon}>
              {reminderText(r.at)}
            </Chip>
          ))}
        </View>
        {replacesReminders && <Text style={styles.proposalNotes}>Replaces your reminders</Text>}
        {a.notes && <Text style={styles.proposalNotes}>{a.notes}</Text>}
      </View>
    )
  }

  if (op.kind === 'addSteps') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>Add steps to</Text>
        <Text style={styles.proposalTitle}>{todoTextLookup(a.todoId)}</Text>
        {a.steps.map((s, i) => (
          <Text key={i} style={styles.proposalNotes}>• {s.text}</Text>
        ))}
      </View>
    )
  }

  if (op.kind === 'createCategory') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>New category</Text>
        <View style={styles.swatchRow}>
          {a.color && <View style={[styles.swatch, { backgroundColor: a.color }]} />}
          <Text style={styles.proposalTitle}>{a.label}</Text>
        </View>
      </View>
    )
  }

  if (op.kind === 'createStore') {
    return (
      <View>
        <Text style={styles.proposalKind}>New store</Text>
        <Text style={styles.proposalTitle}>{op.args.name}</Text>
      </View>
    )
  }

  if (op.kind === 'addGroceryItem') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>{added ? 'Added to shopping list' : 'Add to shopping list'}</Text>
        <Text style={styles.proposalTitle}>{a.text}</Text>
        <View style={styles.proposalMeta}>
          {a.groupId && <Chip styles={styles}>{groupLabelLookup(a.groupId)}</Chip>}
          {a.stores?.map((s, i) => (
            <Chip key={i} styles={styles}>🛒 {s}</Chip>
          ))}
        </View>
      </View>
    )
  }

  if (op.kind === 'deleteGroceryItem') {
    // Freeze the title: after removal the item is gone, so a live lookup would
    // fall back to "that item" on the post-confirm re-render.
    return (
      <FrozenTitle
        kindLabel="Remove from shopping"
        resolve={() => groceryTextLookup(op.args.groceryId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'editCategory') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>Edit category</Text>
        <View style={styles.swatchRow}>
          {a.color && <View style={[styles.swatch, { backgroundColor: a.color }]} />}
          {/* Show the new icon itself, not its raw key ("shopping-cart"). */}
          {a.icon ? <CategoryIcon icon={a.icon} size={16} color={a.color} /> : null}
          <Text style={styles.proposalTitle}>{a.label ?? categoryLabelLookup(a.categoryId)}</Text>
        </View>
      </View>
    )
  }

  if (op.kind === 'deleteCategory') {
    return (
      <FrozenTitle
        kindLabel="Delete category"
        resolve={() => categoryLabelLookup(op.args.categoryId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'setGroceryChecked') {
    return (
      <FrozenTitle
        kindLabel={op.args.checked ? 'Mark bought' : 'Back on the list'}
        resolve={() => groceryTextLookup(op.args.groceryId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'renameStore') {
    return (
      <View>
        <Text style={styles.proposalKind}>Rename store</Text>
        <Text style={styles.proposalTitle}>
          {op.args.from} → {op.args.to}
        </Text>
      </View>
    )
  }

  if (op.kind === 'deleteStore') {
    return (
      <View>
        <Text style={styles.proposalKind}>Remove store</Text>
        <Text style={styles.proposalTitle}>{op.args.name}</Text>
      </View>
    )
  }

  if (op.kind === 'skipTodo') {
    return (
      <FrozenTitle
        kindLabel={op.args.scope === 'series' ? 'Skip this & future' : 'Skip this time'}
        resolve={() => todoTextLookup(op.args.todoId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'markUndone') {
    return (
      <FrozenTitle
        kindLabel="Reopen"
        resolve={() => todoTextLookup(op.args.todoId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'deferOverdue') {
    return (
      <View>
        <Text style={styles.proposalKind}>Move carried-over to-dos</Text>
        <Text style={styles.proposalTitle}>Move carried-over to-dos to {formatCalendarDate(op.args.dueDate, { locale: t.locale })}</Text>
      </View>
    )
  }

  if (op.kind === 'restoreTodo') {
    return (
      <FrozenTitle
        kindLabel="Reopen"
        resolve={() => trashedTextLookup(op.args.todoId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'subtaskAction') {
    const a = op.args
    const kindLabel = {
      complete: 'Complete step',
      uncomplete: 'Reopen step',
      remove: 'Remove step',
      rename: 'Rename step',
    }[a.action]
    return (
      <View>
        <Text style={styles.proposalKind}>{kindLabel}</Text>
        <Text style={styles.proposalTitle}>
          {a.action === 'rename' && a.newText ? `${a.subtaskText} → ${a.newText}` : a.subtaskText}
        </Text>
        <Text style={styles.proposalNotes}>on {todoTextLookup(a.todoId)}</Text>
      </View>
    )
  }

  if (op.kind === 'editGroceryItem') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>Edit shopping item</Text>
        <Text style={styles.proposalTitle}>{a.text ?? groceryTextLookup(a.groceryId)}</Text>
        <View style={styles.proposalMeta}>
          {a.groupId && <Chip styles={styles}>{groupLabelLookup(a.groupId)}</Chip>}
          {a.stores?.map((s, i) => (
            <Chip key={i} styles={styles}>🛒 {s}</Chip>
          ))}
        </View>
      </View>
    )
  }

  if (op.kind === 'markDone') {
    // Freeze the title: once marked done the to-do drops out of the open list,
    // so a live lookup would read "that to-do" after the action.
    return (
      <FrozenTitle
        kindLabel="Mark done"
        resolve={() => todoTextLookup(op.args.todoId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'deleteTodo') {
    // Only reached in a mixed turn (a delete-only turn uses DeleteTodoCard).
    return (
      <FrozenTitle
        kindLabel="Move to Done"
        resolve={() => todoTextLookup(op.args.todoId)}
        styles={styles}
      />
    )
  }

  if (op.kind === 'pickTodos') {
    // Only reached for a replaced (read-only) proposal — a live one renders
    // the interactive PickTodosCard.
    return (
      <View>
        <Text style={styles.proposalKind}>Choose which to {PICK_VERB[op.args.action]}</Text>
        <Text style={styles.pickSubtitle}>
          {pickMatchHeader(op.args.todoIds.length, op.args.totalMatches, op.args.query)}
        </Text>
      </View>
    )
  }

  // Exhaustive: every op kind has a preview above.
  const unhandled: never = op
  void unhandled
  return null
}

/** A preview title whose text is resolved ONCE on mount and frozen, so it
 * survives the action that deletes/changes the underlying item (a live lookup
 * would fall back to a generic placeholder on the post-action re-render). */
function FrozenTitle({
  kindLabel,
  resolve,
  styles,
}: {
  kindLabel: string
  resolve: () => string
  styles: ReturnType<typeof makeStyles>
}) {
  const [text] = useState(resolve)
  return (
    <View>
      <Text style={styles.proposalKind}>{kindLabel}</Text>
      <Text style={styles.proposalTitle}>{text}</Text>
    </View>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: SPACING.lg,
      paddingHorizontal: SPACING.lg,
      paddingBottom: Platform.OS === 'ios' ? SPACING.xxl : SPACING.lg,
      maxHeight: '85%',
      minHeight: 420,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: SPACING.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      marginBottom: SPACING.md,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    // Absolute so the centered title isn't pushed off-center by Cancel's width.
    cancelBtn: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    title: { fontSize: TYPE.title, fontWeight: '700', color: c.label },
    enterManuallyRow: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: c.primary,
      marginBottom: SPACING.md,
    },
    enterManuallyText: {
      fontSize: TYPE.footnote,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    closeText: { fontSize: TYPE.body, color: c.label2, fontWeight: '500' },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { paddingVertical: SPACING.md, gap: SPACING.sm },
    // Greeting + intent chips (pre-first-turn).
    greeting: { fontSize: TYPE.bodyLg, fontWeight: '600', color: c.label, marginBottom: SPACING.sm },
    captureHint: { fontSize: TYPE.footnote, color: c.label2, lineHeight: 18, marginBottom: SPACING.md },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    intentChip: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
    },
    intentChipText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.primary },
    // Chat bubbles.
    userRow: { alignItems: 'flex-end' },
    userBubble: {
      maxWidth: '85%',
      backgroundColor: c.primary,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    userBubbleText: { fontSize: TYPE.body, color: c.primaryOn, lineHeight: 21 },
    mochiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
    // Small Mochi avatar (sparkle) beside each assistant bubble — top-aligned.
    mochiAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    mochiBubble: {
      maxWidth: '86%',
      backgroundColor: c.card,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    mochiLine: { fontSize: TYPE.body, color: c.label, lineHeight: 22 },
    errorLine: { fontSize: TYPE.footnote, color: c.label2 },
    errorBlock: { gap: SPACING.sm, paddingVertical: SPACING.xs },
    errorActions: { flexDirection: 'row', gap: SPACING.sm },
    errorBtn: {
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: c.primary,
    },
    errorBtnText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.primary },
    proposalCard: {
      backgroundColor: c.modal,
      borderRadius: RADIUS.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: SPACING.md,
      gap: SPACING.sm,
    },
    proposalKind: {
      fontSize: TYPE.caption,
      fontWeight: '700',
      color: c.label2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    proposalTitle: { fontSize: TYPE.bodyLg, fontWeight: '600', color: c.label },
    proposalMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: 2 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primarySoft,
    },
    chipText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.primary },
    proposalNotes: { fontSize: TYPE.footnote, color: c.label2, fontStyle: 'italic' },
    swatchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    swatch: { width: 16, height: 16, borderRadius: 8 },
    appliedNote: { fontSize: TYPE.footnote, fontWeight: '600', color: c.label2, marginTop: SPACING.xs },
    appliedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.xs },
    undoText: { fontSize: TYPE.footnote, fontWeight: '700', color: c.primary },
    actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
    btn: {
      flex: 1,
      height: 42,
      borderRadius: RADIUS.control,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: c.primary },
    btnPrimaryText: { color: c.primaryOn, fontSize: TYPE.body, fontWeight: '600' },
    btnDisabled: { opacity: 0.4 },
    btnNeutral: { backgroundColor: c.surfaceAlt },
    btnNeutralText: { color: c.label, fontSize: TYPE.body, fontWeight: '600' },
    // ── Pick-list (multi-select checklist) ──
    pickSubtitle: { fontSize: TYPE.footnote, color: c.label2, marginTop: 1, marginBottom: SPACING.xs },
    pickSummary: {
      fontSize: TYPE.caption,
      fontWeight: '600',
      color: c.primary,
      marginBottom: SPACING.sm,
    },
    pickSelectAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    pickSelectAllText: { fontSize: TYPE.footnote, fontWeight: '600', color: c.label2 },
    pickList: { maxHeight: 240, marginBottom: SPACING.sm },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.md,
      paddingVertical: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    pickRowBody: { flex: 1 },
    pickRowText: { fontSize: TYPE.body, fontWeight: '500', color: c.label },
    pickRowMeta: { fontSize: TYPE.caption, color: c.label2, marginTop: 1 },
    pickCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    pickCheckboxOn: { backgroundColor: c.primary, borderColor: c.primary },
    pickDeferCard: {
      marginTop: SPACING.sm,
      backgroundColor: c.surfaceAlt,
      borderRadius: RADIUS.card,
      overflow: 'hidden',
    },
    pickDeferRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      minHeight: 44,
    },
    pickDeferRowLabel: { fontSize: TYPE.body, fontWeight: '500', color: c.label },
    pickDeferRowHint: { fontSize: TYPE.footnote, color: c.label3 },
    pickDeferWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
    pickDeferLabel: { fontSize: TYPE.footnote, fontWeight: '600', color: c.label2 },
    meter: {
      fontSize: TYPE.caption,
      fontWeight: '600',
      color: c.label2,
      textAlign: 'center',
      paddingTop: SPACING.sm,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      paddingTop: SPACING.md,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.control,
      backgroundColor: c.bg,
      fontSize: TYPE.body,
      color: c.label,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
    // 40pt mic, vertically centred on the 44pt send button. A visible soft
    // circle at rest so it reads as a button (icon label2 on surfaceAlt ≥3:1).
    micWrap: { width: 40, height: 40, marginBottom: 2 },
    micBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Listening: filled accent circle, Stop square in primaryOn.
    micBtnListening: { backgroundColor: c.primary },
    // The gentle pulse ring behind the listening mic.
    micPulse: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
    },
    speechNote: {
      fontSize: TYPE.footnote,
      color: c.label2,
      paddingBottom: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    // Listening / missed sit right-aligned, next to the mic they describe.
    speechNoteEnd: { textAlign: 'right' },
    speechLink: { color: c.primary, fontWeight: '600' },
    sendBtnText: { color: c.primaryOn, fontSize: TYPE.title, fontWeight: '700' },
  })
}
