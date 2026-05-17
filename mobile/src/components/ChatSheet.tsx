import React, { useMemo, useState } from 'react'
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
import { useLang } from '../LangContext'
import { useTheme, ThemeColors } from '../theme'
import { useMochiAgent, type ProposedOperation } from '../useMochiAgent'
import { todayLocal } from '../utils'
import { CategoryDef, categoryLabel } from '../categories'

interface Props {
  visible: boolean
  onClose: () => void
  categories: CategoryDef[]
  /** Apply a single createTodo proposal. Wired by the parent to the
   * existing store's addTask so the agent has the same write surface
   * as a manual tap. */
  onApplyCreateTodo: (op: ProposedOperation) => void
}

/**
 * Phase 0 Mochi agent UI: a tiny chat surface with one user turn, a
 * single Claude reply, and a list of proposed operations awaiting the
 * user's confirm. No conversation history, no streaming, no tools
 * beyond `createTodo`. The constrained scope is intentional — we want
 * to prove the round-trip first before investing in the conversational
 * layer.
 */
export default function ChatSheet({
  visible,
  onClose,
  categories,
  onApplyCreateTodo,
}: Props) {
  const { t } = useLang()
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const { send, reset, isThinking, proposal, error } = useMochiAgent()
  const [input, setInput] = useState('')

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
    })
  }

  function handleApply() {
    if (!proposal) return
    for (const op of proposal.operations) {
      if (op.kind === 'createTodo') onApplyCreateTodo(op)
    }
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
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Ask Mochi</Text>
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
                      {op.kind === 'createTodo' && (
                        <CreateTodoPreview
                          op={op}
                          categoryLabelLookup={(id) =>
                            categories.find((c) => c.id === id)
                              ? categoryLabel(
                                  categories.find((c) => c.id === id)!,
                                  t,
                                )
                              : id
                          }
                          styles={styles}
                        />
                      )}
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
              <TextInput
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
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function CreateTodoPreview({
  op,
  categoryLabelLookup,
  styles,
}: {
  op: Extract<ProposedOperation, { kind: 'createTodo' }>
  categoryLabelLookup: (id: string) => string
  styles: ReturnType<typeof makeStyles>
}) {
  const a = op.args
  return (
    <View>
      <Text style={styles.proposalTitle}>{a.text}</Text>
      <View style={styles.proposalMeta}>
        {a.category && (
          <Text style={styles.proposalChip}>
            {categoryLabelLookup(a.category)}
          </Text>
        )}
        {a.dueDate && (
          <Text style={styles.proposalChip}>Completed by {a.dueDate}</Text>
        )}
        {a.priority && a.priority !== 'medium' && (
          <Text style={styles.proposalChip}>Priority: {a.priority}</Text>
        )}
      </View>
      {a.notes && <Text style={styles.proposalNotes}>{a.notes}</Text>}
    </View>
  )
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
  })
}
