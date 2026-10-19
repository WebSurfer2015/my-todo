/**
 * Firebase App Check (client side). Attests that requests to Firestore /
 * Cloud Functions come from the genuine Sagely app: App Attest on iOS
 * (DeviceCheck fallback for older devices), Play Integrity on Android, and
 * the debug provider in __DEV__ (register the debug token printed in the
 * Xcode log under Firebase console → App Check → Manage debug tokens).
 *
 * Safe to ship before enforcement: initialization is best-effort. The module
 * is loaded with a guarded dynamic require so a dev client built BEFORE
 * @react-native-firebase/app-check was added (no native module) keeps running
 * — it just skips App Check.
 *
 * Before flipping enforcement on the server (Firestore / Functions App Check
 * enforcement in the Firebase console, or the functions' enforceAppCheck
 * flag), ALL of these must be true, or every request will be rejected:
 *   1. a NEW native build (EAS) that includes this module is what users run;
 *   2. the iOS app is registered for App Attest (and DeviceCheck) in Firebase
 *      console → App Check, with the App Attest entitlement on the bundle id;
 *   3. App Check metrics show (nearly) all traffic as verified.
 */
import { getApp } from '@react-native-firebase/app'

let started = false

export function initAppCheck(): void {
  if (started) return
  started = true
  try {
    const mod = require('@react-native-firebase/app-check') as typeof import('@react-native-firebase/app-check')
    const provider = new mod.ReactNativeFirebaseAppCheckProvider()
    provider.configure({
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
    })
    mod
      .initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true })
      .catch((err: unknown) => {
        console.warn('App Check init failed (continuing without it):', err)
      })
  } catch (err) {
    // Native module missing (older dev client) — run without App Check.
    console.warn('App Check unavailable (continuing without it):', err)
  }
}
