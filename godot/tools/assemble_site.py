#!/usr/bin/env python3
"""Add the original canvas game under site/classic without touching the sources.

The Godot page is already exported into the site directory. This copies
index.html, js/, css/, and assets/ (when present) into classic/ and inserts
a link back to the Godot build. The source tree is only read.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CLASSIC_LINK = """<a id="nightfall-godot-link" href="../">Godot version</a>
<style>
#nightfall-godot-link {
  position: fixed;
  z-index: 40;
  left: 12px;
  bottom: 12px;
  padding: 6px 10px;
  background: rgba(8, 6, 10, 0.78);
  border: 1px solid rgba(239, 230, 214, 0.28);
  color: #efe6d6;
  font: 12px/1 "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-decoration: none;
}
#nightfall-godot-link:hover { background: #2a2433; }
</style>
"""


def assemble(site: Path) -> None:
    index = site / "index.html"
    if not index.is_file():
        raise SystemExit(f"Godot export is missing {index}")

    classic = site / "classic"
    if classic.exists():
        shutil.rmtree(classic)
    classic.mkdir(parents=True)

    for name in ("index.html", "js", "css", "assets"):
        src = ROOT / name
        if not src.exists():
            continue
        dest = classic / name
        if src.is_dir():
            shutil.copytree(src, dest)
        else:
            shutil.copy2(src, dest)

    html_path = classic / "index.html"
    html = html_path.read_text(encoding="utf-8")
    if 'id="nightfall-godot-link"' not in html:
        if "</body>" not in html:
            raise SystemExit(f"{html_path} has no </body> tag to attach the Godot link")
        html = html.replace("</body>", CLASSIC_LINK + "</body>", 1)
        html_path.write_text(html, encoding="utf-8")

    # Skip Jekyll so GitHub Pages serves wasm, pck, and worklet files as-is.
    (site / ".nojekyll").write_text("", encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {sys.argv[0]} <site-dir>")
    assemble(Path(sys.argv[1]).resolve())


if __name__ == "__main__":
    main()
