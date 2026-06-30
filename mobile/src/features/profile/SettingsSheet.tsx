/**
 * App-preferences sheet. Reached via the gear icon on the home header
 * (top-right, opposite the avatar that opens ProfileSheet). Owns every
 * preference that's about *how the app behaves* — Background, Notifications,
 * Animations & Sound, Mochi agent toggle, Data (export + privacy), About.
 *
 * Identity (avatar, name, quote, account, sign out) lives in
 * ProfileSheet — Settings stays purely about preferences, no
 * destructive or identity actions.
 *
 * UX model: live toggles (commercial-grade pattern). Each switch saves
 * immediately via onSavePartial({ ...patch }). No Cancel/Save ceremony.
 * The header has a single "Done" button that just closes the sheet.
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import { Profile, type ThemeName } from "../../core-bindings/profile";
import { useLang } from "../../app/LangContext";
import { usePurchases } from "../../app/PurchasesContext";
import { useTheme, ThemeColors, themeSwatch } from "../../app/theme";
import SheetShell from "../../ui/SheetShell";

interface Props {
  visible: boolean;
  profile: Profile;
  /** Live-save patch — called immediately on every toggle / change. */
  onSavePartial: (patch: Partial<Profile>) => void;
  /** Opens the theme picker (parent owns the modal to avoid iOS
   * modal-on-modal layering issues). */
  onOpenTheme: () => void;
  /** Re-opens the first-launch intro (sets onboardingDone=false). */
  onShowIntro: () => void;
  /** Opens the Tips & guides menu (parent owns the modal). */
  onOpenGuides: () => void;
  /** Opens Manage Filter (CategorySheet in edit mode). Settings hands
   * off to SheetContext.openManageFilter via the parent. */
  onOpenManageTodos: () => void;
  /** Opens Manage Groceries (StorePicker in edit mode). Navigates to
   * the Groceries tab + signals GroceriesScreen via the parent. */
  onOpenManageGroceries: () => void;
  /** Opens the Animation & Sound preferences sheet (the three toggles
   * that used to live inline in this Settings sheet). */
  onOpenAnimationSound: () => void;
  /** Assembles a JSON snapshot of the user's data and hands it to
   * the OS share sheet. Owned by the parent (SheetContext) since the
   * data lives on the store. */
  onExport: () => Promise<void>;
  /** Clears every per-user state doc — the user stays signed in and
   * the UI resets to a clean empty state. Destructive; the sheet
   * shows a confirm dialog before invoking. */
  onDeleteData: () => Promise<void>;
  /** Removes the Firebase Auth user plus all their data. Owned by
   * the parent so the auth context can manage post-deletion flows
   * (close all sheets, route to SignIn). */
  onDeleteAccount: () => Promise<void>;
  onClose: () => void;
}

