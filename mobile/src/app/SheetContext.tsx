/**
 * Cross-screen sheet host. ProfileSheet, SettingsSheet, and the
 * ThemeSelector are reachable from every tab (the avatar + gear
 * sit in each screen's AppHeader), so the visibility state + the
 * sheet components themselves live at the app shell, not inside a
 * single tab screen.
 *
 * Per-tab sheets (ComposeSheet / ChatSheet / CategorySheet for Todos;
 * GroceryEditSheet / StorePicker for Groceries)
 * stay inside their owning screen — those don't need cross-tab access.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { Alert, Share } from 'react-native'
import { createNavigationContainerRef } from '@react-navigation/native'
import { useStore } from './StoreContext'
import { useAuth } from './AuthContext'
import { useLang } from './LangContext'
import {
  buildExportPayload,
  serializeExport,
  isExportEmpty,
} from '../../../core/src/data/exporter'
import ProfileSheet from '../features/profile/ProfileSheet'
import SettingsSheet from '../features/profile/SettingsSheet'
import ThemeSelector from '../features/profile/ThemeSelector'
import GuideMenuSheet from '../features/onboarding/GuideMenuSheet'
import GuideSheet from '../features/onboarding/GuideSheet'
import GuidesPrompt from '../features/onboarding/GuidesPrompt'
import ComposeSheet, { type ComposePrefill } from '../features/task/ComposeSheet'
import ChatSheet from '../features/mochi/ChatSheet'
import type { ProposedOperation } from '../features/mochi/useMochiAgent'
import { MOCHI_AGENT_ENABLED } from './featureFlags'
import ManageAnimationSoundSheet from '../features/profile/ManageAnimationSoundSheet'
import CategorySheet from '../features/category/CategorySheet'
import { COLOR_PALETTE } from '../core-bindings/categories'
import { SEED_GROCERY_STORES, frequentGroceries } from '../core-bindings/groceries'
import type { Filter, Priority } from '../core-bindings/types'
import type { Guide } from '../features/onboarding/guides'
import { genUuid } from '../../../core/src/logic/utils'

/** Signal that a screen should open its tab-local manage sheet. The
 * `seq` bumps so a repeat-trigger fires even when target stays the
 * same; screens read on focus and act when both target + seq change.
 * Used for Groceries today since StorePicker still lives inside
 * GroceryView. */
export interface ManageRequest {
  target: 'todos' | 'groceries' | null
  seq: number
}

interface Sheets {
  openProfile: () => void
  openSettings: () => void
  openTheme: () => void
  /** Open the Tips & guides menu (entry point for Settings). */
  openGuides: () => void
  /** Open the add-todo compose sheet from any tab. */
  openCompose: () => void
  /** FAB entry point — opens the last-used capture surface (manual or Mochi). */
  openCapture: () => void
  /** Open the Mochi capture assistant (natural-language add/edit). Entry
   * point lives in the compose sheet. */
  openMochi: () => void
  /** Open the Manage Filter sheet (Todos gear icon, Settings entry). */
  openManageFilter: () => void
  /** Open the Select Filter sheet (Todos funnel). */
  openSelectFilter: () => void
  /** Open Manage Groceries — navigates to Groceries tab then signals
   * the screen to open StorePicker in edit mode (since StorePicker
   * still lives inside GroceryView). */
  openManageGroceries: () => void
  /** Latest manage-sheet request the SheetContext has dispatched.
   * Tab screens read this to know when to open their local sheets. */
  manageRequest: ManageRequest
  /** Ask the Todos screen to scroll to a date-bucket group (by key). The
   * `seq` bumps so a repeat request for the same group re-fires. Set by the
   * Dashboard's "N open →" links; read by TodosScreen. */
  requestTodosScroll: (group: string) => void
  todosScrollRequest: { group: string | null; seq: number }
}

const SheetContext = createContext<Sheets | null>(null)

/**
 * Module-level NavigationContainer ref. SheetProvider is mounted ABOVE
 * NavigationContainer in App.tsx, so `useNavigation` isn't available
 * here — instead App.tsx threads this same ref to NavigationContainer.
 * Once the container mounts, `isReady()` returns true and we can
 * `.navigate('Todos' | 'Groceries')` from Settings entries.
 */
