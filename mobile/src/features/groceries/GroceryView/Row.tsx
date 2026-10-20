import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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
 * Row tap targets — the same model as a to-do row (TaskItem):
 * - The circle → check off (or re-add from Saved). A check-off gets a
 *   "Got <item>." snackbar with an exact Undo (wired by the screen).
 * - The text/store body → open the edit sheet.
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
  // when it's checked off. On a fresh check-off we show the row as checked
  // optimistically and HOLD the real toggle for the burst's lifetime, so the
  // celebration plays on THIS row instead of the one that shifts up to take
  // its spot. Flushed on unmount so a tapped check-off is never lost.
  const triggerFirework = useTriggerFirework();
  const checkboxRef = useRef<View>(null);
  const [completing, setCompleting] = useState(false);
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; commit: () => void } | null>(null);
  useEffect(
    () => () => {
      const p = pendingRef.current;
      if (p) {
        clearTimeout(p.timer);
        p.commit();
      }
    },
    [],
  );
  useEffect(() => {
    if (item.checked) setCompleting(false);
  }, [item.checked]);
  const showChecked = item.checked || completing;
  const handleOpenEdit = useCallback(() => onOpenEdit(item.id), [onOpenEdit, item.id]);
  const handleToggle = useCallback(() => {
    if (pendingRef.current) return;
    // A fresh check-off (unchecked → checked) is the only celebrating case;
    // un-checking and Future re-adds act immediately.
    if (!item.checked && celebrate) {
      setCompleting(true);
      if (playSound) playCompletionChime();
      checkboxRef.current?.measureInWindow((x, y, w, h) => {
        triggerFirework({ x: x + w / 2, y: y + h / 2, color: tint });
      });
      const commit = () => {
        pendingRef.current = null;
        onToggle(item.id);
      };
      pendingRef.current = { timer: setTimeout(commit, 650), commit };
      return;
    }
    const delta = onToggle(item.id);
    if (delta > 0 && playSound) playCompletionChime();
  }, [onToggle, item.id, item.checked, playSound, celebrate, tint, triggerFirework]);
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={handleToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: showChecked }}
        accessibilityLabel={
          futureMode ? `Add ${item.text} back to list` : `Check off ${item.text}`
        }
      >
        <View
          ref={checkboxRef}
          style={[
            styles.checkbox,
            showChecked && styles.checkboxChecked,
            futureMode && styles.checkboxFuture,
          ]}
        >
          {futureMode ? (
            <Text style={styles.checkboxPlus}>+</Text>
          ) : showChecked ? (
            <CheckGlyph size={14} />
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBody}
        activeOpacity={0.6}
        onPress={handleOpenEdit}
        accessibilityRole="button"
        accessibilityLabel={
          futureMode
            ? `${item.text}, saved`
            : item.checked
              ? `${item.text}, checked`
              : item.text
        }
        accessibilityHint="Opens the item"
        accessibilityActions={[
          { name: "activate", label: "Edit" },
          { name: "toggle", label: futureMode ? "Add back to list" : item.checked ? "Un-check" : "Check off" },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "toggle") handleToggle();
          else handleOpenEdit();
        }}
      >
        <Text
          style={[styles.rowText, showChecked && !futureMode && styles.rowTextChecked]}
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

// Memoized: the parent rebuilds the byGroup/future arrays on every
// store mutation, but the underlying item objects keep their identity
// unless that specific item changed. With id-aware stable onToggle/
// onOpenEdit callbacks (and the useMemo'd `styles`), only the rows
// whose `item` actually changed re-render.
export default memo(Row);
