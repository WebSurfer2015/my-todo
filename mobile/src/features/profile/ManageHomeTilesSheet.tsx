/**
 * Pick which 3 Filters appear as the Home / Dashboard stat tiles.
 *
 * Stripped-down sibling of CategorySheet's Configure mode — only the
 * 1/2/3/+ badge per row, no pinning / hiding / drag / rename. The sheet
 * lists every visible status above every category. Tapping a badge
 * toggles that Filter in or out of `homeStatTiles`; the + is disabled
 * once 3 tiles are picked.
 */

import React, { useMemo } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CategoryDef, categoryLabel } from "../../core-bindings/categories";
import {
  Filter,
  PRIORITY_VALUES,
  StatusFilter,
  categoryFilter,
  priorityFilter,
} from "../../core-bindings/types";
import CategoryIcon from "../../ui/CategoryIcon";
import StatusIcon, { statusColor } from "../../ui/StatusIcon";
import PriorityBars from "../../ui/PriorityBars";
import { useLang } from "../../app/LangContext";
import { useTheme, ThemeColors } from "../../app/theme";

interface Props {
  visible: boolean;
  /** Effective list of picked Home stat Filters. */
  homeStatTiles: Filter[];
  categories: CategoryDef[];
  /** Visible status entries (hidden statuses are skipped here). */
  orderedVisibleStatuses: { id: StatusFilter; label: string }[];
  onToggleHomeStatTile: (f: Filter) => void;
  /** Header Reset — clears every pick (writes []), so the Dashboard
   * tile row hides until the user opts back in. */
  onClearAll: () => void;
  onClose: () => void;
}

