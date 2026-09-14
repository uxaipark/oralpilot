'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { Globe2 } from 'lucide-react';
import {
  translate,
  isLocale,
  localeTags,
  localeNames,
  locales,
  LOCALE_STORAGE_KEY,
  type Locale,
} from './translate';

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
};
const Context = createContext<I18n>({
  locale: 'ko',
  setLocale: () => {},
  t: (s) => s,
});
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>('ko');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(saved)) updateLocale(saved);
    } catch {
      /* Storage can be unavailable; the selector still works. */
    }
  }, []);
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* In-memory preference remains usable. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({ locale, setLocale, t: (s: string) => translate(s, locale) }),
    [locale, setLocale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
/** React-native presentation boundary: no DOM rewriting, no remount on language changes.
 * Only rendered text and accessible descriptions are localized. Never localize values,
 * React keys, URLs, refs, handlers, or the clinical objects passed between components.
 * translate="no" protects patient-provided text, IDs and native language names.
 */
export function localizeNode<T extends ReactNode>(
  node: T,
  t: (text: string) => string,
): T {
  if (typeof node === 'string') return t(node) as T;
  if (Array.isArray(node))
    return node.map((child) => localizeNode(child, t)) as unknown as T;
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<Record<string, unknown>>;
  const props = el.props;
  if (
    props.translate === 'no' ||
    props.contentEditable === true ||
    props['data-no-i18n'] ||
    ['script', 'style', 'textarea'].includes(String(el.type))
  )
    return node;
  const next: Record<string, unknown> = {};
  for (const key of [
    'label',
    'title',
    'aria-label',
    'aria-description',
    'aria-valuetext',
    'placeholder',
    'alt',
  ]) {
    if (typeof props[key] === 'string') next[key] = t(props[key] as string);
  }
  if (props.children !== undefined)
    next.children = localizeNode(props.children as ReactNode, t);
  return cloneElement(el, next) as T;
}
export function useLocalize() {
  const { t } = useI18n();
  return useCallback(
    <T extends ReactNode>(node: T) => localizeNode(node, t),
    [t],
  );
}
export function LanguageSelector({
  tone = 'dark',
}: {
  tone?: 'dark' | 'perio';
}) {
  const { locale, setLocale } = useI18n();
  const labels = { ko: '화면 언어', en: 'Interface language', ja: '表示言語' };
  return (
    <div className="language-selector" translate="no">
      <Globe2 size={15} aria-hidden="true" />
      <Dropdown
        tone={tone}
        id="interface-language"
        value={locale}
        onValueChange={(v) => {
          if (isLocale(v)) setLocale(v);
        }}
        aria-label={labels[locale]}
      >
        {locales.map((code) => (
          <DropdownOption key={code} value={code}>
            {localeNames[code]}
          </DropdownOption>
        ))}
      </Dropdown>
    </div>
  );
}
export { localeTags };
