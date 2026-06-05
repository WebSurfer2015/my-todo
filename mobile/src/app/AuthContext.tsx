import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  FirebaseAuthTypes,
  AppleAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "@react-native-firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "@react-native-firebase/firestore";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { auth, db } from "../adapters/firebase";
import { stateDocPath } from "../../../core/src/ports/persistence";
import { runDeleteAccount } from "../../../core/src/store";
import { Analytics } from "../adapters/analytics";
import { Profile, SEED_PROFILE, MAX_PROFILE_NAME_LEN } from "../../../core/src/data/profile";

type User = FirebaseAuthTypes.User;

export class RecentLoginRequiredError extends Error {
  constructor() {
    super("Please sign out and sign back in, then try deleting your account again.");
    this.name = "RecentLoginRequiredError";
  }
}

export interface SignUpInit {
  firstName?: string;
  lastName?: string;
  profileName?: string;
}

export interface AuthApi {
  user: User | null;
  loading: boolean;
  appleAvailable: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, init?: SignUpInit) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Permanently delete the signed-in user's Firestore data + auth record.
   * Throws RecentLoginRequiredError if the user needs to re-authenticate.
   */
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthApi>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // Attribute subsequent analytics events to this uid (or unset
      // when signed out). Fire-and-forget — never block auth on
      // an analytics SDK hiccup.
      void Analytics.setUserId(u?.uid ?? null);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // Google Sign-In needs BOTH IDs on iOS:
  //  - webClientId: Firebase verifies the returned idToken against this.
  //  - iosClientId: GoogleSignin v16 wrapper does NOT auto-read
  //    GIDClientID from Info.plist when initializing GIDConfiguration —
  //    omitting it produces "must specify |clientID| in |GIDConfiguration|".
  useEffect(() => {
    GoogleSignin.configure({
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
        "986088928923-hh38uefh095la6k74h8d5ui7h1m8b5bd.apps.googleusercontent.com",
      iosClientId:
        "986088928923-s8u1ibjj8brq785a8mppo6ugstt3n7j8.apps.googleusercontent.com",
      offlineAccess: false,
    });
  }, []);

  /** Helper: seed profile doc if missing (matches Apple/email flow).
   * Returns true when a new profile was seeded (the user just signed
   * up); false when they were already in the database. Callers fire
   * the signup_completed analytics event when this returns true. */
  const seedProfileFromCred = useCallback(
    async (
      cred: FirebaseAuthTypes.UserCredential,
      hint?: { firstName?: string; lastName?: string },
    ): Promise<boolean> => {
      const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
      const snap = await getDoc(profileRef);
      if (snap.exists()) return false;
      const display = cred.user.displayName?.trim() ?? "";
      const [first, ...rest] = display.split(/\s+/).filter(Boolean);
      const firstName =
        hint?.firstName?.trim() ||
        first ||
        cred.user.email?.split("@")[0] ||
        SEED_PROFILE.name;
      const lastName =
        hint?.lastName?.trim() ||
        (rest.length > 0 ? rest.join(" ") : undefined);
      const profile: Profile = {
        ...SEED_PROFILE,
        name: firstName.slice(0, MAX_PROFILE_NAME_LEN),
        firstName: firstName.slice(0, MAX_PROFILE_NAME_LEN),
        lastName,
      };
      await setDoc(profileRef, {
        value: JSON.stringify({ version: 1, data: profile }),
        updatedAt: Date.now(),
      });
      return true;
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, init?: SignUpInit) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const firstName = init?.firstName?.trim() || undefined;
      const lastName = init?.lastName?.trim() || undefined;
      const profileName = init?.profileName?.trim();
      const resolvedName =
        profileName ||
        firstName ||
        email.split("@")[0] ||
        SEED_PROFILE.name;
      const profile: Profile = {
        ...SEED_PROFILE,
        name: resolvedName.slice(0, MAX_PROFILE_NAME_LEN),
        firstName,
        lastName,
      };
      await setDoc(doc(db, stateDocPath(cred.user.uid, "profile")), {
        value: JSON.stringify({ version: 1, data: profile }),
        updatedAt: Date.now(),
      });
      void Analytics.signupCompleted("email");
    },
    [],
  );

  const signInWithApple = useCallback(async () => {
    // Apple Sign-In + Firebase requires a nonce flow to prevent replay
    // attacks. We generate a raw nonce, send its SHA-256 hash to Apple,
    // and pass the raw nonce alongside the identity token to Firebase —
    // Firebase verifies the hash inside the JWT matches the raw nonce.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) {
      throw new Error("Apple Sign-In returned no identity token");
    }
    // PERSIST THE NAME IMMEDIATELY — Apple sends fullName ONLY on the
    // very first sign-in. If anything between here and the Firestore
    // write fails (network, auth/credential, rules), Apple won't send
    // the name on the next call and it's lost forever. Stash it keyed
    // by Apple's persistent user id so we can read it back below.
    const givenName = credential.fullName?.givenName?.trim() ?? "";
    const familyName = credential.fullName?.familyName?.trim() ?? "";
    if (givenName || familyName) {
      await AsyncStorage.setItem(
        `apple_pending_name_${credential.user}`,
        JSON.stringify({ givenName, familyName }),
      ).catch(() => {});
    }
    const fbCredential = AppleAuthProvider.credential(
      credential.identityToken,
      rawNonce,
    );
    const cred = await signInWithCredential(auth, fbCredential);
    // First-time Apple sign-in: seed a profile doc using the name Apple
    // provided in the credential. Returning users are skipped.
    const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      // Source the name from the credential first, then fall back to
      // the AsyncStorage stash (covers the case where a previous
      // attempt got the name but failed to persist the profile doc).
      let effectiveGiven = givenName;
      let effectiveFamily = familyName;
      if (!effectiveGiven && !effectiveFamily) {
        try {
          const stash = await AsyncStorage.getItem(
            `apple_pending_name_${credential.user}`,
          );
          if (stash) {
            const parsed = JSON.parse(stash) as {
              givenName?: string;
              familyName?: string;
            };
            effectiveGiven = parsed.givenName?.trim() ?? "";
            effectiveFamily = parsed.familyName?.trim() ?? "";
          }
        } catch {
          // ignore — fall through to the displayName/email fallback.
        }
      }
      const firstName =
        effectiveGiven ||
        cred.user.displayName?.trim().split(/\s+/)[0] ||
        cred.user.email?.split("@")[0] ||
        SEED_PROFILE.name;
      const lastName = effectiveFamily || undefined;
      const profile: Profile = {
        ...SEED_PROFILE,
        name: firstName.slice(0, MAX_PROFILE_NAME_LEN),
        firstName: firstName.slice(0, MAX_PROFILE_NAME_LEN),
        lastName,
      };
      await setDoc(profileRef, {
        value: JSON.stringify({ version: 1, data: profile }),
        updatedAt: Date.now(),
      });
      void Analytics.signupCompleted("apple");
    }
    // Profile is persisted (or pre-existed) — safe to clear the stash.
    // If the setDoc above threw, we keep the stash for the next attempt.
    await AsyncStorage.removeItem(
      `apple_pending_name_${credential.user}`,
    ).catch(() => {});
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      // SDK v16+ returns { type: 'success' | 'cancelled', data: { idToken, ... } }
      if (result.type === "cancelled") return;
      const idToken = result.data?.idToken;
      if (!idToken) throw new Error("Google Sign-In returned no idToken");
      const fbCredential = GoogleAuthProvider.credential(idToken);
      const cred = await signInWithCredential(auth, fbCredential);
      const givenName = result.data?.user?.givenName ?? undefined;
      const familyName = result.data?.user?.familyName ?? undefined;
      const isFreshSignup = await seedProfileFromCred(cred, { firstName: givenName, lastName: familyName });
      if (isFreshSignup) void Analytics.signupCompleted("google");
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // Cancelled or "in progress" are benign; let UI suppress.
      if (
        code === statusCodes.SIGN_IN_CANCELLED ||
        code === statusCodes.IN_PROGRESS
      ) {
        return;
      }
      throw err;
    }
  }, [seedProfileFromCred]);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    // Clear local persisted state so the next user signing in on this
    // device doesn't see leftover data, and so migrateLocalToCloud can't
    // push prior-user data into a brand-new user's empty Firestore doc.
    // MUST cover every key migrateLocalToCloud considers (groceries +
    // groceryGroups were missing → grocery bleed across accounts on a
    // shared device) plus todoReferences (autofill history).
    await AsyncStorage.multiRemove([
      "todos",
      "categories",
      "profile",
      "groceries",
      "groceryGroups",
      "todoReferences",
    ]).catch(() => {
      // best-effort — don't block sign-out on a storage hiccup
    });
  }, []);

  const deleteAccount = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error("Not signed in");
    const uid = current.uid;
    // Order (wipe cloud data → THEN delete the auth user) is required by
    // the security rules and is enforced + unit-tested in core's
    // runDeleteAccount. Cloud wipe is best-effort per key.
    await runDeleteAccount({
      wipeCloudData: () =>
        Promise.all(
          ["todos", "categories", "profile"].map((key) =>
            deleteDoc(doc(db, stateDocPath(uid, key))).catch(() => {}),
          ),
        ).then(() => {}),
      deleteAuthUser: () => deleteUser(current),
      onAuthError: (err) => {
        if ((err as { code?: string } | null)?.code === "auth/requires-recent-login") {
          throw new RecentLoginRequiredError();
        }
      },
    });
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      loading,
      appleAvailable,
      signIn,
      signUp,
      signInWithApple,
      signInWithGoogle,
      resetPassword,
      signOut,
      deleteAccount,
    }),
    [
      user,
      loading,
      appleAvailable,
      signIn,
      signUp,
      signInWithApple,
      signInWithGoogle,
      resetPassword,
      signOut,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  return useContext(AuthContext);
}
