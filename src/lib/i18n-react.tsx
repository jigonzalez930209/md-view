/**
 * i18n binding for React: provides the active language to components.
 *
 * Changing the language changes the context value, so even memoized
 * components re-render with the new texts.
 */

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE,
  setActiveLanguage,
  translate,
  type Language,
  type TranslateParams,
  type TranslationKey,
} from './i18n';

export interface I18n {
  language: Language;
  t: (key: TranslationKey, params?: TranslateParams) => string;
  /** Simple plural: picks `key.one` or `key.other` based on the count. */
  plural: (key: string, count: number, params?: TranslateParams) => string;
}

const fallback: I18n = {
  language: DEFAULT_LANGUAGE,
  t: (key, params) => translate(DEFAULT_LANGUAGE, key, params),
  plural: (key, count, params) =>
    translate(DEFAULT_LANGUAGE, `${key}.${count === 1 ? 'one' : 'other'}` as TranslationKey, {
      count,
      ...params,
    }),
};

const I18nContext = createContext<I18n>(fallback);

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: ReactNode;
}) {
  // Non-React modules use `t()`; we set the language before the children's
  // effects run (and also when it changes).
  setActiveLanguage(language);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  useEffect(() => {
    setActiveLanguage(language);
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      t: (key, params) => translate(language, key, params),
      plural: (key, count, params) =>
        translate(language, `${key}.${count === 1 ? 'one' : 'other'}` as TranslationKey, {
          count,
          ...params,
        }),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
