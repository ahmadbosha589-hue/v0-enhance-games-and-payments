#!/usr/bin/env python3
"""Apply per-locale translation JSONs (from
C:/Users/pc/AppData/Local/hermes/cache/scratch/i18n-translations/<loc>.json)
into the flat blocks in lib/i18n/translations.ts.

For each locale:
  - locates its `const <loc>: Record<TranslationKey, string> = {` block
  - adds any keys from the JSON that aren't already in the block, inserted
    just before the block's closing brace
  - reports per-locale counts
Idempotent: re-running adds nothing.
"""
from pathlib import Path
import json
import re
import sys

REPO = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare")
TR = REPO / "lib/i18n/translations.ts"
SRC_DIR = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/i18n-translations")

# it/hi have no Record blocks in translations.ts; they use spread entries
# `it: { ...en, ...itTranslations }`. For them we append overrides INSIDE the
# spread object expression instead.
SPREAD_ENTRIES = {"it", "hi"}

src = TR.read_text(encoding="utf-8")
total = 0
locales = sys.argv[1:] or sorted(p.stem for p in SRC_DIR.glob("*.json"))

for loc in locales:
    path = SRC_DIR / f"{loc}.json"
    if not path.exists():
        print(f"{loc}: no translation JSON, skipped")
        continue
    t = json.loads(path.read_text(encoding="utf-8"))["t"]

    if loc in SPREAD_ENTRIES:
        # Find `  it: { ...en, ...itTranslations },` inside the translations map
        entry_re = re.compile(r"(  %s: \{ \.\.\.en, \.\.\.%sTranslations \},?)" % (loc, loc))
        m = entry_re.search(src)
        if not m:
            print(f"{loc}: spread entry not found")
            continue
        existing_keys = set()
        extra_files = {
            "it": REPO / "lib/i18n/italian-translations.ts",
            "hi": REPO / "lib/i18n/hindi-translations.ts",
        }
        ef = extra_files[loc]
        if ef.exists():
            existing_keys = set(re.findall(r"\n\s+\"([a-zA-Z.]+)\":", ef.read_text(encoding="utf-8")))
        additions = [f'  "{k}": "{v}",' for k, v in t.items() if k not in existing_keys]
        if not additions:
            print(f"{loc}: nothing to add")
            continue
        # Replace the spread entry with a full inline block
        inner = "\n".join(additions)
        replacement = f"  {loc}: {{\n    ...en,\n{inner}\n  }},"
        src = src[: m.start(1)] + replacement + src[m.end(1):]
        total += len(additions)
        print(f"{loc}: converted spread entry to full block, +{len(additions)} keys")
        continue

    block_re = re.compile(r"(const %s: Record<TranslationKey, string> = \{)" % loc)
    m = block_re.search(src)
    if not m:
        print(f"{loc}: BLOCK NOT FOUND")
        continue
    block_start = m.end()
    close = src.find("\n}", block_start)
    if close == -1:
        print(f"{loc}: closing brace not found")
        continue
    block = src[block_start:close]
    already = set(re.findall(r"\n\s+\"([a-zA-Z.]+)\":", block))
    additions = []
    for k, v in t.items():
        if k in already:
            continue
        safe_v = v.replace("\\", "\\\\").replace('"', '\\"')
        additions.append(f'  "{k}": "{safe_v}",')
    if not additions:
        print(f"{loc}: nothing to add")
        continue
    insert = "\n" + "\n".join(additions)
    src = src[:close] + insert + src[close:]
    total += len(additions)
    print(f"{loc}: +{len(additions)} keys")

TR.write_text(src, encoding="utf-8")
print(f"TOTAL ADDED: {total}")
