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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  Profile,
  Avatar as AvatarT,
  AVATAR_LIBRARY,
  Density,
} from "../profile";
import Avatar from "./Avatar";
import { useLang } from "../LangContext";
import { useAuth } from "../AuthContext";
import { useTheme, ThemeColors } from "../theme";

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
  const { t, lang, toggle: toggleLang } = useLang();
  const { signOut, deleteAccount } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title ?? "");
  const [quote, setQuote] = useState(profile.quote ?? "");
  const [avatar, setAvatar] = useState<AvatarT>(profile.avatar);
  const [density, setDensity] = useState<Density>(
    profile.density ?? "comfortable",
  );
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(profile.name);
      setTitle(profile.title ?? "");
      setQuote(profile.quote ?? "");
      setAvatar(profile.avatar);
      setDensity(profile.density ?? "comfortable");
    }
  }, [visible, profile]);

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
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setAvatar({ kind: "image", uri });
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
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setAvatar({ kind: "image", uri });
    }
  }

  function openAvatarPicker() {
    const cancelLabel = lang === "en" ? "Cancel" : "取消";
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
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      name: trimmed,
      quote: quote.trim() || undefined,
      avatar,
      density,
      title: title.trim() || undefined,
    });
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
            <Text style={styles.title}>{t.editProfile}</Text>

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

            <View style={styles.field}>
              <Text style={styles.label}>{t.profileNameLabel}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                maxLength={40}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.profileTitleLabel}</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t.profileTitlePlaceholder}
                placeholderTextColor={theme.gray3}
                maxLength={64}
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.profileQuoteLabel}</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={quote}
                onChangeText={setQuote}
                placeholder={t.profileQuotePlaceholder}
                placeholderTextColor={theme.gray3}
                multiline
                maxLength={24}
              />
              <Text style={styles.helper}>{t.profileGreetingHelper}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.languageLabel}</Text>
              <View style={styles.langRow}>
                <TouchableOpacity
                  style={[
                    styles.langBtn,
                    lang === "en" && styles.langBtnActive,
                  ]}
                  onPress={() => lang !== "en" && toggleLang()}
                >
                  <Text
                    style={[
                      styles.langBtnText,
                      lang === "en" && styles.langBtnTextActive,
                    ]}
                  >
                    EN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.langBtn,
                    lang === "zh" && styles.langBtnActive,
                  ]}
                  onPress={() => lang !== "zh" && toggleLang()}
                >
                  <Text
                    style={[
                      styles.langBtnText,
                      lang === "zh" && styles.langBtnTextActive,
                    ]}
                  >
                    中文
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t.densityLabel}</Text>
              <View style={styles.langRow}>
                <TouchableOpacity
                  style={[
                    styles.langBtn,
                    density === "comfortable" && styles.langBtnActive,
                  ]}
                  onPress={() => setDensity("comfortable")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: density === "comfortable" }}
                >
                  <Text
                    style={[
                      styles.langBtnText,
                      density === "comfortable" && styles.langBtnTextActive,
                    ]}
                  >
                    {t.densityComfortable}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.langBtn,
                    density === "compact" && styles.langBtnActive,
                  ]}
                  onPress={() => setDensity("compact")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: density === "compact" }}
                >
                  <Text
                    style={[
                      styles.langBtnText,
                      density === "compact" && styles.langBtnTextActive,
                    ]}
                  >
                    {t.densityCompact}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.signOut}
              onPress={() => {
                onClose();
                signOut();
              }}
            >
              <Text style={styles.signOutText}>{t.signOut}</Text>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={handleSave}
              >
                <Text style={[styles.btnText, styles.btnPrimaryText]}>
                  {t.save}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dangerZone}>
              <Text style={styles.dangerText}>
                {t.deleteAccountDescription}
              </Text>
              <TouchableOpacity
                style={[styles.dangerBtn, deleting && styles.dangerBtnDisabled]}
                disabled={deleting}
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
                <Text style={styles.dangerBtnText}>
                  {deleting ? t.deleting : t.deleteAccount}
                </Text>
              </TouchableOpacity>
            </View>
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
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 28,
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
      marginBottom: 14,
      color: c.label,
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
      textTransform: "uppercase",
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
    label: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
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
    signOut: {
      alignItems: "center",
      paddingVertical: 10,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
    },
    signOutText: {
      fontSize: 13,
      color: c.red,
      fontWeight: "500",
    },
    dangerZone: {
      marginTop: 18,
      paddingTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.separator,
      gap: 8,
    },
    dangerText: {
      fontSize: 12,
      color: c.label2,
      lineHeight: 16,
    },
    dangerBtn: {
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.red,
    },
    dangerBtnDisabled: { opacity: 0.5 },
    dangerBtnText: {
      fontSize: 13,
      color: c.red,
      fontWeight: "500",
    },
  });
}
