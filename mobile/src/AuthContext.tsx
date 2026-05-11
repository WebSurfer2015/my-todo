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
  FacebookAuthProvider,
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
import { LoginManager, AccessToken, Profile as FBProfile } from "react-native-fbsdk-next";
import { auth, db } from "./firebase";
import { stateDocPath } from "../../core/src/persistence";
import { Profile, SEED_PROFILE, MAX_PROFILE_NAME_LEN } from "../../core/src/profile";

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
  signInWithFacebook: () => Promise<void>;
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

  /** Helper: seed profile doc if missing (matches Apple/email flow). */
  const seedProfileFromCred = useCallback(
    async (
      cred: FirebaseAuthTypes.UserCredential,
      hint?: { firstName?: string; lastName?: string },
    ) => {
      const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
      const snap = await getDoc(profileRef);
      if (snap.exists()) return;
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
    const fbCredential = AppleAuthProvider.credential(
      credential.identityToken,
      rawNonce,
    );
    const cred = await signInWithCredential(auth, fbCredential);
    // First-time Apple sign-in: seed a profile doc using the name Apple
    // provided in the credential (Apple sends fullName ONLY on the very
    // first sign-in). Returning users are skipped.
    const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      const givenName = credential.fullName?.givenName?.trim() ?? "";
      const familyName = credential.fullName?.familyName?.trim() ?? "";
      const firstName =
        givenName ||
        cred.user.displayName?.trim().split(/\s+/)[0] ||
        cred.user.email?.split("@")[0] ||
        SEED_PROFILE.name;
      const lastName = familyName || undefined;
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
    }
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
      await seedProfileFromCred(cred, { firstName: givenName, lastName: familyName });
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

  const signInWithFacebook = useCallback(async () => {
    const result = await LoginManager.logInWithPermissions(["public_profile", "email"]);
    if (result.isCancelled) return;
    const tokenData = await AccessToken.getCurrentAccessToken();
    if (!tokenData) throw new Error("Facebook Sign-In returned no access token");
    const fbCredential = FacebookAuthProvider.credential(tokenData.accessToken);
    const cred = await signInWithCredential(auth, fbCredential);
    // Try to enrich the profile seed with Facebook's first/last name.
    const fbProfile = await FBProfile.getCurrentProfile().catch(() => null);
    await seedProfileFromCred(cred, {
      firstName: fbProfile?.firstName ?? undefined,
      lastName: fbProfile?.lastName ?? undefined,
    });
  }, [seedProfileFromCred]);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    // Clear local persisted state so the next user signing in on this
    // device doesn't see leftover data, and so migrateLocalToCloud can't
    // push prior-user todos into a brand-new user's empty Firestore doc.
    await AsyncStorage.multiRemove(["todos", "categories", "profile"]).catch(
      () => {
        // best-effort — don't block sign-out on a storage hiccup
      },
    );
  }, []);

  const deleteAccount = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error("Not signed in");
    const uid = current.uid;
    // Delete Firestore-side data first — once auth is gone, security rules
    // would reject these writes.
    await Promise.all(
      ["todos", "categories", "profile"].map((key) =>
        deleteDoc(doc(db, stateDocPath(uid, key))).catch(() => {
          // Best-effort: missing doc is fine, transient failures shouldn't
          // block the auth delete.
        }),
      ),
    );
    try {
      await deleteUser(current);
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "auth/requires-recent-login") {
        throw new RecentLoginRequiredError();
      }
      throw err;
    }
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
      signInWithFacebook,
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
      signInWithFacebook,
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
