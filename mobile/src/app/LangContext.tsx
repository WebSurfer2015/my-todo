import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { strings, Lang, Strings, LANG_ORDER } from '../core-bindings/i18n'
import { readVersioned, writeVersioned } from '../adapters/persistence'
import { LANGUAGE_PICKER_ENABLED } from './featureFlags'

interface LangCtx {
  lang: Lang
  t: Strings
  setLang: (l: Lang) => void
}

const VALID_LANGS = new Set<string>(LANG_ORDER)

const LangContext = createContext<LangCtx>({
  lang: 'en',
  t: strings.en as Strings,
  setLang: () => {},
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    // English-only launch: ignore any stored language while the picker is off.
    if (!LANGUAGE_PICKER_ENABLED) return
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

  const value = useMemo<LangCtx>(
    () => ({ lang, t: strings[lang] as Strings, setLang }),
    [lang, setLang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export const useLang = () => useContext(LangContext)
