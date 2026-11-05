"""Find where each spoken quote is said on YouTube, from the videos' own captions.

For every entry: search YouTube (yt-dlp "ytsearch"), fetch each candidate's
auto-captions only (no media), fuzzy-match the phrase against them, and keep
the best hit as (video id, second). Writes <cache>/found.json, which
tools/clips.py reads to cut the audio.

Run: python tools/findclips.py <cache-folder> [names...]
"""

import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

CACHE = Path(sys.argv[1])
ONLY = set(sys.argv[2:])
YTDLP = str(Path(sys.executable).parent / "yt-dlp")

# name: (search query, phrase as said, caption language)
WANT = {
    "trump-bestwords": ("Trump \"I know words, I have the best words\" Hilton Head", "i know words i have the best words", "en"),
    "trump-cats": ("Trump debate \"they're eating the dogs\" Springfield", "they're eating the dogs the people that came in they're eating the cats", "en"),
    "trump-concepts": ("Trump \"I have concepts of a plan\" debate", "i have concepts of a plan", "en"),
    "trump-windmills": ("Trump windmills \"noise causes cancer\"", "they say the noise causes cancer", "en"),
    "trump-hannibal": ("Trump \"the late great Hannibal Lecter\"", "the late great hannibal lecter", "en"),
    "trump-shark": ("Trump shark electrocution boat battery Las Vegas", "i'll take electrocution every single time", "en"),
    "trump-weave": ("Trump \"I do the weave\"", "i do the weave", "en"),
    "trump-person": ("Trump \"person woman man camera TV\" Fox", "person woman man camera tv", "en"),
    "vance-catladies": ("JD Vance \"childless cat ladies\" Tucker Carlson 2021", "a bunch of childless cat ladies who are miserable at their own lives", "en"),
    "vance-nevertrump": ("JD Vance Charlie Rose \"never Trump guy\"", "i'm a never trump guy i never liked him", "en"),
    "vance-stories": ("JD Vance \"if I have to create stories\" CNN Dana Bash", "if i have to create stories so that the american media actually pays attention", "en"),
    "vance-factcheck": ("JD Vance \"the rules were that you guys weren't going to fact check\"", "the rules were that you guys weren't going to fact check", "en"),
    "rubio-dispel": ("Rubio \"let's dispel with this fiction\" debate", "let's dispel once and for all with this fiction that barack obama doesn't know what he's doing", "en"),
    "rubio-pants": ("Rubio Trump \"full length mirror\" pants wet Dallas", "maybe to make sure his pants weren't wet", "en"),
    "rubio-spraytan": ("Rubio \"worst spray tan in America\"", "the guy with the worst spray tan in america", "en"),
    "rubio-hands": ("Rubio \"have you seen his hands\" small hands", "you know what they say about men with small hands", "en"),
    "rubio-watches": ("Rubio \"selling watches in Manhattan\" debate", "would be right now selling watches in manhattan", "en"),
    "hegseth-hands": ("Hegseth \"I don't think I've washed my hands for 10 years\" Fox and Friends", "i don't think i've washed my hands for ten years", "en"),
    "hegseth-germs": ("Hegseth \"germs are not a real thing\"", "germs are not a real thing i can't see them therefore they're not real", "en"),
    "hegseth-warplans": ("Hegseth \"nobody was texting war plans\" Hawaii", "nobody was texting war plans and that's all i have to say about that", "en"),
    "netanyahu-bomb": ("Netanyahu UN 2012 bomb diagram red line speech", "this is a bomb this is a fuse", "en"),
    "netanyahu-redline": ("Netanyahu UN 2012 bomb diagram red line speech", "a red line should be drawn right here", "en"),
    "netanyahu-spring": ("Netanyahu UN 2012 bomb diagram red line speech", "by next spring at most by next summer", "en"),
    "netanyahu-saddam": ("Netanyahu 2002 Congress \"I guarantee you\" Saddam", "if you take out saddam saddam's regime i guarantee you that it will have enormous positive reverberations", "en"),
    "netanyahu-nothing": ("נתניהו \"לא יהיה כלום כי אין כלום\"", "לא יהיה כלום כי אין כלום", "iw"),
    "netanyahu-droves": ("נתניהו \"המצביעים הערבים נעים בכמויות אדירות לקלפיות\"", "המצביעים הערבים נעים בכמויות אדירות לקלפיות", "iw"),
}

norm = lambda w: re.sub(r"[^\w']", "", w.lower().replace("’", "'"))


def run(args, timeout=120):
    return subprocess.run([YTDLP, "-q", "--no-warnings", *args], capture_output=True, text=True, timeout=timeout)


def captions(vid: str, lang: str):
    """Caption words with times (seconds), from YouTube's json3 captions."""
    path = CACHE / "subs" / f"{vid}.{lang}.json3"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        run(["--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", f"{lang}.*,{lang}", "--sub-format", "json3",
             "-o", str(CACHE / "subs" / "%(id)s.%(ext)s"), f"https://www.youtube.com/watch?v={vid}"])
        got = sorted((CACHE / "subs").glob(f"{vid}*.json3"))
        if not got:
            return []
        got[0].rename(path)
    words = []
    for ev in json.loads(path.read_text()).get("events", []):
        t0 = ev.get("tStartMs", 0)
        for seg in ev.get("segs") or []:
            for w in seg.get("utf8", "").split():
                words.append((norm(w), (t0 + seg.get("tOffsetMs", 0)) / 1000))
    return [w for w in words if w[0]]


def locate(words, phrase: str):
    target = [norm(w) for w in phrase.split()]
    said = [w for w, _ in words]
    n, best = len(target), (0.0, 0)
    for i in range(len(said)):
        for m in (n - 1, n, n + 1):
            if m > 0 and i + m <= len(said):
                r = difflib.SequenceMatcher(None, target, said[i:i + m]).ratio()
                if r > best[0]:
                    best = (r, i)
    return best[0], (words[best[1]][1] if words else 0)


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    out_path = CACHE / "found.json"
    found = json.loads(out_path.read_text()) if out_path.exists() else {}
    searches: dict[str, list] = {}
    for name, (query, phrase, lang) in WANT.items():
        if ONLY and name not in ONLY:
            continue
        if query not in searches:
            res = run(["--flat-playlist", "-J", f"ytsearch8:{query}"], timeout=90)
            try:
                searches[query] = [e for e in json.loads(res.stdout)["entries"] if e.get("id")]
            except Exception:
                searches[query] = []
        best = None
        for e in searches[query]:
            dur = e.get("duration") or 0
            if dur and dur > 4 * 3600:
                continue
            words = captions(e["id"], lang)
            score, t = locate(words, phrase)
            if best is None or score > best["score"]:
                best = {"id": e["id"], "title": e.get("title"), "channel": e.get("channel"), "t": t, "score": round(score, 2), "lang": lang}
            if score > 0.9:
                break
        found[name] = best
        print(name, best, flush=True)
        out_path.write_text(json.dumps(found, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
