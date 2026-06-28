import React from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MAX_GROCERY_GROUP_LABEL_LEN } from "../../../core-bindings/groceries";
import { GROCERY_DEPT_ICONS } from "../groceryDeptIcons";
import { COLOR_PALETTE } from "../../../core-bindings/categories";
import { ThemeColors } from "../../../app/theme";
import type { Styles } from "./styles";

/** Headerless add/edit-department fields — the parent's SheetShell owns the
 * Cancel / title / Save header. */
export interface DeptFormProps {
  label: string;
  color: string;
  icon: string;
  onLabel: (v: string) => void;
  onColor: (v: string) => void;
  onIcon: (v: string) => void;
  styles: Styles;
  theme: ThemeColors;
}

export default function DeptForm({
  label,
  color,
  icon,
  onLabel,
  onColor,
  onIcon,
  styles,
  theme,
}: DeptFormProps) {
  return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formBody}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formFieldLabel}>NAME</Text>
        <TextInput
          style={styles.formInput}
          value={label}
          onChangeText={onLabel}
          maxLength={MAX_GROCERY_GROUP_LABEL_LEN}
          placeholder="e.g. Health & Beauty"
          placeholderTextColor={theme.gray3}
          returnKeyType="done"
          autoFocus
        />

        <Text style={styles.formFieldLabel}>COLOR</Text>
        <View style={styles.formSwatchGrid}>
          {COLOR_PALETTE.map((hex) => (
            <TouchableOpacity
              key={hex}
              style={[
                styles.formSwatch,
                { backgroundColor: hex },
                color === hex && styles.formSwatchSelected,
              ]}
              onPress={() => onColor(hex)}
              accessibilityLabel={`Color ${hex}`}
              accessibilityRole="button"
              accessibilityState={{ selected: color === hex }}
            />
          ))}
        </View>

        <Text style={styles.formFieldLabel}>ICON</Text>
        <View style={styles.formIconGrid}>
          {GROCERY_DEPT_ICONS.map(({ key, Icon }) => {
            const selected = icon === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.formIconTile, selected && styles.formIconTileSelected]}
                onPress={() => onIcon(key)}
                accessibilityLabel={`Icon ${key}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Icon size={20} color={color} strokeWidth={2} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
  );
}
