#!/usr/bin/env python3
"""Remove dead ad/analytics script tags left after URL sanitisation.

Sanitising external URLs to '/' turned ad/GA script tags into `src="/"`,
which loads an HTML document as JavaScript and throws SyntaxError. This
script removes those tags, GA tracker blocks, and adsbygoogle remnants.

Default dry run; pass --apply to write.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "client"

DEAD_SRC = re.compile(r'<script\b[^>]*\bsrc\s*=\s*["\']/["\'][^>]*>\s*</script\s*>', re.I)
TRACKER_BLOCK = re.compile(
    r'<script\b[^>]*>(?:(?!</script>).)*?(?:gaJsHost|pageTracker|_gat\.|adsbygoogle)(?:(?!</script>).)*?</script\s*>',
    re.I | re.S,
)
ADS_INS = re.compile(r'<ins\b[^>]*class=["\'][^"\']*adsbygoogle[^"\']*["\'][^>]*>.*?</ins\s*>', re.I | re.S)


def main():
    apply = "--apply" in sys.argv
    changed = 0
    removals = 0
    for p in CLIENT.rglob("*.html"):
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        new = DEAD_SRC.sub("", text)
        new = TRACKER_BLOCK.sub("", new)
        new = ADS_INS.sub("", new)
        new = re.sub(r"<title>\s*/+\s*</title>", "<title>Ekoloko</title>", new, flags=re.I)
        if new != text:
            changed += 1
            removals += len(DEAD_SRC.findall(text)) + len(TRACKER_BLOCK.findall(text)) + len(ADS_INS.findall(text))
            if apply:
                p.write_text(new, encoding="utf-8")
    print(f"files: {changed}, removals: {removals}")
    if not apply:
        print("dry run only — pass --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
