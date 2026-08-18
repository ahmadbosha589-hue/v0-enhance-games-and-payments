/**
 * Verifies the i18n deep-merge fallback actually works at runtime.
 *
 * Compile-time success only proves the types line up. These tests prove that
 * every locale declared in config.ts resolves to a COMPLETE dictionary with no
 * `undefined` leaves, that translated strings survive the merge, and that
 * untranslated subtrees fall back to English instead of rendering blank UI.
 */
import { describe, it, expect } from "vitest"
import { locales } from "@/lib/i18n/config"
import { getDictionarySync, dictionaries } from "@/lib/i18n/get-dictionary"
import { en } from "@/lib/i18n/dictionaries/en"

/** Collect every leaf path in an object, e.g. "cookies.sections.howWeUse.title". */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  )
}

function valueAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (typeof acc !== "object" || acc === null) return undefined
    return (acc as Record<string, unknown>)[part]
  }, obj)
}

const EN_PATHS = leafPaths(en)

describe("i18n dictionary completeness", () => {
  it("declares at least 18 locales", () => {
    expect(locales.length).toBeGreaterThanOrEqual(18)
  })

  it("registers every declared locale in the loader (no silent English fallback)", () => {
    for (const locale of locales) {
      expect(dictionaries[locale], `locale '${locale}' missing from loader`).toBeDefined()
    }
  })

  it.each(locales)("locale '%s' exposes every English key with a non-empty string", (locale) => {
    const dict = getDictionarySync(locale)
    const missing: string[] = []

    for (const path of EN_PATHS) {
      const value = valueAt(dict, path)
      if (typeof value !== "string" || value.length === 0) {
        missing.push(path)
      }
    }

    expect(missing, `${locale} has ${missing.length} missing/blank keys: ${missing.slice(0, 5).join(", ")}`).toEqual([])
  })

  it("keeps real translations instead of overwriting them with English", () => {
    const es = getDictionarySync("es")
    // Spanish translates these; they must NOT equal the English text.
    expect(es.nav.dashboard).not.toBe(en.nav.dashboard)
    expect(es.common.loading).not.toBe(en.common.loading)
  })

  it("falls back to English for untranslated subtrees", () => {
    // zh has no `cookies` section of its own, so it inherits English wholesale.
    const zh = getDictionarySync("zh")
    expect(zh.cookies.title).toBe(en.cookies.title)
  })

  it("applies the newly backfilled nav/admin/footer keys per locale", () => {
    const zh = getDictionarySync("zh")
    expect(zh.nav.earn).toBe("赚取")
    expect(zh.footer.aml).toBe("反洗钱政策")
    expect(zh.admin.adManagement).toBe("广告管理")

    const de = getDictionarySync("de")
    expect(de.nav.ptc).toBe("PTC-Anzeigen")
    expect(de.admin.systemSettings).toBe("Systemeinstellungen")
  })

  it("never leaks a literal 'undefined' into any rendered string", () => {
    for (const locale of locales) {
      const dict = getDictionarySync(locale)
      for (const path of EN_PATHS) {
        const value = valueAt(dict, path)
        expect(String(value), `${locale}.${path}`).not.toContain("undefined")
      }
    }
  })
})
