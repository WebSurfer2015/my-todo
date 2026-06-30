import React, { memo, useCallback, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { GroceryItem } from "../../../core-bindings/groceries";
import CalmFirework from "../../task/CalmFirework";
import { playCompletionChime } from "../../../adapters/completionChime";
import type { Styles } from "./styles";
import CheckGlyph from "../../../ui/CheckGlyph";

export interface RowProps {
  item: GroceryItem;
  /** Returns the (store × dept) bucket-completion delta from
   * useGroceriesSlice.toggleGroceryChecked. When > 0 the row fires
   * the in-row CalmFirework to celebrate. Takes the item id so the
   * parent can pass a reference-stable callback (the row supplies
   * `item.id`), keeping the React.memo wrapper effective. */
  onToggle: (id: string) => number;
  onOpenEdit: (id: string) => void;
  styles: Styles;
  futureMode?: boolean;
  /** Department color — feeds CalmFirework as the primary particle
   * `color`, mirroring how TaskItem uses a category color. */
  tint?: string;
  celebrate?: boolean;
  playSound?: boolean;
}

/**
 * Row tap targets, tuned for fast shopping:
 * - Checkbox AND the text/store body → toggle checked / re-add from Future
 *   (tap anywhere to check an item off the list quickly).
 * - The trailing "›" chevron, or a long-press anywhere → open the edit sheet.
 */
function Row({
  item,
  onToggle,
  onOpenEdit,
  styles,
  futureMode,
  tint,
  celebrate = true,
  playSound = true,
}: RowProps) {
  // In-row firework celebration — bump this counter when a fresh check-off
  // completes a (store × dept) bucket (delta > 0).
  const [fireworkTrigger, setFireworkTrigger] = useState(0);
  const handleOpenEdit = useCallback(() => onOpenEdit(item.id), [onOpenEdit, item.id]);
  const handleToggle = useCallback(() => {
    const delta = onToggle(item.id);
    if (delta > 0) {
      if (playSound) playCompletionChime();
      setFireworkTrigger((n) => n + 1);
    }
  }, [onToggle, item.id, playSound]);
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={handleToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.checked }}
        accessibilityLabel={
          futureMode ? `Add ${item.text} back to list` : `Check off ${item.text}`
        }
      >
        <View>
          <View
            style={[
              styles.checkbox,
              item.checked && styles.checkboxChecked,
              futureMode && styles.checkboxFuture,
            ]}
          >
            {futureMode ? (
              <Text style={styles.checkboxPlus}>+</Text>
            ) : item.checked ? (
              <CheckGlyph size={14} />
            ) : null}
          </View>
          {/* In-row firework, centered on the checkbox. */}
          <CalmFirework
            trigger={fireworkTrigger}
            color={tint}
            reduceMotion={!celebrate}
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBody}
        activeOpacity={0.6}
        onPress={handleToggle}
        onLongPress={handleOpenEdit}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          futureMode
            ? `${item.text}. Tap to add back, long-press to edit.`
            : item.checked
              ? `${item.text}, checked. Tap to un-check, long-press to edit.`
              : `${item.text}. Tap to check off, long-press to edit.`
        }
      >
        <Text
          style={[styles.rowText, item.checked && !futureMode && styles.rowTextChecked]}
          numberOfLines={2}
        >
          {item.text}
        </Text>
        {item.stores.length > 0 && (
          <Text style={styles.rowStore} numberOfLines={1}>
            {item.stores.join(" · ")}
          </Text>
        )}
      </TouchableOpacity>
      {/* Visible edit affordance — tap-to-toggle owns the row body, so a quiet
          chevron gives a discoverable edit path without relying on long-press. */}
      <TouchableOpacity
        onPress={handleOpenEdit}
        hitSlop={10}
        style={styles.rowEditBtn}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.text}`}
      >
        <Text style={styles.rowEditChevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

// Memoized: the parent rebuilds the byGroup/future arrays on every
// store mutation, but the underlying item objects keep their identity
// unless that specific item changed. With id-aware stable onToggle/
// onOpenEdit callbacks (and the useMemo'd `styles`), only the rows
// whose `item` actually changed re-render.
export default memo(Row);
