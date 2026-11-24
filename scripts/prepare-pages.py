#!/usr/bin/env python3
"""Stage an explicit, reproducible public source tree without large audio binaries."""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve()
target.mkdir(parents=True, exist_ok=False)
paths = [
    "index.html", "package.json", "package-lock.json", "vite.config.js",
    ".gitignore", "README.md", "AUDIO-PREMIUM.md", "ASSETS.md",
    ".github/workflows/pages.yml", "tests/locales.test.mjs",
    "scripts/localize.mjs", "scripts/deploy-pages.py", "scripts/analyze-studio-audio.py", "scripts/synthesize-modes.py", "scripts/synthesize-soundtrack.py",
    "scripts/synthesize-premium.py", "scripts/audio-premium-requirements.txt",
    "public/favicon.svg", "tools/editor-visionoir.html",
]
paths += [str(file.relative_to(root)) for file in (root/"src").rglob("*") if file.is_file()]
paths += [
    str(file.relative_to(root)) for file in (root/"public/assets").glob("*")
    if file.suffix in {".jpg",".webp",".woff2",".svg",".txt",".json"}
]
paths.extend(["unseen/index.html", ".github/workflows/unseen-check.yml", "scripts/prepare-pages.py"])
# Only original distribution directories are staged; private profiles and references live outside the checkout.
for directory, suffixes in (
    ("game", {".md", ".css", ".js", ".mjs", ".cjs", ".py", ".tsv", ".score", ".json", ".png", ".gif"}),
    ("public/unseen/art", {".png", ".json"}),
    ("public/unseen/audio", {".m4a", ".js", ".json", ".txt"}),
):
    for file in sorted((root / directory).rglob("*")):
        if file.is_file() and (file.suffix in suffixes or file.name=="LICENSE") and "__pycache__" not in file.parts:
            paths.append(str(file.relative_to(root)))
for rel in paths:
    source = root/rel
    output = target/rel
    output.parent.mkdir(parents=True, exist_ok=True)
    if source.name.startswith("synthesize"):
        output.write_text(source.read_text().replace("/opt/homebrew/bin/ffmpeg","ffmpeg"))
    else:
        shutil.copy2(source,output)
print(f"Staged {len(paths)} public source files.")
