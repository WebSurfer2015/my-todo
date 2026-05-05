import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFirestore } from "@react-native-firebase/firestore";

/**
 * @react-native-firebase auto-initializes from GoogleService-Info.plist (iOS)
 * and google-services.json (Android) at native launch — no JS-side config
 * needed. We just grab handles to the default app.
 */
export const firebaseApp = getApp();
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
