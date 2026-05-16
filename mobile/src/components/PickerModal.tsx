import React, { useMemo } from 'react'
import { Modal, View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme, ThemeColors } from '../theme'

interface Option {
  key: string
  label: string
  color: string
  icon?: React.ReactNode
}

interface Props {
  visible: boolean
  options: Option[]
  selectedKey: string
  onSelect: (key: string) => void
  onClose: () => void
}

export default function PickerModal({ visible, options, selectedKey, onSelect, onClose }: Props) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.sheet}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.item,
                i < options.length - 1 && styles.itemBorder,
                selectedKey === opt.key && styles.itemSelected,
              ]}
              onPress={() => { onSelect(opt.key); onClose() }}
            >
              {opt.icon}
              <Text style={[styles.label, { color: opt.color }]}>{opt.label}</Text>
              {selectedKey === opt.key && <Text style={[styles.check, { color: opt.color }]}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheet: {
      backgroundColor: c.modal,
      borderRadius: 14,
      minWidth: 220,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
      overflow: 'hidden',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    itemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    itemSelected: {
      backgroundColor: c.bg,
    },
    label: {
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    check: {
      fontSize: 16,
      fontWeight: '600',
    },
  })
}
