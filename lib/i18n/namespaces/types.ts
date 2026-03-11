// =====================================================
// Namespace Types - Define all available namespaces
// =====================================================

export const NAMESPACES = [
  "common", // Shared translations (buttons, labels, etc.)
  "nav", // Navigation translations
  "hero", // Hero section
  "features", // Features section
  "howItWorks", // How it works section
  "stats", // Stats section
  "faq", // FAQ section
  "cta", // CTA section
  "footer", // Footer translations
  "auth", // Authentication pages
  "dashboard", // Dashboard pages
  "settings", // Settings page
  "claim", // Claim page
  "wallet", // Wallet/withdrawal
  "referral", // Referral system
  "leaderboard", // Leaderboard page
  "admin", // Admin panel
  "errors", // Error messages
  "about", // About page
  "contact", // Contact page
  "blog", // Blog page
  "adblock", // Adblock detection
  "antibot", // Anti-bot verification
  "time", // Time-related translations
  "legal", // Legal pages (terms, privacy)
  "notifications", // Notification messages
  "testimonials", // Testimonials section
] as const

export type Namespace = (typeof NAMESPACES)[number]

export type SupportedLocale =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ru"
  | "zh"
  | "ja"
  | "ko"
  | "ar"
  | "tr"
  | "vi"
  | "th"
  | "id"
  | "nl"
  | "pl"
  | "uk"
  | "cs"
  | "it"
  | "hi"

// Alias for backwards compatibility
export type LanguageCode = SupportedLocale

export interface Language {
  code: SupportedLocale
  name: string
  nativeName: string
  flag: string
  dir?: "ltr" | "rtl"
}

export const languages: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪", dir: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇧🇷", dir: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺", dir: "ltr" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦", dir: "rtl" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷", dir: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳", dir: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱", dir: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", flag: "🇵🇱", dir: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", flag: "🇺🇦", dir: "ltr" },
  { code: "cs", name: "Czech", nativeName: "Čeština", flag: "🇨🇿", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹", dir: "ltr" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
]

// Type for translation values (nested object or string)
export type TranslationValue = string | { [key: string]: TranslationValue }
export type TranslationRecord = Record<string, TranslationValue>

// Translation cache type
export type TranslationCache = Map<string, Record<string, unknown>>

// Default locale
export const DEFAULT_LOCALE: SupportedLocale = "en"

// RTL languages
export const RTL_LANGUAGES: SupportedLocale[] = ["ar"]

// Check if a language is RTL
export function isRTL(locale: SupportedLocale): boolean {
  return RTL_LANGUAGES.includes(locale)
}

// Get language by code
export function getLanguageByCode(code: string): Language | undefined {
  return languages.find((lang) => lang.code === code)
}

// Validate if a string is a valid locale
export function isValidLocale(locale: string): locale is SupportedLocale {
  return languages.some((lang) => lang.code === locale)
}
