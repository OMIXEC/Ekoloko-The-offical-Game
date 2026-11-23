#!/usr/bin/env python3
"""Strip links to the original/foreign Ekoloko builds from app code and config.

Only app files are touched (never docs, which keep provenance links).
Run with --check in CI to fail if a forbidden link reappears.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "client",
    ROOT / "backend" / "server" / "src",
    ROOT / "backend" / "server" / "config",
    ROOT / "desktop" / "src",
]
EXTS = {".html", ".xml", ".js", ".json", ".action"}
SKIP_PARTS = {"node_modules", ".git", "dist", "database"}

HOSTS = [
    "ekoloko.cf", "ekoloko.com", "ekoloko.org", "ekoloko.ml",
    "ekoloko.co.il", "ekoloko.plimus.com", "playtesting.ekoloko.org",
    "macromedia.com", "doubleclick.net", "googlesyndication.com",
    "google-analytics.com", "kidsafeseal.com", "tranzila.com",
    "discord.gg", "unpkg.com", "ifeel.co.il", "allmag.co.il",
]
HOST_ALT = "|".join(re.escape(h).replace(r"\.", r"\.") for h in HOSTS)
URL_RE = re.compile(
    r"(?:https?:)?//(?:[A-Za-z0-9-]+\.)*(?:" + HOST_ALT + r")(?::\d+)?(?:/[^\s\"'<>()]*)?",
    re.IGNORECASE,
)
# Bare domain strings (analytics config, comments, JS literals) that have no scheme.
BARE_RE = re.compile(
    r"\.?(?:www\.)?(?:ekoloko\.cf|ekoloko\.com|ekoloko\.org|"
    r"play\.ekoloko\.[a-z]+|download\.macromedia\.com|unpkg\.com|discord\.gg)",
    re.IGNORECASE,
)


def files():
    for base in TARGETS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in EXTS:
                continue
            if any(part in SKIP_PARTS for part in path.parts):
                continue
            yield path


def main():
    check_only = "--check" in sys.argv
    changed = 0
    hits = 0
    for path in files():
        try:
            text = path.read_text(encoding="utf-8-sig")
        except (UnicodeDecodeError, OSError):
            continue
        new, count = URL_RE.subn("/", text)
        new, bare = BARE_RE.subn("/", new)
        count += bare
        if not count:
            continue
        hits += count
        if not check_only:
            path.write_text(new, encoding="utf-8")
            changed += 1
    if check_only:
        if hits:
            print(f"forbidden external URLs: {hits}")
            return 1
        print("link check: clean")
        return 0
    print(f"sanitized {hits} URLs in {changed} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
