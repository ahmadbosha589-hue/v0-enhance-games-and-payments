#!/usr/bin/env python3
"""Micro-fill: the last 8 missing keys for hi and it."""
import json
import re
from pathlib import Path

REPO = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare")
TR = REPO / "lib/i18n/translations.ts"
BSLASH = chr(92)

FILLS = {
    "hi": {
        "about.cta.description": "हज़ारों उपयोगकर्ताओं के साथ जुड़ें जो हर दिन मुफ़्त बिटकॉइन कमा रहे हैं। अभी साइन अप करें और कुछ ही मिनटों में अपने पहले सैटोशी का दावा करें।",
        "about.cta.title": "कमाई शुरू करने के लिए तैयार?",
        "common.copy": "कॉपी करें",
        "common.learnMore": "और जानें",
        "footer.rights": "सर्वाधिकार सुरक्षित",
        "nav.features": "विशेषताएँ",
        "nav.getStarted": "शुरू करें",
        "nav.howItWorks": "यह कैसे काम करता है",
    },
    "it": {
        "common.copy": "Copia",
        "common.learnMore": "Scopri di più",
        "common.previous": "Precedente",
        "footer.rights": "Tutti i diritti riservati",
        "nav.features": "Funzionalità",
        "nav.getStarted": "Inizia",
        "nav.howItWorks": "Come funziona",
        "nav.signIn": "Accedi",
    },
}


def find_block_end(src: str, entry_start: int) -> int:
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
for loc, fills in FILLS.items():
    m = re.search(r"\n  %s: \{" % loc, src)
    close_brace = find_block_end(src, m.start())
    interior = src[src.index("{", m.start()) + 1:close_brace]
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
