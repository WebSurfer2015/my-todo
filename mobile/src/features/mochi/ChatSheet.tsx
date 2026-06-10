import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { Sparkles } from 'lucide-react-native'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'
import { useMochiAgent, type ProposedOperation } from './useMochiAgent'
import { todayLocal } from '../../core-bindings/utils'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import { Analytics } from '../../adapters/analytics'

interface Props {
  visible: boolean
  onClose: () => void
  /** First name (or display name) for the greeting line. */
  greetingName: string
  categories: CategoryDef[]
  /** Open todos (id + text) sent as agent context so Mochi can target
   * editTodo / markDone / addSteps at real ids. */
  todos: Array<{ id: string; text: string }>
  /** Grocery departments (id + label) so Mochi can target addGroceryItem. */
  groceryGroups: Array<{ id: string; label: string }>
  /** Grocery store names so Mochi can tag items / detect a missing store. */
  stores: string[]
  /** Apply one validated proposed operation. The parent maps each kind to
   * the existing store mutation so the agent shares the manual write
   * surface — confirm-before-apply keeps the user in control. */
  onApplyOperation: (op: ProposedOperation) => void
  /** Switch back to the manual compose form. Renders an "Enter manually
   * instead" action; omit to hide it. */
  onEnterManually?: () => void
}

/** Opening intent chips — pre-fill the input so the user can elaborate. */
const INTENT_CHIPS = [
  'Add a to-do',
  'Update a to-do',
  'Add steps',
  'Mark one done',
  'Add to shopping list',
]

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
  categories,
  todos,
  groceryGroups,
  stores,
  onApplyOperation,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { send, reset, isThinking, messages, error } = useMochiAgent()
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

  function handleSend() {
    const turn = input.trim()
    if (!turn) return
    setInput('')
    send(turn, {
      today: todayLocal(),
      // Strip to id + label only — no need to leak counts/colors to the model.
      categories: categories.map((c) => ({ id: c.id, label: categoryLabel(c, t) })),
      todos,
      groceryGroups,
      stores,
    })
  }

  function handleConfirm(index: number, ops: ProposedOperation[]) {
    for (const op of ops) onApplyOperation(op)
    setResolved((prev) => ({ ...prev, [index]: 'applied' }))
  }

  // "Try again" — drop this proposal's action row and let the user restate.
  function handleReject(index: number) {
    setResolved((prev) => ({ ...prev, [index]: 'declined' }))
    inputRef.current?.focus()
  }

  function close() {
    reset()
    setInput('')
    setResolved({})
    onClose()
  }

  const greeting = greetingName.trim()
    ? `Hello ${greetingName.trim()}, how can I help you?`
    : 'Hello, how can I help you?'

  const categoryLookup = (id: string) => {
    const c = categories.find((cat) => cat.id === id)
    return c ? categoryLabel(c, t) : id
  }
  const todoTextLookup = (id: string) =>
    todos.find((td) => td.id === id)?.text ?? 'that to-do'
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
                  <Text style={styles.greeting}>{greeting}</Text>
                  <View style={styles.chipsRow}>
                    {INTENT_CHIPS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={styles.intentChip}
                        activeOpacity={0.7}
                        onPress={() => {
                          setInput(c + ' ')
                          inputRef.current?.focus()
                        }}
                      >
                        <Text style={styles.intentChipText}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <View key={i} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userBubbleText}>{m.content}</Text>
                    </View>
                  </View>
                ) : (
                  <View key={i} style={styles.mochiRow}>
                    <View style={styles.mochiBubble}>
                      {!!m.content && <Text style={styles.mochiLine}>{m.content}</Text>}
                      {m.operations?.map((op, j) => (
                        <View key={j} style={styles.proposalCard}>
                          <OperationPreview
                            op={op}
                            categoryLabelLookup={categoryLookup}
                            todoTextLookup={todoTextLookup}
                            groupLabelLookup={groupLookup}
                            styles={styles}
                          />
                        </View>
                      ))}
                      {m.operations && m.operations.length > 0 && (
                        resolved[i] === 'applied' ? (
                          <Text style={styles.appliedNote}>✓ Done</Text>
                        ) : resolved[i] === 'declined' ? (
                          <Text style={styles.appliedNote}>Okay — tell me what to change.</Text>
                        ) : m.awaitingConfirmation ? (
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              style={[styles.btn, styles.btnSecondary]}
                              onPress={() => handleReject(i)}
                            >
                              <Text style={styles.btnSecondaryText}>Try again</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.btn, styles.btnPrimary]}
                              onPress={() => handleConfirm(i, m.operations!)}
                            >
                              <Text style={styles.btnPrimaryText}>Confirm</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null
                      )}
                    </View>
                  </View>
                ),
              )}

              {isThinking && (
                <View style={styles.mochiRow}>
                  <View style={styles.mochiBubble}>
                    <Text style={styles.mochiLine}>Mochi's thinking…</Text>
                  </View>
                </View>
              )}

              {error && <Text style={styles.errorLine}>{error}</Text>}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Message Mochi…"
                placeholderTextColor={theme.gray3}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                editable={!isThinking}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || isThinking}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** Renders a confirm-preview for any proposed operation, so the user sees
 * exactly what Mochi will do before tapping Confirm. */
