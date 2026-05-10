import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../AuthContext";
import { useLang } from "../LangContext";
import { useTheme, ThemeColors } from "../theme";

export default function SignIn() {
  const { t } = useLang();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { signIn, signUp, signInWithApple, resetPassword, appleAvailable } =
    useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: "signin" | "signup" | "reset") {
    setError(null);
    setResetSent(false);
    setMode(next);
  }

  async function submit() {
    if (mode === "signup" && !firstName.trim()) {
      setError("First name is required");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else if (mode === "signup") {
        await signUp(email.trim(), password, { firstName, lastName });
      } else {
        await resetPassword(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setError(null);
    setBusy(true);
    try {
      await signInWithApple();
    } catch (err) {
      // User cancellation throws code "ERR_REQUEST_CANCELED"; suppress.
      const code = (err as { code?: string } | null)?.code;
      if (code !== "ERR_REQUEST_CANCELED") {
        setError(err instanceof Error ? err.message : String(err));
      }
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
        <View style={styles.card}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.icon}
            accessibilityLabel="My Todo"
          />
          <Text style={styles.title}>My Todo</Text>
          <Text style={styles.subtitle}>
            {mode === "reset" ? t.resetPasswordPrompt : "Get things done"}
          </Text>

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
                  maxLength={40}
                  editable={!busy}
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
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!busy}
            />
          </View>

          {mode !== "reset" && (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                editable={!busy}
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
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
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

          <TouchableOpacity
            style={styles.toggle}
            onPress={() =>
              switchMode(
                mode === "reset"
                  ? "signin"
                  : mode === "signin"
                    ? "signup"
                    : "signin",
              )
            }
          >
            <Text style={styles.toggleText}>
              {mode === "reset"
                ? t.backToSignIn
                : mode === "signin"
                  ? "Don't have an account? Create one"
                  : "Already have an account? Sign in"}
            </Text>
          </TouchableOpacity>

          {mode !== "reset" && appleAvailable && (
            <View style={styles.appleSection}>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  mode === "signin"
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                }
                buttonStyle={
                  theme.bg === "#000000"
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={10}
                style={styles.appleButton}
                onPress={handleApple}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    kb: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 28,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 4,
    },
    icon: {
      width: 72,
      height: 72,
      borderRadius: 16,
      alignSelf: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: c.label,
      letterSpacing: -0.4,
      marginBottom: 6,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 13,
      color: c.label2,
      lineHeight: 18,
      marginBottom: 20,
      textAlign: "center",
    },
    field: { marginBottom: 12 },
    fieldRow: { flexDirection: "row", gap: 10 },
    fieldHalf: { flex: 1 },
    required: { color: c.red },
    label: {
      fontSize: 12,
      color: c.label2,
      fontWeight: "600",
      marginBottom: 4,
    },
    input: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      color: c.label,
      backgroundColor: c.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: 8,
    },
    error: {
      fontSize: 13,
      color: c.red,
      backgroundColor: "rgba(255,59,48,0.08)",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    success: {
      fontSize: 13,
      color: c.green,
      backgroundColor: "rgba(52,199,89,0.10)",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    submit: {
      marginTop: 8,
      backgroundColor: c.blue,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    submitDisabled: { opacity: 0.6 },
    submitText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    toggle: { marginTop: 14, alignItems: "center", padding: 6 },
    toggleText: { color: c.blue, fontSize: 13 },
    appleSection: { marginTop: 16 },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
    },
    dividerText: {
      marginHorizontal: 10,
      color: c.label2,
      fontSize: 12,
    },
    appleButton: { width: "100%", height: 44 },
  });
}
