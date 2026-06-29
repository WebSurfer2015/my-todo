import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Shuffle, Camera } from "lucide-react-native";
import SheetShell from "../../../ui/SheetShell";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Profile,
  Avatar as AvatarT,
  AVATAR_LIBRARY,
  type QuoteMode,
} from "../../../core-bindings/profile";
import { todayLocal } from "../../../../../core/src/logic/utils";
import { DAILY_QUOTES, dailyQuoteIndex, quoteAt } from "../../../../../core/src/data/quotes";

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
import Avatar from "../../../ui/Avatar";
import { useLang } from "../../../app/LangContext";
import { useAuth } from "../../../app/AuthContext";
import { useTheme, ThemeColors } from "../../../app/theme";

import { makeStyles } from "./styles";

interface Props {
  visible: boolean;
  profile: Profile;
  onSave: (p: Profile) => void;
  onClose: () => void;
}

export default function ProfileSheet({
  visible,
  profile,
  onSave,
  onClose,
}: Props) {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Backfill from `name` for legacy profiles that have a single
  // `name` set but no `firstName`/`lastName` split. Without this,
  // an existing user opens Edit profile and sees Save grayed out
  // (canSave checks firstName.trim()) because the field starts empty.
  const [firstName, setFirstName] = useState(profile.firstName ?? profile.name ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [quote, setQuote] = useState(profile.quote ?? "");
  const [avatar, setAvatar] = useState<AvatarT>(normalizeAvatar(profile.avatar));
  const [quoteMode, setQuoteMode] = useState<QuoteMode>(
    profile.quoteMode ?? "custom",
  );
  const [quoteShuffle, setQuoteShuffle] = useState(profile.quoteShuffle);
  // True while a picked photo is being resized/compressed — a multi-MB crop
  // can take a beat, and a frozen-looking avatar reads as broken.
  const [photoBusy, setPhotoBusy] = useState(false);

  // Today's daily quote (honoring a same-day "show me another" shuffle).
  // Shown as a muted preview when the quote source is "Daily".
  const today = todayLocal();
  const dailyIndex =
    quoteShuffle?.date === today ? quoteShuffle.index : dailyQuoteIndex(today);
  const dailyPreview = quoteAt(dailyIndex);

  // "Random daily": EVERY tap advances to a fresh quote, different from the
  // one currently on screen. (The old two-step — first tap shows today's fixed
  // quote, second tap shuffles — read as a 2-click cycle that never moved.)
  function onRandomDaily() {
    const current = quoteMode === "daily" ? dailyIndex : -1;
    let next = current;
    if (DAILY_QUOTES.length > 1) {
      while (next === current) next = Math.floor(Math.random() * DAILY_QUOTES.length);
    } else {
      next = 0;
    }
    setQuoteShuffle({ date: today, index: next });
    if (quoteMode !== "daily") setQuoteMode("daily");
    Haptics.selectionAsync().catch(() => {});
  }

  React.useEffect(() => {
    if (visible) {
      setFirstName(profile.firstName ?? profile.name ?? "");
      setLastName(profile.lastName ?? "");
      setQuote(profile.quote ?? "");
      setQuoteMode(profile.quoteMode ?? "custom");
      setQuoteShuffle(profile.quoteShuffle);
      setAvatar(normalizeAvatar(profile.avatar));
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
      setPhotoBusy(true);
      try {
        setAvatar({ kind: "image", uri: await compressToDataUri(result.assets[0].uri) });
      } catch (err) {
        Alert.alert("Photo error", err instanceof Error ? err.message : String(err));
      } finally {
        setPhotoBusy(false);
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
      setPhotoBusy(true);
      try {
        setAvatar({ kind: "image", uri: await compressToDataUri(result.assets[0].uri) });
      } catch (err) {
        Alert.alert("Photo error", err instanceof Error ? err.message : String(err));
      } finally {
        setPhotoBusy(false);
      }
    }
  }

  function useMochiAvatar() {
    setAvatar({ kind: "preset", key: "mochi" });
  }

  function openAvatarPicker() {
    const cancelLabel = t.cancel;
    // Offer a way back to the Mochi mascot once a photo is set — otherwise the
    // user is trapped in their chosen photo with no "remove" path.
    const hasPhoto = avatar.kind === "image";
    if (Platform.OS === "ios") {
      const options = hasPhoto
        ? [t.profileTakePhoto, t.profileChooseLibrary, "Use Mochi", cancelLabel]
        : [t.profileTakePhoto, t.profileChooseLibrary, cancelLabel];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: hasPhoto ? 3 : 2,
        },
        (i) => {
          if (i === 0) takePhoto();
          else if (i === 1) pickFromLibrary();
          else if (hasPhoto && i === 2) useMochiAvatar();
        },
      );
    } else {
      Alert.alert(t.profileChangePhoto, undefined, [
        { text: t.profileTakePhoto, onPress: takePhoto },
        { text: t.profileChooseLibrary, onPress: pickFromLibrary },
        ...(hasPhoto ? [{ text: "Use Mochi", onPress: useMochiAvatar }] : []),
        { text: cancelLabel, style: "cancel" as const },
      ]);
    }
  }

  const canSave = firstName.trim().length > 0;
  function commit() {
    const trimmedFirst = firstName.trim();
    onSave({
      ...profile,
      name: trimmedFirst,
      firstName: trimmedFirst,
      lastName: lastName.trim() || undefined,
      quote: quote.trim() || undefined,
      quoteMode,
      quoteShuffle: quoteMode === "daily" ? quoteShuffle : undefined,
      avatar,
      density: "comfortable",
      title: profile.title,
      // Preserve whatever reduceMotion the user has set in Settings.
      // The previous `reduceMotion: true` here was a bug — saving
      // the profile silently forced motion off for everyone, which
      // killed the check-off flight animation.
    });
  }
  function handleSave() {
    if (!firstName.trim()) {
      // Don't silently swallow the Save tap — tell the user why
      // nothing happens. (Save is also visually disabled when
      // first name is empty, but voice/keyboard nav can still
      // fire onPress.)
      Alert.alert("Add a first name", "First name can't be empty.");
      return;
    }
    commit();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  }
  // Backdrop / swipe dismiss: auto-save edits to this existing profile
  // (calm, forgiving) when there's a valid name; otherwise just close — a
  // nameless profile can't be persisted anyway.
  function handleDismiss() {
    if (canSave) commit();
    onClose();
  }

  return (
    <SheetShell
      visible={visible}
      onClose={handleDismiss}
      title={t.editProfile}
      primary={{ label: t.save, onPress: handleSave, disabled: !canSave }}
    >
            {/* Avatar hero — centered identity with a camera badge.
                Tapping the avatar (or badge) opens the photo picker;
                the standalone "Change photo" button is gone. */}
            <View style={styles.avatarHero}>
              <TouchableOpacity
                onPress={openAvatarPicker}
                activeOpacity={0.85}
                style={styles.avatarTouch}
                accessibilityRole="button"
                accessibilityLabel={t.profileChangePhoto}
              >
                <Avatar avatar={avatar} size={92} />
                {photoBusy && (
                  <View style={styles.avatarBusy}>
                    <ActivityIndicator color={theme.primaryOn} />
                  </View>
                )}
                <View style={styles.avatarBadge}>
                  <Camera size={15} color={theme.primaryOn} strokeWidth={2.2} />
                </View>
              </TouchableOpacity>
            </View>

            {/* NAME */}
            <View style={styles.card}>
              <View style={styles.cardFieldRow}>
                <View style={[styles.cardField, styles.cardFieldHalf]}>
                  <Text style={styles.cardFieldLabel}>
                    {t.profileFirstNameLabel}
                    <Text style={{ color: theme.red }}> *</Text>
                  </Text>
                  <TextInput
                    style={styles.cardFieldInput}
                    value={firstName}
                    onChangeText={setFirstName}
                    maxLength={40}
                    autoComplete="given-name"
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
                <View style={styles.cardFieldVDivider} />
                <View style={[styles.cardField, styles.cardFieldHalf]}>
                  <Text style={styles.cardFieldLabel}>{t.profileLastNameLabel}</Text>
                  <TextInput
                    style={styles.cardFieldInput}
                    value={lastName}
                    onChangeText={setLastName}
                    maxLength={40}
                    autoComplete="family-name"
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>

            {/* QUOTE — section label + the Random daily action on one line.
                "Random daily" fills the box with the rotating daily quote;
                tap again for another. Typing switches to a custom line;
                clearing it shows none. */}
            <View style={styles.quoteHeader}>
              <Text style={styles.quoteHeaderLabel}>QUOTE</Text>
              <TouchableOpacity
                onPress={onRandomDaily}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Random daily quote"
                accessibilityState={{ selected: quoteMode === "daily" }}
              >
                <View style={[styles.randomDailyChip, quoteMode === "daily" && styles.randomDailyChipActive]}>
                  <Shuffle
                    size={13}
                    color={quoteMode === "daily" ? theme.primaryOn : theme.primary}
                    strokeWidth={2.4}
                  />
                  <Text style={[styles.randomDailyText, quoteMode === "daily" && styles.randomDailyTextActive]}>
                    Random daily
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              <View style={styles.cardField}>
                <TextInput
                  style={[styles.cardFieldInput, styles.cardFieldInputMulti, styles.inputItalic]}
                  value={quoteMode === "daily" ? dailyPreview : quote}
                  onChangeText={(text) => {
                    setQuote(text);
                    setQuoteMode("custom");
                  }}
                  placeholder={t.profileQuotePlaceholder}
                  placeholderTextColor={theme.gray3}
                  multiline
                  maxLength={128}
                />
                <Text style={styles.helper}>
                  {quoteMode === "daily"
                    ? "A fresh quote each day. Tap Random daily for another."
                    : "Shown under your greeting. Leave blank for none."}
                </Text>
              </View>
            </View>

            {/* ACCOUNT — email + a full-width destructive Sign out row.
                (Export / Delete data / Delete account live in Settings.) */}
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.card}>
              <View style={styles.accountEmailRow}>
                <Text style={styles.accountEmailText} numberOfLines={1}>
                  {user?.email ?? "Not signed in"}
                </Text>
              </View>
              {user && (
                <>
                  <View style={styles.cardDivider} />
                  <TouchableOpacity
                    style={styles.accountSignOutRow}
                    onPress={() => {
                      Alert.alert(t.signOut, "You'll be returned to the sign-in screen. Your data stays in your account.", [
                        { text: t.cancel, style: "cancel" },
                        {
                          text: t.signOut,
                          style: "destructive",
                          onPress: () => {
                            onClose();
                            signOut();
                          },
                        },
                      ]);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t.signOut}
                  >
                    <Text style={styles.accountSignOutText}>{t.signOut}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={{ height: 24 }} />
    </SheetShell>
  );
}

