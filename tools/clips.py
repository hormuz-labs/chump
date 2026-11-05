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
sys.path.insert(0, str(Path(__file__).parent))
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
    # clips located by tools/findclips.py from YouTube captions: a window around the hit
    found = CACHE / "found.json"
    langs = {}
    if found.exists():
        from findclips import WANT
        for name, hit in json.loads(found.read_text()).items():
            if hit and hit["score"] >= 0.7 and name not in CLIPS:
                CLIPS[name] = (hit["id"], max(0, int(hit["t"]) - 10), int(hit["t"]) + 25, WANT[name][1])
                langs[name] = hit["lang"]
    models = {}
    report = json.loads((CACHE / "clips.json").read_text()) if (CACHE / "clips.json").exists() else {}
    for name, (vid, a, b, phrase) in CLIPS.items():
        if ONLY and name not in ONLY:
            continue
        try:
            src = fetch(vid, a, b)
        except Exception as e:
            print(name, "FAILED to fetch", e, flush=True)
            continue
        # read the 16 kHz mono wav ourselves (faster-whisper's own decoder trips on newer PyAV)
        with wave.open(str(src)) as wf:
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32) / 32768
        hebrew = langs.get(name) == "iw"
        key = "small" if hebrew else "small.en"
        models.setdefault(key, WhisperModel(key, device="cpu", compute_type="int8"))
        segments, _ = models[key].transcribe(pcm, word_timestamps=True, vad_filter=True, language="he" if hebrew else "en")
        words = [w for s in segments for w in s.words]
        t0, t1, score = find(words, phrase)
        if score < 0.75:
            print(name, "SKIPPED, best match", round(score, 2), flush=True)
            continue
        heard = " ".join(w.word.strip() for w in words if t0 - 0.01 <= w.start and w.end <= t1 + 0.01)
        start, end = max(0, t0 - 0.2), t1 + 0.35
        dur = end - start
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(src),
            "-af", f"afade=t=in:d=0.08,afade=t=out:st={max(0, dur - 0.15):.2f}:d=0.15,loudnorm=I=-16:TP=-1.5",
            "-ac", "1", "-b:a", "80k", str(OUT / f"{name}.mp3"),
        ], check=True)
        # the words as heard, timed from the start of the clip, for the synced caption
        timed = [{"w": w.word.strip(), "t": round(w.start - start, 2)} for w in words if t0 - 0.01 <= w.start and w.end <= t1 + 0.01]
        (OUT / f"{name}.json").write_text(json.dumps({"words": timed, "rtl": hebrew}, ensure_ascii=False))
        report[name] = {"score": round(score, 2), "heard": heard, "video": vid, "at": round(a + t0, 1), "seconds": round(dur, 1)}
        print(name, report[name], flush=True)
    (CACHE / "clips.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
