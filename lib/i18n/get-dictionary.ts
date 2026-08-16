// =====================================================
// Dictionary Loader - All Languages
// =====================================================

import type { Locale } from "./config"
import { en } from "./dictionaries/en"
import { ar } from "./dictionaries/ar"
import { es } from "./dictionaries/es"
import { pt } from "./dictionaries/pt"
import { zh } from "./dictionaries/zh"
import { ru } from "./dictionaries/ru"
import { fr } from "./dictionaries/fr"
import { de } from "./dictionaries/de"
import { ja } from "./dictionaries/ja"
import { ko } from "./dictionaries/ko"

const dictionaries = {
  en,
  ar,
  es,
  pt,
  zh,
  ru,
  fr,
  de,
  ja,
  ko,
}

export async function getDictionary(locale: Locale) {
  return dictionaries[locale] || dictionaries.en
}

export function getDictionarySync(locale: Locale) {
  return dictionaries[locale] || dictionaries.en
}

export { dictionaries }
