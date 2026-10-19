import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  BackHandler,
  Image,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import crashlytics from "@react-native-firebase/crashlytics";
import { useAuth } from "../../app/AuthContext";
import { useLang } from "../../app/LangContext";
import { useTheme, ThemeColors, SPACING, RADIUS, TYPE } from "../../app/theme";
import { Lang, LANG_NAMES, LANG_ORDER } from "../../../../core/src/data/i18n";
import { LANGUAGE_PICKER_ENABLED } from "../../app/featureFlags";
import { authErrorCode, mapAuthError, AuthFlow } from "../../adapters/authErrors";

type Mode = "social" | "signin" | "signup" | "reset";

export default function SignIn() {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const {
    signIn,
    signUp,
    signInWithApple,
    signInWithGoogle,
    resetPassword,
    appleAvailable,
  } = useAuth();
  const [mode, setMode] = useState<Mode>("social");
  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Android hardware back: from an email sub-flow, go back to the social
  // screen instead of exiting the app (the platform-expected behavior).
  useEffect(() => {
    if (Platform.OS !== "android" || mode === "social") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      switchMode("social");
      return true;
    });
    return () => sub.remove();
  }, [mode]);

  function switchMode(next: Mode) {
    setError(null);
    setResetSent(false);
    setMode(next);
  }

  async function submit() {
    if (mode === "signup" && !firstName.trim()) {
      setError(t.firstNameRequired);
      return;
    }
    if (mode !== "reset" && password.length < 6) {
      // Catch the too-short case before spending a network round-trip on it.
      setError(t.passwordTooShort);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else if (mode === "signup") {
        await signUp(email.trim(), password, { firstName, lastName });
      } else if (mode === "reset") {
        await resetPassword(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      console.error("[auth] email sign-in failed", err);
      try {
        crashlytics().log(`auth error code (email): ${authErrorCode(err) || "(none)"}`);
        crashlytics().recordError(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // best-effort
      }
      setError(mapAuthError(err, "email"));
    } finally {
      setBusy(false);
    }
  }

  async function withProvider(fn: () => Promise<void>, flow: AuthFlow) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // suppress user-cancellation across all 3 SDKs
      if (
        code === "ERR_REQUEST_CANCELED" ||
        code === "SIGN_IN_CANCELLED" ||
        code === "12501" /* Google Android cancel */
      ) {
        return;
      }
      console.error("[auth] sign-in failed", { flow, code, err });
      try {
        crashlytics().log(`auth error code (${flow}): ${authErrorCode(err) || "(none)"}`);
        crashlytics().recordError(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // never let crash reporting take down sign-in
      }
      setError(mapAuthError(err, flow));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.kb}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {LANGUAGE_PICKER_ENABLED && <LangPicker theme={theme} />}

            <Image
              source={require("../../../assets/icon.png")}
              style={styles.icon}
              accessibilityLabel="Sagely"
            />
            <Text style={styles.title}>Sagely</Text>
            <Text style={styles.subtitle}>
              {mode === "reset" ? t.resetPasswordPrompt : t.signInTagline}
            </Text>

            {/* SOCIAL PROVIDERS — Apple, Google */}
            {mode !== "reset" && mode === "social" && (
              <View style={styles.providers}>
                {error && <Text style={styles.error}>{error}</Text>}
                {busy && (
                  <ActivityIndicator
                    style={{ marginVertical: 8 }}
                    color="#999"
                    accessibilityLabel="Signing in"
                  />
                )}
                {appleAvailable && (
                  <View
                    pointerEvents={busy ? "none" : "auto"}
                    style={busy ? { opacity: 0.5 } : undefined}
                  >
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={
                        theme.bg === "#000000"
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={10}
                      style={styles.appleButton}
                      onPress={() => withProvider(signInWithApple, "apple")}
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.socialBtn, styles.googleBtn, busy && { opacity: 0.5 }]}
                  onPress={() => withProvider(signInWithGoogle, "google")}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={styles.googleText}>{t.signInWithGoogle}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggle}
                  onPress={() => switchMode("signin")}
                  disabled={busy}
                  testID="signin-with-email"
                >
                  <Text style={styles.toggleEmphasis}>{t.signInWithEmail}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggle}
                  onPress={() => switchMode("signup")}
                  disabled={busy}
                >
                  <Text style={styles.toggleText}>{t.createAccountToggle}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* EMAIL FORM */}
            {mode !== "social" && (
              <>
                {mode === "signup" && (
                  <View style={styles.fieldRow}>
                    <View style={[styles.field, styles.fieldHalf]}>
                      <Text style={styles.label}>
                        {t.profileFirstNameLabel}
                        <Text style={styles.required}> *</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={firstName}
                        onChangeText={setFirstName}
                        autoComplete="given-name"
                        autoCapitalize="words"
                        autoFocus
                        maxLength={40}
                        editable={!busy}
                        returnKeyType="next"
                        onSubmitEditing={() => emailRef.current?.focus()}
                      />
                    </View>
                    <View style={[styles.field, styles.fieldHalf]}>
                      <Text style={styles.label}>{t.profileLastNameLabel}</Text>
                      <TextInput
                        style={styles.input}
                        value={lastName}
                        onChangeText={setLastName}
                        autoComplete="family-name"
                        autoCapitalize="words"
                        maxLength={40}
                        editable={!busy}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={styles.label}>{t.emailLabel}</Text>
                  <TextInput
                    ref={emailRef}
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    keyboardType="email-address"
                    inputMode="email"
                    clearButtonMode="while-editing"
                    autoFocus={mode !== "signup"}
                    editable={!busy}
                    returnKeyType={mode === "reset" ? "go" : "next"}
                    blurOnSubmit={mode === "reset"}
                    onSubmitEditing={() =>
                      mode === "reset" ? submit() : passwordRef.current?.focus()
                    }
                    testID="signin-email-input"
                  />
                </View>

                {mode !== "reset" && (
                  <View style={styles.field}>
                    <View style={styles.passwordLabelRow}>
                      <Text style={styles.label}>{t.passwordLabel}</Text>
                      <TouchableOpacity
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                      >
                        <Text style={styles.showPwText}>
                          {showPassword ? "Hide" : "Show"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      ref={passwordRef}
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      textContentType={mode === "signin" ? "password" : "newPassword"}
                      editable={!busy}
                      returnKeyType="go"
                      onSubmitEditing={() => submit()}
                      testID="signin-password-input"
                    />
                  </View>
                )}

                {error && <Text style={styles.error}>{error}</Text>}
                {resetSent && mode === "reset" && (
                  <Text style={styles.success}>{t.resetEmailSent}</Text>
                )}

                <TouchableOpacity
                  style={[styles.submit, busy && styles.submitDisabled]}
                  onPress={submit}
                  disabled={busy}
                  activeOpacity={0.8}
                  testID="signin-submit"
                >
                  {busy ? (
                    <ActivityIndicator color={theme.primaryOn} />
                  ) : (
                    <Text style={styles.submitText}>
                      {mode === "signin"
                        ? t.signInAction
                        : mode === "signup"
                          ? t.createAccountAction
                          : t.sendResetEmail}
                    </Text>
                  )}
                </TouchableOpacity>

                {mode === "signin" && (
                  <TouchableOpacity
                    style={styles.toggle}
                    onPress={() => switchMode("reset")}
                  >
                    <Text style={styles.toggleText}>{t.forgotPassword}</Text>
                  </TouchableOpacity>
                )}

                {(mode === "signup" || mode === "reset") && (
                  <TouchableOpacity
                    style={styles.toggle}
                    onPress={() => switchMode("signin")}
                  >
                    <Text style={styles.toggleText}>
                      {mode === "reset"
                        ? t.backToSignIn
                        : t.haveAccountToggle}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.toggle}
                  onPress={() => switchMode("social")}
                >
                  <Text style={styles.toggleText}>{t.backToAllOptions}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Tap to open a Modal listing all 6 languages. Selecting one persists via LangContext. */
function LangPicker({ theme }: { theme: ThemeColors }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const styles = useMemo(() => makeLangPickerStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.btn}
        accessibilityLabel={t.languageLabel}
      >
        <Text style={styles.btnText}>{LANG_NAMES[lang]} ▾</Text>
      </TouchableOpacity>
      {/* Mount the Modal only while open. A mounted (even invisible) RN
          <Modal> flattens the SignIn screen's iOS a11y tree (#15), which
          hid every sign-in control from Maestro and broke the E2E prelude.
          Gating on `open` keeps the SignIn a11y intact when it's closed. */}
      {open && (
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Sibling backdrop tap-layer (not a wrapper) — a wrapping touchable
            collapses the language list into one iOS a11y leaf (#15). */}
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessible={false}
          />
          <View style={styles.sheet}>
            {LANG_ORDER.map((l) => (
              <TouchableOpacity
                key={l}
                style={styles.row}
                onPress={() => {
                  setLang(l as Lang);
                  setOpen(false);
                }}
              >
                <Text style={[styles.rowText, l === lang && styles.rowTextActive]}>
                  {LANG_NAMES[l]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
}

function makeLangPickerStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { alignSelf: "flex-end", marginBottom: SPACING.sm, marginTop: -8 },
    btn: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.chip,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    btnText: { color: c.label2, fontSize: TYPE.caption },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: SPACING.xxl,
    },
    sheet: {
      backgroundColor: c.modal,
      borderRadius: RADIUS.card,
      paddingVertical: SPACING.sm,
      width: "100%",
      maxWidth: 280,
    },
    row: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
    rowText: { fontSize: TYPE.bodyLg, color: c.label, textAlign: "center" },
    rowTextActive: { color: c.blue, fontWeight: "600" },
  });
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    kb: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xl },
    card: {
      backgroundColor: c.card,
      borderRadius: RADIUS.card,
      padding: 28,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 4,
    },
    icon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignSelf: "center",
      marginBottom: SPACING.lg,
      borderWidth: 2,
      borderColor: c.primary,
    },
    title: {
      // 28 is off-ramp (equidistant from TYPE.h2/h1) — kept raw, not snapped.
      fontSize: 28,
      fontWeight: "700",
      color: c.label,
      letterSpacing: -0.5,
      marginBottom: SPACING.sm,
      textAlign: "center",
    },
    subtitle: {
      fontSize: TYPE.body,
      color: c.label2,
      lineHeight: 20,
      marginBottom: SPACING.xl,
      textAlign: "center",
      fontStyle: "italic",
    },
    providers: { gap: SPACING.sm },
    appleButton: { width: "100%", height: 44 },
    socialBtn: {
      width: "100%",
      height: 44,
      borderRadius: RADIUS.control,
      alignItems: "center",
      justifyContent: "center",
    },
    googleBtn: {
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#dadce0",
    },
    googleText: { color: "#1f1f1f", fontSize: TYPE.body, fontWeight: "500" },
    toggleEmphasis: { color: c.label, fontSize: TYPE.body, fontWeight: "500" },
    field: { marginBottom: SPACING.md },
    fieldRow: { flexDirection: "row", gap: SPACING.sm },
    fieldHalf: { flex: 1 },
    required: { color: c.label2 },
    label: {
      fontSize: TYPE.caption,
      color: c.label2,
      fontWeight: "600",
      marginBottom: SPACING.xs,
    },
    passwordLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    showPwText: {
      fontSize: TYPE.caption,
      color: c.primary,
      fontWeight: "600",
      marginBottom: SPACING.xs,
    },
    input: {
      // ~44pt field (was ~40pt) — primary entry points deserve a full target.
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      fontSize: TYPE.body,
      color: c.label,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: RADIUS.control,
    },
    error: {
      fontSize: TYPE.footnote,
      color: c.label2,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    success: {
      fontSize: TYPE.footnote,
      color: c.green,
      backgroundColor: "rgba(52,199,89,0.10)",
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.md,
      borderRadius: 6,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    submit: {
      marginTop: SPACING.sm,
      backgroundColor: c.primary,
      borderRadius: RADIUS.control,
      // ~48pt — this is the app's primary CTA across all auth modes.
      paddingVertical: SPACING.lg,
      alignItems: "center",
    },
    submitDisabled: { opacity: 0.6 },
    // On-accent ink (white in light, dark ink in dark) — AA on every accent.
    submitText: { color: c.primaryOn, fontSize: TYPE.body, fontWeight: "600" },
    toggle: { marginTop: SPACING.lg, alignItems: "center", padding: SPACING.sm },
    toggleText: { color: c.blue, fontSize: TYPE.footnote },
  });
}
