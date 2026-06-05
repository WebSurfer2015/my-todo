import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  AuthProvider as FbAuthProvider,
  User,
  UserCredential,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../adapters/firebase";
import { stateDocPath } from "../../../core/src/ports/persistence";
import { Profile, SEED_PROFILE, MAX_PROFILE_NAME_LEN } from "../../../core/src/data/profile";

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

/**
 * If the user has no profile doc yet (first social sign-in), seed it with
 * a name derived from the OAuth credential. Returning users are skipped.
 */
async function seedProfileIfMissing(cred: UserCredential): Promise<void> {
  const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
  const snap = await getDoc(profileRef);
  if (snap.exists()) return;
  const display = cred.user.displayName?.trim() ?? "";
  const [first, ...rest] = display.split(/\s+/).filter(Boolean);
  const firstName =
    first || cred.user.email?.split("@")[0] || SEED_PROFILE.name;
  const lastName = rest.length > 0 ? rest.join(" ") : undefined;
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

/**
 * Run an OAuth provider sign-in via popup, falling back to redirect when the
 * popup is blocked (Safari ITP, in-app browsers, strict cookie policies).
 * Seeds a profile doc on first sign-in. Returns void in the redirect case
 * because the page will navigate away.
 */
async function signInWithOAuthProvider(provider: FbAuthProvider): Promise<void> {
  let cred: UserCredential;
  try {
    cred = await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment" ||
      code === "auth/unauthorized-domain" ||
      code === "auth/web-storage-unsupported"
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
  await seedProfileIfMissing(cred);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Complete signInWithRedirect handshake on page load (Safari ITP path).
  // No-op when there's no pending redirect. Profile-doc seed happens here
  // for the redirect path (popup path seeds inline).
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then(async (cred) => {
        if (cancelled || !cred) return;
        await seedProfileIfMissing(cred);
      })
      .catch((err) => {
        console.warn("getRedirectResult failed:", err);
      });
    return () => {
      cancelled = true;
    };
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
      // Fallback: profileName → firstName → email prefix
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
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    await signInWithOAuthProvider(provider);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    await signInWithOAuthProvider(provider);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    // Clear local persisted state so the next user signing in on this
    // browser doesn't see leftover data, and so migrateLocalToCloud can't
    // push prior-user todos into a brand-new user's empty Firestore doc.
    try {
      ["todos", "categories", "profile"].forEach((k) =>
        localStorage.removeItem(k),
      );
    } catch {
      // localStorage can throw in private browsing modes — best-effort.
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) throw new Error("Not signed in");
    const uid = current.uid;
    // Delete Firestore-side data first — once auth is gone, security rules
    // would reject these writes. This wipe-then-delete-user ORDER is the
    // load-bearing invariant; it's specified + unit-tested in core's
    // runDeleteAccount (core/src/store/deleteAccount.ts). Mobile delegates
    // to that helper; web keeps this inline copy (parity is task #5).
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
