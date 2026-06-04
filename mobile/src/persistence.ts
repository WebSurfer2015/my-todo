import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  StorageAdapter, SCHEMA_VERSION,
  readVersioned as coreRead, writeVersioned as coreWrite, clearAllPersisted as coreClear,
} from '../../core/src/ports/persistence'

export { SCHEMA_VERSION }
export type { StorageAdapter }

/** Async StorageAdapter wrapping React Native AsyncStorage. */
export const storage: StorageAdapter = {
  async getItem(key) { return await AsyncStorage.getItem(key) },
  async setItem(key, value) { await AsyncStorage.setItem(key, value) },
  async removeItem(key) { await AsyncStorage.removeItem(key) },
  async clear() { await AsyncStorage.clear() },
}

export function readVersioned<T>(key: string, migrate: (raw: unknown) => T): Promise<T> {
  return coreRead(storage, key, migrate)
}

export function writeVersioned(key: string, data: unknown): Promise<void> {
  return coreWrite(storage, key, data)
}

export function clearAllPersisted(): Promise<void> {
  return coreClear(storage)
}
