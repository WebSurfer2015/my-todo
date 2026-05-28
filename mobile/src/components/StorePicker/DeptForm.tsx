import React from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MAX_GROCERY_GROUP_LABEL_LEN } from "../../groceries";
import { GROCERY_DEPT_ICONS } from "../groceryDeptIcons";
import { COLOR_PALETTE } from "../../categories";
import { ThemeColors } from "../../theme";
import { useLang } from "../../LangContext";
import type { Styles } from "./styles";

export interface DeptFormProps {
  mode: "add" | "edit";
  label: string;
  color: string;
  icon: string;
  onLabel: (v: string) => void;
  onColor: (v: string) => void;
  onIcon: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  styles: Styles;
  theme: ThemeColors;
  t: ReturnType<typeof useLang>["t"];
}

export default function DeptForm({
  mode,
  label,
  color,
  icon,
  onLabel,
  onColor,
  onIcon,
  onCancel,
  onSave,
  styles,
  theme,
  t,
}: DeptFormProps) {
  const trimmed = label.trim();
  const canSave = trimmed.length > 0;
  return (
    <>
      <View style={styles.titleRow}>
        <TouchableOpacity onPress={onCancel} hitSlop={10} style={styles.titleSideBtn}>
          <Text style={{ fontSize: 15, fontWeight: "500", color: theme.primary }}>
            {t.cancel}
          </Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {mode === "add" ? "Add Department" : "Edit Department"}
        </Text>
        <TouchableOpacity
          onPress={onSave}
          disabled={!canSave}
          hitSlop={10}
          style={styles.titleSideBtn}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: canSave ? theme.primary : theme.gray3,
              textAlign: "right",
            }}
          >
            {t.save}
          </Text>
        </TouchableOpacity>
      </View>
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
    </>
  );
}
