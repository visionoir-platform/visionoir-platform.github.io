"""Build track-coloured fallback stills and turntables from the approved portrait renders.

Run `python3 src/creator/tools/grade-fallback.py` from the project root.
Requires Node.js on PATH, Python 3 and Pillow with WebP support (tested on
Pillow 12.1.1). Inputs are the public poster and turntable images and the
palette in src/palette.js. The distributed images are already generated.
"""
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageChops, ImageColor, ImageOps

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / 'public' / 'creator'
# Shadow, specular highlight, metallic midtone level, and grade strength.
PROFILES = {
    'noir': ('#0c0814', '#c9bbdc', 0.55, 0.9),
    'afterimage': ('#1a0d15', '#fffaf8', 0.84, 0.75),
    'alloy': ('#160e09', '#fffaf8', 0.77, 0.83),
    'aura': ('#071617', '#f4fffe', 0.83, 0.75),
}


def grade_frame(frame, accent, profile):
    rgb = frame.convert('RGB')
    light = ImageOps.grayscale(rgb)
    shadow, highlight, level, strength = profile
    midtone = tuple(round(c * level) for c in ImageColor.getrgb(accent))
    tinted = ImageOps.colorize(light, shadow, highlight, mid=midtone)
    # Framing and head height are fixed in each 24-view render. Preserve the
    # photographed head, then introduce reflected colour across the clothing.
    width, height = rgb.size
    ramp = Image.new('L', (1, height))
    ramp.putdata([round(255 * strength * min(1, max(0, (y / height - 0.28) / 0.12)))
                  for y in range(height)])
    material = light.point([min(255, max(0, (v - 18) * 8)) for v in range(256)])
    weight = ImageChops.multiply(ramp.resize((width, height), Image.Resampling.NEAREST), material)
    result = Image.composite(tinted, rgb, weight)
    if frame.mode == 'RGBA':
        result.putalpha(frame.getchannel('A'))
    return result


def render(path, track, palette):
    atlas = path.name.startswith('turntable')
    columns, rows = (6, 4) if atlas else (1, 1)
    with Image.open(path) as source:
        width, height = source.width // columns, source.height // rows
        result = Image.new(source.mode, source.size)
        for row in range(rows):
            for col in range(columns):
                x, y = col * width, row * height
                cell = source.crop((x, y, x + width, y + height))
                result.paste(grade_frame(cell, palette[track], PROFILES[track]), (x, y))
        stem = 'turntable' if atlas else 'poster'
        target = path.with_name(path.name.replace(stem, f'{stem}-{track}', 1))
        result.save(target, 'WEBP', quality=86, method=4)


if __name__ == '__main__':
    palette = json.loads(subprocess.check_output(
        ['node', '--input-type=module', '-e',
         'import {trackAccents} from "./src/palette.js";console.log(JSON.stringify(trackAccents))'],
        cwd=ROOT))
    for name in ('poster', 'poster-liquid', 'turntable', 'turntable-liquid'):
        for mode in PROFILES:
            render(ASSETS / (name + '.webp'), mode, palette)
