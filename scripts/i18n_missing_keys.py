#!/usr/bin/env python3
"""Report which flat-translation keys each locale in translations.ts lacks,
with the English values, so gaps can be filled precisely."""
import re
import sys

SRC = r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/translations.ts"
src = open(SRC, encoding="utf-8").read()

m = re.search(r"export const en: Record<TranslationKey, string> = \{(.*?)\n\}", src, re.S)
en_block = m.group(1)
en_keys = set(re.findall(r"\n\s+\"([a-zA-Z.]+)\":", en_block))
en_vals = dict(re.findall(r"\n\s+\"([a-zA-Z.]+)\":\s*\n?\s*\"((?:[^\"\\]|\\.)*)\"", en_block))

locales = re.findall(r"\nconst (es|ru|zh|ja|ko|cs|fr|de|pt|ar|tr|vi|th|id|nl|pl|uk): Record<TranslationKey, string> = \{", src)
blocks = re.split(r"\n(?=const (?:es|ru|zh|ja|ko|cs|fr|de|pt|ar|tr|vi|th|id|nl|pl|uk): Record<TranslationKey, string> = \{)", src)

sel = sys.argv[1:] if len(sys.argv) > 1 else None
for name, block in zip(locales, blocks[1:]):
    if sel and name not in sel:
        continue
    keys = set(re.findall(r"\n\s+\"([a-zA-Z.]+)\":", block))
    missing = sorted(en_keys - keys)
    print(f"=== {name}: {len(keys)}/{len(en_keys)} overridden, {len(missing)} missing ===")
    for k in missing:
        v = en_vals.get(k, "?").replace("\n", " ")
        print(f'  "{k}": "{v}",')
