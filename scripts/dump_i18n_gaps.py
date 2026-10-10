#!/usr/bin/env python3
"""Dump, per non-EN locale, the flat keys still missing after merging the
namespace translations — as JSON files under the scratch dir so translation
backfill scripts can consume them."""
import json
import sys
import importlib.util
from pathlib import Path

REPO = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare")
OUT_DIR = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/i18n-gaps")
OUT_DIR.mkdir(parents=True, exist_ok=True)

spec = importlib.util.spec_from_file_location("flatten_namespaces", str(REPO / "scripts/flatten_namespaces.py"))
fn = importlib.util.module_from_spec(spec)
sys.modules["flatten_namespaces"] = fn
spec.loader.exec_module(fn)

en_flat = json.loads(Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/en_flat_keys.json").read_text(encoding="utf-8"))
en_keys = set(en_flat)

for loc in fn.LOCALES:
    if loc == "en":
        continue
    merged = {}
    for ns_file in sorted((fn.NS / loc).glob("*.ts")):
        if ns_file.name == "index.ts":
            continue
        prefix = fn.SECTION_PREFIX.get(ns_file.stem)
        if prefix is None:
            continue
        flat = fn.parse_ns_file(ns_file)
        for k, v in flat.items():
            full = f"{prefix}.{k}" if not k.startswith(prefix + ".") else k
            if full in en_keys:
                merged[full] = v
    # Also merge the existing flat overrides from translations.ts
    src = (REPO / "lib/i18n/translations.ts").read_text(encoding="utf-8")
    m = None
    for mm in __import__("re").finditer(r"\nconst (%s): Record<TranslationKey, string> = \{(.*?)\n\}" % loc, src, __import__("re").S):
        m = mm
    if m:
        block = m.group(2)
        for k, v in __import__("re").findall(r'\n\s+"([a-zA-Z.]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"', block):
            merged[k] = v
    still_missing = sorted(en_keys - set(merged))
    out = {"locale": loc, "covered": merged, "missing_keys": still_missing, "en_values": {k: en_flat[k] for k in still_missing}}
    (OUT_DIR / f"{loc}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{loc}: covered {len(merged)}/{len(en_keys)}, missing {len(still_missing)} -> {OUT_DIR / (loc + '.json')}")
