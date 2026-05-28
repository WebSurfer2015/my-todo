import React, { useCallback, useRef } from "react";
import { Dimensions, Text, TouchableOpacity, View } from "react-native";
import { GroceryItem } from "../../groceries";
import { useTriggerPebbleFlight } from "../PebbleFlight";
import type { Styles } from "./styles";

export interface RowProps {
  item: GroceryItem;
  /** Returns the (store × dept) bucket-completion delta from
   * useGroceriesSlice.toggleGroceryChecked. When > 0 the row fires
   * the Mochi pebble-flight to celebrate. */
  onToggle: () => number;
  onOpenEdit: () => void;
  styles: Styles;
  futureMode?: boolean;
  /** Department color — feeds PebbleFlight as `tint` for the
   * default-Mochi pebble glyph, mirroring how TaskItem uses a
   * category color. */
  tint?: string;
  celebrate?: boolean;
  playSound?: boolean;
}

/**
 * Row tap targets split iOS-Reminders-style:
 * - Checkbox area (left) → toggle checked / re-add from Future
 * - Text + store (rest of the row) → open edit sheet
 * Long-press anywhere → also opens edit (alternative discovery path).
 */
export default function Row({
  item,
  onToggle,
  onOpenEdit,
  styles,
  futureMode,
  tint,
  celebrate = true,
  playSound = true,
}: RowProps) {
  const triggerPebbleFlight = useTriggerPebbleFlight();
  const measureRef = useRef<View>(null);
  const handleToggle = useCallback(() => {
    const delta = onToggle();
    if (delta > 0 && (celebrate || playSound)) {
      const fallback = {
        x: Dimensions.get("window").width / 2,
        y: Dimensions.get("window").height / 2,
      };
      const node = measureRef.current;
      if (node) {
        node.measureInWindow((x, y, w, h) => {
          const from =
            typeof x === "number" && typeof y === "number" && w > 0 && h > 0
              ? { x: x + w / 2, y: y + h / 2 }
              : fallback;
          triggerPebbleFlight(from, { animate: celebrate, chime: playSound, tint });
        });
      } else {
        triggerPebbleFlight(fallback, { animate: celebrate, chime: playSound, tint });
      }
    }
  }, [onToggle, celebrate, playSound, tint, triggerPebbleFlight]);
  return (
    <View ref={measureRef} style={styles.row}>
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
          style={[
            styles.checkbox,
            item.checked && styles.checkboxChecked,
            futureMode && styles.checkboxFuture,
          ]}
        >
          {futureMode ? (
            <Text style={styles.checkboxPlus}>+</Text>
          ) : item.checked ? (
            <Text style={styles.checkboxCheck}>✓</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBody}
        activeOpacity={0.6}
        onPress={handleToggle}
        onLongPress={onOpenEdit}
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
    </View>
  );
}
