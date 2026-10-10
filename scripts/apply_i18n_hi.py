#!/usr/bin/env python3
"""Apply the Hindi translations JSON into translations.ts: convert the
single-line `hi: { ...en, ...hiTranslations },` entry into a full block that
preserves the hiTranslations spread and adds all missing keys."""
import json
import re
from pathlib import Path

p = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/translations.ts")
src = p.read_text(encoding="utf-8")
hi_t = json.loads(
    Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/i18n-translations/hi.json")
    .read_text(encoding="utf-8")
)["t"]

# existing keys in hindi-translations.ts (still merged via the spread)
ef = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/hindi-translations.ts")
existing = set(re.findall(r'\n\s+"([a-zA-Z.]+)":', ef.read_text(encoding="utf-8")))

BSLASH = chr(92)
additions = []
for k, v in hi_t.items():
    if k in existing:
        continue
    safe_v = v.replace(BSLASH, BSLASH + BSLASH).replace('"', BSLASH + '"')
    additions.append(f'  "{k}": "{safe_v}",')

inner = "\n".join(additions)
old = "  hi: { ...en, ...hiTranslations },"
new = "  hi: {\n    ...en,\n    ...hiTranslations,\n" + inner + "\n  },"
assert old in src, "hi spread entry not found"
src = src.replace(old, new, 1)
p.write_text(src, encoding="utf-8")
print(f"hi: converted to full block, +{len(additions)} keys")
