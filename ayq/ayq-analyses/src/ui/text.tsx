import type { JSX } from 'react';
import { createContext, useContext } from 'react';
import { translate, type StringKey, type StringParams } from '../strings.js';

export const LocaleContext = createContext<string>('en');

export function useLocale(): string {
  return useContext(LocaleContext);
}

/** The only way text reaches a component, accessible names included. */
export function useText(): (key: StringKey, params?: StringParams) => string {
  const locale = useLocale();
  return (key, params) => translate(key, params, locale);
}
