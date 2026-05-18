/**
 * Groceries tab — wraps GroceryView with the shared AppHeader and the
 * search top-sheet. While the sheet is open, typing restricts the
 * underlying list live; tapping Search commits the query as a
 * removable pill in the filter row.
 */

import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <AppHeader
        title="Groceries"
        onSearchPress={() => setSearchOpen(true)}
      />
      <SearchTopSheet
        visible={searchOpen}
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
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
})
