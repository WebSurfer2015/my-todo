/**
 * Groceries tab — wraps GroceryView with the shared AppHeader and the
 * search top-sheet. While the sheet is open, typing restricts the
 * underlying list live; tapping Search commits the query as a
 * removable pill in the filter row.
 */

import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useStore } from '../StoreContext'
import { SEED_GROCERY_STORES } from '../groceries'
import GroceryView from '../components/GroceryView'
import AppHeader from '../components/AppHeader'
import SearchTopSheet from '../components/SearchTopSheet'

export default function GroceriesScreen() {
  const store = useStore()
  const insets = useSafeAreaInsets()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Lifted from GroceryView so the AppHeader filter icon can open the
  // StorePicker, matching the Todos pattern.
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  // Suppress the search Modal whenever this tab isn't focused so it
  // doesn't render on top of Home / Todos when the user switches away
  // mid-search. The state (query + open flag) persists, so coming
  // back restores the same view.
  const isFocused = useIsFocused()

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader
        title="Groceries"
        onSearchPress={() => setSearchOpen(true)}
        onFilterPress={() => setStorePickerOpen(true)}
      />
      <SearchTopSheet
        visible={isFocused && searchOpen}
        placeholder="Search groceries"
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
        onToggleChecked={store.toggleGroceryChecked}
        onEdit={store.editGrocery}
        onDelete={store.deleteGrocery}
        onSetActiveStore={store.setActiveGroceryStore}
        onSetActiveDept={store.setActiveGroceryDept}
        onAddStore={store.addGroceryStore}
        onRenameStore={store.renameGroceryStore}
        onDeleteStore={store.deleteGroceryStore}
        onReorderStores={store.reorderGroceryStores}
        onToggleStoreHidden={store.toggleGroceryStoreHidden}
        onTogglePinnedStore={store.pinGroceryStore}
        onTogglePinnedDept={store.pinGroceryDept}
        onSetGroceryGroups={store.setGroceryGroups}
        storePickerOpen={storePickerOpen}
        onStorePickerOpenChange={setStorePickerOpen}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
})
