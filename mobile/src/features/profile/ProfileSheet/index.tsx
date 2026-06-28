import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { Shuffle } from "lucide-react-native";
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
    profile.quoteMode ?? (profile.quote?.trim() ? "custom" : "daily"),
  );
  const [quoteShuffle, setQuoteShuffle] = useState(profile.quoteShuffle);

  // Today's daily quote (honoring a same-day "show me another" shuffle).
  // Shown as a muted preview when the quote source is "Daily".
  const today = todayLocal();
  const dailyIndex =
    quoteShuffle?.date === today ? quoteShuffle.index : dailyQuoteIndex(today);
  const dailyPreview = quoteAt(dailyIndex);

  function shuffleDailyQuote() {
    let next = dailyIndex;
    if (DAILY_QUOTES.length > 1) {
      while (next === dailyIndex) next = Math.floor(Math.random() * DAILY_QUOTES.length);
    }
    setQuoteShuffle({ date: today, index: next });
    Haptics.selectionAsync().catch(() => {});
  }

  // "Random daily": first tap fills the box with today's daily quote;
  // tapping again (already in daily mode) rerolls to a different one.
  function onRandomDaily() {
    if (quoteMode !== "daily") {
      setQuoteShuffle(undefined);
      setQuoteMode("daily");
      Haptics.selectionAsync().catch(() => {});
    } else {
      shuffleDailyQuote();
    }
  }

  React.useEffect(() => {
    if (visible) {
      setFirstName(profile.firstName ?? profile.name ?? "");
      setLastName(profile.lastName ?? "");
      setQuote(profile.quote ?? "");
      setQuoteMode(profile.quoteMode ?? (profile.quote?.trim() ? "custom" : "daily"));
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

  const canSave = firstName.trim().length > 0;
  function handleSave() {
    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      // Don't silently swallow the Save tap — tell the user why
      // nothing happens. (Save is also visually disabled when
      // first name is empty, but voice/keyboard nav can still
      // fire onPress.)
      Alert.alert("Add a first name", "First name can't be empty.");
      return;
    }
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
  }

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      title={t.editProfile}
      primary={{ label: t.save, onPress: handleSave, disabled: !canSave }}
    >
            {/* Avatar header */}
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

            {/* IDENTITY (first+last on one row, then quote) — no section
                label; the fields speak for themselves. Sits above YOUR
                JOURNEY so the user lands on editable name fields first
                and the pebble hero feels like a reward below. */}
            <View style={[styles.card, styles.cardWithTopGap]}>
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
              <View style={styles.cardDivider} />
              <View style={styles.cardField}>
                <View style={styles.labelRow}>
                  <Text style={styles.cardFieldLabel}>Quote</Text>
                  {/* "Random daily" fills the box with the rotating daily
                      quote; tap again for another. Typing your own switches
                      to a custom line; clearing it shows none. */}
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

            {/* Bottom actions (Export / Delete data / Delete account)
                live in SettingsSheet, not here. Profile stays identity-
                only — the gear icon in the header opens Settings, which
                hosts the DATA section. */}

            {/* Signed-in identity line — sits right above Sign out so the
                account context reads as a unit with the account action. */}
            <Text style={styles.signedInLine} numberOfLines={1}>
              {user?.email ? `You're signed in as  ${user.email}` : 'Not signed in'}
            </Text>

            {/* Sign Out — destructive, so it sits at the bottom (not the
                Cancel slot). Disabled when there's no signed-in user. */}
            {user && (
              <TouchableOpacity
                style={styles.signOutRow}
                onPress={() => {
                  onClose();
                  signOut();
                }}
                accessibilityRole="button"
                accessibilityLabel={t.signOut}
              >
                <Text style={styles.signOutRowText}>{t.signOut}</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 24 }} />
    </SheetShell>
  );
}

