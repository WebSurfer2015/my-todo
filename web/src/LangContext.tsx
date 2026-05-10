import { createContext, useCallback, useContext, useMemo, ReactNode } from 'react'
import { Lang, strings, Strings, LANG_ORDER } from './i18n'
import { usePersistedState } from './usePersistedState'
import { readVersioned } from './persistence'

interface LangCtx {
  lang: Lang
  t: Strings
  setLang: (l: Lang) => void
  /** Cycles through LANG_ORDER. Kept for back-compat with old call sites. */
  toggle: () => void
}

const LangContext = createContext<LangCtx>(null!)

const VALID_LANGS = new Set<string>(LANG_ORDER)

function loadLang(): Lang {
  return readVersioned<Lang>('lang', (raw) =>
    VALID_LANGS.has(raw as string) ? (raw as Lang) : 'en',
  )
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = usePersistedState<Lang>('lang', loadLang)
  const setLang = useCallback(
    (l: Lang) => setLangState(l),
    [setLangState],
  )
  const toggle = useCallback(() => {
    setLangState((cur) => {
      const idx = LANG_ORDER.indexOf(cur)
      return LANG_ORDER[(idx + 1) % LANG_ORDER.length]
    })
  }, [setLangState])
  const value = useMemo<LangCtx>(
    () => ({ lang, t: strings[lang], setLang, toggle }),
    [lang, setLang, toggle],
  )
  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() { return useContext(LangContext) }
