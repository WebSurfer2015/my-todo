import { Profile, SEED_PROFILE, migrateProfile, AVATAR_ICON_LIBRARY } from '../../core/src/profile'
import { readVersioned } from './persistence'

export * from '../../core/src/profile'

/** Web's user-facing avatar library is the lucide-icon set. Mobile stays on emoji presets. */
export const AVATAR_LIBRARY = AVATAR_ICON_LIBRARY

/** Sync localStorage loader used by the web store's `useState(loader)` initializer. */
export function loadProfile(): Profile {
  return readVersioned<Profile>('profile', (raw) => migrateProfile(raw) ?? SEED_PROFILE)
}

export async function fileToCompressedDataURL(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image'))
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas not supported'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