export const sheetNavigationRef = createNavigationContainerRef<{
  Home: undefined
  Todos: undefined
  Groceries: undefined
}>()

export function SheetProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { user, deleteAccount, signOut } = useAuth()
  const { t } = useLang()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [guideMenuOpen, setGuideMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  // Pre-filled fields when Compose is opened from Ask Mochi's "Review & add".
  // Null for a normal blank compose (the Add FAB).
  const [composePrefill, setComposePrefill] = useState<ComposePrefill | null>(null)
  const [mochiOpen, setMochiOpen] = useState(false)
  const [animationSoundOpen, setAnimationSoundOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'view' | 'edit'>('view')
  const [manageRequest, setManageRequest] = useState<ManageRequest>({ target: null, seq: 0 })
  const [todosScrollRequest, setTodosScrollRequest] = useState<{ group: string | null; seq: number }>({ group: null, seq: 0 })
  const requestTodosScroll = useCallback((group: string) => {
    setTodosScrollRequest((p) => ({ group, seq: p.seq + 1 }))
  }, [])
  // Currently-playing single guide. Null when only the menu is up
  // (or both are closed). Setting this immediately renders the
  // guide carousel over the menu.
  const [activeGuide, setActiveGuide] = useState<Guide | null>(null)
  // First-run prompt — shown once when onboarding is done and
  // profile.guidesPromptShown is not yet set. Local visibility
  // state lets us animate it independently of the menu.
  const [promptOpen, setPromptOpen] = useState(false)

  const openProfile = useCallback(() => setProfileOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openTheme = useCallback(() => setThemePickerOpen(true), [])
  const openGuides = useCallback(() => setGuideMenuOpen(true), [])
  const openCompose = useCallback(() => {
    setComposePrefill(null) // Add FAB → blank compose
    setComposeOpen(true)
  }, [])
  const openMochi = useCallback(() => setMochiOpen(true), [])

  // The FAB reopens whichever capture surface you used last — manual compose
  // or Ask Mochi — persisted on the profile so it sticks across launches. The
  // two "switch" links below update it. When AI assistance is OFF, the FAB
  // always opens manual compose, regardless of the remembered mode — Ask Mochi
  // shouldn't surface at all while AI is disabled.
  const agentEnabled = store.profile.agentEnabled !== false
  const lastComposeMode = store.profile.lastComposeMode ?? 'manual'
  const openCapture = useCallback(() => {
    if (agentEnabled && lastComposeMode === 'mochi') setMochiOpen(true)
    else openCompose()
  }, [agentEnabled, lastComposeMode, openCompose])

  // Ask Mochi → "Review & add": hand the chat's createTodo proposal to the
  // manual ComposeSheet (the same code a manual add uses) so the user reviews
  // and saves through one path — no separate apply logic, identical outcome.
  // The agent's reminders carry no id (the model can't mint stable UUIDs), so
  // stamp one per entry, exactly as applyMochiOp does.
  const reviewCreateTodo = useCallback(
    (args: Extract<ProposedOperation, { kind: 'createTodo' }>['args']) => {
      const reminders =
        args.reminders && args.reminders.length > 0
          ? args.reminders.map((r) => ({
              id: genUuid(),
              at: r.at,
              ...(r.offsetMinutes ? { offsetMinutes: r.offsetMinutes } : {}),
              ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}),
            }))
          : undefined
      setComposePrefill({
        text: args.text,
        priority: args.priority ?? 'medium',
        category: args.category,
        dueDate: args.dueDate,
        recurrence: args.recurrence,
        ...(reminders ? { reminders } : {}),
      })
      // Close the chat first, then open Compose on the next tick — iOS can't
      // stack two <Modal>s reliably (same handoff dance as guide menu → guide).
      setMochiOpen(false)
      setTimeout(() => setComposeOpen(true), 280)
    },
    [],
  )

  // Apply one confirmed Mochi operation through the SAME store mutations a
  // manual tap uses — so the agent has no privileged write path. Each kind
  // maps to existing actions; the user already confirmed in ChatSheet.
  const applyMochiOp = useCallback(
    (op: ProposedOperation) => {
      // Agent reminders carry no id (the model can't mint stable UUIDs);
      // stamp one per entry on apply so the scheduler's per-fire key stays
      // distinct. Returns undefined for an empty/absent list.
      const toReminders = (
        rs?: { at: string; offsetMinutes?: number; intervalMinutes?: number }[],
      ) =>
        rs && rs.length > 0
          ? rs.map((r) => ({
              id: genUuid(),
              at: r.at,
              ...(r.offsetMinutes ? { offsetMinutes: r.offsetMinutes } : {}),
              ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}),
            }))
          : undefined

      if (op.kind === 'createTodo') {
        const a = op.args
        const reminders = toReminders(a.reminders)
        store.addTask(
          a.text,
          a.priority ?? 'medium',
          a.dueDate ?? '',
          a.category,
          a.recurrence,
          {
            ...(a.notes ? { notes: a.notes } : {}),
            ...(reminders ? { reminders } : {}),
          },
        )
      } else if (op.kind === 'editTodo') {
        const a = op.args
        if (a.text !== undefined) store.updateText(a.todoId, a.text)
        if (a.priority !== undefined) store.updatePriority(a.todoId, a.priority)
        if (a.dueDate !== undefined) store.updateDueDate(a.todoId, a.dueDate)
        if (a.category !== undefined) store.updateTaskCategory(a.todoId, a.category)
        if (a.notes !== undefined) store.updateNotes(a.todoId, a.notes)
        if (a.recurrence !== undefined) store.updateRecurrence(a.todoId, a.recurrence)
        const editReminders = toReminders(a.reminders)
        if (editReminders) store.updateReminders(a.todoId, editReminders)
      } else if (op.kind === 'addSteps') {
        for (const s of op.args.steps) store.addSubtask(op.args.todoId, s.text)
      } else if (op.kind === 'markDone') {
        // Idempotent: `toggle` flips state unconditionally, so guard
        // against re-opening a todo that's already done (markDone means
        // "make it done", never "un-done it").
        const td = store.todos.find((t) => t.id === op.args.todoId)
        if (td && !td.done) store.toggle(op.args.todoId)
      } else if (op.kind === 'createCategory') {
        const a = op.args
        store.addCategory({
          label: a.label,
          color: a.color ?? COLOR_PALETTE[store.categories.length % COLOR_PALETTE.length],
          icon: a.icon ?? 'tag',
        })
      } else if (op.kind === 'createStore') {
        store.addGroceryStore(op.args.name)
      } else if (op.kind === 'addGroceryItem') {
        const a = op.args
        store.addGrocery({ text: a.text, groupId: a.groupId, stores: a.stores })
      } else if (op.kind === 'deleteTodo') {
        // Permanent delete, gated by an explicit confirm that SPELLS OUT the
        // permanence — same semantics as the manual TaskDetails "Delete to-do".
        // For a recurring series, ask scope first (this one vs this + future).
        const td = store.todos.find((t) => t.id === op.args.todoId)
        if (!td) return
        if (td.seriesId) {
          Alert.alert(
            'Delete repeating to-do?',
            `Permanently delete "${td.text}" — just this one, or this and all future? This can't be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Just this one',
                style: 'destructive',
                onPress: () => store.permanentlyDelete(td.id),
              },
              {
                text: 'This & future',
                style: 'destructive',
                onPress: () => store.permanentlyDeleteSeriesFuture(td.id),
              },
            ],
          )
        } else {
          Alert.alert(
            'Delete to-do?',
            `Permanently delete "${td.text}". This can't be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => store.permanentlyDelete(td.id),
              },
            ],
          )
        }
      } else if (op.kind === 'deleteGroceryItem') {
        const item = store.groceries.find((g) => g.id === op.args.groceryId)
        Alert.alert(
          'Remove from shopping?',
          `Permanently remove "${item?.text ?? 'this item'}" from your shopping list. This can't be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => store.deleteGrocery(op.args.groceryId),
            },
          ],
        )
      }
    },
    [store],
  )

  // Optimistic capture: apply a single new to-do / grocery item RIGHT AWAY
  // (no Confirm tap) and return an `undo` the chat renders inline — a snackbar
  // would render behind the chat Modal. For a recurring to-do, Undo asks
  // whether to drop just this occurrence or the whole repeat.
  const applyCaptureWithUndo = useCallback(
    (op: ProposedOperation): { id: string | null; undo: () => void } => {
      const toReminders = (
        rs?: { at: string; offsetMinutes?: number; intervalMinutes?: number }[],
      ) =>
        rs && rs.length > 0
          ? rs.map((r) => ({
              id: genUuid(),
              at: r.at,
              ...(r.offsetMinutes ? { offsetMinutes: r.offsetMinutes } : {}),
              ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}),
            }))
          : undefined

      if (op.kind === 'createTodo') {
        const a = op.args
        const reminders = toReminders(a.reminders)
        const id = store.addTask(
          a.text,
          a.priority ?? 'medium',
          a.dueDate ?? '',
          a.category,
          a.recurrence,
          {
            ...(a.notes ? { notes: a.notes } : {}),
            ...(reminders ? { reminders } : {}),
          },
        )
        const isRecurring = !!a.recurrence
        return {
          id,
          undo: () => {
            if (isRecurring) {
              Alert.alert(
                'Remove repeating to-do?',
                `"${a.text}" repeats — remove just this one, or the whole series?`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Just this one', onPress: () => store.permanentlyDelete(id) },
                  {
                    text: 'Whole series',
                    style: 'destructive',
                    onPress: () => store.permanentlyDeleteSeriesFuture(id),
                  },
                ],
              )
            } else {
              store.permanentlyDelete(id)
            }
          },
        }
      }
      if (op.kind === 'addGroceryItem') {
        const a = op.args
        const id = store.addGrocery({ text: a.text, groupId: a.groupId, stores: a.stores })
        return {
          // null id → no inline chip-editing for groceries (Undo only).
          id: null,
          undo: () => {
            if (id) store.deleteGrocery(id)
          },
        }
      }
      return { id: null, undo: () => {} }
    },
    [store],
  )

  // Inline-edit a just-captured to-do straight from the Mochi card — fixes the
  // common "Mochi got the category/date slightly off" without leaving chat.
  const editCapturedTodo = useCallback(
    (id: string, patch: { category?: string; priority?: Priority; dueDate?: string }) => {
      if (patch.category !== undefined) store.updateTaskCategory(id, patch.category)
      if (patch.priority !== undefined) store.updatePriority(id, patch.priority)
      if (patch.dueDate !== undefined) store.updateDueDate(id, patch.dueDate)
    },
    [store],
  )

  // Apply a pick-list proposal to the user's chosen subset of ids. Each action
  // runs through the SAME store mutations a manual edit / applyMochiOp uses, so
  // the agent has no privileged write path — delete still warns it's permanent.
  const applyPickedTodos = useCallback(
    (op: Extract<ProposedOperation, { kind: 'pickTodos' }>, ids: string[]) => {
      if (ids.length === 0) return
      const { action } = op.args
      if (action === 'delete') {
        const n = ids.length
        Alert.alert(
          n === 1 ? 'Delete to-do?' : `Delete ${n} to-dos?`,
          `Permanently delete ${n === 1 ? 'this to-do' : `these ${n} to-dos`}. This can't be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => ids.forEach((id) => store.permanentlyDelete(id)),
            },
          ],
        )
      } else if (action === 'markDone') {
        // Idempotent — only flip ones that aren't already done.
        ids.forEach((id) => {
          const td = store.todos.find((t) => t.id === id)
          if (td && !td.done) store.toggle(id)
        })
      } else if (action === 'edit') {
        const e = op.args.edit
        if (!e) return
        const reminders =
          e.reminders && e.reminders.length > 0
            ? e.reminders.map((r) => ({
                id: genUuid(),
                at: r.at,
                ...(r.offsetMinutes ? { offsetMinutes: r.offsetMinutes } : {}),
                ...(r.intervalMinutes ? { intervalMinutes: r.intervalMinutes } : {}),
              }))
            : undefined
        ids.forEach((id) => {
          if (e.text !== undefined) store.updateText(id, e.text)
          if (e.priority !== undefined) store.updatePriority(id, e.priority)
          if (e.dueDate !== undefined) store.updateDueDate(id, e.dueDate)
          if (e.category !== undefined) store.updateTaskCategory(id, e.category)
          if (e.notes !== undefined) store.updateNotes(id, e.notes)
          if (e.recurrence !== undefined) store.updateRecurrence(id, e.recurrence)
          if (reminders) store.updateReminders(id, reminders)
        })
      } else if (action === 'addSteps') {
        const steps = op.args.steps ?? []
        ids.forEach((id) => steps.forEach((s) => store.addSubtask(id, s.text)))
      }
    },
    [store],
  )
  const openManageFilter = useCallback(() => {
    setCategorySheetMode('edit')
    setCategorySheetOpen(true)
  }, [])
  const openSelectFilter = useCallback(() => {
    setCategorySheetMode('view')
    setCategorySheetOpen(true)
  }, [])
  const openManageGroceries = useCallback(() => {
    // Navigate to the Groceries tab so the signal fires when its
    // screen is on top, then bump the manage request. GroceriesScreen
    // watches manageRequest and opens StorePicker in edit mode.
    if (sheetNavigationRef.isReady()) {
      sheetNavigationRef.navigate('Groceries')
    }
    setManageRequest((prev) => ({ target: 'groceries', seq: prev.seq + 1 }))
  }, [])

  // ----- Settings → DATA section handlers -----
  // Export, Delete data only, Delete account. Owned here because they
  // touch cross-slice store data + the auth context. The SettingsSheet
  // just wires UI to these callbacks.
  const handleExport = useCallback(async () => {
    const payload = buildExportPayload({
      todos: store.todos,
      todoReferences: store.todoReferences,
      categories: store.categories,
      profile: store.profile,
      groceries: store.groceries,
      groceryGroups: store.groceryGroups,
    })
    if (isExportEmpty(payload)) {
      Alert.alert(t.exportData, t.exportEmpty)
      return
    }
    try {
      const json = serializeExport(payload)
      await Share.share({
        title: 'sagely-data.json',
        message: json,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t.exportFailed, message)
    }
  }, [
    store.todos,
    store.todoReferences,
    store.categories,
    store.profile,
    store.groceries,
    store.groceryGroups,
    t,
  ])

  const handleDeleteData = useCallback(async () => {
    try {
      await store.clearAllData()
      setSettingsOpen(false)
      // Force a sign-out → sign-in cycle so the user gets a fresh
      // hydrate. The in-place setter reset can lose to a Firestore
      // subscribe race + the useSyncedState write debounce, and the
      // user explicitly asked for "log out to refresh the view" as
      // the calmer fallback. They sign back in to a clean slate.
      await signOut()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t.deleteDataOnly, message)
    }
  }, [store, signOut, t])

  const handleDeleteAccount = useCallback(async () => {
    try {
      // Close the settings sheet first so the SignIn redirect (which
      // happens automatically when AuthContext sees !user) doesn't
      // race with an open modal.
      setSettingsOpen(false)
      await deleteAccount()
    } catch (err) {
      const code = (err as { name?: string } | null)?.name
      const message =
        code === 'RecentLoginRequiredError'
          ? t.deleteAccountReauth
          : err instanceof Error
            ? err.message
            : String(err)
      Alert.alert(t.deleteAccount, message)
    }
  }, [deleteAccount, t])

  // Mount the first-run prompt the first time the user lands in
  // the app post-onboarding with the flag unset. Stamping the
  // flag inside the accept / dismiss handlers prevents repeats
  // even if the user dismisses without action.
  useEffect(() => {
    if (!store.loaded) return
    if (!store.profile.onboardingDone) return
    if (store.profile.guidesPromptShown) return
    // Defer a beat so the prompt doesn't race with the splash
    // fade-out on cold launch.
    const t = setTimeout(() => setPromptOpen(true), 600)
    return () => clearTimeout(t)
  }, [store.loaded, store.profile.onboardingDone, store.profile.guidesPromptShown])

  function stampPromptShown() {
    store.saveProfile({ ...store.profile, guidesPromptShown: true })
  }

  function markGuideSeen(id: string) {
    const seen = store.profile.guidesSeen ?? []
    if (seen.includes(id)) return
    store.saveProfile({ ...store.profile, guidesSeen: [...seen, id] })
  }

  return (
    <SheetContext.Provider value={{ openProfile, openSettings, openTheme, openGuides, openCompose, openCapture, openMochi, openManageFilter, openSelectFilter, openManageGroceries, manageRequest, requestTodosScroll, todosScrollRequest }}>
      {children}
      {/* Sheets are only relevant once signed in. Crucially, mounting these
          <Modal>s on the signed-out SignIn screen FLATTENS its iOS a11y tree
          (RN Modal quirk, #15) — which hid every SignIn control from Maestro
          and broke the E2E sign-in prelude. Gating on `user` keeps the
          SignIn screen's a11y intact. */}
      {user && (
      <>
      <ProfileSheet
        visible={profileOpen}
        profile={store.profile}
        onSave={(p) => {
          store.saveProfile(p)
          setProfileOpen(false)
        }}
        onClose={() => setProfileOpen(false)}
      />
      <SettingsSheet
        visible={settingsOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile({ ...store.profile, ...patch })
        }
        onOpenTheme={openTheme}
        onShowIntro={() =>
          store.saveProfile({ ...store.profile, onboardingDone: false })
        }
        onOpenGuides={openGuides}
        onOpenManageTodos={openManageFilter}
        onOpenManageGroceries={openManageGroceries}
        onOpenAnimationSound={() => setAnimationSoundOpen(true)}
        onExport={handleExport}
        onDeleteData={handleDeleteData}
        onDeleteAccount={handleDeleteAccount}
        onClose={() => setSettingsOpen(false)}
      />
      <ThemeSelector
        visible={themePickerOpen}
        value={store.profile.theme ?? 'sage'}
        onChange={(next) => {
          // Close the picker FIRST, then apply the theme after it has
          // dismissed. Applying live re-themes the whole app (incl. the
          // mounted Modals) while this Modal is still animating, which
          // desyncs iOS's native modal stack and leaves an invisible
          // touch-capturing layer → the UI freezes ("no action works").
          setThemePickerOpen(false)
          // Functional update so we apply onto the LATEST profile, not the
          // one captured when onChange fired (avoids clobbering a concurrent
          // edit during the 260ms dismiss window).
          setTimeout(() => {
            store.saveProfile((p) => ({ ...p, theme: next }))
          }, 260)
        }}
        onClose={() => setThemePickerOpen(false)}
      />
      <GuidesPrompt
        visible={promptOpen}
        onAccept={() => {
          stampPromptShown()
          setPromptOpen(false)
          setGuideMenuOpen(true)
        }}
        onDismiss={() => {
          stampPromptShown()
          setPromptOpen(false)
        }}
      />
      <GuideMenuSheet
        visible={guideMenuOpen}
        seen={store.profile.guidesSeen ?? []}
        onSelect={(g) => {
          // iOS can't stack Modals reliably — the second one
          // renders behind the first and looks invisible. Close
          // the menu first, then open the guide on the next
          // animation tick. The guide's onClose re-opens the
          // menu so the user lands back on the list.
          setGuideMenuOpen(false)
          setTimeout(() => setActiveGuide(g), 280)
        }}
        onClose={() => setGuideMenuOpen(false)}
      />
      <GuideSheet
        visible={!!activeGuide}
        guide={activeGuide}
        onComplete={() => {
          if (activeGuide) markGuideSeen(activeGuide.id)
          setActiveGuide(null)
          // Return the user to the menu so they can pick another
          // walkthrough (or close out). Same modal-handoff dance
          // as opening.
          setTimeout(() => setGuideMenuOpen(true), 280)
        }}
        onClose={() => {
          setActiveGuide(null)
          setTimeout(() => setGuideMenuOpen(true), 280)
        }}
      />
      {/* ComposeSheet promoted to the app shell so the Add FAB works
          from any tab (Home, Todos). Per-tab compose wiring inside
          TodosScreen was removed when this moved up. */}
      <ComposeSheet
        visible={composeOpen}
        categories={store.categories}
        defaultCategory={store.defaultCategory}
        references={store.todoReferences}
        agentEnabled={store.profile.agentEnabled !== false}
        onCreateCategory={(label) => {
          const color =
            COLOR_PALETTE[store.categories.length % COLOR_PALETTE.length]
          return store.addCategory({ label, color, icon: 'tag' })
        }}
        onAdd={store.addTask}
        prefill={composePrefill}
        onClose={() => {
          setComposeOpen(false)
          setComposePrefill(null)
        }}
        // Kill-switch: when Mochi is off, omit the callback so the
        // compose sheet hides the "Ask Mochi instead" affordance.
        onAskMochi={
          MOCHI_AGENT_ENABLED
            ? () => {
                store.saveProfile((p) => ({ ...p, lastComposeMode: 'mochi' }))
                setComposeOpen(false)
                setMochiOpen(true)
              }
            : undefined
        }
      />
      {/* Mochi capture assistant — opened from the compose sheet's "Ask
          Mochi" affordance. Applies via the same store mutations as a
          manual tap, after the user confirms each proposal. Gated by the
          MOCHI_AGENT_ENABLED kill-switch so the sheet never mounts when
          the feature is paused. */}
      {MOCHI_AGENT_ENABLED && (
        <ChatSheet
          visible={mochiOpen}
          greetingName={
            store.profile.firstName?.trim() || store.profile.name?.trim() || ''
          }
          reduceMotion={store.profile.reduceMotion === true}
          categories={store.categories}
          todos={store.todos
            .filter((td) => !td.done && !td.trashed)
            .map((td) => ({
              id: td.id,
              text: td.text,
              priority: td.priority,
              category: td.category,
              dueDate: td.dueDate,
              recurrence: td.recurrence,
            }))}
          groceryGroups={store.groceryGroups.map((g) => ({
            id: g.id,
            label: g.label,
          }))}
          groceries={store.groceries.map((g) => ({ id: g.id, text: g.text }))}
          // Top frequently-bought staples → quick re-add chips on the opening
          // screen (minCount 2 so they surface without a long history). Empty
          // for a new account; ChatSheet falls back to teaching examples.
          frequentChips={frequentGroceries(store.groceries, { minCount: 2 })
            .slice(0, 3)
            .map((g) => ({
              label: g.text.charAt(0).toUpperCase() + g.text.slice(1),
              prefill: `Add ${g.text} to shopping list`,
            }))}
          stores={store.profile.groceryStores ?? SEED_GROCERY_STORES}
          onApplyOperation={applyMochiOp}
          onCaptureWithUndo={applyCaptureWithUndo}
          onEditCapturedTodo={editCapturedTodo}
          onApplyPickedTodos={applyPickedTodos}
          onReviewCreateTodo={reviewCreateTodo}
          onClose={() => setMochiOpen(false)}
          onEnterManually={() => {
            store.saveProfile((p) => ({ ...p, lastComposeMode: 'manual' }))
            setMochiOpen(false)
            setComposeOpen(true)
          }}
        />
      )}
      <ManageAnimationSoundSheet
        visible={animationSoundOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile({ ...store.profile, ...patch })
        }
        onClose={() => setAnimationSoundOpen(false)}
      />
      {/* CategorySheet promoted out of TodosScreen so Settings (on
          any tab) can open it via sheets.openManageFilter. Todos'
          funnel/gear still drive it via openSelectFilter / openManageFilter. */}
      <CategorySheet
        visible={categorySheetOpen}
        defaultMode={categorySheetMode}
        currentFilter={store.filter}
        selectedFilters={store.filters}
        onToggleFilter={store.toggleFilter}
        onClearFilters={store.clearFilters}
        pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[][]}
        onSelectFilter={store.setFilter}
        onPinFilter={store.pinFilter}
        categories={store.categories}
        taskCounts={store.taskCountsForSheet}
        systemCounts={store.systemCounts}
        priorityCounts={store.byPriority}
        orderedStatuses={store.orderedStatuses}
        orderedVisibleStatuses={store.orderedVisibleStatuses}
        orderedPriorities={store.orderedPriorities}
        onAdd={store.addCategory}
        onEdit={store.editCategory}
        onDelete={store.deleteCategory}
        onReorder={store.reorderCategories}
        onRenameStatus={store.renameStatus}
        onToggleStatusHidden={store.toggleStatusHidden}
        onReorderStatuses={store.reorderStatuses}
        onTogglePriorityHidden={store.togglePriorityHidden}
        onReorderPriorities={store.reorderPriorities}
        onClose={() => setCategorySheetOpen(false)}
      />
      </>
      )}
    </SheetContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
