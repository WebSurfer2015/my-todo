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
import { Sparkles, Mic } from 'lucide-react-native'
import { useLang } from '../../app/LangContext'
import { useTheme, ThemeColors } from '../../app/theme'
import { useMochiAgent, type ProposedOperation } from './useMochiAgent'
import { useVoiceInput } from './useVoiceInput'
import { todayLocal } from '../../core-bindings/utils'
import { CategoryDef, categoryLabel } from '../../core-bindings/categories'
import { Analytics } from '../../adapters/analytics'

interface Props {
  visible: boolean
  onClose: () => void
  categories: CategoryDef[]
  /** Open todos (id + text) sent as agent context so Mochi can target
   * editTodo / markDone / addSteps at real ids. */
  todos: Array<{ id: string; text: string }>
  /** Apply one validated proposed operation (any of the four kinds). The
   * parent maps each kind to the existing store mutation (addTask /
   * update* / addSubtask / toggle) so the agent shares the manual write
   * surface — confirm-before-apply keeps the user in control. */
  onApplyOperation: (op: ProposedOperation) => void
}

/**
 * Mochi agent UI: a calm capture-and-edit surface with one user turn, a
 * single Claude reply, and the proposed operations awaiting confirm.
 * Supports all four ops (create / edit / add steps / mark done); the user
 * always confirms before anything is applied.
 */
export default function ChatSheet({
  visible,
  onClose,
  categories,
  todos,
  onApplyOperation,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { send, reset, isThinking, proposal, error } = useMochiAgent()
  const [input, setInput] = useState('')
  const inputRef = useRef<TextInput>(null)
  // Voice dictation — live transcript streams straight into the box.
  const { listening, toggle: toggleVoice } = useVoiceInput(setInput)

  // Fire once per open. visible flips true → false → true counts as
  // two separate "opened" events, which matches the analytics intent.
  useEffect(() => {
    if (visible) void Analytics.mochiChatOpened()
  }, [visible])

  function handleSend() {
    const turn = input.trim()
    if (!turn) return
    setInput('')
    send(turn, {
      today: todayLocal(),
      // Strip to id + label only — no need to leak counts/colors to
      // the model.
      categories: categories.map((c) => ({
        id: c.id,
        label: categoryLabel(c, t),
      })),
      todos,
    })
  }

  function handleApply() {
    if (!proposal) return
    for (const op of proposal.operations) onApplyOperation(op)
    reset()
    onClose()
  }

  function handleReject() {
    reset()
  }

  function close() {
    reset()
    setInput('')
    onClose()
  }

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
            <View style={styles.headerRow}>
              <View style={styles.titleRow}>
                <Sparkles size={16} color={theme.primary} strokeWidth={2.2} />
                <Text style={styles.title}>Ask Mochi</Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={10}>
                <Text style={styles.closeText}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {isThinking && (
                <Text style={styles.mochiLine}>Mochi's reading…</Text>
              )}

              {error && <Text style={styles.errorLine}>{error}</Text>}

              {proposal && (
                <View>
                  <Text style={styles.mochiLine}>{proposal.reply}</Text>
                  {proposal.operations.map((op, i) => (
                    <View key={i} style={styles.proposalCard}>
                      <OperationPreview
                        op={op}
                        categoryLabelLookup={(id) =>
                          categories.find((c) => c.id === id)
                            ? categoryLabel(categories.find((c) => c.id === id)!, t)
                            : id
                        }
                        todoTextLookup={(id) =>
                          todos.find((td) => td.id === id)?.text ?? 'that to-do'
                        }
                        styles={styles}
                      />
                    </View>
                  ))}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={handleReject}
                    >
                      <Text style={styles.btnSecondaryText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={handleApply}
                    >
                      <Text style={styles.btnPrimaryText}>Use this</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!isThinking && !proposal && !error && (
                <Text style={styles.hint}>
                  Try: “add email therapist for Friday under Home”
                </Text>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={[styles.micBtn, listening && styles.micBtnActive]}
                onPress={toggleVoice}
                disabled={isThinking}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Stop voice input' : 'Start voice input'}
              >
                <Mic
                  size={20}
                  color={listening ? '#fff' : theme.label2}
                  strokeWidth={2}
                />
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Say what you'd like to add or change…"
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

/** Renders a confirm-preview for any of the four proposed operations, so
 * the user sees exactly what Mochi will do before tapping "Use this". */
function OperationPreview({
  op,
  categoryLabelLookup,
  todoTextLookup,
  styles,
}: {
  op: ProposedOperation
  categoryLabelLookup: (id: string) => string
  todoTextLookup: (id: string) => string
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
          {a.dueDate && <Text style={styles.proposalChip}>Completed by {a.dueDate}</Text>}
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
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 16,
      paddingHorizontal: 16,
      paddingBottom: Platform.OS === 'ios' ? 32 : 16,
      maxHeight: '85%',
      minHeight: 380,
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
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontSize: 17, fontWeight: '700', color: c.label },
    closeText: { fontSize: 15, color: c.label2, fontWeight: '500' },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyContent: { paddingVertical: 12, gap: 12 },
    mochiLine: { fontSize: 15, color: c.label, lineHeight: 22 },
    errorLine: { fontSize: 13, color: c.red },
    hint: { fontSize: 13, color: c.label3, fontStyle: 'italic' },
    proposalCard: {
      backgroundColor: c.card,
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
    proposalTitle: { fontSize: 15, fontWeight: '600', color: c.label },
    proposalMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    proposalChip: {
      fontSize: 12,
      fontWeight: '500',
      color: c.label2,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.bg,
    },
    proposalNotes: { fontSize: 13, color: c.label3, fontStyle: 'italic' },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    btn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimary: { backgroundColor: c.primary },
    btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
    sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micBtnActive: { backgroundColor: c.red },
  })
}
