import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import { Sparkles, Bell } from 'lucide-react-native'
import { useLang } from '../../app/LangContext'
import { usePurchases } from '../../app/PurchasesContext'
import { useTheme, ThemeColors } from '../../app/theme'
import { useMochiAgent, type ProposedOperation } from './useMochiAgent'
import MochiThinking from './MochiThinking'
import { snapDueDateToRecurrence } from '../../../../core/src/logic/derive'
import { todayLocal } from '../../core-bindings/utils'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import { Analytics } from '../../adapters/analytics'

interface Props {
  visible: boolean
  onClose: () => void
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
  }>
  /** Grocery departments (id + label) so Mochi can target addGroceryItem. */
  groceryGroups: Array<{ id: string; label: string }>
  /** Grocery store names so Mochi can tag items / detect a missing store. */
  stores: string[]
  /** Apply one validated proposed operation. The parent maps each kind to
   * the existing store mutation so the agent shares the manual write
   * surface — confirm-before-apply keeps the user in control. */
  onApplyOperation: (op: ProposedOperation) => void
  /** Review a proposed NEW todo in the manual ComposeSheet instead of
   * applying it directly — the chat parsed the words, the manual form (the
   * same code a manual add uses) lets the user confirm/edit and save. When
   * provided, a single-createTodo confirmation routes here. */
  onReviewCreateTodo?: (args: Extract<ProposedOperation, { kind: 'createTodo' }>['args']) => void
  /** Switch back to the manual compose form. Renders an "Enter manually
   * instead" action; omit to hide it. */
  onEnterManually?: () => void
}

/** Opening intent chips. Tapping one auto-sends the intent and gets an instant
 * canned follow-up question — no AI round (no "thinking…", no token cost) for a
 * bare intent that would otherwise just make Mochi ask "what?". */