function OperationPreview({
  op,
  categoryLabelLookup,
  todoTextLookup,
  groupLabelLookup,
  styles,
}: {
  op: ProposedOperation
  categoryLabelLookup: (id: string) => string
  todoTextLookup: (id: string) => string
  groupLabelLookup: (id: string) => string
  styles: ReturnType<typeof makeStyles>
}) {
  if (op.kind === 'createTodo') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>New to-do</Text>
        <Text style={styles.proposalTitle}>{a.text}</Text>
        <View style={styles.proposalMeta}>
          {a.category && <Text style={styles.proposalChip}>{categoryLabelLookup(a.category)}</Text>}
          {a.dueDate && <Text style={styles.proposalChip}>Completion by {a.dueDate}</Text>}
          {a.priority && a.priority !== 'medium' && (
            <Text style={styles.proposalChip}>Priority: {a.priority}</Text>
          )}
          {recurrenceLabel(a.recurrence) && (
            <Text style={styles.proposalChip}>{recurrenceLabel(a.recurrence)}</Text>
          )}
          {a.reminders?.map((r, i) => (
            <Text key={i} style={styles.proposalChip}>⏰ {r.at.replace('T', ' ')}</Text>
          ))}
        </View>
        {a.notes && <Text style={styles.proposalNotes}>{a.notes}</Text>}
      </View>
    )
  }

  if (op.kind === 'editTodo') {
    const a = op.args
    return (
      <View>
        <Text style={styles.proposalKind}>Edit</Text>
        <Text style={styles.proposalTitle}>{todoTextLookup(a.todoId)}</Text>
        <View style={styles.proposalMeta}>
          {a.text && <Text style={styles.proposalChip}>Rename: {a.text}</Text>}
          {a.category && <Text style={styles.proposalChip}>{categoryLabelLookup(a.category)}</Text>}
          {a.dueDate && <Text style={styles.proposalChip}>Due {a.dueDate}</Text>}
          {a.priority && <Text style={styles.proposalChip}>Priority: {a.priority}</Text>}
          {recurrenceLabel(a.recurrence) && (
            <Text style={styles.proposalChip}>{recurrenceLabel(a.recurrence)}</Text>
          )}
          {a.reminders?.map((r, i) => (
            <Text key={i} style={styles.proposalChip}>⏰ {r.at.replace('T', ' ')}</Text>
          ))}
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
          {a.groupId && <Text style={styles.proposalChip}>{groupLabelLookup(a.groupId)}</Text>}
          {a.stores?.map((s, i) => (
            <Text key={i} style={styles.proposalChip}>🛒 {s}</Text>
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
    mochiRow: { alignItems: 'flex-start' },
    mochiBubble: {
      maxWidth: '92%',
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
    proposalChip: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.primarySoft,
      overflow: 'hidden',
    },
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
    btnSecondary: {
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    btnSecondaryText: { color: c.label2, fontSize: 15, fontWeight: '500' },
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