export default function ManageHomeTilesSheet({
  visible,
  homeStatTiles,
  categories,
  orderedVisibleStatuses,
  onToggleHomeStatTile,
  onClearAll,
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  function renderBadge(filter: Filter, label: string) {
    const idx = homeStatTiles.indexOf(filter);
    const isPicked = idx >= 0;
    const a11y = isPicked
      ? `Remove ${label} from Home tiles, slot ${idx + 1}`
      : `Add ${label} as a Home tile`;
    return (
      <TouchableOpacity
        onPress={() => onToggleHomeStatTile(filter)}
        hitSlop={6}
        style={[styles.badge, isPicked && styles.badgePicked]}
        accessibilityRole="button"
        accessibilityState={{ selected: isPicked }}
        accessibilityLabel={a11y}
      >
        <Text style={[styles.badgeText, isPicked && styles.badgeTextPicked]}>
          {isPicked ? String(idx + 1) : "+"}
        </Text>
      </TouchableOpacity>
    );
  }

  // Compute the sheet's exact height in points (not a %) so the
  // inner ScrollView's flex:1 has a deterministic bounded parent.
  // Percentage-based heights inside a Modal+Pressable nest weren't
  // resolving cleanly — the ScrollView ended up with 0 height,
  // clipping CATEGORIES below the visible band with no scroll.
  const screenH = Dimensions.get('window').height
  const sheetHeight = Math.round(screenH * 0.85)
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping Pressable
          collapses the sheet into one iOS a11y leaf (breaks VoiceOver/Maestro). */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        {/* Plain View (not Pressable) for the sheet itself. The
            opaque background absorbs taps so they don't reach the
            backdrop, and a Pressable here would claim the touch
            responder and starve the inner ScrollView's pan
            recognizer — that was blocking scroll to CATEGORIES. */}
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={onClearAll}
              hitSlop={10}
              disabled={homeStatTiles.length === 0}
              style={styles.headerSideLeft}
              accessibilityRole="button"
              accessibilityLabel="Reset Home tiles — clear all picks"
              accessibilityState={{ disabled: homeStatTiles.length === 0 }}
            >
              <Text
                style={[
                  styles.resetText,
                  homeStatTiles.length === 0 && styles.resetTextDisabled,
                ]}
              >
                Reset
              </Text>
            </TouchableOpacity>
            <Text style={styles.title}>Home Tiles</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerSide}>
              <Text style={styles.doneText}>{t.done}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerLabel}>
              {homeStatTiles.length === 0
                ? "NONE PICKED"
                : `${homeStatTiles.length} PICKED`}
            </Text>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            // Indicator visible so the user knows there's more
            // content below (Categories) when STATUSES + PRIORITIES
            // fill the first screen of the sheet.
            showsVerticalScrollIndicator={true}
            indicatorStyle="default"
          >
            <Text style={styles.sectionHeader}>STATUSES</Text>
            <View style={styles.listCard}>
              {orderedVisibleStatuses.map((s, i) => (
                <View
                  key={s.id}
                  style={[
                    styles.row,
                    i < orderedVisibleStatuses.length - 1 && styles.rowDivider,
                  ]}
                >
                  <StatusIcon id={s.id} size={18} color={statusColor(s.id, theme)} />
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                  {renderBadge(s.id, s.label)}
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeader}>PRIORITIES</Text>
            <View style={styles.listCard}>
              {PRIORITY_VALUES.map((p, i) => {
                const label = t.priority[p]
                const f = priorityFilter(p)
                return (
                  <View
                    key={`pri-${p}`}
                    style={[
                      styles.row,
                      i < PRIORITY_VALUES.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <PriorityBars level={p} size={18} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {label}
                    </Text>
                    {renderBadge(f, label)}
                  </View>
                )
              })}
            </View>

            <Text style={styles.sectionHeader}>CATEGORIES</Text>
            <View style={styles.listCard}>
              {categories.map((c, i) => {
                const label = categoryLabel(c, t);
                const f = categoryFilter(c.id);
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.row,
                      i < categories.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={18} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {label}
                    </Text>
                    {renderBadge(f, label)}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 12,
      paddingBottom: 24,
      paddingHorizontal: 16,
      // height is set inline from Dimensions (85% of screen) so the
      // inner ScrollView's flex:1 always has a bounded parent and
      // can scroll the CATEGORIES section into view.
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 8,
    },
    headerSide: {
      minWidth: 56,
      alignItems: "flex-end",
    },
    headerSideLeft: {
      minWidth: 56,
      alignItems: "flex-start",
    },
    resetText: {
      fontSize: 15,
      color: c.red,
      fontWeight: "500",
    },
    resetTextDisabled: {
      color: c.label3,
      opacity: 0.55,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: c.label,
    },
    doneText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: "600",
    },
    banner: {
      paddingHorizontal: 4,
      paddingVertical: 6,
      alignItems: "flex-end",
    },
    bannerLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label2,
    },
    body: {
      // flex:1 so the ScrollView absorbs whatever space remains
      // inside the sheet's maxHeight cap and scrolls internally
      // when content exceeds it. Was flexGrow:0 — fine when the
      // body only had STATUSES + CATEGORIES, but overflowed off-
      // screen once PRIORITIES was added + rows got the comfort
      // bump.
      flex: 1,
    },
    bodyContent: {
      paddingBottom: 12,
    },
    sectionHeader: {
      // Comfort: was 11/12/6 — bumped to 12/20/12 to match
      // CategorySheet's exhale.
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 20,
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    listCard: {
      borderRadius: 14,
      backgroundColor: c.card,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      // Comfort: gap 12 → 14, paddings 14/12 → 16/18 mirroring
      // CategorySheet's viewRow scale.
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowLabel: {
      flex: 1,
      fontSize: 17,
      color: c.label,
      fontWeight: "500",
    },
    badge: {
      minWidth: 30,
      height: 24,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.gray3,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    badgePicked: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    badgeDisabled: {
      opacity: 0.35,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.label2,
      lineHeight: 16,
    },
    badgeTextPicked: {
      color: "#fff",
    },
    badgeTextDisabled: {
      color: c.label3,
    },
  });
}
