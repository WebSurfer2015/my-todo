import { createContext, useCallback, useContext, useMemo, ReactNode } from 'react'
import { Lang, strings, Strings } from './i18n'
import { usePersistedState } from './usePersistedState'
import { readVersioned } from './persistence'

interface LangCtx {
  lang: Lang
  t: Strings
  toggle: () => void
}

const LangContext = createContext<LangCtx>(null!)

function loadLang(): Lang {
  return readVersioned<Lang>('lang', (raw) => (raw === 'zh' ? 'zh' : 'en'))
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePersistedState<Lang>('lang', loadLang)
  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'zh' : 'en')), [setLang])
  const value = useMemo<LangCtx>(() => ({ lang, t: strings[lang], toggle }), [lang, toggle])
  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() { return useContext(LangContext) }
