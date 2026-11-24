#!/usr/bin/env python3
"""Compose, master and verify two original VISIONOIR scores, with no samples.

Portable Python/NumPy + FFmpeg/libmp3lame; no DAW, network, compiler or macOS API.
Run `python3 scripts/synthesize-premium.py --track all` after installing NumPy.
Existing masters are never touched. Replacing these two masters needs --force.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import wave

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SR = 44100
ARTIST = "VISIONOIR"
PRODUCTION = "Sintesi originale assistita per VISIONOIR"
COPYRIGHT = "© 2026 VISIONOIR. Rights notice as indicated."
EMAIL = "visionoir.platform@gmail.com"
TAU = 2 * np.pi
SCORES = {
    "alloy": {"title": "METALLOGRAM", "bpm": 130, "bars": 112,
              "seed": 2026112401, "filename": "visionoir-metallogram.mp3", "lufs": -15,
              "key": "D minor", "character": "Rhythmic metallic / Lega",
              "sections": [(0, 8, "Materiale"), (8, 24, "Incisione"),
                           (24, 48, "Moto"), (48, 64, "Rifrazione"),
                           (64, 96, "Lega"), (96, 112, "Residuo")]},
    "aura": {"title": "VELUM", "bpm": 84, "bars": 72,
             "seed": 2026112402, "filename": "visionoir-velum.mp3", "lufs": -16,
             "key": "E minor", "character": "Cinematic atmospheric / Aura",
             "sections": [(0, 8, "Soglia"), (8, 24, "Emergenza"),
                          (24, 36, "Ascesa"), (36, 44, "Sospensione"),
                          (44, 64, "Orizzonte"), (64, 72, "Dissolvenza")]},
}


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def time_axis(duration):
    return np.arange(round(duration * SR), dtype=np.float32) / SR


def envelope(t, attack, decay, release=.025):
    attack_curve = np.minimum(t / max(attack, .0001), 1)
    release_curve = np.minimum((len(t) / SR - t) / release, 1)
    return attack_curve * np.exp(-t / decay) * release_curve


def band_limit(x, low=0, high=9000):
    """Zero-phase, gentle spectral shaping for individually enveloped voices."""
    freq = np.fft.rfftfreq(len(x), 1 / SR)
    curve = 1 / np.sqrt(1 + (freq / high) ** 12)
    if low:
        curve *= 1 / np.sqrt(1 + (low / np.maximum(freq, .001)) ** 12)
    return np.fft.irfft(np.fft.rfft(x) * curve, n=len(x)).astype(np.float32)


class Score:
    def __init__(self, mode):
        self.mode = mode
        self.meta = SCORES[mode]
        self.beat = 60 / self.meta["bpm"]
        self.bar = 4 * self.beat
        self.n = round(self.meta["bars"] * self.bar * SR)
        self.rng = np.random.default_rng(self.meta["seed"])
        self.drums = np.zeros((self.n, 2), dtype=np.float32)
        self.music = np.zeros_like(self.drums)
        self.space = np.zeros_like(self.drums)
        self.kicks = []

    def add(self, stem, voice, at, gain=1., pan=0):
        start = round(at * SR)
        if start < 0 or start >= self.n:
            return
        length = min(len(voice), self.n - start)
        if voice.ndim == 2:
            stem[start:start+length] += voice[:length] * gain
        else:
            # A single centre voice feeds L/R equally; bass never uses stereo spread.
            stem[start:start+length, 0] += voice[:length] * (gain * math.sqrt((1-pan)/2))
            stem[start:start+length, 1] += voice[:length] * (gain * math.sqrt((1+pan)/2))

    def echo(self, stem, voice, at, gain, pan=0, delay=.75, repeats=3):
        self.add(stem, voice, at, gain, pan)
        # Darker, quieter repeats, not a full-band wall of sound.
        tail = band_limit(voice, 240, 3200) if voice.ndim == 1 else voice
        for repeat in range(1, repeats+1):
            self.add(stem, tail, at + self.beat*delay*repeat,
                     gain*.24*(.46**(repeat-1)), .55*(-1)**repeat)

    def noise(self, duration, low, high):
        x = self.rng.standard_normal(round(duration*SR)).astype(np.float32)
        x = band_limit(x, low, high)
        return x / max(.001, np.sqrt(np.mean(x*x)))

    def kick(self, soft=False):
        duration = .62 if soft else .45
        t = time_axis(duration)
        base = 41.2 if soft else 49
        f = base + (54 if soft else 91)*np.exp(-t*35) + 16*np.exp(-t*145)
        phase = TAU*np.cumsum(f, dtype=np.float64)/SR
        body = np.sin(phase)*np.exp(-t/(.115 if soft else .10))
        body += .075*np.sin(phase*2)*np.exp(-t/.035)
        click = self.noise(duration, 1700, 4200)*np.exp(-t*360)*(.008 if soft else .024)
        return (np.tanh((body+click)*1.17)*np.minimum(t/.0018, 1)*.75).astype(np.float32)

    def hit_kick(self, voice, at, gain):
        self.add(self.drums, voice, at, gain)
        self.kicks.append(at)

    def hat(self, open_hat=False, soft=False):
        duration = .25 if open_hat else .075
        t = time_axis(duration)
        x = self.noise(duration, 4200, 8500 if not soft else 6500)
        # Tiny pitched component; noise is spectrally rounded above 8 kHz.
        x = x*.25 + np.sin(TAU*4213*t)*np.sin(TAU*5719*t)*.025
        return x*envelope(t, .0012, .055 if open_hat else .018)

    def clap(self):
        duration = .24
        t = time_axis(duration)
        env = np.zeros_like(t)
        for offset, amplitude, decay in [(0, .9, .011), (.012, .65, .013), (.025, .55, .043)]:
            age = np.maximum(0, t-offset)
            env += np.where(t >= offset, amplitude*np.exp(-age/decay), 0)
        return self.noise(duration, 950, 5100)*env*.24*np.minimum(t/.0008, 1)

    def metal(self, note, duration=.5, decay=.105, brightness=.6):
        t = time_axis(duration)
        f = hz(note)
        # Struck resonator partials, with quick high-mode damping.
        x = np.sin(TAU*f*t)*np.exp(-t/decay)
        for ratio, amplitude, damping in [(1.502, .29, .7), (2.761, .15, .42), (4.071, .065, .23)]:
            x += np.sin(TAU*f*ratio*t + .15)*amplitude*brightness*np.exp(-t/(decay*damping))
        return x*np.minimum(t/.002, 1)*np.minimum((duration-t)/.02, 1)*.65

    def pluck(self, note, duration=.8, mellow=False):
        t = time_axis(duration)
        phase = TAU*hz(note)*t
        x = np.sin(phase)
        for harmonic, gain in [(2, .30), (3, .13), (4, .045)]:
            x += gain*np.sin(phase*harmonic)*np.exp(-t*(2.7*harmonic if mellow else 1.6*harmonic))
        return x*envelope(t, .012 if mellow else .004, .6 if mellow else .18)*.65

    def bass(self, note, duration, decay=.24):
        t = time_axis(duration)
        phase = TAU*hz(note)*t
        x = np.sin(phase)+.22*np.sin(phase*2)+.055*np.sin(phase*3)
        return np.tanh(x*1.1)*envelope(t, .007, decay, .055)*.72

    def chord(self, notes, duration=.8, decay=.22):
        t = time_axis(duration)
        x = np.zeros_like(t)
        for i, note in enumerate(notes):
            phase = TAU*hz(note)*t + i*.17
            for harmonic, gain in [(1, 1), (2, .32), (3, .09), (4, .025)]:
                x += gain*np.sin(phase*harmonic)*np.exp(-t*harmonic*1.8)/len(notes)
        return x*envelope(t, .009, decay, .035)

    def pad(self, notes, at, duration, gain, movement=.15):
        t = time_axis(duration)
        env = np.minimum(t/1.4, 1)*np.minimum((duration-t)/2.2, 1)
        # Smooth equal-power onset/offset, for overlapping chord changes.
        env = np.sin(np.clip(env, 0, 1)*np.pi/2)**2
        stereo = np.zeros((len(t), 2), dtype=np.float32)
        for channel in (0, 1):
            voice = np.zeros_like(t)
            for i, note in enumerate(notes):
                detune = 1 + (-1 if channel == 0 else 1)*.0008
                phase = TAU*hz(note)*detune*t + i*.51
                slow = .85+movement*np.sin(TAU*(.07+.011*i)*t+i*.8)
                voice += (np.sin(phase)*.75 + np.sin(phase*2)*.12 +
                          np.sin(phase*3)*.035)*slow/len(notes)
            stereo[:, channel] = voice*env
        self.add(self.space, stereo, at, gain)

    def swell(self, at, duration, gain, reverse=False):
        t = time_axis(duration)
        env = np.sin(np.pi*t/duration)**2
        if reverse:
            env *= (t/duration)**1.5
        x = self.noise(duration, 850, 3800)*env
        self.add(self.space, x, at, gain, -.2)

    def finish_pcm(self, path):
        # Kick-triggered musical ducking, rather than an always-running LFO.
        duck = np.ones(self.n, dtype=np.float32)
        recovery = .13 if self.mode == "alloy" else .24
        curve = 1-(.53 if self.mode == "alloy" else .30)*np.exp(-time_axis(recovery*6)/recovery)
        for at in self.kicks:
            start = round(at*SR)
            size = min(len(curve), self.n-start)
            np.minimum(duck[start:start+size], curve[:size], out=duck[start:start+size])
        self.music *= duck[:, None]
        self.drums += self.music
        del self.music
        self.space *= (.65+.35*duck[:, None])
        self.drums += self.space
        del self.space
        mix = self.drums
        del self.drums
        del duck
        # Keep the stereo difference out of the kick/sub range and remove DC.
        mid = (mix[:, 0]+mix[:, 1])*.5
        side = (mix[:, 0]-mix[:, 1])*.5
        side = band_limit(side, 180, 10000)
        mix[:, 0] = mid+side
        mix[:, 1] = mid-side
        del mid, side
        mix -= np.mean(mix, axis=0, dtype=np.float64)
        # Mild soft saturation at the mix stage, not a clipped loudness shortcut.
        np.tanh(mix*1.10, out=mix)
        mix *= .81/max(.001, float(np.max(np.abs(mix))))
        intro = round(.05*SR)
        outro = round((1.8 if self.mode == "aura" else .65)*SR)
        mix[:intro] *= np.linspace(0, 1, intro, dtype=np.float32)[:, None]
        mix[-outro:] *= np.linspace(1, 0, outro, dtype=np.float32)[:, None]
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(SR)
            # Chunked serialization keeps memory lower than a full PCM copy.
            for start in range(0, self.n, SR*8):
                samples = np.clip(mix[start:start+SR*8], -1, 1)
                wav.writeframes((samples*32767).astype("<i2").tobytes())
        del mix


def metallogram():
    s = Score("alloy")
    kick, hat, open_hat, clap = s.kick(), s.hat(), s.hat(True), s.clap()
    rim = s.metal(75, .18, .032, .48)
    chords = [[62, 65, 69, 76], [58, 62, 65, 69], [55, 62, 65, 69], [60, 64, 67, 74]]
    bass_roots = [38, 34, 31, 36]
    # Two phrases answer one another; later sections transpose/invert the response.
    motif_a = [(0, 74), (.75, 81), (1.5, 77), (2.75, 72), (3.25, 76)]
    motif_b = [(.25, 74), (1.25, 77), (2, 81), (2.75, 79), (3.5, 76)]
    for bar in range(s.meta["bars"]):
        start = bar*s.bar
        full = 24 <= bar < 48 or 64 <= bar < 96
        break_ = 48 <= bar < 56
        groove = 8 <= bar < 104 and not break_
        energy = 1 if full else .72
        # Intro begins with metal/air; low pulse joins after four bars.
        for beat in range(4):
            at = start+beat*s.beat
            if 4 <= bar < 108 and not break_:
                if not (56 <= bar < 60 and beat in (1, 3)):
                    s.hit_kick(kick, at, .90 if groove else .74)
            if groove:
                s.add(s.drums, open_hat, at+.5*s.beat, .19*energy, .15)
                if full or bar % 4 >= 2:
                    s.add(s.drums, hat, at+.27*s.beat, .09*energy, -.27)
                    s.add(s.drums, hat, at+.78*s.beat, .065*energy, .31)
            if (full or 16 <= bar < 24 or 96 <= bar < 104) and beat % 2:
                s.add(s.drums, clap, at, .24, -.035)
            if groove and beat in (0, 2):
                s.add(s.drums, rim, at+.76*s.beat, .115, -.22)
        chord_index = (bar//4) % 4
        if 8 <= bar < 108 and not break_:
            root = bass_roots[chord_index]
            bass_pattern = [(.0, root, .48), (.75, root, .32), (1.5, root+7, .30),
                            (2.25, root, .40), (3.25, root+12, .28), (3.75, root+7, .21)]
            if bar % 4 == 3:
                bass_pattern = bass_pattern[:-1]+[(3.5, root-2, .3)]
            for off, note, length in bass_pattern:
                if bar >= 104 and off > 2:
                    continue
                s.add(s.music, s.bass(note, length*s.beat, .17), start+off*s.beat, .34)
        if bar >= 12 and bar < 104:
            offsets = [.5, 2.25] if bar % 2 == 0 else [1.25, 3.25]
            for off in offsets:
                if break_ and off > 1:
                    continue
                voice = s.chord(chords[chord_index], 1.1, .32 if break_ else .20)
                s.echo(s.music, voice, start+off*s.beat, .26 if full else .18, -.1, repeats=3)
        if bar % 4 in (0, 2) or full:
            motif = motif_a if bar % 4 < 2 else motif_b
            for index, (off, note) in enumerate(motif):
                if not full and index % 2:
                    continue
                transposition = 12 if 80 <= bar < 88 and index == 2 else 0
                voice = s.metal(note+transposition, .85, .14 if full else .21, .45)
                s.echo(s.music, voice, start+off*s.beat,
                       (.105 if full else .072)*(1-.1*(index%2)),
                       (-.25 if index%2 else .25), delay=.75)
        if bar % 8 == 0:
            notes = [n+12 for n in chords[chord_index]]
            s.pad(notes, start, s.bar*8+.8, .10 if full else .15)
        if bar in (22, 46, 62, 94):
            s.swell(start+2*s.beat, 6*s.beat, .012, True)
        if full and bar % 8 == 7:
            for index in range(3):
                s.add(s.drums, rim, start+(3.25+index*.25)*s.beat,
                      .055+index*.015, -.18+index*.18)
    return s


def velum():
    s = Score("aura")
    kick, hat = s.kick(True), s.hat(False, True)
    soft_tick = s.metal(64, .35, .055, .15)
    # Open voicings avoid low-mid congestion; lowest pad note is G3 or above.
    chords = [[55, 59, 64, 66, 71], [55, 60, 64, 67, 71],
              [55, 59, 62, 64, 69], [57, 62, 66, 69, 76]]
    roots = [28, 24, 31, 26]
    melody = [76, 71, 74, 79, 78, 74, 71, 66]
    for bar in range(s.meta["bars"]):
        start = bar*s.bar
        index = (bar//4) % 4
        suspension = 36 <= bar < 44
        peak = 44 <= bar < 64
        pulse = 12 <= bar < 64 and not suspension
        if bar % 4 == 0:
            gain = .32 if peak else (.25 if bar >= 8 else .19)
            s.pad(chords[index], start, 4*s.bar+2.4, gain, .12)
            if peak and bar % 8 == 4:
                s.pad([n+12 for n in chords[index][1:4]], start+.5*s.beat,
                      4*s.bar+1.6, .065)
        if bar % 4 == 0 and 8 <= bar < 68:
            note = roots[index]
            # Sub fundamental + audible first harmonic, centred; no bass wideners.
            duration = s.bar*3.7
            t = time_axis(duration)
            phase = TAU*hz(note)*t
            env = np.minimum(t/.14, 1)*np.minimum((duration-t)/1.2, 1)
            bass = (np.sin(phase)+.24*np.sin(phase*2))*env*.54
            s.add(s.music, bass, start, .33 if peak else .24)
        if pulse:
            s.hit_kick(kick, start, .62 if peak else .48)
            s.hit_kick(kick, start+2*s.beat, .53 if peak else .41)
            if peak and bar % 4 == 3:
                s.hit_kick(kick, start+3.5*s.beat, .28)
            for beat in (1, 3):
                s.add(s.drums, hat, start+(beat+.5)*s.beat, .075 if peak else .05, .27)
            if bar % 2 == 0:
                s.echo(s.drums, soft_tick, start+1.5*s.beat, .055, -.25, repeats=2)
        if 8 <= bar < 68 and bar % 2 == 0:
            # Felt-like sine piano, with a slow phrase rather than an endless arp.
            offset = .5 if bar % 4 == 0 else 1.25
            selected = chords[index][1:4]
            for n, note in enumerate(selected):
                voice = s.pluck(note, 3.6, True)
                s.echo(s.music, voice, start+(offset+n*.06)*s.beat,
                       .13 if peak else .11, -.2+n*.2, delay=1.5, repeats=4)
        if 16 <= bar < 64 and not suspension:
            notes = chords[index]
            arp = [notes[1]+12, notes[3]+12, notes[2]+12, notes[4]]
            offsets = [.75, 1.75, 2.5, 3.5] if peak else [1.5, 3.25]
            for n, off in enumerate(offsets):
                voice = s.pluck(arp[(n+bar)%len(arp)], 1.6, True)
                s.echo(s.music, voice, start+off*s.beat,
                       .045 if peak else .035, -.3 if n%2 else .3, delay=.75, repeats=3)
        if bar >= 24 and bar < 68 and bar % 2 == 0:
            note = melody[((bar-24)//2)%len(melody)]
            if 48 <= bar < 56:
                note += 12 if bar % 4 == 0 else 0
            duration = 4.8 if suspension else 3.4
            t = time_axis(duration)
            phase = TAU*hz(note)*t + .015*np.sin(TAU*4.3*t)
            voice = (np.sin(phase)+.12*np.sin(phase*2))*envelope(t, .14, 1.4, .35)
            s.echo(s.music, voice, start+.5*s.beat,
                   .12 if peak else .085, .10, delay=1.5, repeats=3)
        if bar in (6, 22, 42, 62):
            s.swell(start, 2*s.bar, .006, True)
    return s


def run(command):
    return subprocess.run(command, check=True, capture_output=True, text=True)


def loudness(ffmpeg, file, target, mono=False):
    prefix = "pan=mono|c0=0.5*c0+0.5*c1," if mono else ""
    command = [ffmpeg, "-hide_banner", "-threads", "1", "-i", str(file),
               "-af", prefix+f"loudnorm=I={target}:TP=-2:LRA=11:print_format=json",
               "-threads", "1", "-f", "null", "-"]
    stderr = run(command).stderr
    return json.JSONDecoder().raw_decode(stderr[stderr.rfind("{"):])[0]


def sha256(file):
    hasher = hashlib.sha256()
    with open(file, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def signal_metrics(ffmpeg, mp3, temp):
    decoded = temp/"decoded.f32"
    run([ffmpeg, "-v", "error", "-threads", "1", "-i", str(mp3), "-ac", "2", "-ar", str(SR),
         "-f", "f32le", "-y", str(decoded)])
    x = np.memmap(decoded, dtype="<f4", mode="r").reshape(-1, 2)
    energy = np.zeros(2, dtype=np.float64)
    cross = 0.
    peak = 0.
    dc = np.zeros(2, dtype=np.float64)
    mono_energy = 0.
    for start in range(0, len(x), SR*8):
        chunk = np.asarray(x[start:start+SR*8], dtype=np.float64)
        energy += np.sum(chunk*chunk, axis=0)
        dc += np.sum(chunk, axis=0)
        cross += float(np.sum(chunk[:, 0]*chunk[:, 1]))
        mono_energy += float(np.sum(np.mean(chunk, axis=1)**2))
        peak = max(peak, float(np.max(np.abs(chunk))))
    # Uniformly sampled two-second windows for an inexpensive low-frequency M/S audit.
    mid_power, side_power = 0., 0.
    window_size = 2*SR
    window = np.hanning(window_size)
    frequencies = np.fft.rfftfreq(window_size, 1/SR)
    mask = (frequencies >= 25) & (frequencies <= 120)
    for start in np.linspace(0, len(x)-window_size, 32, dtype=int):
        chunk = np.asarray(x[start:start+window_size])
        mid = np.fft.rfft((chunk[:, 0]+chunk[:, 1])*.5*window)
        side = np.fft.rfft((chunk[:, 0]-chunk[:, 1])*.5*window)
        mid_power += float(np.sum(np.abs(mid[mask])**2))
        side_power += float(np.sum(np.abs(side[mask])**2))
    result = {"duration_seconds": round(len(x)/SR, 6), "sample_peak_dbfs": round(20*np.log10(peak), 3),
              "rms_dbfs": round(10*np.log10(float(np.sum(energy))/(len(x)*2)), 3),
              "stereo_correlation": round(cross/math.sqrt(float(energy[0]*energy[1])), 5),
              "mono_fold_rms_change_db": round(10*np.log10(mono_energy/(float(np.sum(energy))*.5)), 3),
              "bass_side_to_mid_db_25_120hz": round(10*np.log10(max(side_power, 1e-20)/mid_power), 3),
              "dc_offset": [float(value/len(x)) for value in dc],
              "boundary_jump_peak": float(np.max(np.abs(x[0]-x[-1]))),
              "first_10ms_peak_dbfs": round(20*np.log10(max(1e-12, float(np.max(np.abs(x[:441]))))), 3),
              "last_10ms_peak_dbfs": round(20*np.log10(max(1e-12, float(np.max(np.abs(x[-441:]))))), 3),
              "complete_decode_verified": True}
    del x
    decoded.unlink()
    return result


def master(score, ffmpeg, out, temp):
    meta = score.meta
    wav = temp/(score.mode+".wav")
    score.finish_pcm(wav)
    measured = loudness(ffmpeg, wav, meta["lufs"])
    print(f"{meta['title']}: PCM composed; mastering", flush=True)
    normalizer = (f"loudnorm=I={meta['lufs']}:TP=-2:LRA=11:linear=true:"
                  "measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:"
                  "measured_thresh={input_thresh}:offset={target_offset}").format(**measured)
    final = out/meta["filename"]
    encoded = temp/meta["filename"]
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-threads", "1", "-y", "-i", str(wav),
               "-af", normalizer, "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "160k",
               "-threads", "1", "-id3v2_version", "3", "-write_xing", "1"]
    tags = {"title": meta["title"], "artist": ARTIST, "album_artist": ARTIST,
            "producer": PRODUCTION, "copyright": COPYRIGHT,
            "album": "VISIONOIR — Materia e atmosfera", "date": "2026", "TBPM": str(meta["bpm"]),
            "genre": "Electronic", "license": "All rights reserved. Listening within VISIONOIR only. "+EMAIL,
            "comment": "Original deterministic synthesis; no external samples. Credits and notice requested by Flavio Giorgio Guarini."}
    for key, value in tags.items():
        command += ["-metadata", key+"="+value]
    run(command+[str(encoded)])
    check = loudness(ffmpeg, encoded, meta["lufs"])
    mono = loudness(ffmpeg, encoded, meta["lufs"], mono=True)
    result = {"id": score.mode, "mode": score.mode, "title": meta["title"], "bpm": meta["bpm"],
              "bars": meta["bars"], "key": meta["key"], "character": meta["character"],
              "src": "assets/"+meta["filename"], "filename": meta["filename"],
              "artist": ARTIST, "album_artist": ARTIST, "producer": PRODUCTION,
              "copyright": COPYRIGHT, "permissions_contact": EMAIL,
              "license_url": "assets/AUDIO-PREMIUM-LICENSE.txt", "license": "All rights reserved",
              "provenance": "Original score and deterministic DSP synthesis created for VISIONOIR with AI assistance. No external recordings, samples or interpolated melodies.",
              "seed": meta["seed"], "sample_rate": SR, "channels": 2, "bitrate_kbps": 160,
              "bytes": encoded.stat().st_size, "sha256": sha256(encoded),
              "source_pcm_sha256": sha256(wav), "generator_sha256": sha256(Path(__file__)),
              "measured_lufs": float(check["input_i"]), "measured_true_peak_dbtp": float(check["input_tp"]),
              "measured_lra_lu": float(check["input_lra"]),
              "measured_mono_lufs": float(mono["input_i"]), "measured_mono_true_peak_dbtp": float(mono["input_tp"]),
              "arrangement": [{"start_bar": start+1, "end_bar": end, "label": label,
                               "start_seconds": round(start*score.bar, 3), "end_seconds": round(end*score.bar, 3)}
                              for start, end, label in meta["sections"]]}
    result.update(signal_metrics(ffmpeg, encoded, temp))
    if result["measured_true_peak_dbtp"] > -1.5:
        raise RuntimeError("Encoded true peak exceeds -1.5 dBTP")
    if abs(result["measured_lufs"]-meta["lufs"]) > 1.25:
        raise RuntimeError("Encoded integrated loudness outside tolerance")
    if result["bass_side_to_mid_db_25_120hz"] > -28:
        raise RuntimeError("Unexpected stereo information in the sub range")
    if result["mono_fold_rms_change_db"] < -4:
        raise RuntimeError("Excessive mono cancellation")
    if result["bytes"] > 4_500_000:
        raise RuntimeError("Asset exceeds 4.5 MB budget")
    os.replace(encoded, final)
    print(json.dumps({key: result[key] for key in ["id", "title", "duration_seconds", "measured_lufs", "measured_true_peak_dbtp", "bytes"]}), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--track", choices=["all", "alloy", "aura"], default="all")
    parser.add_argument("--output-dir", type=Path, default=ROOT/"public/assets")
    parser.add_argument("--force", action="store_true", help="Replace only the selected premium audio assets")
    args = parser.parse_args()
    ffmpeg = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if not ffmpeg:
        parser.error("FFmpeg with libmp3lame is required on PATH (or set FFMPEG).")
    selected = list(SCORES) if args.track == "all" else [args.track]
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    for mode in selected:
        if (out/SCORES[mode]["filename"]).exists() and not args.force:
            parser.error(f"{SCORES[mode]['filename']} already exists; use --force to regenerate it.")
    manifest_path = out/"premium-soundtracks.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    records = {row["id"]: row for row in previous.get("tracks", [])}
    with tempfile.TemporaryDirectory(prefix="visionoir-premium-") as directory:
        temp = Path(directory)
        for mode in selected:
            print(f"Composing {SCORES[mode]['title']} ({mode})", flush=True)
            score = metallogram() if mode == "alloy" else velum()
            records[mode] = master(score, ffmpeg, out, temp)
            del score
    manifest = {"schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
                "generator": "scripts/synthesize-premium.py", "generator_version": 1,
                "generation_platform": platform.platform(), "python_version": platform.python_version(),
                "numpy_version": np.__version__, "ffmpeg_version": run([ffmpeg, "-version"]).stdout.splitlines()[0],
                "verification": "Encoded MP3 full decode and FFmpeg loudnorm (EBU R128/true peak); sampled bass mid/side spectrum; mono fold down. No critical listening session claimed.",
                "tracks": [records[mode] for mode in SCORES if mode in records]}
    temporary_manifest = out/".premium-soundtracks.json.tmp"
    temporary_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+"\n")
    os.replace(temporary_manifest, manifest_path)


if __name__ == "__main__":
    main()
