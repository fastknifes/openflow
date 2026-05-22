import type { I18nResource, Locale } from './types.js'
import { zhCN } from './zh-cn.js'
import { en } from './en.js'

const resources: Record<Locale, I18nResource> = {
  'zh-CN': zhCN,
  en,
}

let currentLocale: Locale = 'zh-CN'

/**
 * Set the active locale for i18n.
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale
}

/**
 * Get the currently active locale.
 */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * Detect locale from a natural-language text sample.
 * Returns 'zh-CN' if significant Chinese characters are found, otherwise 'en'.
 */
export function detectLocaleFromText(text: string): Locale {
  // CJK Unified Ideographs range
  const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const totalCharCount = text.replace(/\s/g, '').length
  if (totalCharCount === 0) return currentLocale
  // If more than 10% of non-whitespace chars are Chinese, treat as Chinese
  return chineseCharCount / totalCharCount > 0.1 ? 'zh-CN' : 'en'
}

/**
 * Translate a key into the current locale.
 * Supports simple interpolation with `{key}` placeholders.
 */
export function t<K extends keyof I18nResource>(
  key: K,
  interpolations?: Record<string, string>,
): I18nResource[K] {
  const resource = resources[currentLocale] ?? resources['zh-CN']
  let value = resource[key]

  if (interpolations && typeof value === 'string') {
    value = (value as string).replace(/\{(\w+)\}/g, (_match, name) => {
      return interpolations[name] ?? _match
    }) as unknown as I18nResource[K]
  }

  return value
}

/**
 * Shorthand for accessing string-array resources (e.g. signal words).
 */
export function tArray<K extends keyof I18nResource>(
  key: K,
): Extract<I18nResource[K], string[]> {
  const resource = resources[currentLocale] ?? resources['zh-CN']
  const value = resource[key]
  if (!Array.isArray(value)) {
    throw new TypeError(`i18n key "${key}" does not resolve to a string array`)
  }
  return value as Extract<I18nResource[K], string[]>
}

/**
 * Get a keyword pattern list for regex construction.
 * Returns patterns suitable for `new RegExp(pattern, 'iu')`.
 */
export function tPatterns(
  key: 'resolver.featureKeywords',
): Array<{ pattern: string; tags: string[] }> {
  const resource = resources[currentLocale] ?? resources['zh-CN']
  const value = resource[key]
  if (!Array.isArray(value)) {
    throw new TypeError(`i18n key "${key}" does not resolve to an array`)
  }
  return value as Array<{ pattern: string; tags: string[] }>
}
