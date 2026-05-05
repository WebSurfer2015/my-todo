import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase web SDK initialization. The config below is NOT a secret — anyone
 * can extract it from the bundled JS. Security is enforced by Firestore rules
 * + auth, not by hiding the config.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDu7ce5m27uAB5wMCebJvyqdTO446uzEms",
  authDomain: "my-todos-1b079.firebaseapp.com",
  projectId: "my-todos-1b079",
  storageBucket: "my-todos-1b079.firebasestorage.app",
  messagingSenderId: "986088928923",
  appId: "1:986088928923:web:58f498309fcbd0692e783e",
};

export const firebaseApp = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Persist auth across reloads (default is localStorage; this is explicit).
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Failed to set auth persistence:", err);
});
