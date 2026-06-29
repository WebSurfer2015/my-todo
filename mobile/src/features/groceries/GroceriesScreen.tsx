/**
 * Groceries tab — wraps GroceryView with the shared AppHeader and the
 * search top-sheet. While the sheet is open, typing restricts the
 * underlying list live; tapping Search commits the query as a
 * removable pill in the filter row.
 */

import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useStore } from '../../app/StoreContext'
import { useSheets } from '../../app/SheetContext'
import { SEED_GROCERY_STORES } from '../../core-bindings/groceries'
import GroceryView from './GroceryView'
import AppHeader from '../../app/AppHeader'
import SearchTopSheet from '../filters/SearchTopSheet'

export default function GroceriesScreen() {
  const store = useStore()
  const sheets = useSheets()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Lifted from GroceryView so the AppHeader filter icon can open the
  // StorePicker, matching the Todos pattern.
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  // When true, StorePicker opens in Manage (edit) mode. Driven by the
  // gear icon and the cross-tab manage signal from Settings.
  const [storePickerEditing, setStorePickerEditing] = useState(false)
  // Track the last seen manage-request seq so we only react to NEW
  // signals — same target with the same seq is a no-op.
  const lastSeenSeqRef = useRef<number>(sheets.manageRequest.seq)
  // Suppress the search Modal whenever this tab isn't focused so it
  // doesn't render on top of Home / Todos when the user switches away
  // mid-search. The state (query + open flag) persists, so coming
  // back restores the same view.
  const isFocused = useIsFocused()

  // React to a Manage Groceries signal from Settings → SheetContext.
  // SheetContext navigates to this tab + bumps the seq; we open the
  // local StorePicker in edit mode once the screen is focused.
  useEffect(() => {
    const req = sheets.manageRequest
    if (req.target !== 'groceries') return
    if (req.seq === lastSeenSeqRef.current) return
    lastSeenSeqRef.current = req.seq
    setStorePickerEditing(true)
    setStorePickerOpen(true)
  }, [sheets.manageRequest])

  return (
    <View style={styles.flex}>
      <AppHeader
        title="Shopping"
        onSearchPress={() => setSearchOpen(true)}
        onFilterPress={() => {
          setStorePickerEditing(false)
          setStorePickerOpen(true)
        }}
        // Gear opens Settings to match Dashboard's gear — same
        // entry point across tabs. Per-tab manage actions (Manage
        // Store etc.) remain reachable from Settings' MANAGE
        // section, just not from the gear icon directly anymore.
        onGearPress={sheets.openSettings}
      />
      {/* PebbleStrip removed — completion celebration moved to the
          Mochi avatar in AppHeader, which does a happy-dance on
          every check-off (animation-aware). */}
      <SearchTopSheet
        visible={isFocused && searchOpen}
        placeholder="Search shopping"
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onCancel={() => {
          setSearchQuery('')
          setSearchOpen(false)
        }}
        onSubmit={() => setSearchOpen(false)}
      />
      <GroceryView
        groceries={store.groceries}
        groceryGroups={store.groceryGroups}
        configuredStores={store.profile.groceryStores ?? SEED_GROCERY_STORES}
        hiddenStores={store.profile.hiddenGroceryStores ?? []}
        pinnedStores={store.profile.pinnedGroceryStores ?? []}
        pinnedDepts={store.profile.pinnedGroceryDepts ?? []}
        activeStore={store.profile.activeGroceryStore}
        activeDept={store.profile.activeGroceryDept}
        initialAddStore={store.profile.lastAddedGroceryStore}
        searchQuery={searchOpen ? searchQuery : searchQuery.trim()}
        searchPillVisible={!searchOpen && searchQuery.trim().length > 0}
        onSearchPillPress={() => setSearchOpen(true)}
        onSearchClear={() => setSearchQuery('')}
        onAdd={store.addGrocery}
        agentEnabled={store.profile.agentEnabled !== false}
        // The add FAB matches the other tabs: it opens whichever capture you
        // used last (manual grocery sheet OR Ask Mochi — which adds groceries
        // too). The grocery sheet's "Ask Mochi instead" link flips the mode.
        lastComposeMode={store.profile.lastComposeMode ?? 'manual'}
        onAskMochi={() => {
          store.saveProfile((p) => ({ ...p, lastComposeMode: 'mochi' }))
          sheets.openMochi()
        }}
        onToggleChecked={store.toggleGroceryChecked}
        celebrate={
          store.profile.completionAnimation !== false &&
          store.profile.reduceMotion !== true
        }
        playSound={store.profile.completionSound !== false}
        onEdit={store.editGrocery}
        onDelete={store.deleteGrocery}
        onSetActiveStore={store.setActiveGroceryStore}
        onSetActiveDept={store.setActiveGroceryDept}
        onAddStore={store.addGroceryStore}
        onAddGroup={store.addGroceryGroup}
        onRenameStore={store.renameGroceryStore}
        onDeleteStore={store.deleteGroceryStore}
        onLinkItemsToStore={store.linkItemsToStore}
        onReorderStores={store.reorderGroceryStores}
        onToggleStoreHidden={store.toggleGroceryStoreHidden}
        onTogglePinnedStore={store.pinGroceryStore}
        onTogglePinnedDept={store.pinGroceryDept}
        onSetGroceryGroups={store.setGroceryGroups}
        storePickerOpen={storePickerOpen}
        onStorePickerOpenChange={(v) => {
          setStorePickerOpen(v)
          if (!v) setStorePickerEditing(false)
        }}
        storePickerEditing={storePickerEditing}
        onOpenManageStore={() => {
          // Local handoff: ComposeSheet already closes itself before
          // calling this, so we just open the local StorePicker in
          // edit mode. Same code path as the gear icon.
          setStorePickerEditing(true)
          setStorePickerOpen(true)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
})
