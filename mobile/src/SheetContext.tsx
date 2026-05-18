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
  useState,
  ReactNode,
  useCallback,
} from 'react'
import { useStore } from './StoreContext'
import ProfileSheet from './components/ProfileSheet'
import SettingsSheet from './components/SettingsSheet'
import BackgroundPicker from './components/BackgroundPicker'

interface Sheets {
  openProfile: () => void
  openSettings: () => void
  openBackgrounds: () => void
}

const SheetContext = createContext<Sheets | null>(null)

export function SheetProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bgPickerOpen, setBgPickerOpen] = useState(false)

  const openProfile = useCallback(() => setProfileOpen(true), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const openBackgrounds = useCallback(() => setBgPickerOpen(true), [])

  return (
    <SheetContext.Provider value={{ openProfile, openSettings, openBackgrounds }}>
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
    </SheetContext.Provider>
  )
}

export function useSheets(): Sheets {
  const s = useContext(SheetContext)
  if (!s) throw new Error('useSheets must be used inside SheetProvider')
  return s
}
