/**
 * Cross-screen sheet host. ProfileSheet, SettingsSheet, and the
 * ThemeSelector are reachable from every tab (the avatar + gear
 * sit in each screen's AppHeader), so the visibility state + the
 * sheet components themselves live at the app shell, not inside a
 * single tab screen.
 *
 * It also hosts the capture + editing sheets every tab reaches: ComposeSheet
 * (the Add FAB), ChatSheet (Ask Mochi), CategorySheet (filters / manage) and
 * the ONE TaskDetailsSheet. Only the Groceries-local sheets
 * (GroceryEditSheet / StorePicker) stay inside GroceryView.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { Share } from 'react-native'
import { createNavigationContainerRef } from '@react-navigation/native'
import { useStore } from './StoreContext'
import { useAuth } from './AuthContext'
import { useNotify } from './notify'
import { useLang } from './LangContext'
import { usePurchases } from './PurchasesContext'
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
import TaskDetailsSheet from '../features/task/TaskDetailsSheet'
import ChatSheet from '../features/mochi/ChatSheet'
import type { OpOf } from '../../../core/src/ports/aiContracts'
import { planMochiOp, type MochiIntent } from '../../../core/src/logic/mochiOps'
import { clearMochiRest } from '../features/mochi/mochiRest'
import { IAP_ENABLED, MOCHI_AGENT_ENABLED } from './featureFlags'
import ManageAnimationSoundSheet from '../features/profile/ManageAnimationSoundSheet'
import CategorySheet from '../features/category/CategorySheet'
import { COLOR_PALETTE, categoryLabel } from '../core-bindings/categories'
import { SEED_GROCERY_STORES, frequentGroceries } from '../core-bindings/groceries'
import type { Filter } from '../core-bindings/types'
import type { Guide } from '../features/onboarding/guides'
import { genUuid } from '../../../core/src/logic/utils'
import { useDetailsRouter, type DetailsRouter } from './useDetailsRouter'
import { alertWithPresence, useModalPresence } from './modalPresence'
import { useMochiExecutor } from './useMochiExecutor'
import { EXPORT_FAILED_MESSAGE, categoryDeletedMessage } from './sheetMessages'
import {
  deleteAccountErrorMessage,
  DELETE_DATA_DONE,
  DELETE_DATA_FAILED,
  DELETE_DATA_OFFLINE,
} from './accountErrors'

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
  /** First-run hand-off: give `text` to Mochi and send it (Compose with the
   * words pre-filled when Mochi is off). */
  openCaptureWith: (text: string) => void
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

/** Opens the to-do details sheet (optionally jumped into a step's editor).
 * A separate, STABLE context so memoized list rows don't re-render whenever
 * the sheet layer does. */
