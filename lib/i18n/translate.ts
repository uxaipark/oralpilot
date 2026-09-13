import messages from './messages.json';
export type Locale = 'ko' | 'en' | 'ja';
export const locales = ['ko', 'en', 'ja'] as const;
export const localeTags: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
};
export const localeNames: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
};
export const LOCALE_STORAGE_KEY = 'oralpilot.locale.v1';
export const isLocale = (v: unknown): v is Locale =>
  locales.includes(v as Locale);
export type Catalog = Record<string, Record<Locale, string>>;
const catalog = messages as Catalog;
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(catalog)
  .filter((k) => /\{\d+\}/.test(k))
  .map((key) => {
    const slots: string[] = [];
    const parts = key.split(/(\{\d+\})/g);
    const source = parts
      .map((p) => (/^\{\d+\}$/.test(p) ? (slots.push(p), '(.+?)') : escape(p)))
      .join('');
    return {
      key,
      slots,
      regex: new RegExp(`^${source}$`),
      weight: key.replace(/\{\d+\}/g, '').length,
    };
  })
  .sort((a, b) => b.weight - a.weight);
/** Translate display copy only. IDs, geometry, values and saved clinical data remain language-neutral. */
export function translate(text: string, locale: Locale, depth = 0): string {
  const key = normalize(text);
  if (!key || depth > 5) return text;
  let value = catalog[key]?.[locale];
  if (value === undefined) {
    for (const pattern of patterns) {
      const match = key.match(pattern.regex);
      if (!match) continue;
      value = catalog[pattern.key][locale];
      value = value.replace(/\{\d+\}/g, (slot) => {
        const i = pattern.slots.indexOf(slot);
        return i < 0 ? slot : translate(match[i + 1], locale, depth + 1);
      });
      break;
    }
  }
  if (value === undefined) {
    const parts = key.split(/( \/ | — | · )/);
    if (parts.length > 1) {
      const joined = parts
        .map((p, i) => (i % 2 ? p : translate(p, locale, depth + 1)))
        .join('');
      if (joined !== key) value = joined;
    }
    if (value === undefined) return text;
  }
  return (
    text.slice(0, text.length - text.trimStart().length) +
    value +
    text.slice(text.trimEnd().length)
  );
}
export const formatDate = (value: Date | number | string, locale: Locale) =>
  new Date(value).toLocaleDateString(localeTags[locale]);
