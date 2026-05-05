import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { strings, Lang, Strings } from './i18n'
import { readVersioned, writeVersioned } from './persistence'

interface LangCtx { lang: Lang; t: Strings; toggle: () => void }
const LangContext = createContext<LangCtx>({ lang: 'en', t: strings.en as Strings, toggle: () => {} })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    let cancelled = false
    readVersioned<Lang>('lang', (raw) => (raw === 'zh' ? 'zh' : 'en')).then((l) => {
      if (!cancelled) setLang(l)
    })
    return () => { cancelled = true }
  }, [])

  const toggle = useCallback(() => {
    setLang((cur) => {
      const next: Lang = cur === 'en' ? 'zh' : 'en'
      writeVersioned('lang', next)
      return next
    })
  }, [])

  const value = useMemo<LangCtx>(
    () => ({ lang, t: strings[lang] as Strings, toggle }),
    [lang, toggle],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