export const TaskDetailsOpenContext = createContext<DetailsRouter['openTaskDetails']>(() => {})

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
  const { showSnackbar, dismissSnackbar } = useNotify()
  const { t } = useLang()
  const { tier, openPaywall } = usePurchases()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [guideMenuOpen, setGuideMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  // Pre-filled fields when Compose is opened from Ask Mochi's "Review & add".
  // Null for a normal blank compose (the Add FAB).
  const [composePrefill, setComposePrefill] = useState<ComposePrefill | null>(null)
  const [mochiOpen, setMochiOpen] = useState(false)
  // Text carried from Compose into Mochi ("Ask Mochi instead").
  const [mochiSeed, setMochiSeed] = useState('')
  useEffect(() => {
    if (!mochiOpen) {
      setMochiSeed('')
      setMochiAutoSend(false)
    }
  }, [mochiOpen])
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

  // Every provider-owned sheet counts as a presented Modal — with the same
  // dismiss grace as the shared shells — so a reminder tap during a sheet's
  // close animation doesn't try to present over it.
  useModalPresence(profileOpen)
  useModalPresence(settingsOpen)
  useModalPresence(themePickerOpen)
  useModalPresence(guideMenuOpen)
  useModalPresence(composeOpen)
  useModalPresence(mochiOpen)
  useModalPresence(animationSoundOpen)
  useModalPresence(categorySheetOpen)
  useModalPresence(promptOpen)
  useModalPresence(!!activeGuide)
  const anySheetOpen =
    profileOpen || settingsOpen || themePickerOpen || guideMenuOpen || composeOpen ||
    mochiOpen || animationSoundOpen || categorySheetOpen || promptOpen || !!activeGuide

  // Latest store, for callbacks/Undos that run later and must read the
  // CURRENT state (a render-time `store` closed over is stale by then).
  const storeRef = useRef(store)
  useEffect(() => {
    storeRef.current = store
  }, [store])

  // The ONE to-do details sheet. It used to live inside each list row, so
  // an edit that moved the row (date → tomorrow on Today, a group change on
  // Todos) unmounted the row and closed the sheet mid-edit, losing typed
  // text. Hosted here, it always shows the live to-do from the store.
  // Opening it from anywhere (incl. a reminder tap over another sheet) and
  // the sheet → sheet handoff timers live in useDetailsRouter.
  const accountUid = user?.uid ?? null
  const findTodo = useCallback((id: string) => storeRef.current.todos.find((td) => td.id === id), [])
  const {
    detailsReq,
    openTaskDetails,
    detailsMounted,
    detailsShown,
    closeTaskDetails,
    registerDetailsClose,
    forgetDetails,
    afterModalClose,
  } = useDetailsRouter({ anySheetOpen, accountUid, findTodo, showSnackbar })
  const detailsTodo = detailsReq ? store.todos.find((td) => td.id === detailsReq.id) : undefined
  // The to-do vanished while open (e.g. deleted on another device): forget
  // the request (and any queued swap), or the sheet would pop back if that
  // id reappeared.
  useEffect(() => {
    if (detailsReq && !detailsTodo) forgetDetails()
  }, [detailsReq, detailsTodo, forgetDetails])
  const openProfile = useCallback(() => setProfileOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openTheme = useCallback(() => setThemePickerOpen(true), [])
  const openGuides = useCallback(() => setGuideMenuOpen(true), [])
  // Compose opened from the Today tab starts dated today — Today only lists
  // dated to-dos, so an undated add would seem to vanish. Everywhere else a
  // new to-do has no date by default.
  const [composeStartsToday, setComposeStartsToday] = useState(false)
  const openCompose = useCallback(() => {
    setComposePrefill(null) // Add FAB → blank compose
    setComposeStartsToday(
      sheetNavigationRef.isReady() && sheetNavigationRef.getCurrentRoute()?.name === 'Home',
    )
    setComposeOpen(true)
  }, [])
  // The account Ask Mochi was opened for. The chat is shown only while it
  // still matches: on an account change the re-keyed ChatSheet mounts before
  // the reset effect below runs, and must not mount visible (or auto-send the
  // previous account's seed for the new one).
  const [mochiOpenedFor, setMochiOpenedFor] = useState<string | null>(null)
  const showMochi = useCallback(() => {
    setMochiOpenedFor(accountUid)
    setMochiOpen(true)
  }, [accountUid])
  const openMochi = showMochi
  const [mochiAutoSend, setMochiAutoSend] = useState(false)
  const agentOn = MOCHI_AGENT_ENABLED && store.profile.agentEnabled !== false
  const openCaptureWith = useCallback(
    (text: string) => {
      if (agentOn) {
        setMochiSeed(text)
        setMochiAutoSend(true)
        showMochi()
      } else {
        setComposePrefill({ text })
        setComposeOpen(true)
      }
    },
    [agentOn, showMochi],
  )

  // The FAB reopens whichever capture surface you used last — manual compose
  // or Ask Mochi — persisted on the profile so it sticks across launches. The
  // two "switch" links below update it. When AI assistance is OFF, the FAB
  // always opens manual compose, regardless of the remembered mode — Ask Mochi
  // shouldn't surface at all while AI is disabled.
  const agentEnabled = store.profile.agentEnabled !== false
  // Default is Mochi — it's the front door (2026-10-18). "Enter manually"
  // switches the remembered mode to manual.
  const lastComposeMode = store.profile.lastComposeMode ?? 'mochi'
  const openCapture = useCallback(() => {
    if (MOCHI_AGENT_ENABLED && agentEnabled && lastComposeMode === 'mochi') showMochi()
    else openCompose()
  }, [agentEnabled, lastComposeMode, openCompose, showMochi])

  // Every sheet is per account. SheetProvider sits ABOVE AppGate, so a
  // sign-out doesn't unmount it — reset all open state when the account
  // changes, so the next account doesn't land in a sheet left open by the
  // previous one. (useDetailsRouter resets details, parked reminder offers
  // and pending handoffs.) Undo / reminder snackbars belong to the previous
  // account too — only ones meant to outlive it ("data cleared") stay.
  useEffect(() => {
    setProfileOpen(false)
    setSettingsOpen(false)
    setThemePickerOpen(false)
    setGuideMenuOpen(false)
    setComposeOpen(false)
    setComposePrefill(null)
    setMochiOpen(false)
    // The previous account's words never carry into the next account's chat.
    setMochiSeed('')
    setMochiAutoSend(false)
    setAnimationSoundOpen(false)
    setCategorySheetOpen(false)
    setPromptOpen(false)
    setActiveGuide(null)
    dismissSnackbar({ accountChange: true })
  }, [accountUid, dismissSnackbar])

  // Ask Mochi's executor (store mutations + inline Undos).
  const {
    mochiSnapshot,
    runMochiIntents,
    applyMochiOps,
    applyCaptureWithUndo,
    editCapturedTodo,
    applyPickedTodos,
    deleteTodoScoped,
    applyPickAction,
  } = useMochiExecutor(store, t)

  // Ask Mochi → "Review & add": hand the chat's createTodo proposal to the
  // manual ComposeSheet (the same code a manual add uses) so the user reviews
  // and saves through one path — no separate apply logic, identical outcome.
  // The planner stamps reminder ids and resolves a same-turn new category
  // (creating it now, so Compose can preselect it); only the addTask is left
  // for the user to save.
  const reviewCreateTodo = useCallback(
    (args: OpOf<'createTodo'>['args'], opts?: { note?: string }) => {
      const intents = planMochiOp({ kind: 'createTodo', args }, mochiSnapshot(), { genId: genUuid })
      const task = intents.find((i): i is Extract<MochiIntent, { type: 'addTask' }> => i.type === 'addTask')
      const { categoryOf } = runMochiIntents(intents.filter((i) => i.type === 'addCategory'))
      setComposePrefill({
        text: args.text,
        priority: args.priority ?? 'medium',
        category: task?.category ? categoryOf(task.category) : undefined,
        dueDate: args.dueDate,
        recurrence: args.recurrence,
        ...(task?.reminders ? { reminders: task.reminders } : {}),
        ...(opts?.note ? { note: opts.note } : {}),
      })
      // Close the chat first, then open Compose once it has dismissed.
      setMochiOpen(false)
      afterModalClose(() => setComposeOpen(true))
    },
    [mochiSnapshot, runMochiIntents, afterModalClose],
  )

  // Manual category delete (CategorySheet): its to-dos stay, uncategorized,
  // with the store's exact Undo (puts the category back on each of them) —
  // shown INLINE in the sheet (a snackbar would render behind its Modal).
  const deleteCategoryWithUndo = useCallback((id: string) => {
    const live = storeRef.current
    const cat = live.categories.find((c) => c.id === id)
    const name = cat ? categoryLabel(cat, t) : ''
    const uncategorized = live.todosRef.current.filter((td) => td.category === id).length
    const undo = live.deleteCategory(id)
    return undo ? { message: categoryDeletedMessage(name, uncategorized), undo } : null
  }, [t])

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
      alertWithPresence(t.exportData, t.exportEmpty)
      return
    }
    try {
      const json = serializeExport(payload)
      await Share.share({
        title: 'sagely-data.json',
        message: json,
      })
    } catch {
      // Calm copy, never the raw error text.
      alertWithPresence(t.exportFailed, EXPORT_FAILED_MESSAGE)
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
    let result: 'synced' | 'pending' | null = null
    try {
      // Waits (≤ ~5s, Settings shows "Deleting…") for the server to confirm
      // the wipe — signing out with the writes still unsent used to say
      // "done" while nothing had left the device.
      result = await store.clearAllData()
      setSettingsOpen(false)
      // Force a sign-out → sign-in cycle so the user gets a fresh
      // hydrate. The in-place setter reset can lose to a Firestore
      // subscribe race + the useSyncedState write debounce, and the
      // user explicitly asked for "log out to refresh the view" as
      // the calmer fallback. They sign back in to a clean slate.
      // (signOut also cancels this account's scheduled reminders.)
      await signOut()
    } catch {
      setSettingsOpen(false)
      // Never the raw SDK error. A failed sign-out after a confirmed wipe
      // still cleared the data — say that.
      if (result === null) {
        showSnackbar({ message: DELETE_DATA_FAILED })
        return
      }
    }
    // A snackbar, not an Alert: it survives the switch to the signed-out
    // screen (NotifyProvider wraps SignIn), where a queued Alert handoff
    // was cancelled by the account reset and never shown.
    showSnackbar({
      message: result === 'pending' ? DELETE_DATA_OFFLINE : DELETE_DATA_DONE,
      durationMs: result === 'pending' ? 8000 : undefined,
      outlivesAccount: true,
    })
  }, [store, signOut, showSnackbar])

  const handleDeleteAccount = useCallback(async () => {
    try {
      // Close the settings sheet first so the SignIn redirect (which
      // happens automatically when AuthContext sees !user) doesn't
      // race with an open modal.
      setSettingsOpen(false)
      await deleteAccount()
      // NotifyProvider wraps the SignIn screen too, so this survives the
      // switch to signed-out.
      showSnackbar({ message: t.accountDeletedDone, outlivesAccount: true })
    } catch (err) {
      const code = (err as { name?: string } | null)?.name
      if (code === 'RecentLoginRequiredError') {
        // Firebase needs a fresh sign-in to delete. Offer it directly instead
        // of telling the user to find "Sign out" themselves. Wait for Settings
        // to finish dismissing — iOS drops an Alert raised mid-dismiss.
        afterModalClose(() =>
          alertWithPresence(t.deleteAccount, t.deleteAccountReauth, [
            { text: t.cancel, style: 'cancel' },
            { text: t.signInAgain, onPress: () => void signOut() },
          ]),
        )
        return
      }
      afterModalClose(() => alertWithPresence(t.deleteAccount, deleteAccountErrorMessage(err)))
    }
  }, [deleteAccount, signOut, showSnackbar, t, afterModalClose])

  // Mochi's "resting" state is per account: forget it on sign-out so the
  // next account on this device doesn't inherit it.
  useEffect(() => {
    if (!accountUid) clearMochiRest()
  }, [accountUid])

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

  // Updater form throughout: a spread of the render-time `store.profile`
  // would clobber a profile change that landed since (another sheet's save,
  // a Firestore snapshot).
  function stampPromptShown() {
    store.saveProfile((p) => ({ ...p, guidesPromptShown: true }))
  }

  function markGuideSeen(id: string) {
    store.saveProfile((p) => {
      const seen = p.guidesSeen ?? []
      return seen.includes(id) ? p : { ...p, guidesSeen: [...seen, id] }
    })
  }

  // Stable provider value: an inline literal re-rendered every useSheets()
  // consumer on every SheetProvider render (i.e. every store change).
  const sheetsValue = useMemo<Sheets>(
    () => ({ openProfile, openSettings, openTheme, openGuides, openCompose, openCapture, openMochi, openCaptureWith, openManageFilter, openSelectFilter, openManageGroceries, manageRequest, requestTodosScroll, todosScrollRequest }),
    [openProfile, openSettings, openTheme, openGuides, openCompose, openCapture, openMochi, openCaptureWith, openManageFilter, openSelectFilter, openManageGroceries, manageRequest, requestTodosScroll, todosScrollRequest],
  )

  return (
    <TaskDetailsOpenContext.Provider value={openTaskDetails}>
    <SheetContext.Provider value={sheetsValue}>
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
          store.saveProfile((p) => ({ ...p, ...patch }))
        }
        onOpenTheme={openTheme}
        onShowIntro={() =>
          store.saveProfile((p) => ({ ...p, onboardingDone: false }))
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
        // Free-only v2.0.0: every theme is free while IAP is off.
        allThemesUnlocked={!IAP_ENABLED || tier !== 'free'}
        onUpgrade={() => {
          // Close the picker first, then open the paywall after it dismisses
          // (iOS can't reliably stack two Modals).
          setThemePickerOpen(false)
          afterModalClose(() => openPaywall('Unlock every theme with Premium.'))
        }}
        onChange={(next) => {
          // Close the picker FIRST, then apply the theme after it has
          // dismissed. Applying live re-themes the whole app (incl. the
          // mounted Modals) while this Modal is still animating, which
          // desyncs iOS's native modal stack and leaves an invisible
          // touch-capturing layer → the UI freezes ("no action works").
          setThemePickerOpen(false)
          // Functional update so we apply onto the LATEST profile, not the
          // one captured when onChange fired (avoids clobbering a concurrent
          // edit during the dismiss window).
          afterModalClose(() => store.saveProfile((p) => ({ ...p, theme: next })))
        }}
        onClose={() => setThemePickerOpen(false)}
      />
      <GuidesPrompt
        visible={promptOpen}
        onAccept={() => {
          stampPromptShown()
          setPromptOpen(false)
          // Open the menu only once the prompt has dismissed — in the same
          // tick it can render behind the closing prompt and look dead.
          afterModalClose(() => setGuideMenuOpen(true))
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
          afterModalClose(() => setActiveGuide(g))
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
          afterModalClose(() => setGuideMenuOpen(true))
        }}
        onClose={() => {
          setActiveGuide(null)
          afterModalClose(() => setGuideMenuOpen(true))
        }}
      />
      {/* ComposeSheet promoted to the app shell so the Add FAB works
          from any tab (Home, Todos). Per-tab compose wiring inside
          TodosScreen was removed when this moved up. */}
      <ComposeSheet
        visible={composeOpen}
        startsToday={composeStartsToday}
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
            ? (text: string) => {
                store.saveProfile((p) => ({ ...p, lastComposeMode: 'mochi' }))
                setMochiSeed(text)
                setComposeOpen(false)
                // Same handoff as the other sheet switches — iOS can't
                // reliably stack two Modals.
                afterModalClose(showMochi)
              }
            : undefined
        }
      />
      {/* Mochi capture assistant — opened from the compose sheet's "Ask
          Mochi" affordance. Applies via the same store mutations as a
          manual tap, after the user confirms each proposal. Gated by the
          MOCHI_AGENT_ENABLED kill-switch so the sheet never mounts when
          the feature is paused. Keyed on the account: the chat stays
          mounted between opens (SheetProvider sits above AppGate), so a new
          account must get a fresh conversation — remounting drops the
          previous account's messages and aborts its in-flight turn. */}
      {MOCHI_AGENT_ENABLED && (
        <ChatSheet
          key={accountUid ?? 'signed-out'}
          visible={mochiOpen && mochiOpenedFor === accountUid}
          initialInput={mochiSeed}
          autoSendInitial={mochiAutoSend}
          greetingName={
            store.profile.firstName?.trim() || store.profile.name?.trim() || ''
          }
          reduceMotion={store.reduceMotion}
          categories={store.categories}
          // Open to-dos FIRST: the server keeps only the first 100, and a pile
          // of completed ones would otherwise push older open to-dos out of
          // Mochi's view ("nothing matches"). Stable sort keeps the order.
          todos={store.todos
            .filter((td) => !td.trashed)
            .sort((a, b) => Number(a.done) - Number(b.done))
            .map((td) => ({
              id: td.id,
              text: td.text,
              priority: td.priority,
              category: td.category,
              dueDate: td.dueDate,
              done: td.done,
              subtasks: td.subtasks?.map((s) => s.text),
              recurrence: td.recurrence,
              seriesId: td.seriesId,
              reminders: td.reminders?.map((r) => ({ at: r.at })),
            }))}
          trashedTodos={store.todos
            .filter((td) => td.trashed)
            .map((td) => ({ id: td.id, text: td.text }))}
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
          onApplyOperations={applyMochiOps}
          onCaptureWithUndo={applyCaptureWithUndo}
          onEditCapturedTodo={editCapturedTodo}
          onApplyPickedTodos={applyPickedTodos}
          onDeleteTodo={deleteTodoScoped}
          onPickAction={applyPickAction}
          onReviewCreateTodo={reviewCreateTodo}
          onClose={() => setMochiOpen(false)}
          onEnterManually={(opts?: { remember?: boolean }) => {
            // "Add it myself" while Mochi rests is a one-off — it must not make
            // manual the remembered FAB mode.
            if (opts?.remember !== false) {
              store.saveProfile((p) => ({ ...p, lastComposeMode: 'manual' }))
            }
            setComposePrefill(null)
            setComposeStartsToday(
              sheetNavigationRef.isReady() && sheetNavigationRef.getCurrentRoute()?.name === 'Home',
            )
            setMochiOpen(false)
            // Same Modal handoff as the other sheet switches.
            afterModalClose(() => setComposeOpen(true))
          }}
        />
      )}
      <ManageAnimationSoundSheet
        visible={animationSoundOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile((p) => ({ ...p, ...patch }))
        }
        onClose={() => setAnimationSoundOpen(false)}
      />
      {/* CategorySheet promoted out of TodosScreen so Settings (on
          any tab) can open it via sheets.openManageFilter. Todos'
          funnel/gear still drive it via openSelectFilter / openManageFilter. */}
      <CategorySheet
        visible={categorySheetOpen}
        defaultMode={categorySheetMode}
        selectedFilters={store.filters}
        onToggleFilter={store.toggleFilter}
        onClearFilters={store.clearFilters}
        pinnedFilters={(store.profile.pinnedFilters ?? []) as Filter[][]}
        onPinFilter={store.pinFilter}
        categories={store.categories}
        taskCounts={store.taskCountsForSheet}
        systemCounts={store.systemCounts}
        priorityCounts={store.byPriority}
        orderedStatuses={store.orderedStatuses}
        orderedPriorities={store.orderedPriorities}
        onAdd={store.addCategory}
        onEdit={store.editCategory}
        onDelete={deleteCategoryWithUndo}
        onReorder={store.reorderCategories}
        onRenameStatus={store.renameStatus}
        onReorderStatuses={store.reorderStatuses}
        onReorderPriorities={store.reorderPriorities}
        onClose={() => setCategorySheetOpen(false)}
      />
      </>
      )}
      {detailsReq && detailsTodo && (
        <TaskDetailsSheet
          visible
          todo={detailsTodo}
          categories={store.categories}
          initialSubtaskEditId={detailsReq.subtaskId}
          onClose={closeTaskDetails}
          onMounted={detailsMounted}
          onShown={detailsShown}
          registerClose={registerDetailsClose}
          onUpdateText={store.updateText}
          onUpdateNotes={store.updateNotes}
          onUpdatePriority={store.updatePriority}
          onUpdateDueDate={store.updateDueDate}
          onUpdateCategory={store.updateTaskCategory}
          onUpdateRecurrence={store.updateRecurrence}
          onUpdateReminders={store.updateReminders}
          onMoveToTrash={store.moveToTrash}
          onToggle={store.toggle}
          onPermanentDelete={store.permanentlyDelete}
          onMoveSeriesToTrash={store.moveSeriesToTrash}
          onSkip={store.skipTodo}
          onSkipSeries={store.skipSeriesFuture}
          onPermanentDeleteSeries={store.permanentlyDeleteSeriesFuture}
          onCommitSeriesEdits={store.commitSeriesEdits}
          onDetachFromSeries={store.detachFromSeries}
          onAddSubtask={store.addSubtask}
          onToggleSubtask={store.toggleSubtask}
          onUpdateSubtaskText={store.updateSubtaskText}
          onUpdateSubtaskPriority={store.updateSubtaskPriority}
          onUpdateSubtaskDueDate={store.updateSubtaskDueDate}
          onRemoveSubtask={store.removeSubtask}
          onClearSubtasks={store.clearSubtasks}
          agentEnabled={store.profile.agentEnabled !== false}
        />
      )}
    </SheetContext.Provider>
    </TaskDetailsOpenContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
