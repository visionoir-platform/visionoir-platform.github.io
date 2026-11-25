"""Check a frontal Acid frame from qa-material-phases.cjs, on a runner with Pillow.

python src/creator/tools/qa-acid-reflections.py <private-proof>/desktop-acid-audio.png
The input is the stage crop taken with its camera locked, without a caption or border.
"""

import argparse
import json
from PIL import Image


def quantile(values, fraction):
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def measure(image):
    image = image.convert("RGB")
    image.thumbnail((240, 300), Image.Resampling.BICUBIC)
    width, height = image.size
    pixel = image.load()
    luminance, green_separation = [], []
    change_across = change_along = 0
    for y in range(round(height * .43), round(height * .78)):
        # Locate the garment in this row. Exclude the head, peripheral fragments,
        # stage controls and background. Include the dark folds between green peaks.
        coat = []
        for x in range(width):
            red, green, blue = pixel[x, y]
            if green - red > 14 and green - blue > 8 and green > 48:
                coat.append(x)
        if len(coat) < 9:
            continue
        left, right = quantile(coat, .03), quantile(coat, .90)
        span = right - left
        for x in range(round(left + .12 * span), round(left + .63 * span)):
            red, green, blue = pixel[x, y]
            luminance.append((.2126 * red + .7152 * green + .0722 * blue) / 255)
            green_separation.append((green - red) / 255)
            change_across += abs(green - pixel[x + 1, y][1])
            change_along += abs(green - pixel[x, y + 1][1])
    if len(luminance) < 500 or not change_along:
        raise ValueError("No measurable frontal Acid coat in this frame")
    return {
        "samples": len(luminance),
        "p10": quantile(luminance, .10),
        "p90": quantile(luminance, .90),
        "greenSeparation": quantile(green_separation, .50),
        "horizontalToVerticalVariation": change_across / change_along,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frame")
    with Image.open(parser.parse_args().frame) as frame:
        result = measure(frame)
    print(json.dumps(result, indent=2))
    if not (result["p10"] < .35 and result["p90"] - result["p10"] > .36
            and result["greenSeparation"] > .13 and result["horizontalToVerticalVariation"] > 1.45):
        raise SystemExit("Acid needs a green coat with deep shadows and contrasting longitudinal reflections")