const INTENT_CHIPS: { label: string; prompt: string }[] = [
  { label: 'Add a to-do', prompt: 'What would you like to add?' },
  { label: 'Update a to-do', prompt: 'Which to-do should I change, and how?' },
  { label: 'Add steps', prompt: 'Which to-do needs steps?' },
  { label: 'Mark one done', prompt: 'Which one did you finish?' },
  { label: 'Add to shopping list', prompt: 'What should I add to your list?' },
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

/** Slow breathing sparkle for the empty-state greeting — a calm sign of life,
 * not a spinner. Static when reduce-motion is on. */
function BreathingSparkle({ reduceMotion, color }: { reduceMotion: boolean; color: string }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduceMotion, v])
  return (
    <Animated.View
      style={
        reduceMotion
          ? { marginBottom: 8 }
          : {
              marginBottom: 8,
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
              transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
            }
      }
    >
      <Sparkles size={22} color={color} strokeWidth={2.2} />
    </Animated.View>
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
  groceryGroups,
  stores,
  onApplyOperation,
  onReviewCreateTodo,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { send, reset, isThinking, messages, error, pushLocalExchange } = useMochiAgent()
  const { mochiRemaining, mochiPeriod, canSendMochi, openPaywall } = usePurchases()
  const [input, setInput] = useState('')
  // Per-proposal resolution so a confirmed/declined turn swaps its action
  // row for a quiet footer. Keyed by message index (append-only, stable).
  const [resolved, setResolved] = useState<Record<number, 'applied' | 'declined'>>({})
  const inputRef = useRef<TextInput>(null)
  const scrollRef = useRef<ScrollView>(null)

  // Fire once per open. visible flips true → false → true counts as
  // two separate "opened" events, which matches the analytics intent.
  useEffect(() => {
    if (visible) void Analytics.mochiChatOpened()
  }, [visible])

  // Keep the latest turn in view as the conversation grows / Mochi thinks.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(id)
  }, [messages, isThinking])

  function handleSend(raw: string = input) {
    const turn = raw.trim()
    if (!turn || isThinking) return
    // Out of Mochi requests (base allowance + no top-ups) → open the paywall
    // instead of spending a call.
    if (!canSendMochi) {
      openPaywall("You're out of Mochi requests for now.")
      return
    }
    Haptics.selectionAsync().catch(() => {})
    setInput('')
    send(turn, {
      today: todayLocal(),
      // Strip to id + label only — no need to leak counts/colors to the model.
      categories: categories.map((c) => ({ id: c.id, label: categoryLabel(c, t) })),
      // Strip to id + text for the agent — it doesn't need the local fields.
      todos: todos.map((td) => ({ id: td.id, text: td.text })),
      groceryGroups,
      stores,
    })
  }

  function handleConfirm(index: number, ops: ProposedOperation[]) {
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
    for (const op of ops) onApplyOperation(op)
    setResolved((prev) => ({ ...prev, [index]: 'applied' }))
  }

  function close() {
    reset()
    setInput('')
    setResolved({})
    onClose()
  }

  const greeting = greetingName.trim()
    ? `Hi ${greetingName.trim()}. What's on your mind?`
    : "Hi. What's on your mind?"

  const categoryLookup = (id: string) => {
    const c = categories.find((cat) => cat.id === id)
    return c ? categoryLabel(c, t) : id
  }
  const todoTextLookup = (id: string) =>
    todos.find((td) => td.id === id)?.text ?? 'that to-do'
  const todoLookup = (id: string) => todos.find((td) => td.id === id)
  const groupLookup = (id: string) =>
    groceryGroups.find((g) => g.id === id)?.label ?? id

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onShow={() => inputRef.current?.focus()}
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
            collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {/* Cancel pinned left, title optically centered, no right action. */}
            <View style={styles.headerRow}>
              <View style={styles.titleRow}>
                <Sparkles size={16} color={theme.primary} strokeWidth={2.2} />
                <Text style={styles.title}>Ask Mochi</Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={10} style={styles.cancelBtn}>
                <Text style={styles.closeText}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>

            {onEnterManually && (
              <TouchableOpacity
                style={styles.enterManuallyRow}
                onPress={onEnterManually}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Switch to entering the to-do manually"
              >
                <Text style={styles.enterManuallyText}>Enter manually instead</Text>
              </TouchableOpacity>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Greeting + intent chips — only before the first user turn. */}
              {messages.length === 0 && (
                <View>
                  <BreathingSparkle reduceMotion={reduceMotion} color={theme.primary} />
                  <Text style={styles.greeting}>{greeting}</Text>
                  <View style={styles.chipsRow}>
                    {INTENT_CHIPS.map((c) => (
                      <TouchableOpacity
                        key={c.label}
                        style={styles.intentChip}
                        activeOpacity={0.7}
                        onPress={() => {
                          // Auto-send the intent + an instant canned question —
                          // no AI round for a bare intent. The user then types
                          // the details, which DO go to Mochi.
                          Haptics.selectionAsync().catch(() => {})
                          pushLocalExchange(c.label, c.prompt)
                          inputRef.current?.focus()
                        }}
                      >
                        <Text style={styles.intentChipText}>{c.label}</Text>
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
                      {!!m.content && <Text style={styles.mochiLine}>{m.content}</Text>}
                      {m.operations?.map((op, j) => (
                        <View key={j} style={styles.proposalCard}>
                          <OperationPreview
                            op={op}
                            categoryLabelLookup={categoryLookup}
                            todoTextLookup={todoTextLookup}
                            todoLookup={todoLookup}
                            groupLabelLookup={groupLookup}
                            styles={styles}
                            theme={theme}
                          />
                        </View>
                      ))}
                      {m.operations && m.operations.length > 0 && (
                        resolved[i] === 'applied' ? (
                          <Text style={styles.appliedNote}>✓ Done</Text>
                        ) : m.awaitingConfirmation ? (
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              style={[styles.btn, styles.btnPrimary]}
                              onPress={() => handleConfirm(i, m.operations!)}
                            >
                              <Text style={styles.btnPrimaryText}>
                                {onReviewCreateTodo &&
                                m.operations!.length === 1 &&
                                m.operations![0].kind === 'createTodo'
                                  ? 'Review & add'
                                  : 'Confirm'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null
                      )}
                    </View>
                  </Appear>
                ),
              )}

              {isThinking && (
                <View style={styles.mochiRow}>
                  <MochiThinking />
                </View>
              )}

              {error && <Text style={styles.errorLine}>{error}</Text>}
            </ScrollView>

            {mochiRemaining != null && (
              <TouchableOpacity
                onPress={() => !canSendMochi && openPaywall()}
                disabled={canSendMochi}
                activeOpacity={0.7}
              >
                <Text style={styles.meter}>
                  {!canSendMochi
                    ? 'Out of Mochi requests — tap to upgrade'
                    : mochiRemaining > 0
                      ? `${mochiRemaining} Mochi requests left ${mochiPeriod === 'today' ? 'today' : 'this month'}`
                      : 'Allowance used — now pay as you go'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Message Mochi…"
                placeholderTextColor={theme.gray3}
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
                editable={!isThinking}
              />
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
function OperationPreview({
  op,
  categoryLabelLookup,
  todoTextLookup,
  todoLookup,
  groupLabelLookup,
  styles,
  theme,
}: {
  op: ProposedOperation
  categoryLabelLookup: (id: string) => string
  todoTextLookup: (id: string) => string
  todoLookup: (id: string) => { priority?: string; category?: string; dueDate?: string } | undefined
  groupLabelLookup: (id: string) => string
  styles: ReturnType<typeof makeStyles>
  theme: ThemeColors
}) {
  const reminderIcon = <Bell size={12} color={theme.primary} strokeWidth={2.4} />
  const reminderText = (at: string) => at.replace('T', ' ')
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
          {a.category && <Chip styles={styles}>{categoryLabelLookup(a.category)}</Chip>}
          {effectiveDue && <Chip styles={styles}>{`Due ${effectiveDue}`}</Chip>}
          <Chip styles={styles}>Priority: {a.priority ?? 'medium'}</Chip>
          {recurrenceLabel(a.recurrence) && (
            <Chip styles={styles}>{recurrenceLabel(a.recurrence)}</Chip>
          )}
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
    return (
      <View>
        <Text style={styles.proposalKind}>Edit todo</Text>
        <Text style={styles.proposalTitle}>
          {a.text ? a.text : todoTextLookup(a.todoId)}
        </Text>
        <View style={styles.proposalMeta}>
          <Chip styles={styles}>
            {category ? categoryLabelLookup(category) : 'No category'}
          </Chip>
          <Chip styles={styles}>{dueDate ? `Due ${dueDate}` : 'No due date'}</Chip>
          <Chip styles={styles}>Priority: {priority}</Chip>
          {recurrenceLabel(a.recurrence) && (
            <Chip styles={styles}>{recurrenceLabel(a.recurrence)}</Chip>
          )}
          {a.reminders && a.reminders.length > 0 ? (
            a.reminders.map((r, i) => (
              <Chip key={i} styles={styles} icon={reminderIcon}>
                {reminderText(r.at)}
              </Chip>
            ))
          ) : (
            <Chip styles={styles} icon={reminderIcon}>No reminder</Chip>
          )}
        </View>
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
        <Text style={styles.proposalKind}>Add to shopping list</Text>
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

  // markDone
  return (
    <View>
      <Text style={styles.proposalKind}>Mark done</Text>
      <Text style={styles.proposalTitle}>{todoTextLookup(op.args.todoId)}</Text>
    </View>
  )
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Human-readable label for a proposed recurrence, e.g. "Repeats weekly ·
 * Mon, Wed" or "Every 2 weeks". */
function recurrenceLabel(
  r?: { freq: string; interval?: number; byWeekday?: number[] },
): string | null {
  if (!r) return null
  const units: Record<string, string> = {
    daily: 'days',
    weekly: 'weeks',
    monthly: 'months',
    yearly: 'years',
  }
  const base =
    r.interval && r.interval > 1
      ? `Every ${r.interval} ${units[r.freq] ?? r.freq}`
      : `Repeats ${r.freq}`
  const days =
    r.byWeekday && r.byWeekday.length > 0
      ? ` · ${r.byWeekday.map((d) => WEEKDAY_ABBR[d] ?? d).join(', ')}`
      : ''
  return `${base}${days}`
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
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      maxHeight: '85%',
      minHeight: 420,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.separator,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 28,
      marginBottom: 12,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Absolute so the centered title isn't pushed off-center by Cancel's width.
    cancelBtn: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: '700', color: c.label },
    enterManuallyRow: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.primary,
      marginBottom: 10,
    },
    enterManuallyText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
      letterSpacing: -0.1,
    },
    closeText: { fontSize: 15, color: c.label2, fontWeight: '500' },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { paddingVertical: 12, gap: 10 },
    // Greeting + intent chips (pre-first-turn).
    greeting: { fontSize: 17, fontWeight: '600', color: c.label, marginBottom: 12 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    intentChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    intentChipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    // Chat bubbles.
    userRow: { alignItems: 'flex-end' },
    userBubble: {
      maxWidth: '85%',
      backgroundColor: c.primary,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    userBubbleText: { fontSize: 15, color: c.primaryOn, lineHeight: 21 },
    mochiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
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
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 8,
    },
    mochiLine: { fontSize: 15, color: c.label, lineHeight: 22 },
    errorLine: { fontSize: 13, color: c.red },
    proposalCard: {
      backgroundColor: c.modal,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: 12,
      gap: 6,
    },
    proposalKind: {
      fontSize: 11,
      fontWeight: '700',
      color: c.label3,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    proposalTitle: { fontSize: 17, fontWeight: '600', color: c.label },
    proposalMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: c.primary },
    proposalNotes: { fontSize: 13, color: c.label3, fontStyle: 'italic' },
    swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    swatch: { width: 16, height: 16, borderRadius: 8 },
    appliedNote: { fontSize: 13, fontWeight: '600', color: c.label3, marginTop: 4 },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
      flex: 1,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: c.primary },
    btnPrimaryText: { color: c.primaryOn, fontSize: 15, fontWeight: '600' },
    meter: {
      fontSize: 11,
      fontWeight: '600',
      color: c.label3,
      textAlign: 'center',
      paddingTop: 8,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      paddingTop: 12,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.bg,
      fontSize: 15,
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
    sendBtnText: { color: c.primaryOn, fontSize: 18, fontWeight: '700' },
  })
}
