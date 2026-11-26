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
    ".github/workflows/pages.yml", "tests/locales.test.mjs", "tests/device-tilt.test.mjs", "tests/device-shake.test.mjs", "tests/instagram.test.mjs",
    "scripts/prepare-player-artwork.py", "scripts/localize.mjs", "scripts/deploy-pages.py", "scripts/analyze-studio-audio.py", "scripts/synthesize-modes.py", "scripts/synthesize-soundtrack.py",
    "scripts/synthesize-premium.py", "scripts/audio-premium-requirements.txt",
    "public/favicon.svg", "public/favicon.ico", "tools/editor-visionoir.html",
]
paths += [str(file.relative_to(root)) for file in (root/"src").rglob("*") if file.is_file() and not file.is_symlink() and "__pycache__" not in file.parts and not file.name.startswith(".")]
paths += [
    str(file.relative_to(root)) for file in (root/"public/assets").glob("*")
    if file.suffix in {".jpg",".webp",".woff2",".svg",".txt",".json"}
]
paths.extend(str(f.relative_to(root)) for f in (root / "public/assets").glob("visionoir-original-cover-v1-*.png"))
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
# Stage the music application and its original distributable assets separately from the private masters.
for fixed in ("support/index.html", "scripts/ecosystem-locales.mjs", "scripts/portals.mjs", "scripts/policy-page.mjs", "tests/support.test.mjs", "tests/frequency-door.test.mjs", "scripts/support-sandbox.mjs", "scripts/qa-ecosystem.cjs", "scripts/check-frequency-release.mjs", "scripts/pages-csp.mjs", "scripts/qa-pages-privacy.cjs", "tests/pages-csp.test.mjs",
              "LICENSE", "COPYRIGHT.md", "TRADEMARKS.md", "CREDITS.md", "ASSET_LICENSES.md", "ASSET_PROVENANCE.md",
              "THIRD_PARTY_NOTICES.md", "USER_CONTENT_POLICY.md", "CONTRIBUTING.md", "SECURITY.md", "SBOM.json"):
    paths.append(fixed)
for directory in ("frequency", "public/creator"):
    for item in (root / directory).rglob("*"):
        if item.is_file() and not item.is_symlink() and not any(part.startswith(".") or part in {"node_modules", "__pycache__"} for part in item.parts) and item.suffix.casefold() not in {".blend", ".wav", ".zip", ".als", ".log", ".pyc"}:
            paths.append(str(item.relative_to(root)))
for rel in paths:
    source = root/rel
    output = target/rel
    output.parent.mkdir(parents=True, exist_ok=True)
    if source.name.startswith("synthesize"):
        output.write_text(source.read_text().replace("/opt/homebrew/bin/ffmpeg","ffmpeg"))
    else:
        shutil.copy2(source,output)
# Private working notes contain access and QA details. Only the release summary
# belongs in the public checkout, where it already has its canonical filename.
checkpoint = root / 'release' / 'VISIONOIR_CHECKPOINT.md'
if not checkpoint.is_file():
    checkpoint = root / 'VISIONOIR_CHECKPOINT.md'
if not checkpoint.read_text().startswith('# VISIONOIR · Registro pubblico di rilascio\n'):
    raise ValueError('Missing public release checkpoint')
shutil.copy2(checkpoint, target / 'VISIONOIR_CHECKPOINT.md')
print(f"Staged {len(paths)} public source files.")
