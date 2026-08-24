"""Stamps ?v=<content-hash> onto local CSS/JS references in the HTML files.

GitHub Pages serves assets with Cache-Control: max-age=600, so without this a
visitor who loaded the site before a deploy keeps executing stale JS for up to
ten minutes - long enough to look like the deploy silently failed. Hashing the
content means the URL changes only when the file changes, so browsers fetch the
new bytes immediately and keep caching aggressively otherwise.

Run after editing anything in web/assets/, before deploying:
    python scripts/stamp_assets.py
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / "web"

# src="assets/js/x.js" or href="assets/css/x.css", with or without an old stamp.
REF = re.compile(r'((?:src|href)=")(assets/[^"?]+\.(?:js|css))(?:\?v=[0-9a-f]+)?(")')


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def main() -> int:
    if not WEB.is_dir():
        print(f"error: {WEB} not found", file=sys.stderr)
        return 1

    cache: dict[str, str] = {}
    missing: list[str] = []
    changed = 0

    for html in sorted(WEB.glob("*.html")):
        original = html.read_text(encoding="utf-8")

        def stamp(m: re.Match) -> str:
            rel = m.group(2)
            if rel not in cache:
                target = WEB / rel
                if not target.is_file():
                    missing.append(rel)
                    cache[rel] = ""
                else:
                    cache[rel] = digest(target)
            h = cache[rel]
            return f"{m.group(1)}{rel}{'?v=' + h if h else ''}{m.group(3)}"

        updated = REF.sub(stamp, original)
        if updated != original:
            html.write_text(updated, encoding="utf-8")
            changed += 1
            print(f"stamped {html.name}")

    if missing:
        print(f"error: referenced asset(s) not found: {sorted(set(missing))}", file=sys.stderr)
        return 1

    print(f"done - {changed} file(s) updated, {len([v for v in cache.values() if v])} asset(s) hashed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
