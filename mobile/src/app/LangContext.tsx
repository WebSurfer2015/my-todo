import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { strings, Lang, Strings, LANG_ORDER } from '../core-bindings/i18n'
import { readVersioned, writeVersioned } from '../adapters/persistence'

interface LangCtx {
  lang: Lang
  t: Strings
  setLang: (l: Lang) => void
  /** Cycles through LANG_ORDER. Kept for back-compat. */
  toggle: () => void
}

const VALID_LANGS = new Set<string>(LANG_ORDER)

const LangContext = createContext<LangCtx>({
  lang: 'en',
  t: strings.en as Strings,
  setLang: () => {},
  toggle: () => {},
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    let cancelled = false
    readVersioned<Lang>('lang', (raw) =>
      VALID_LANGS.has(raw as string) ? (raw as Lang) : 'en',
    ).then((l) => {
      if (!cancelled) setLangState(l)
    })
    return () => { cancelled = true }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    writeVersioned('lang', l)
  }, [])

  const toggle = useCallback(() => {
    setLangState((cur) => {
      const idx = LANG_ORDER.indexOf(cur)
      const next = LANG_ORDER[(idx + 1) % LANG_ORDER.length]
      writeVersioned('lang', next)
      return next
    })
  }, [])

  const value = useMemo<LangCtx>(
    () => ({ lang, t: strings[lang] as Strings, setLang, toggle }),
    [lang, setLang, toggle],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
