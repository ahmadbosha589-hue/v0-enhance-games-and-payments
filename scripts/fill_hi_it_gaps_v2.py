#!/usr/bin/env python3
"""Final gap-fill for hi (139) and it (133) — brace-counting block locator.

The previous attempt matched `},` across the translations map's closing brace
and corrupted the file. This version locates each locale's TRUE block end by
counting braces from the entry line, then inserts the new keys immediately
before that closing brace.
"""
import json
import re
from pathlib import Path

REPO = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare")
TR = REPO / "lib/i18n/translations.ts"
BSLASH = chr(92)

# Fill dicts (same content as the previous attempt).
fills_by_loc = json.loads(
    Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/i18n-gaps/final-hi-it.json")
    .read_text(encoding="utf-8")
)


def find_block_end(src: str, entry_start: int) -> int:
    """Return the index of the `}` that closes the object opened at
    entry_start (the `{` on that line), counting braces outside strings."""
    i = src.index("{", entry_start)
    depth = 0
    in_str = False
    while i < len(src):
        c = src[i]
        if in_str:
            if c == BSLASH:
                i += 2
                continue
            if c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    raise ValueError("unbalanced braces")


src = TR.read_text(encoding="utf-8")
total = 0
for loc, fills in fills_by_loc.items():
    entry_re = re.compile(r"\n  %s: \{[^\n]*" % loc)
    m = entry_re.search(src)
    if not m:
        print(f"{loc}: entry line not found")
        continue
    # The block interior starts after the `{` on this line
    open_brace = src.index("{", m.start())
    close_brace = find_block_end(src, m.start())
    interior = src[open_brace + 1:close_brace]
    already = set(re.findall(r'\n\s+"([a-zA-Z.]+)":', interior))
    additions = []
    for k, v in fills.items():
        if k in already:
            continue
        safe_v = v.replace(BSLASH, BSLASH + BSLASH).replace('"', BSLASH + '"')
        additions.append(f'  "{k}": "{safe_v}",')
    if not additions:
        print(f"{loc}: nothing to add")
        continue
    insert = "\n" + "\n".join(additions)
    src = src[:close_brace] + insert + src[close_brace:]
    total += len(additions)
    print(f"{loc}: +{len(additions)} keys")

TR.write_text(src, encoding="utf-8")
print(f"TOTAL ADDED: {total}")
