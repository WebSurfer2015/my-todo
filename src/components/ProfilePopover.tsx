import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Profile, Avatar, AVATAR_LIBRARY, Density, fileToCompressedDataURL } from '../profile'
import { useLang } from '../LangContext'
import AvatarView from './Avatar'

interface Props {
  profile: Profile
  onSave: (p: Profile) => void
  onClose: () => void
}

export default function ProfilePopover({ profile, onSave, onClose }: Props) {
  const { t } = useLang()
  const [name, setName] = useState(profile.name)
  const [title, setTitle] = useState(profile.title ?? '')
  const [quote, setQuote] = useState(profile.quote ?? '')
  const [avatar, setAvatar] = useState<Avatar>(profile.avatar)
  const [density, setDensity] = useState<Density>(profile.density ?? 'comfortable')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const data = await fileToCompressedDataURL(file)
      setAvatar({ kind: 'image', uri: data })
    } catch (err) {
      window.alert(String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      nameRef.current?.focus()
      return
    }
    onSave({ name: trimmed, title: title.trim() || undefined, quote: quote.trim() || undefined, avatar, density })
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t.editProfile}</h3>

        <div className="modal-field profile-avatar-row">
          <AvatarView avatar={avatar} size={64} alt={name} />
          <div className="profile-upload-actions">
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t.uploading : t.uploadPhoto}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div className="modal-field">
          <span className="modal-label">{t.chooseAvatar}</span>
          <div className="palette">
            {AVATAR_LIBRARY.map((a, i) => (
              <button
                key={i}
                type="button"
                className={`avatar-swatch${avatar.kind === 'icon' && a.kind === 'icon' && a.icon === avatar.icon && a.color === avatar.color ? ' selected' : ''}`}
                onClick={() => setAvatar(a)}
                aria-label={a.kind === 'icon' ? a.icon : ''}
                title={a.kind === 'icon' ? a.icon : ''}
              >
                <AvatarView avatar={a} size={36} />
              </button>
            ))}
          </div>
        </div>

        <label className="modal-field">
          <span className="modal-label">{t.profileNameLabel}</span>
          <input
            ref={nameRef}
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            maxLength={40}
          />
        </label>

        <label className="modal-field">
          <span className="modal-label">{t.profileTitleLabel}</span>
          <input
            className="modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder={t.profileTitlePlaceholder}
            maxLength={40}
          />
        </label>

        <label className="modal-field">
          <span className="modal-label">{t.profileQuoteLabel}</span>
          <textarea
            className="modal-input modal-textarea"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder={t.profileQuotePlaceholder}
            maxLength={120}
            rows={2}
          />
        </label>

        <div className="modal-field">
          <span className="modal-label">{t.densityLabel}</span>
          <div className="segmented" role="radiogroup" aria-label={t.densityLabel}>
            <button
              type="button"
              role="radio"
              aria-checked={density === 'comfortable'}
              className={`segmented-option${density === 'comfortable' ? ' selected' : ''}`}
              onClick={() => setDensity('comfortable')}
            >
              {t.densityComfortable}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={density === 'compact'}
              className={`segmented-option${density === 'compact' ? ' selected' : ''}`}
              onClick={() => setDensity('compact')}
            >
              {t.densityCompact}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <span className="modal-spacer" />
          <button type="button" className="btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>{t.save}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
