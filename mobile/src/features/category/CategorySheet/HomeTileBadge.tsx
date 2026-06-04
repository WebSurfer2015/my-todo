/**
 * Inline 1/2/3/+ badge rendered in Configure mode next to the Pin button.
 * Shows the slot number (1, 2, 3) when the row is picked as a Home tile,
 * or "+" when not picked. Disabled (no-op + dim) once 3 are picked and
 * this row isn't one of them.
 */

import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { Filter } from "../../../core-bindings/types";
import { ThemeColors } from "../../../app/theme";
import type { Styles } from "./styles";

export interface HomeTileBadgeProps {
  filter: Filter;
  homeStatTiles: Filter[];
  onToggle: (f: Filter) => void;
  styles: Styles;
  theme: ThemeColors;
  label: string;
}

export default function HomeTileBadge({
  filter,
  homeStatTiles,
  onToggle,
  styles,
  theme,
  label,
}: HomeTileBadgeProps) {
  const idx = homeStatTiles.indexOf(filter);
  const isPicked = idx >= 0;
  const isFull = !isPicked && homeStatTiles.length >= 3;
  const a11y = isPicked
    ? `Remove ${label} from Home tiles, slot ${idx + 1}`
    : isFull
      ? `Home tiles full, deselect one to add ${label}`
      : `Add ${label} as a Home tile`;
  return (
    <TouchableOpacity
      onPress={() => {
        if (isFull) return;
        onToggle(filter);
      }}
      disabled={isFull}
      hitSlop={6}
      style={[
        styles.tileBadge,
        isPicked && styles.tileBadgePicked,
        isFull && styles.tileBadgeDisabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isFull, selected: isPicked }}
      accessibilityLabel={a11y}
    >
      <Text
        style={[
          styles.tileBadgeText,
          isPicked && styles.tileBadgeTextPicked,
          isFull && styles.tileBadgeTextDisabled,
        ]}
      >
        {isPicked ? String(idx + 1) : "+"}
      </Text>
    </TouchableOpacity>
  );
  void theme;
}
