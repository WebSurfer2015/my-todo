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
import { useStore } from './StoreContext'
import ProfileSheet from './components/ProfileSheet'
import SettingsSheet from './components/SettingsSheet'
import BackgroundPicker from './components/BackgroundPicker'
import GuideMenuSheet from './components/GuideMenuSheet'
import GuideSheet from './components/GuideSheet'
import GuidesPrompt from './components/GuidesPrompt'
import type { Guide } from './guides'

interface Sheets {
  openProfile: () => void
  openSettings: () => void
  openBackgrounds: () => void
  /** Open the Tips & guides menu (entry point for Settings). */
  openGuides: () => void
}

const SheetContext = createContext<Sheets | null>(null)

export function SheetProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)
  const [guideMenuOpen, setGuideMenuOpen] = useState(false)
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
    <SheetContext.Provider value={{ openProfile, openSettings, openBackgrounds, openGuides }}>
      {children}
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
        onOpenBackgrounds={openBackgrounds}
        onShowIntro={() =>
          store.saveProfile({ ...store.profile, onboardingDone: false })
        }
        onOpenGuides={openGuides}
        onClose={() => setSettingsOpen(false)}
      />
      <BackgroundPicker
        visible={bgPickerOpen}
        value={store.profile.background}
        onChange={(next) =>
          store.saveProfile({ ...store.profile, background: next })
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
    </SheetContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
