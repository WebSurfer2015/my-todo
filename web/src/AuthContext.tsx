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
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { stateDocPath } from "../../core/src/persistence";
import { Profile, SEED_PROFILE, MAX_PROFILE_NAME_LEN } from "../../core/src/profile";

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

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Complete signInWithRedirect handshake on page load (Safari ITP path).
  // No-op when there's no pending redirect. If a credential comes back and
  // the user has no profile doc yet, seed it the same way signInWithApple
  // does for the popup path.
  useEffect(() => {
    let cancelled = false;
    getRedirectResult(auth)
      .then(async (cred) => {
        if (cancelled || !cred) return;
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
    let cred;
    try {
      cred = await signInWithPopup(auth, provider);
    } catch (err) {
      // Safari with strict tracking prevention (ITP) blocks signInWithPopup
      // for cross-origin OAuth. Fall back to redirect — user comes back here
      // after Apple's login screen and getRedirectResult (in the effect
      // below) finishes the handshake.
      const code = (err as { code?: string } | null)?.code ?? "";
      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/unauthorized-domain" ||
        code === "auth/web-storage-unsupported"
      ) {
        await signInWithRedirect(auth, provider);
        return; // page will reload; profile-doc seeding happens in the
                // redirect-result handler below
      }
      throw err;
    }
    // First-time Apple sign-in: seed a profile doc so the store doesn't get
    // stuck waiting for non-existent data and so appTitle has a real name.
    // Returning users (profile already exists) are skipped untouched.
    const profileRef = doc(db, stateDocPath(cred.user.uid, "profile"));
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
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
    () => ({ user, loading, signIn, signUp, signInWithApple, resetPassword, signOut, deleteAccount }),
    [user, loading, signIn, signUp, signInWithApple, resetPassword, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  return useContext(AuthContext);
}
