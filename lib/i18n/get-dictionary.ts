// =====================================================
// Dictionary Loader - All Languages
// =====================================================
//
// Non-English dictionaries are PARTIAL by design: a locale only has to declare
// the sections it has actually translated. Every dictionary is deep-merged over
// English at module load, so:
//   - every locale exposes the complete `Dictionary` shape (no runtime holes)
//   - untranslated keys fall back to English instead of rendering `undefined`
//   - adding a translation is a pure addition; nothing else has to change
//
// Previously each locale was typed as the exact `Dictionary`, which made a
// partial translation a compile error (TS2740 x16) and forced contributors to
// either copy all 469 English strings or leave the locale out of the loader
// entirely — which is why tr/vi/th/id/nl/pl/uk/cs were declared in config.ts
// and exported from dictionaries/index.ts but never registered here (TS7053).

import type { Locale } from "./config"
import { locales, defaultLocale } from "./config"
import type { Dictionary } from "./dictionaries/en"
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
import { tr } from "./dictionaries/tr"
import { vi } from "./dictionaries/vi"
import { th } from "./dictionaries/th"
import { id } from "./dictionaries/id"
import { nl } from "./dictionaries/nl"
import { pl } from "./dictionaries/pl"
import { uk } from "./dictionaries/uk"
import { cs } from "./dictionaries/cs"

/** Recursively optional: any subtree may be omitted at any depth. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** A translation that may omit any subtree; gaps are filled from English. */
export type PartialDictionary = DeepPartial<Dictionary>

/**
 * Deep-merge a partial translation over the English base.
 *
 * Recurses into nested objects (e.g. `cookies.sections.whatAreCookies.title`),
 * so a locale can translate one leaf deep inside a tree and inherit the rest.
 * A translated value that is an empty string is treated as "not translated" and
 * keeps the English text, so a blank entry can never blank out live UI.
 */
function mergeDeep<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base

  // String leaf: take the override only when it carries real content.
  if (typeof base === "string") {
    return typeof override === "string" && override.length > 0 ? (override as T) : base
  }

  // Non-plain-object leaf (number, boolean, array): replace wholesale.
  if (typeof base !== "object" || Array.isArray(base)) {
    return (override as T) ?? base
  }

  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  const src = override as Record<string, unknown>

  for (const key of Object.keys(out)) {
    if (key in src) {
      out[key] = mergeDeep(out[key], src[key])
    }
  }

  return out as T
}

function mergeDictionary(base: Dictionary, override: PartialDictionary): Dictionary {
  return mergeDeep(base, override)
}

const rawDictionaries: Record<Locale, PartialDictionary> = {
  en,
  es,
  pt,
  ar,
  zh,
  ru,
  fr,
  de,
  ja,
  ko,
  tr,
  vi,
  th,
  id,
  nl,
  pl,
  uk,
  cs,
}

/**
 * Fully-resolved dictionaries: every locale in `config.locales` is present and
 * complete. Built once at module load — `getDictionary` is a plain lookup.
 */
const dictionaries: Record<Locale, Dictionary> = locales.reduce(
  (acc, locale) => {
    acc[locale] = locale === defaultLocale ? en : mergeDictionary(en, rawDictionaries[locale] ?? {})
    return acc
  },
  {} as Record<Locale, Dictionary>,
)

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale] ?? dictionaries[defaultLocale]
}

export function getDictionarySync(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale]
}

export { dictionaries }
