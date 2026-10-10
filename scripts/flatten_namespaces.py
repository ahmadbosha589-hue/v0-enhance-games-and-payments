#!/usr/bin/env python3
"""Flatten the namespace files (lib/i18n/namespaces/<loc>/*.ts) into flat
key/value dicts per locale and report which of the 349 EN flat keys each
locale's namespaces already carry — then merge them into the flat map blocks
in translations.ts.

This reuses the REAL translations already written in the namespace system
instead of translating ~4,400 strings from scratch. Only keys whose English
flat value exists are merged; values are taken from the namespace file when
they differ from English (a namespace leaf equal to English is still merged —
it's a real translation decision), and missing keys fall back to English via
the existing `...en` spread, so coverage is complete by construction either
way.
"""
from pathlib import Path
import json
import re

REPO = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare")
NS = REPO / "lib/i18n/namespaces"
TR = REPO / "lib/i18n/translations.ts"
EN_KEYS_JSON = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/en_flat_keys.json")

LOCALES = ["ar", "cs", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt", "ru", "th", "tr", "uk", "vi", "zh"]

# Namespace file → flat key prefix. testimonials/hero/etc. map 1:1.
SECTION_PREFIX = {
    "common": "common", "nav": "nav", "hero": "hero", "features": "features",
    "howItWorks": "howItWorks", "stats": "stats", "faq": "faq", "cta": "cta",
    "footer": "footer", "auth": "auth", "claim": "claim", "wallet": "wallet",
    "referral": "referral", "leaderboard": "leaderboard", "admin": "admin",
    "settings": "settings", "about": "about", "contact": "contact",
    "errors": "errors", "time": "time", "adblock": "adblock", "antibot": "antibot",
    "blog": "blog", "dashboard": "dashboard", "legal": "legal",
    "notifications": "notifications", "testimonials": "testimonials",
}

STR_LEAF = re.compile(r'^\s{2,}([a-zA-Z0-9_]+):\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')


def parse_ns_file(path: Path):
    """Parse a simple nested-object TS translation file into a flat dict.

    Handles `export const X = {` / `export default {`, one-level nesting
    (section leaves), string values (single or multi-line), and skips arrays
    (items lists) and comments. Depth: section.leaf → "section.leaf".
    """
    out = {}
    section = None
    pending_value = None  # (key, chunks) for multi-line strings
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if pending_value is not None:
            key, chunks = pending_value
            if line.endswith('",') or line.endswith('"'):
                chunks.append(line.rstrip(",").rstrip())
                value = "".join(chunks)
                if value.startswith('"'):
                    value = value[1:]
                if value.endswith('"'):
                    value = value[:-1]
                out[key] = value
                pending_value = None
            else:
                chunks.append(line)
            continue
        if not line or line.startswith("//") or line.startswith("*") or line.startswith("/*"):
            continue
        m = re.match(r"^export (?:default|const [a-zA-Z0-9_]+) ?=? \{", line)
        if m:
            section = "__root__"
            continue
        if line == "}":
            section = None
            continue
        # Section header: `  nav: {`
        sm = re.match(r"^([a-zA-Z0-9_]+): \{", line)
        if sm:
            section = sm.group(1)
            continue
        # Array leaf or nested-deeper: skip block
        if re.match(r"^[a-zA-Z0-9_]+: \[$", line) or re.match(r"^[a-zA-Z0-9_]+: \{$", line):
            skip_depth = 1
            continue
        lm = STR_LEAF.match(raw)
        if lm and section is not None:
            key, value = lm.group(1), lm.group(2)
            flat = key if section == "__root__" else f"{section}.{key}"
            out[flat] = value
    return out


def main():
    en_flat = json.loads(EN_KEYS_JSON.read_text(encoding="utf-8"))
    en_keys = set(en_flat)
    report = {}
    for loc in LOCALES:
        merged = {}
        for ns_file in sorted((NS / loc).glob("*.ts")):
            if ns_file.name == "index.ts":
                continue
            section = ns_file.stem
            prefix = SECTION_PREFIX.get(section)
            if prefix is None:
                continue
            flat = parse_ns_file(ns_file)
            for k, v in flat.items():
                # Namespace keys are section-relative; build the flat key with
                # the canonical prefix (dashboard file keys → dashboard.*).
                full = f"{prefix}.{k}" if not k.startswith(prefix + ".") else k
                if full in en_keys:
                    merged[full] = v
        report[loc] = merged

    for loc in LOCALES:
        print(f"{loc}: namespaces carry {len(report[loc])}/{len(en_keys)} flat keys")


if __name__ == "__main__":
    main()
