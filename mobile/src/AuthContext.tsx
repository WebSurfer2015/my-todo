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
import {
  FirebaseAuthTypes,
  AppleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "@react-native-firebase/auth";
import { deleteDoc, doc, setDoc } from "@react-native-firebase/firestore";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
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
    await signInWithCredential(auth, fbCredential);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
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
      signOut,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  return useContext(AuthContext);
}
