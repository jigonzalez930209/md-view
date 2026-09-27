/**
 * Enlace de i18n con React: provee el idioma activo a los componentes.
 *
 * Al cambiar el idioma cambia el valor del contexto, asi que incluso los
 * componentes memoizados se vuelven a renderizar con los textos nuevos.
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
  /** Plural simple: elige `key.one` o `key.other` segun la cantidad. */
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
  // Los modulos que no son React usan `t()`; dejamos el idioma listo antes de
  // que corran los efectos de los hijos (y tambien al cambiar).
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
