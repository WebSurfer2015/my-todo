// PR 2 of the useTodoStore split — see docs/USETODOSTORE-SPLIT-PLAN.md.
// Owns the profile state + the lastSavedAt "saved at" stamp + the
// onSaved callback. Other slices receive `onSaved` from the composer
// so any save (todos, categories, groceries, etc.) advances the
// shared "last saved" indicator.

import { useCallback, useState } from "react";
import { useSyncedState } from "../useSyncedState";
import { Profile, SEED_PROFILE, migrateProfile } from "../profile";
import { StorageAdapter } from "../../../core/src/persistence";
import { unwrap, serializeAny } from "../storage/envelope";

const parseProfile = (raw: string | null): Profile => {
  const data = unwrap(raw);
  return data ? migrateProfile(data) : SEED_PROFILE;
};

export interface ProfileSlice {
  profile: Profile;
  setProfile: (next: Profile | ((prev: Profile) => Profile)) => void;
  profileLoaded: boolean;
  /** Most recent successful persist timestamp across ALL useSyncedState
   * keys threaded through `onSaved`. Surfaced in Settings as a quiet
   * "saved" indicator. */
  lastSavedAt: number | null;
  /** Pass this into every other slice's useSyncedState so a save
   * anywhere updates the shared indicator. */
  onSaved: (ts: number) => void;
}

export function useProfileSlice(adapter: StorageAdapter): ProfileSlice {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const onSaved = useCallback((ts: number) => setLastSavedAt(ts), []);

  const [profile, setProfile, profileLoaded] = useSyncedState<Profile>(
    adapter,
    "profile",
    SEED_PROFILE,
    parseProfile,
    serializeAny,
    onSaved,
  );

  return { profile, setProfile, profileLoaded, lastSavedAt, onSaved };
}
