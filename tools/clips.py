"""Cut the real audio for a few quotes from public-domain US government video.

For each clip: yt-dlp fetches the audio track (lowest quality) and a window around the moment is cut,
faster-whisper (small.en) transcribes it with word timings, the quote's
phrase is found by fuzzy matching the words, and ffmpeg cuts it from the
first word to the last (with a little air and a fade) into public/audio/.

Sources are White House / National Archives and Department of War
recordings, which are US government works (public domain).

Run: python tools/clips.py <cache-folder> [names...]
"""

import difflib
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio"
CACHE = Path(sys.argv[1])
ONLY = set(sys.argv[2:])
YTDLP = str(Path(sys.executable).parent / "yt-dlp")

# name: (video id, window start s, window end s, phrase to find)
CLIPS = {
    "trump-injection": ("PsQnfpfIa_o", 1585, 1645, "is there a way we can do something like that by injection inside or almost a cleaning"),
    "trump-genius": ("g_wiSOe0G2k", 2350, 2395, "i'm an extremely stable genius"),
    "trump-television": ("ajxSWocbye8", 2935, 2975, "this is going to be great television"),
    "vance-thankyou": ("ajxSWocbye8", 2635, 2670, "have you said thank you once this entire meeting"),
    "rubio-fourjobs": ("inRXd4OWt2M", 8255, 8305, "the most meaningful labor day of my life as someone with four jobs"),
    "hegseth-fat": ("8BA5EwsR_rI", 900, 1080, "fat generals and admirals in the halls of the pentagon"),
    "hegseth-beardos": ("8BA5EwsR_rI", 1040, 1200, "no more beardos"),
    "netanyahu-nobel": ("xx0ad5vwC08", 75, 125, "it's nominating you for the peace prize which is well deserved and you should get it"),
}

norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'"))


def fetch(vid: str, a: int, b: int) -> Path:
    # YouTube refuses ranged downloads through ffmpeg, so take the whole audio
    # track at the lowest quality once, then cut the window out locally
    full = CACHE / f"{vid}.m4a"
    if not full.exists():
        subprocess.run([
            YTDLP, "-q", "--no-warnings", "-f", "worstaudio[ext=m4a][language^=en]/worstaudio[language^=en]/worstaudio[ext=m4a]/worstaudio",
            "-o", str(full), f"https://www.youtube.com/watch?v={vid}",
        ], check=True)
    path = CACHE / f"{vid}-{a}-{b}.wav"
    if not path.exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", str(full),
                        "-ac", "1", "-ar", "16000", str(path)], check=True)
    return path


def find(words, phrase: str):
    """Best fuzzy match of the phrase in the transcript words: (start s, end s, score)."""
    target = [norm(w) for w in phrase.split()]
    said = [norm(w.word) for w in words]
    best = (0.0, 0, 0)
    n = len(target)
    for i in range(len(said)):
        for m in (n - 2, n - 1, n, n + 1, n + 2):
            if m <= 0 or i + m > len(said):
                continue
            r = difflib.SequenceMatcher(None, target, said[i:i + m]).ratio()
            if r > best[0]:
                best = (r, i, i + m)
    r, i, j = best
    return words[i].start, words[j - 1].end, r


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    report = {}
    for name, (vid, a, b, phrase) in CLIPS.items():
        if ONLY and name not in ONLY:
            continue
        src = fetch(vid, a, b)
        # read the 16 kHz mono wav ourselves (faster-whisper's own decoder trips on newer PyAV)
        with wave.open(str(src)) as wf:
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32) / 32768
        segments, _ = model.transcribe(pcm, word_timestamps=True, vad_filter=True, language="en")
        words = [w for s in segments for w in s.words]
        t0, t1, score = find(words, phrase)
        heard = " ".join(w.word.strip() for w in words if t0 - 0.01 <= w.start and w.end <= t1 + 0.01)
        start, end = max(0, t0 - 0.2), t1 + 0.35
        dur = end - start
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(src),
            "-af", f"afade=t=in:d=0.08,afade=t=out:st={max(0, dur - 0.15):.2f}:d=0.15,loudnorm=I=-16:TP=-1.5",
            "-ac", "1", "-b:a", "80k", str(OUT / f"{name}.mp3"),
        ], check=True)
        report[name] = {"score": round(score, 2), "heard": heard, "at": round(a + t0, 1), "seconds": round(dur, 1)}
        print(name, report[name], flush=True)
    (CACHE / "clips.json").write_text(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
