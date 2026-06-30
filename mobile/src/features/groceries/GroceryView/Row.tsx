import React, { memo, useCallback, useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { GroceryItem } from "../../../core-bindings/groceries";
import { useTriggerFirework } from "../../../app/FireworkOverlay";
import { playCompletionChime } from "../../../adapters/completionChime";
import type { Styles } from "./styles";
import CheckGlyph from "../../../ui/CheckGlyph";

export interface RowProps {
  item: GroceryItem;
  /** Returns 1 when this tap just checked the item off (from
   * useGroceriesSlice.toggleGroceryChecked). When > 0 the row fires the
   * calm firework. Takes the item id so the parent can pass a reference-
   * stable callback, keeping the React.memo wrapper effective. */
  onToggle: (id: string) => number;
  onOpenEdit: (id: string) => void;
  styles: Styles;
  futureMode?: boolean;
  /** Department color — the firework's primary particle tint, mirroring
   * how TaskItem uses a category color. */
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
  // Calm firework celebration — fired from the app-level overlay (anchored
  // on the checkbox) so the burst survives the row leaving the active list
  // when it's checked off.
  const triggerFirework = useTriggerFirework();
  const checkboxRef = useRef<View>(null);
  const handleOpenEdit = useCallback(() => onOpenEdit(item.id), [onOpenEdit, item.id]);
  const handleToggle = useCallback(() => {
    const delta = onToggle(item.id);
    if (delta > 0) {
      if (playSound) playCompletionChime();
      if (celebrate) {
        checkboxRef.current?.measureInWindow((x, y, w, h) => {
          triggerFirework({ x: x + w / 2, y: y + h / 2, color: tint });
        });
      }
    }
  }, [onToggle, item.id, playSound, celebrate, tint, triggerFirework]);
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
        <View
          ref={checkboxRef}
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
