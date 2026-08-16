// =====================================================
// Internationalization Configuration
// =====================================================

export const defaultLocale = "en"

export const locales = [
  "en",
  "es",
  "pt",
  "ar",
  "zh",
  "ru",
  "fr",
  "de",
  "ja",
  "ko",
  "tr",
  "vi",
  "th",
  "id",
  "nl",
  "pl",
  "uk",
  "cs",
] as const

export type Locale = (typeof locales)[number]

export const localeNames: Record<Locale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  ar: "العربية",
  zh: "中文",
  ru: "Русский",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  nl: "Nederlands",
  pl: "Polski",
  uk: "Українська",
  cs: "Čeština",
}

export const rtlLocales: Locale[] = ["ar"]

export function isRTL(locale: Locale): boolean {
  return rtlLocales.includes(locale)
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return isRTL(locale) ? "rtl" : "ltr"
}
