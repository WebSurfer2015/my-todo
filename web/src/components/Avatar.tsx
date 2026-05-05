import type { Avatar } from '../profile'
import { findPreset } from '../profile'
import CategoryIcon from './CategoryIcon'

export default function AvatarView({ avatar, size = 38, alt = '' }: { avatar: Avatar; size?: number; alt?: string }) {
  if (avatar.kind === 'image') {
    return (
      <img
        src={avatar.uri}
        alt={alt}
        className="avatar-img"
        style={{ width: size, height: size }}
      />
    )
  }
  if (avatar.kind === 'preset') {
    const preset = findPreset(avatar.key)
    return (
      <div
        className="avatar-icon"
        style={{ width: size, height: size, background: preset.bg, fontSize: Math.round(size * 0.55) }}
        aria-label={alt || preset.key}
        role="img"
      >
        <span style={{ lineHeight: 1 }}>{preset.emoji}</span>
      </div>
    )
  }
  return (
    <div
      className="avatar-icon"
      style={{ width: size, height: size, background: avatar.color }}
      aria-label={alt || avatar.icon}
      role="img"
    >
      <CategoryIcon icon={avatar.icon} size={Math.round(size * 0.55)} />
    </div>
  )
}
