#!/usr/bin/env python3
"""Report (or quarantine) duplicate scrape artifacts in client/.

Files like `main.swf%3fversion%3d9.0.0.0` are HTTP query strings captured by
the original scraper. When a canonical `main.swf` exists and no app file
references the junk name, the copy is redundant.

Default: dry run, prints a report. `--apply` moves candidates into
`client/.dedupe-trash/` instead of deleting them, so the change is reversible.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "client"
TRASH = CLIENT / ".dedupe-trash"
JUNK_RE = re.compile(r"^(.*)%3f.*$", re.IGNORECASE)
SCAN_EXTS = {".html", ".xml", ".js", ".json", ".action"}


def text_sources():
    for p in CLIENT.rglob("*"):
        if p.is_file() and p.suffix.lower() in SCAN_EXTS and TRASH not in p.parents:
            try:
                yield p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                pass


def main():
    apply = "--apply" in sys.argv
    texts = list(text_sources())
    candidates = []
    for p in CLIENT.rglob("*"):
        if not p.is_file() or TRASH in p.parents:
            continue
        m = JUNK_RE.match(p.name)
        if not m:
            continue
        canonical = p.with_name(m.group(1))
        if not canonical.exists():
            continue
        if any(p.name in t for t in texts):
            continue  # still referenced — do not touch
        candidates.append((p, canonical))

    total = sum(p.stat().st_size for p, _ in candidates)
    print(f"candidates: {len(candidates)} files, {total / 1024 / 1024:.1f} MB")
    for p, _ in candidates[:20]:
        print(f"  {p.relative_to(ROOT)}")
    if len(candidates) > 20:
        print(f"  ... and {len(candidates) - 20} more")

    if not apply:
        print("dry run only — pass --apply to quarantine")
        return 0
    TRASH.mkdir(parents=True, exist_ok=True)
    moved = 0
    for p, _ in candidates:
        target = TRASH / p.relative_to(CLIENT)
        target.parent.mkdir(parents=True, exist_ok=True)
        p.replace(target)
        moved += 1
    print(f"quarantined {moved} files into {TRASH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
