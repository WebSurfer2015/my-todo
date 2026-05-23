/**
 * App-preferences sheet. Reached via the gear icon on the home header
 * (top-right, opposite the avatar that opens ProfileSheet). Owns every
 * preference that's about *how the app behaves* — Background, Notifications,
 * Animations & Sound, Mochi agent toggle, Data (export + privacy), About.
 *
 * Identity (avatar, name, quote, account, sign out, lifetime pebbles)
 * lives in ProfileSheet — Settings stays purely about preferences, no
 * destructive or identity actions.
 *
 * UX model: live toggles (commercial-grade pattern). Each switch saves
 * immediately via onSavePartial({ ...patch }). No Cancel/Save ceremony.
 * The header has a single "Done" button that just closes the sheet.
 */

import React, { useMemo } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { Profile } from "../profile";
import { useLang } from "../LangContext";
import { useTheme, ThemeColors } from "../theme";
import {
  DEFAULT_BACKGROUND,
  lookupPair,
  lookupPattern,
  tonesFor,
} from "../backgrounds";
import { renderPattern } from "./backgroundPatterns";

interface Props {
  visible: boolean;
  profile: Profile;
  /** Live-save patch — called immediately on every toggle / change. */
  onSavePartial: (patch: Partial<Profile>) => void;
  /** Opens the background picker (parent owns the modal to avoid iOS
   * modal-on-modal layering issues). */
  onOpenBackgrounds: () => void;
  /** Re-opens the first-launch intro (sets onboardingDone=false). */
  onShowIntro: () => void;
  onClose: () => void;
}

export default function SettingsSheet({
  visible,
  profile,
  onSavePartial,
  onOpenBackgrounds,
  onShowIntro,
  onClose,
}: Props) {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const scheme = useColorScheme() === "dark" ? "dark" : "light";

  const bgChoice = profile.background ?? DEFAULT_BACKGROUND;
  const bgPair = lookupPair(bgChoice.pairKey);
  const bgPattern = lookupPattern(bgChoice.pattern);
  const bgTones = tonesFor(bgPair, scheme);

  const animationOn = profile.completionAnimation !== false;
  const soundOn = profile.completionSound !== false;
  const reduceMotionOn = profile.reduceMotion === true;
  const agentOn = profile.agentEnabled === true;

  function patch(p: Partial<Profile>) {
    onSavePartial(p);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <View style={styles.titleSideBtn} />
              <Text style={styles.title}>Settings</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSideBtn}>
                <Text style={styles.doneText}>{t.done}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* APPEARANCE */}
              <Text style={styles.sectionLabel}>APPEARANCE</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    // Defer so this modal can finish dismissing before the
                    // picker modal slides up — iOS dislikes modal-on-modal.
                    setTimeout(() => onOpenBackgrounds(), 280);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Background, ${bgPair.label}, ${bgPattern.label}. Tap to change.`}
                >
                  <View style={styles.bgPreview}>
                    {renderPattern(bgPattern.key, {
                      tones: bgTones,
                      width: 56,
                      height: 36,
                    })}
                  </View>
                  <Text style={styles.rowLabel}>Background</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {bgPair.label}
                  </Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Daily check-in + Reminder time were removed pending a
                  full notifications & reminders redesign. The underlying
                  profile fields (dailyCheckinEnabled, dailyCheckinHour)
                  are preserved in core/profile.ts so the toggle state
                  isn't lost; we just don't surface the UI right now. */}

              {/* ANIMATIONS & SOUND */}
              <Text style={styles.sectionLabel}>ANIMATIONS & SOUND</Text>
              <View style={styles.card}>
                <ToggleRow
                  label="Reduce motion"
                  hint="Suppresses Mochi flight, row flash, and the checkbox bounce. Use this if motion makes you queasy."
                  value={reduceMotionOn}
                  onChange={(v) => patch({ reduceMotion: v })}
                  styles={styles}
                />
                <View style={styles.divider} />
                <ToggleRow
                  label="Completion animation"
                  hint="A calm scale pulse when you mark a task done."
                  value={animationOn && !reduceMotionOn}
                  onChange={(v) => patch({ completionAnimation: v })}
                  disabled={reduceMotionOn}
                  styles={styles}
                />
                <View style={styles.divider} />
                <ToggleRow
                  label="Completion sound"
                  hint="A soft chime when you mark a task done."
                  value={soundOn}
                  onChange={(v) => patch({ completionSound: v })}
                  styles={styles}
                />
              </View>

              {/* MOCHI */}
              <Text style={styles.sectionLabel}>MOCHI</Text>
              <Text style={styles.sectionSubtitle}>
                Mochi the turtle is the brand mascot.
              </Text>
              <View style={styles.card}>
                <ToggleRow
                  label={t.aiAssistanceLabel}
                  hint={t.aiAssistanceHint}
                  value={agentOn}
                  onChange={(v) => patch({ agentEnabled: v || undefined })}
                  styles={styles}
                />
              </View>

              {/* ABOUT — Sagely version + a "View intro again" row
                  underneath. The intro re-open is the only thing in
                  About that's actionable; keeping it next to the
                  version groups all app-meta together. */}
              <Text style={styles.sectionLabel}>ABOUT</Text>
              <View style={styles.card}>
                <View style={styles.rowStatic}>
                  <Text style={styles.rowLabel}>Sagely</Text>
                  <Text style={styles.rowValue}>v1.3.0</Text>
                </View>
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

              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
      onPress={() => { if (!disabled) onChange(!value) }}
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
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "92%",
      paddingTop: 6,
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginVertical: 6,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    titleSideBtn: { width: 64 },
    title: { fontSize: 17, fontWeight: "700", color: c.label, textAlign: "center" },
    doneText: { fontSize: 17, fontWeight: "600", color: c.primary, textAlign: "right" },
    scroll: { paddingBottom: 24 },
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
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 48,
    },
    rowStatic: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
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
    bgPreview: {
      width: 56,
      height: 36,
      borderRadius: 6,
      overflow: "hidden",
    },
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
