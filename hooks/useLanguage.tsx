
import React, { createContext, useContext, ReactNode } from 'react';
import { getTranslations } from '../utils/translations';

const LanguageContext = createContext<string | undefined>(undefined);

export function LanguageProvider({ language, children }: { language: string, children: ReactNode }) {
  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): string {
  const context = useContext(LanguageContext);
  if (context !== undefined) {
    return context;
  }
  
  // Fallback to localStorage
  const stored = localStorage.getItem('fluento_language');
  if (stored) return stored;
  
  return 'English';
}

export function useTranslations() {
  const language = useLanguage();
  return getTranslations(language);
}
