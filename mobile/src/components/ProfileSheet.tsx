import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
  Share,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Profile,
  Avatar as AvatarT,
  AVATAR_LIBRARY,
} from "../profile";

/** "9:00 AM" / "1:30 PM" formatting for the daily-checkin time row. */
function formatHour12(h: number): string {
  const hr = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hr}:00 ${ampm}`;
}

/**
 * Defensive avatar normalizer — guarantees we render Mochi when the saved
 * avatar is missing, malformed, or points to a preset that no longer exists
 * (e.g. legacy 'turtle' emoji preset before the brand consolidated on Mochi).
 */
function normalizeAvatar(a: AvatarT | undefined | null): AvatarT {
  const fallback: AvatarT = { kind: "preset", key: "mochi" };
  if (!a) return fallback;
  if (a.kind === "preset") {
    if (!AVATAR_LIBRARY.find((p) => p.key === a.key)) return fallback;
  }
  return a;
}
import Avatar from "./Avatar";
import { CairnGlyph } from "./PebbleStrip";
import { useLang } from "../LangContext";
import { useNotify } from "../notify";
import { useAuth } from "../AuthContext";
import { useTheme, ThemeColors } from "../theme";

interface Props {
  visible: boolean;
  profile: Profile;
  /** Snapshot of the user's todos + categories. Used by the data-export
   * action; not modified by this sheet. */
  exportSnapshot?: () => string;
  onSave: (p: Profile) => void;
  onClose: () => void;
}

export default function ProfileSheet({
  visible,
  profile,
  exportSnapshot,
  onSave,
  onClose,
}: Props) {
  const { t } = useLang();
  const { showSnackbar } = useNotify();
  const { signOut, deleteAccount } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [quote, setQuote] = useState(profile.quote ?? "");
  const [avatar, setAvatar] = useState<AvatarT>(normalizeAvatar(profile.avatar));
  const [deleting, setDeleting] = useState(false);
  const [pickingQuote, setPickingQuote] = useState(false);
  const [celebrateAnim, setCelebrateAnim] = useState<boolean>(
    profile.completionAnimation !== false,
  );
  const [celebrateSound, setCelebrateSound] = useState<boolean>(
    profile.completionSound !== false,
  );
  const [dailyCheckin, setDailyCheckin] = useState<boolean>(
    profile.dailyCheckinEnabled === true,
  );
  const [dailyCheckinHour, setDailyCheckinHour] = useState<number>(
    profile.dailyCheckinHour ?? 9,
  );
  const [checkinTimePickerOpen, setCheckinTimePickerOpen] = useState(false);

  // Short anxiety-aware quotes for subheader display. Grouped loosely by
  // intent: breath/grounding, permission/kindness, gentle action, perspective.
  const QUOTES = [
    // Breath & grounding — instant calm
    "Breathe in. Breathe out.",
    "Inhale. Exhale. Keep going.",
    "One breath at a time.",
    "Pause. Settle. Continue.",
    "Right now, you are safe.",
    "This moment is enough.",
    "Be where your feet are.",
    "Take a deep breath. You're doing better than you think.",
    // Permission & kindness
    "Be kind to yourself today.",
    "Rest is productive too.",
    "It's okay to take it slow.",
    "You don't have to do it all.",
    "You're allowed to rest.",
    "Pause is part of progress.",
    "Be gentle with yourself.",
    // Gentle action
    "Small steps still count.",
    "Progress, not perfection.",
    "Done is better than perfect.",
    "Tiny wins still count.",
    "Just the next right thing.",
    "Start small. Start anyway.",
    "Showing up is half the work.",
    "One thing at a time.",
    // Perspective
    "This too shall pass.",
    "Not everything needs your worry.",
    "You are not your thoughts.",
    "Zoom out. The picture is bigger.",
    "Most worries don't come true.",
    "What matters most? Start there.",
    "You are not behind.",
    "You are exactly where you need to be.",
    // Self-compassion
    "You're doing better than you think.",
    "You don't have to be perfect to be amazing.",
    "Imperfect is allowed.",
    "You are a work in progress, and that's okay.",
    // Calm flow
    "Be like water. Adapt and flow.",
    "Slow is smooth. Smooth is fast.",
    "Be the calm in your own storm.",
    "Less is often more.",
    "Trust the process.",
    // Gentle humor
    "Worry less. Breathe more.",
    "Your only competition is yesterday's you.",
    "If in doubt, take a walk.",
    "Unplug for a few minutes. Most things work again after that.",
    "Plot twist: I'm doing my best.",
    "Procrastinators unite! …Tomorrow.",
    "Worry is a rocking chair. Lots of motion, no progress.",
    "If you can't fix it, can it wait?",
    "Coffee first. Decisions later.",
    "Adulting? More like figuring-it-out-ing.",
    "Take a nap. The world can wait five minutes.",
    "I'd panic, but I'm too busy doing my best.",
    "Tomorrow's problem. Tomorrow's me.",
    "I came. I saw. I forgot what I was doing.",
    "My to-do list and I are in a complicated relationship.",
    "Don't grow up. It's a trap.",
    "Anxiety: paying interest on trouble that may never come.",
    "Plot twist: nobody has it all figured out.",
    "If life gives you lemons, ask for the receipt.",
  ];

  async function pickQuoteForMe() {
    if (pickingQuote) return;
    setPickingQuote(true);
    // Pick a different quote than the current one when possible.
    const candidates = QUOTES.filter((q) => q !== quote);
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    setQuote(next);
    // Brief visual feedback so the button feels responsive.
    setTimeout(() => setPickingQuote(false), 120);
  }

  React.useEffect(() => {
    if (visible) {
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setQuote(profile.quote ?? "");
      setAvatar(normalizeAvatar(profile.avatar));
      setCelebrateAnim(profile.completionAnimation !== false);
      setCelebrateSound(profile.completionSound !== false);
      setDailyCheckin(profile.dailyCheckinEnabled === true);
      setDailyCheckinHour(profile.dailyCheckinHour ?? 9);
    }
  }, [visible, profile]);

  // Resize the picked photo to 256x256 + JPEG q=0.7 BEFORE encoding to base64.
  // expo-image-picker's quality only affects compression of the original
  // resolution — a 4k crop at q=0.7 still produces multi-MB base64 that
  // exceeds MAX_AVATAR_URI_LEN (1MB) and gets silently rejected on read.
  async function compressToDataUri(uri: string): Promise<string> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 256, height: 256 } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) throw new Error("Image compression returned no data");
    return `data:image/jpeg;base64,${result.base64}`;
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.profilePermissionNeeded, t.profilePhotoPermDenied);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        setAvatar({ kind: "image", uri: await compressToDataUri(result.assets[0].uri) });
      } catch (err) {
        Alert.alert("Photo error", err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.profilePermissionNeeded, t.profileCameraPermDenied);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        setAvatar({ kind: "image", uri: await compressToDataUri(result.assets[0].uri) });
      } catch (err) {
        Alert.alert("Photo error", err instanceof Error ? err.message : String(err));
      }
    }
  }

  function openAvatarPicker() {
    const cancelLabel = t.cancel;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t.profileTakePhoto, t.profileChooseLibrary, cancelLabel],
          cancelButtonIndex: 2,
        },
        (i) => {
          if (i === 0) takePhoto();
          else if (i === 1) pickFromLibrary();
        },
      );
    } else {
      Alert.alert(t.profileChangePhoto, undefined, [
        { text: t.profileTakePhoto, onPress: takePhoto },
        { text: t.profileChooseLibrary, onPress: pickFromLibrary },
        { text: cancelLabel, style: "cancel" },
      ]);
    }
  }

  function handleSave() {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) return;
    onSave({
      ...profile,
      name: trimmedFirst,
      firstName: trimmedFirst,
      lastName: lastName.trim() || undefined,
      quote: quote.trim() || undefined,
      avatar,
      density: "comfortable",
      title: profile.title,
      reduceMotion: true,
      completionAnimation: celebrateAnim,
      completionSound: celebrateSound,
      dailyCheckinEnabled: dailyCheckin,
      dailyCheckinHour,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showSnackbar({ message: t.profileSaved });
    onClose();
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
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.titleSideBtn}>
                <Text style={styles.cancelHeaderText}>{t.cancel}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{t.editProfile}</Text>
              <TouchableOpacity onPress={handleSave} hitSlop={10} style={styles.titleSideBtn}>
                <Text style={styles.saveHeaderText}>{t.save}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollBodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <View style={styles.avatarRow}>
              <TouchableOpacity onPress={openAvatarPicker} activeOpacity={0.8}>
                <Avatar avatar={avatar} size={72} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openAvatarPicker}
                style={styles.avatarBtn}
              >
                <Text style={styles.avatarBtnText}>{t.profileChangePhoto}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>{t.profilePresetLabel}</Text>
            <View style={styles.presetGrid}>
              {AVATAR_LIBRARY.map((p) => {
                const active = avatar.kind === "preset" && avatar.key === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => setAvatar({ kind: "preset", key: p.key })}
                    style={[styles.presetItem, active && styles.presetActive]}
                  >
                    <Avatar avatar={{ kind: "preset", key: p.key }} size={40} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>
                  {t.profileFirstNameLabel}
                  <Text style={{ color: theme.red }}> *</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  maxLength={40}
                  autoComplete="given-name"
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>{t.profileLastNameLabel}</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  maxLength={40}
                  autoComplete="family-name"
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Quote</Text>
                <TouchableOpacity
                  onPress={pickQuoteForMe}
                  disabled={pickingQuote}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.pickForMeText,
                      pickingQuote && styles.pickForMeTextDisabled,
                    ]}
                  >
                    {pickingQuote ? "Picking…" : "Pick it for me"}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, styles.inputMulti, styles.inputItalic]}
                value={quote}
                onChangeText={setQuote}
                placeholder={t.profileQuotePlaceholder}
                placeholderTextColor={theme.gray3}
                multiline
                maxLength={128}
              />
              <Text style={styles.helper}>Shown under your greeting.</Text>
            </View>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setCelebrateAnim((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: celebrateAnim }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Completion animation</Text>
                <Text style={styles.toggleHint}>
                  A calm scale pulse when you mark a task done.
                </Text>
              </View>
              <View style={[styles.toggleTrack, celebrateAnim && styles.toggleTrackOn]}>
                <View style={[styles.toggleKnob, celebrateAnim && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setCelebrateSound((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: celebrateSound }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Completion sound</Text>
                <Text style={styles.toggleHint}>
                  A soft chime when you mark a task done. (Coming soon.)
                </Text>
              </View>
              <View style={[styles.toggleTrack, celebrateSound && styles.toggleTrackOn]}>
                <View style={[styles.toggleKnob, celebrateSound && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setDailyCheckin((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: dailyCheckin }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Daily check-in</Text>
                <Text style={styles.toggleHint}>
                  One quiet, mascot-voiced reminder. No alerts, no streaks.
                  You can turn it off anytime.
                </Text>
              </View>
              <View style={[styles.toggleTrack, dailyCheckin && styles.toggleTrackOn]}>
                <View style={[styles.toggleKnob, dailyCheckin && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            {dailyCheckin && (
              <TouchableOpacity
                style={styles.checkinTimeRow}
                onPress={() => setCheckinTimePickerOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={`Reminder time, ${formatHour12(dailyCheckinHour)}. Tap to change.`}
              >
                <Text style={styles.checkinTimeLabel}>Reminder time</Text>
                <Text style={styles.checkinTimeValue}>
                  {formatHour12(dailyCheckinHour)}
                </Text>
              </TouchableOpacity>
            )}

            {dailyCheckin && checkinTimePickerOpen && (
              <View style={styles.checkinTimePickerWrap}>
                <DateTimePicker
                  value={(() => {
                    const d = new Date();
                    d.setHours(dailyCheckinHour, 0, 0, 0);
                    return d;
                  })()}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  themeVariant={theme.statusBar === "light-content" ? "dark" : "light"}
                  minuteInterval={30}
                  onChange={(_e: DateTimePickerEvent, d?: Date) => {
                    if (d) setDailyCheckinHour(d.getHours());
                    if (Platform.OS === "android") setCheckinTimePickerOpen(false);
                  }}
                />
              </View>
            )}

            <View style={styles.pebbleHero}>
              <View style={styles.pebbleHeroCairn}>
                <CairnGlyph size={42} />
              </View>
              <Text style={styles.pebbleHeroValue}>{profile.lifetimePebbles ?? 0}</Text>
              <Text style={styles.pebbleHeroLabel}>pebbles placed</Text>
              <Text style={styles.pebbleHeroHint}>
                Every task you've finished, since you started.
              </Text>
            </View>

            <Text style={styles.privacySectionLabel}>YOUR DATA</Text>
            <View style={styles.privacyCard}>
              <Text style={styles.privacyText}>
                Your tasks live in your account. They're encrypted in
                transit, scoped to you on every read, and never sold,
                analyzed, or shared.
              </Text>
              <Text style={styles.privacyText}>
                When you delete your account, everything you've added is
                removed from the cloud the same moment.
              </Text>
            </View>

            {exportSnapshot && (
              <TouchableOpacity
                style={styles.exportBtn}
                onPress={async () => {
                  try {
                    const json = exportSnapshot();
                    await Share.share({
                      title: 'Sagely export',
                      message: json,
                    });
                  } catch {
                    /* User dismissed or share failed — no-op */
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Export my data as JSON"
              >
                <Text style={styles.exportBtnText}>Export my data</Text>
              </TouchableOpacity>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                disabled={deleting}
                hitSlop={10}
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
                          setDeleting(true);
                          try {
                            await deleteAccount();
                            onClose();
                          } catch (err) {
                            const code = (err as { name?: string } | null)
                              ?.name;
                            const message =
                              code === "RecentLoginRequiredError"
                                ? t.deleteAccountReauth
                                : err instanceof Error
                                  ? err.message
                                  : String(err);
                            Alert.alert(t.deleteAccount, message);
                          } finally {
                            setDeleting(false);
                          }
                        },
                      },
                    ],
                    { cancelable: true },
                  );
                }}
              >
                <Text
                  style={[
                    styles.deleteInlineText,
                    deleting && styles.deleteInlineTextDisabled,
                  ]}
                >
                  {deleting ? t.deleting : t.deleteAccount}
                </Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  signOut();
                }}
                hitSlop={10}
              >
                <Text style={styles.signOutInlineText}>{t.signOut}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.aboutFooter}>
              <TouchableOpacity
                onPress={() => {
                  onSave({ ...profile, onboardingDone: false });
                  onClose();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="View Mochi's intro again"
              >
                <Text style={styles.aboutLink}>View intro again</Text>
              </TouchableOpacity>
              <Text style={styles.aboutTagline}>
                Sagely · for brains that get overwhelmed by to-do lists.
              </Text>
              <Text style={styles.aboutVersion}>v1.0.1 · Mochi the turtle is the brand mascot.</Text>
            </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.modal,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 28,
      // Cap the sheet so it can't push above the safe area; without this
      // the title row hides behind the iOS status bar / notch.
      maxHeight: "88%",
    },
    handle: {
      alignSelf: "center",
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.gray3,
      marginBottom: 12,
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: c.label,
      letterSpacing: -0.2,
    },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 14,
    },
    avatarBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: c.bg,
    },
    avatarBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.blue,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "none",
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 8,
    },
    presetGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    presetItem: {
      padding: 2,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "transparent",
    },
    presetActive: {
      borderColor: c.label,
    },
    field: {
      marginBottom: 12,
    },
    fieldRow: { flexDirection: "row", gap: 10 },
    fieldHalf: { flex: 1 },
    label: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "none",
      letterSpacing: 0.6,
      color: c.label3,
      marginBottom: 6,
    },
    input: {
      height: 38,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      fontSize: 14,
      color: c.label,
      backgroundColor: c.bg,
    },
    inputMulti: {
      height: 56,
      paddingTop: 8,
      paddingBottom: 8,
      textAlignVertical: "top",
    },
    inputItalic: {
      fontStyle: "italic",
    },
    helper: {
      marginTop: 6,
      fontSize: 11,
      color: c.label3,
      lineHeight: 14,
    },
    langRow: {
      flexDirection: "row",
      gap: 8,
    },
    langBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    langBtnActive: {
      backgroundColor: c.blue,
      borderColor: c.blue,
    },
    langBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.label,
    },
    langBtnTextActive: {
      color: "#fff",
    },
    pebbleHero: {
      // Hero card — the user's "look what I built" moment. Full-width
      // cairn glyph + large count + supporting copy, centered.
      alignItems: "center",
      paddingVertical: 24,
      paddingHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: c.primarySoft,
    },
    pebbleHeroCairn: {
      marginBottom: 8,
    },
    pebbleHeroValue: {
      fontSize: 36,
      lineHeight: 40,
      color: c.primary,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      letterSpacing: -0.6,
    },
    pebbleHeroLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: c.label2,
      letterSpacing: 0.2,
      marginTop: 2,
    },
    pebbleHeroHint: {
      fontSize: 12,
      color: c.label3,
      fontStyle: "italic",
      textAlign: "center",
      marginTop: 10,
      maxWidth: 260,
    },
    checkinTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginTop: -4,
      marginBottom: 4,
      borderRadius: 10,
      backgroundColor: c.bg,
    },
    checkinTimeLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: c.label2,
    },
    checkinTimeValue: {
      fontSize: 14,
      fontWeight: "700",
      color: c.primary,
      fontVariant: ["tabular-nums"],
    },
    checkinTimePickerWrap: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingVertical: 4,
      marginBottom: 8,
      alignItems: "center",
    },
    privacySectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      color: c.label3,
      marginTop: 18,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    privacyCard: {
      backgroundColor: c.bg,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      marginBottom: 8,
    },
    privacyText: {
      fontSize: 13,
      color: c.label2,
      lineHeight: 19,
    },
    exportBtn: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 4,
      alignItems: "flex-start",
    },
    exportBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.primary,
      letterSpacing: -0.16,
    },
    scrollBody: {
      flexShrink: 1,
    },
    scrollBodyContent: {
      paddingBottom: 12,
    },
    aboutFooter: {
      paddingTop: 24,
      paddingBottom: 12,
      alignItems: "center",
      gap: 6,
    },
    aboutLink: {
      fontSize: 13,
      color: c.primary,
      fontWeight: "600",
      paddingVertical: 4,
    },
    aboutTagline: {
      fontSize: 12,
      color: c.label3,
      fontStyle: "italic",
      textAlign: "center",
    },
    aboutVersion: {
      fontSize: 11,
      color: c.label3,
      textAlign: "center",
      letterSpacing: 0.2,
    },
    actions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 4,
    },
    btn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: c.bg,
    },
    btnPrimary: {
      backgroundColor: c.blue,
    },
    btnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.label,
    },
    btnPrimaryText: {
      color: "#fff",
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    toggleHint: {
      fontSize: 12,
      color: c.label2,
      marginTop: 2,
      lineHeight: 16,
    },
    toggleTrack: {
      width: 50,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.gray3,
      padding: 3,
      justifyContent: "center",
    },
    toggleTrackOn: {
      backgroundColor: c.blue,
    },
    toggleKnob: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#fff",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 2,
      elevation: 2,
    },
    toggleKnobOn: {
      transform: [{ translateX: 20 }],
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 14,
      marginBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    pickForMeText: {
      fontSize: 13,
      color: c.blue,
      fontWeight: "600",
    },
    pickForMeTextDisabled: {
      color: c.gray3,
    },
    titleSideBtn: {
      minWidth: 56,
    },
    cancelHeaderText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: "500",
    },
    saveHeaderText: {
      fontSize: 15,
      color: c.blue,
      fontWeight: "700",
      textAlign: "right",
    },
    signOutInlineText: {
      fontSize: 14,
      color: c.label2,
      fontWeight: "500",
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    deleteInlineText: {
      fontSize: 14,
      color: c.label3,
      fontWeight: "500",
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    deleteInlineTextDisabled: {
      opacity: 0.5,
    },
  });
}
