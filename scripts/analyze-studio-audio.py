"""Build visual envelopes from the actual studio MP3s, independent of audio output."""
import argparse
import base64
import json
import subprocess
from pathlib import Path

import numpy as np

RATE = 24000
FPS = 25
WINDOW = 2048
BANDS = ((30, 200), (200, 2200), (2200, 10000))


def analyze(source):
    pcm = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(source),
        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-",
    ])
    samples = np.frombuffer(pcm, dtype="<f4")
    hop = RATE // FPS
    count = (len(samples) + hop - 1) // hop
    padded = np.pad(samples, (WINDOW // 2, WINDOW // 2))
    window = np.hanning(WINDOW)
    freq = np.fft.rfftfreq(WINDOW, 1 / RATE)
    bands = [(freq >= low) & (freq <= high) for low, high in BANDS]
    frames = np.empty((count, 4), dtype=np.uint8)
    for i in range(count):
        frame = padded[i * hop:i * hop + WINDOW]
        spectrum = np.abs(np.fft.rfft(frame * window)) / (window.sum() / 2)
        db = 20 * np.log10(np.maximum(spectrum, 1e-8))
        strength = np.clip((db + 90) / 70, 0, 1)
        values = [strength[mask].mean() for mask in bands]
        values.append(min(1, 2.2 * np.sqrt(np.mean(frame * frame))))
        frames[i] = np.rint(255 * np.asarray(values)).astype(np.uint8)
    return {"fps": FPS, "frames": base64.b64encode(frames.tobytes()).decode("ascii")}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path, nargs="?", default=Path("public/assets"))
    folder = parser.parse_args().assets
    for source in sorted(folder.glob("visionoir-*.mp3")):
        target = source.with_suffix(".levels.json")
        target.write_text(json.dumps(analyze(source), separators=(",", ":")) + "\n")
        print(target.name)
