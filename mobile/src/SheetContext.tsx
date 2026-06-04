/**
 * Cross-screen sheet host. ProfileSheet, SettingsSheet, and the
 * BackgroundPicker are reachable from every tab (the avatar + gear
 * sit in each screen's AppHeader), so the visibility state + the
 * sheet components themselves live at the app shell, not inside a
 * single tab screen.
 *
 * Per-tab sheets (ComposeSheet / ChatSheet / CategorySheet for Todos;
 * GroceryEditSheet / StorePicker / DepartmentPicker for Groceries)
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
} from '../../core/src/data/exporter'
import ProfileSheet from './components/ProfileSheet'
import SettingsSheet from './components/SettingsSheet'
import BackgroundPicker from './components/BackgroundPicker'
import GuideMenuSheet from './components/GuideMenuSheet'
import GuideSheet from './components/GuideSheet'
import GuidesPrompt from './components/GuidesPrompt'
import ComposeSheet from './components/ComposeSheet'
import ManageHomeTilesSheet from './components/ManageHomeTilesSheet'
import ManageAnimationSoundSheet from './components/ManageAnimationSoundSheet'
import CategorySheet from './components/CategorySheet'
import { COLOR_PALETTE } from './categories'
import type { Filter } from './types'
import type { Guide } from './guides'
import { todayLocal } from '../../core/src/logic/utils'

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
  openBackgrounds: () => void
  /** Open the Tips & guides menu (entry point for Settings). */
  openGuides: () => void
  /** Open the add-todo compose sheet from any tab. */
  openCompose: () => void
  /** Open the Home Tiles picker (Dashboard gear icon). */
  openHomeTiles: () => void
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
  const { deleteAccount, signOut } = useAuth()
  const { t } = useLang()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)
  const [guideMenuOpen, setGuideMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [homeTilesOpen, setHomeTilesOpen] = useState(false)
  const [animationSoundOpen, setAnimationSoundOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySheetMode, setCategorySheetMode] = useState<'view' | 'edit'>('view')
  const [manageRequest, setManageRequest] = useState<ManageRequest>({ target: null, seq: 0 })
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
  const openBackgrounds = useCallback(() => setBgPickerOpen(true), [])
  const openGuides = useCallback(() => setGuideMenuOpen(true), [])
  const openCompose = useCallback(() => setComposeOpen(true), [])
  const openHomeTiles = useCallback(() => setHomeTilesOpen(true), [])
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
    <SheetContext.Provider value={{ openProfile, openSettings, openBackgrounds, openGuides, openCompose, openHomeTiles, openManageFilter, openSelectFilter, openManageGroceries, manageRequest }}>
      {children}
      <ProfileSheet
        visible={profileOpen}
        profile={store.profile}
        onSave={(p) => {
          store.saveProfile(p)
          setProfileOpen(false)
        }}
        onResetLifetime={() => {
          // Recalibrate counters to match the user's current state
          // rather than zeroing them out. Lifetime = items currently in
          // the Done bin (done or trashed-as-done) + done subtasks
          // under non-trashed parents. Today buckets = the subset of
          // each whose completionDate is today. This keeps the
          // visible count consistent with what's actually on screen
          // after the reset.
          const today = todayLocal()
          const tasksDoneTotal = store.todos.filter(
            (t) => t.done || t.trashed,
          ).length
          const tasksDoneToday = store.todos.filter(
            (t) => !t.trashed && t.done && t.completionDate === today,
          ).length
          let subsDoneTotal = 0
          let subsDoneToday = 0
          for (const t of store.todos) {
            if (t.trashed) continue
            for (const s of t.subtasks ?? []) {
              if (!s.done) continue
              subsDoneTotal += 1
              if (s.completionDate === today) subsDoneToday += 1
            }
          }
          store.saveProfile({
            ...store.profile,
            lifetimePebbles: tasksDoneTotal + subsDoneTotal,
            todayTaskPebbles: tasksDoneToday,
            todaySubtaskPebbles: subsDoneToday,
            pebblesDate: today,
          })
        }}
        onClose={() => setProfileOpen(false)}
      />
      <SettingsSheet
        visible={settingsOpen}
        profile={store.profile}
        onSavePartial={(patch) =>
          store.saveProfile({ ...store.profile, ...patch })
        }
        onOpenBackgrounds={openBackgrounds}
        onShowIntro={() =>
          store.saveProfile({ ...store.profile, onboardingDone: false })
        }
        onOpenGuides={openGuides}
        onOpenDashboardTiles={() => {
          // Settings row already closed Settings before invoking this;
          // just promote the tiles sheet.
          setHomeTilesOpen(true)
        }}
        onOpenManageTodos={openManageFilter}
        onOpenManageGroceries={openManageGroceries}
        onOpenAnimationSound={() => setAnimationSoundOpen(true)}
        onExport={handleExport}
        onDeleteData={handleDeleteData}
        onDeleteAccount={handleDeleteAccount}
        onClose={() => setSettingsOpen(false)}
      />
      <BackgroundPicker
        visible={bgPickerOpen}
        value={store.profile.background}
        onChange={(next) =>
          // Manual pick wins: also flip `themeFromAvatar` off so the
          // avatar-derived theme doesn't keep overriding the user's
          // explicit choice. Re-enabling the toggle in Settings brings
          // the avatar theme back.
          store.saveProfile({
            ...store.profile,
            background: next,
            themeFromAvatar: undefined,
          })
        }
        onClose={() => setBgPickerOpen(false)}
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
        onClose={() => setComposeOpen(false)}
      />
      <ManageHomeTilesSheet
        visible={homeTilesOpen}
        homeStatTiles={store.effectiveHomeStatTiles}
        categories={store.categories}
        orderedVisibleStatuses={store.orderedVisibleStatuses}
        onToggleHomeStatTile={store.toggleHomeStatTile}
        onClearAll={store.clearHomeStatTiles}
        onClose={() => setHomeTilesOpen(false)}
      />
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
    </SheetContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
