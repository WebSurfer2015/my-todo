import { useLang } from '../LangContext'

interface Props {
  remaining: number
  completedCount: number
  onClearDone: () => void
}

export default function Footer({ remaining, completedCount, onClearDone }: Props) {
  const { t } = useLang()
  return (
    <div className="footer">
      <span>{t.remaining(remaining)}</span>
      {completedCount > 0 && (
        <button className="btn-clear" onClick={onClearDone}>{t.clearCompleted}</button>
      )}
    </div>
  )
}
