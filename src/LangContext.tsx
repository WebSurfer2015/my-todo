import { createContext, useContext, useState, ReactNode } from 'react'
import { Lang, strings, Strings } from './i18n'

interface LangCtx {
  lang: Lang
  t: Strings
  toggle: () => void
}

const LangContext = createContext<LangCtx>(null!)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')
  const toggle = () => setLang(l => l === 'en' ? 'zh' : 'en')
  return (
    <LangContext.Provider value={{ lang, t: strings[lang], toggle }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() { return useContext(LangContext) }
