import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  StorageAdapter,
  readVersioned as coreRead, writeVersioned as coreWrite,
} from '../../../core/src/ports/persistence'

export type { StorageAdapter }

/** Async StorageAdapter wrapping React Native AsyncStorage (the device-local
 * language setting — everything else syncs through Firestore). */
export const storage: StorageAdapter = {
  async getItem(key) { return await AsyncStorage.getItem(key) },
  async setItem(key, value) { await AsyncStorage.setItem(key, value) },
  async removeItem(key) { await AsyncStorage.removeItem(key) },
}

export function readVersioned<T>(key: string, migrate: (raw: unknown) => T): Promise<T> {
  return coreRead(storage, key, migrate)
}

export function writeVersioned(key: string, data: unknown): Promise<void> {
  return coreWrite(storage, key, data)
}