export default function SettingsSheet({
  visible,
  profile,
  onSavePartial,
  onOpenTheme,
  onShowIntro,
  onOpenGuides,
  onOpenManageTodos,
  onOpenManageGroceries,
  onOpenAnimationSound,
  onExport,
  onDeleteData,
  onDeleteAccount,
  onClose,
}: Props) {
  const [exporting, setExporting] = useState(false);
  const [deletingData, setDeletingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const { tier, openPaywall } = usePurchases();
  const membershipLabel =
    tier === "premium" ? "Premium" : tier === "max" ? "Max" : "Free";

  const themeName: ThemeName = profile.theme ?? "sage";
  const themeLabel = themeName.charAt(0).toUpperCase() + themeName.slice(1);
  const sw = themeSwatch(themeName, scheme);

  const animationOn = profile.completionAnimation !== false;
  const soundOn = profile.completionSound !== false;
  const reduceMotionOn = profile.reduceMotion === true;
  // Tri-state with on-by-default: undefined or true → on; only false is off.
  const agentOn = profile.agentEnabled !== false;

  function patch(p: Partial<Profile>) {
    onSavePartial(p);
  }

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title="Settings"
      primary={{ label: t.done, onPress: onClose }}
      padded={false}
    >
              {/* MEMBERSHIP */}
              <Text style={styles.sectionLabel}>MEMBERSHIP</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose()
                    setTimeout(() => openPaywall(), 280)
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.rowLabel}>Sagely Membership</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {membershipLabel}
                  </Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>

              {/* APPEARANCE */}
              <Text style={styles.sectionLabel}>APPEARANCE</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    // Defer so this modal can finish dismissing before the
                    // picker modal slides up — iOS dislikes modal-on-modal.
                    setTimeout(() => onOpenTheme(), 280);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Theme, ${themeLabel}. Tap to change.`}
                >
                  {/* Mini 3-tone pie of the current theme. */}
                  <View style={styles.themePie}>
                    <View style={[styles.themePieHalf, { backgroundColor: sw.brand }]} />
                    <View style={styles.themePieHalf}>
                      <View style={[styles.themePieQuarter, { backgroundColor: sw.accent }]} />
                      <View style={[styles.themePieQuarter, { backgroundColor: sw.accentBright }]} />
                    </View>
                  </View>
                  <Text style={styles.rowLabel}>Theme</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {themeLabel}
                  </Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>

              {/* CONFIGURATION — entry-points to the per-surface manage
                  sheets. Each row closes Settings and (after the 280ms
                  iOS modal-handoff delay) opens its target sheet. */}
              {/* Dashboard tiles are now the pinned-card row on Home —
                  reordered by drag there, no separate manage sheet. */}
              <Text style={styles.sectionLabel}>CONFIGURATION</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOpenManageTodos(), 280);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Manage Todos"
                >
                  <Text style={styles.rowLabel}>Manage Todos</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    // Manage Groceries navigates first (since StorePicker
                    // still lives in GroceryView) and then signals
                    // GroceriesScreen to open it in edit mode.
                    setTimeout(() => onOpenManageGroceries(), 280);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Manage Store"
                >
                  <Text style={styles.rowLabel}>Manage Store</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOpenAnimationSound(), 280);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Manage Animation & Sound"
                >
                  <Text style={styles.rowLabel}>Manage Animation &amp; Sound</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Daily check-in + Reminder time were removed pending a
                  full notifications & reminders redesign. The underlying
                  profile fields (dailyCheckinEnabled, dailyCheckinHour)
                  are preserved in core/profile.ts so the toggle state
                  isn't lost; we just don't surface the UI right now. */}

              {/* MOCHI */}
              <Text style={styles.sectionLabel}>MOCHI</Text>
              <Text style={styles.sectionSubtitle}>
                Mochi is your gentle planning buddy.
              </Text>
              <View style={styles.card}>
                <ToggleRow
                  label={t.aiAssistanceLabel}
                  hint={t.aiAssistanceHint}
                  value={agentOn}
                  onChange={(v) => patch({ agentEnabled: v ? undefined : false })}
                  styles={styles}
                />
              </View>

              {/* HELP — Tips & guides + intro re-open. Surfaced
                  as its own section so the user can find guides
                  without scrolling past every preference. */}
              <Text style={styles.sectionLabel}>HELP</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onOpenGuides(), 280);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open Tips and guides"
                >
                  <Text style={styles.rowLabel}>Tips & guides</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onShowIntro(), 280);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View Mochi's intro again"
                >
                  <Text style={styles.rowLabel}>View intro again</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>{t.dataSection}</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  disabled={exporting || deletingData || deletingAccount}
                  onPress={async () => {
                    setExporting(true);
                    try {
                      await onExport();
                    } finally {
                      setExporting(false);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.exportData}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>
                      {exporting ? t.exporting : t.exportData}
                    </Text>
                    <Text style={styles.rowHint}>{t.exportDataSubtitle}</Text>
                  </View>
                  {exporting ? (
                    <ActivityIndicator size="small" color={theme.label3} />
                  ) : (
                    <Text style={styles.rowChevron}>›</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  disabled={exporting || deletingData || deletingAccount}
                  onPress={() => {
                    Alert.alert(
                      t.deleteDataOnly,
                      t.deleteDataOnlyConfirm,
                      [
                        { text: t.cancel, style: "cancel" },
                        {
                          text: t.deleteDataOnly,
                          style: "destructive",
                          onPress: async () => {
                            setDeletingData(true);
                            try {
                              await onDeleteData();
                            } finally {
                              setDeletingData(false);
                            }
                          },
                        },
                      ],
                      { cancelable: true },
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.deleteDataOnly}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: theme.red }]}>
                      {deletingData ? t.deleting : t.deleteDataOnly}
                    </Text>
                    <Text style={styles.rowHint}>{t.deleteDataOnlySubtitle}</Text>
                  </View>
                  {deletingData && <ActivityIndicator size="small" color={theme.red} />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.row}
                  disabled={exporting || deletingData || deletingAccount}
                  onPress={() => {
                    Alert.alert(
                      t.deleteAccount,
                      t.deleteAccountConfirm,
                      [
                        { text: t.cancel, style: "cancel" },
                        {
                          text: t.deleteAccount,
                          style: "destructive",
                          onPress: async () => {
                            setDeletingAccount(true);
                            try {
                              await onDeleteAccount();
                            } finally {
                              setDeletingAccount(false);
                            }
                          },
                        },
                      ],
                      { cancelable: true },
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.deleteAccount}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, { color: theme.red }]}>
                      {deletingAccount ? t.deleting : t.deleteAccount}
                    </Text>
                    <Text style={styles.rowHint}>{t.deleteAccountDescription}</Text>
                  </View>
                  {deletingAccount && <ActivityIndicator size="small" color={theme.red} />}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>ABOUT</Text>
              <View style={styles.card}>
                <View style={styles.rowStatic}>
                  <Text style={styles.rowLabel}>Sagely</Text>
                  <Text style={styles.rowValue}>v{Constants.expoConfig?.version ?? "1.6.0"}</Text>
                </View>
              </View>

              <View style={{ height: 24 }} />
    </SheetShell>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
  disabled?: boolean;
}

function ToggleRow({ label, hint, value, onChange, styles, disabled }: ToggleRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && { opacity: 0.4 }]}
      onPress={() => { if (!disabled) { Haptics.selectionAsync().catch(() => {}); onChange(!value) } }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    sectionLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.label3,
      letterSpacing: 0.6,
      paddingHorizontal: 22,
      marginTop: 18,
      marginBottom: 8,
    },
    card: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: c.card,
      overflow: "hidden",
    },
    cardWithTopGap: {
      // For a card that sits without its own section label above it —
      // small breathing room, less than a full section break since the
      // row reads as a continuation of the section above.
      marginTop: 8,
    },
    sectionSubtitle: {
      // Small explanatory text that sits between a section label and
      // its card — pulled close to the label, not floating.
      fontSize: 12,
      color: c.label3,
      lineHeight: 16,
      paddingHorizontal: 22,
      marginTop: -2,
      marginBottom: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 48,
    },
    rowStatic: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 48,
    },
    rowLabel: {
      fontSize: 15,
      color: c.label,
      flexShrink: 1,
    },
    rowHint: {
      fontSize: 12,
      color: c.label3,
      marginTop: 4,
      lineHeight: 16,
    },
    rowValue: {
      fontSize: 14,
      color: c.label3,
      marginLeft: "auto",
      maxWidth: 160,
    },
    rowChevron: {
      fontSize: 22,
      color: c.label3,
      lineHeight: 22,
      marginLeft: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginLeft: 16,
    },
    themePie: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: "hidden",
      flexDirection: "row",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    themePieHalf: { flex: 1 },
    themePieQuarter: { flex: 1 },
    timePickerWrap: {
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    toggleTrack: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.gray3,
      padding: 3,
      justifyContent: "center",
    },
    toggleTrackOn: { backgroundColor: c.primary },
    toggleKnob: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#fff",
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    toggleKnobOn: { transform: [{ translateX: 20 }] },
  });
}
