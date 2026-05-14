import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Profile, Avatar, AVATAR_LIBRARY, Density, fileToCompressedDataURL } from '../profile'
import { useLang } from '../LangContext'
import { useAuth, RecentLoginRequiredError } from '../AuthContext'
import { useNotify } from '../notify'
import AvatarView from './Avatar'

interface Props {
  profile: Profile
  onSave: (p: Profile) => void
  onClose: () => void
}

export default function ProfilePopover({ profile, onSave, onClose }: Props) {
  const { t } = useLang()
  const { deleteAccount } = useAuth()
  const { confirm, showSnackbar } = useNotify()
  const [firstName, setFirstName] = useState(profile.firstName ?? '')
  const [lastName, setLastName] = useState(profile.lastName ?? '')
  const [quote, setQuote] = useState(profile.quote ?? '')
  const [avatar, setAvatar] = useState<Avatar>(profile.avatar)
  const [density, setDensity] = useState<Density>(profile.density ?? 'comfortable')
  const [reduceMotion, setReduceMotion] = useState<boolean>(!!profile.reduceMotion)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstNameRef.current?.focus()
    firstNameRef.current?.select()
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
      showSnackbar({ message: err instanceof Error ? err.message : String(err) })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSave() {
    const trimmedFirst = firstName.trim()
    if (!trimmedFirst) {
      firstNameRef.current?.focus()
      return
    }
    const trimmedLast = lastName.trim()
    onSave({
      // name field is no longer user-editable; auto-derive from firstName so
      // greeting fallbacks and existing aria labels still have a value.
      name: trimmedFirst,
      firstName: trimmedFirst,
      lastName: trimmedLast || undefined,
      // title is hidden in the editor; preserve existing value untouched.
      title: profile.title,
      quote: quote.trim() || undefined,
      avatar,
      density,
      reduceMotion: reduceMotion || undefined,
    })
    showSnackbar({ message: t.profileSaved })
    onClose()
  }

  async function handleDeleteAccount() {
    const ok = await confirm({
      title: t.deleteAccount,
      message: t.deleteAccountConfirm,
      confirmLabel: t.deleteAccount,
      cancelLabel: t.cancel,
      variant: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await deleteAccount()
      showSnackbar({ message: t.accountDeleted })
    } catch (err) {
      const msg =
        err instanceof RecentLoginRequiredError
          ? t.deleteAccountReauth
          : err instanceof Error
            ? err.message
            : String(err)
      showSnackbar({ message: msg })
    } finally {
      setDeleting(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{t.editProfile}</h3>

        <div className="modal-field profile-avatar-row">
          <AvatarView avatar={avatar} size={64} alt={firstName || profile.name} />
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

        <div className="modal-field-row">
          <label className="modal-field">
            <span className="modal-label">
              {t.profileFirstNameLabel}
              <span className="signin-required"> *</span>
            </span>
            <input
              ref={firstNameRef}
              className="modal-input"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              maxLength={40}
              autoComplete="given-name"
              required
            />
          </label>
          <label className="modal-field">
            <span className="modal-label">{t.profileLastNameLabel}</span>
            <input
              className="modal-input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={40}
              autoComplete="family-name"
            />
          </label>
        </div>

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

        <label className="modal-field profile-toggle-row">
          <span className="modal-label-stack">
            <span className="modal-label">{t.reduceMotionLabel}</span>
            <span className="modal-hint">{t.reduceMotionHint}</span>
          </span>
          <input
            type="checkbox"
            className="profile-toggle-checkbox"
            checked={reduceMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
            aria-label={t.reduceMotionLabel}
          />
        </label>

        <div className="modal-actions">
          <span className="modal-spacer" />
          <button type="button" className="btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>{t.save}</button>
        </div>

        <div className="profile-danger-zone">
          <p className="profile-danger-text">{t.deleteAccountDescription}</p>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? t.deleting : t.deleteAccount}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
