"""Package the studio lockup for system players. Pass --original to rebuild the PNGs."""
import argparse
from pathlib import Path

from mutagen.id3 import APIC, PictureType
from mutagen.mp3 import MP3

assets = Path(__file__).resolve().parents[1] / "public" / "assets"
stem = "visionoir-original-cover-v1"
sizes = (96, 180, 192, 512)

def render(original):
    from PIL import Image, ImageChops, ImageOps

    with Image.open(original) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        # Detect ink only for the crop. Resample the original, including its antialiasing.
        difference = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
        ink = difference.convert("L").point(lambda value: 255 if value > 85 else 0).getbbox()
        if not ink:
            raise ValueError("No visible mark in the supplied artwork")
        mark = image.crop(ink)
        side = round(max(mark.size) / 0.87)
        cover = Image.new("RGB", (side, side), "white")
        cover.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
        for size in sizes:
            cover.resize((size, size), Image.Resampling.LANCZOS).save(
                assets / f"{stem}-{size}.png", optimize=True
            )

        # Browsers can also request /favicon.ico without reading the page's link tags.
        cover.resize((96, 96), Image.Resampling.LANCZOS).save(
            assets.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
        )


def embed(directory):
    cover = (assets / f"{stem}-512.png").read_bytes()
    for song in sorted(directory.glob("visionoir-*.mp3")):
        recording = MP3(song)
        if recording.tags is None:
            recording.add_tags()
        tag = recording.tags
        pictures = tag.getall("APIC")
        fronts = [picture for picture in pictures if picture.type == PictureType.COVER_FRONT]
        if len(fronts) == 1 and fronts[0].mime == "image/png" and fronts[0].data == cover:
            continue
        for picture in fronts:
            del tag[picture.HashKey]
        tag.add(APIC(encoding=0, mime="image/png", type=PictureType.COVER_FRONT,
                     desc="VISIONOIR", data=cover))
        tag.save(song, v2_version=3 if tag.version[1] == 3 else 4)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path)
    parser.add_argument("--embed", type=Path, metavar="MP3_DIRECTORY")
    args = parser.parse_args()
    if args.original:
        render(args.original)
    if args.embed:
        embed(args.embed)
    if not args.original and not args.embed:
        parser.error("Specify --original and/or --embed")
