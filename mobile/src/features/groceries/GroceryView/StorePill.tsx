import React from "react";
import { Text, TouchableOpacity } from "react-native";
import type { Styles } from "./styles";

export interface StorePillProps {
  label: string;
  count: number;
  active: boolean;
  pinned: boolean;
  /** Optional leading icon (used by the dept pill so the user can
   * tell it's a department filter rather than a store). */
  deptIcon?: React.ReactNode;
  /** Tint for the pin glyph when the pill is pinned. Defaults to the
   * label color so it matches the surrounding text. */
  pinIconColor?: string;
  /** Reports the pill's X position within the scroll content. Parent
   * uses these to scroll the active pill into view on filter change. */
  onLayoutX?: (x: number) => void;
  onPress: () => void;
  onLongPress: (() => void) | undefined;
  styles: Styles;
  /** When true and `active` is false, render the mint-outline
   * "candidate" style — mirrors Todos FilterBar's `pillExtra`. */
  inactiveOutline?: boolean;
}

export default function StorePill({
  label,
  count,
  active,
  pinned,
  deptIcon,
  pinIconColor,
  onLayoutX,
  onPress,
  onLongPress,
  styles,
  inactiveOutline,
}: StorePillProps) {
  return (
    <TouchableOpacity
      style={[
        styles.storePill,
        active && styles.storePillActive,
        !active && inactiveOutline && styles.storePillExtra,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      onLayout={onLayoutX ? (e) => onLayoutX(e.nativeEvent.layout.x) : undefined}
      delayLongPress={350}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}${active ? ", selected" : ""}${pinned ? ", pinned" : ""}`}
      accessibilityHint={onLongPress ? "Long-press to pin or unpin" : undefined}
    >
      {/* Pin glyph removed for calm — a pinned pill persists in the row, which
          is the signal; long-press still pins/unpins. */}
      {deptIcon}
      <Text
        style={[styles.storePillLabel, active && styles.storePillLabelActive]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      {/* Count intentionally not rendered — calm pass. The number stays in the
          accessibility label for screen readers, just not on-screen. */}
    </TouchableOpacity>
  );
}
