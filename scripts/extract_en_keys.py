#!/usr/bin/env python3
"""Extract the EN flat-translation key/value list from translations.ts into a
JSON file that translation subagents can consume."""
import re
import json

SRC = r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/translations.ts"
OUT = r"C:/Users/pc/AppData/Local/hermes/cache/scratch/en_flat_keys.json"

src = open(SRC, encoding="utf-8").read()
m = re.search(r"export const en: Record<TranslationKey, string> = \{(.*?)\n\}", src, re.S)
en_block = m.group(1)
key_re = re.compile(r'\n\s+"([a-zA-Z.]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"')
pairs = key_re.findall(en_block)
print("en keys extracted:", len(pairs))
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(dict(pairs), f, ensure_ascii=False, indent=1)
print("saved", OUT)
