"""Point each quote at its clip in public/audio/, by the start of its punch line.

Only clips that exist (and passed the word check in tools/clips.py) are attached.
Run: python3 tools/attach_audio.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data.ts"
AUDIO = ROOT / "public" / "audio"

# clip name: the start of the quote's punch, as written in data.ts
PUNCH = {
    "trump-bestwords": "I have the best words.",
    "trump-cats": "They’re eating the cats.",
    "trump-concepts": "I have concepts of a plan.",
    "trump-windmills": "the noise causes cancer.",
    "trump-hannibal": "The late, great Hannibal Lecter.",
    "trump-shark": "I’ll take electrocution",
    "trump-weave": "I do the weave.",
    "trump-person": "Person, woman, man, camera, TV.",
    "trump-injection": "by injection inside",
    "trump-genius": "I’m an extremely stable genius.",
    "trump-television": "This is going to be great television.",
    "vance-catladies": "childless cat ladies",
    "vance-nevertrump": "I never liked him.",
    "vance-stories": "If I have to create stories",
    "vance-factcheck": "you guys weren’t going to fact-check.",
    "vance-thankyou": "Have you said thank you once",
    "rubio-dispel": "Let’s dispel once and for all",
    "rubio-pants": "Maybe to make sure his pants",
    "rubio-spraytan": "the worst spray tan in America",
    "rubio-hands": "you know what they say about men with small hands?",
    "rubio-watches": "Selling watches in Manhattan.",
    "rubio-fourjobs": "as someone with four jobs",
    "hegseth-hands": "I don’t think I’ve washed my hands",
    "hegseth-germs": "Germs are not a real thing.",
    "hegseth-warplans": "Nobody was texting war plans",
    "hegseth-fat": "fat generals and admirals",
    "hegseth-beardos": "No more beardos.",
    "netanyahu-bomb": "This is a bomb; this is a fuse.",
    "netanyahu-redline": "A red line should be drawn right here.",
    "netanyahu-spring": "by next spring, at most by next summer",
    "netanyahu-saddam": "I guarantee you",
    "netanyahu-nothing": "There will be nothing, because there is nothing.",
    "netanyahu-droves": "Arab voters are moving in droves",
    "netanyahu-nobel": "It’s nominating you for the Peace Prize",
}

s = DATA.read_text()
# strip old attachments, then add one per existing clip
import re
s = re.sub(r" audio: '/audio/[a-z-]+\.mp3',", "", s)
for name, punch in PUNCH.items():
    if not (AUDIO / f"{name}.mp3").exists():
        continue
    key = "{ punch: '" + punch.replace("'", "\\'")
    i = s.find(key)
    if i < 0:
        print("no quote for", name)
        continue
    s = s[: i + 1] + f" audio: '/audio/{name}.mp3'," + s[i + 1 :]
DATA.write_text(s)
print(s.count("audio: '/audio/"), "quotes have audio")
