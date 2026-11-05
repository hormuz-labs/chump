"""Gather public-domain / CC0 photos of each person from Wikimedia Commons.

Lists a few yearly categories per person, keeps files whose licence is public
domain or CC0, and downloads an 900px-wide copy of each into
<out>/<id>/<n>.jpg plus <out>/<id>/index.json (file title per image).

Run: python tools/pool.py <out-folder>
"""

import json
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(sys.argv[1])
UA = {"User-Agent": "anyone-home-pool/1.0 (personal satire site)"}
API = "https://commons.wikimedia.org/w/api.php"
PER_PERSON = 70

CATS = {
    "trump": ["Donald Trump in 2025", "Donald Trump in 2026", "Donald Trump in 2019", "Donald Trump in 2018"],
    "vance": ["JD Vance in 2025", "JD Vance in 2026", "JD Vance in 2024"],
    "rubio": ["Marco Rubio in 2025", "Marco Rubio in 2026", "Marco Rubio in 2016"],
    "hegseth": ["Pete Hegseth in 2025", "Pete Hegseth in 2026"],
    "netanyahu": ["Benjamin Netanyahu in 2025", "Benjamin Netanyahu in 2020", "Benjamin Netanyahu in 2017"],
}


def fetch(url: str) -> bytes:
    """GET with Wikimedia's rate limits respected (429 + retry-after)."""
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            wait = float(e.headers.get("retry-after") or 5) if e.code == 429 else 3
            time.sleep(wait + 1 + attempt)
        except Exception:
            time.sleep(3 + attempt * 2)
    return b""


def api(params: dict) -> dict:
    time.sleep(1.2)
    raw = fetch(API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2}))
    try:
        return json.loads(raw)
    except Exception:
        return {}


def subcats(cat: str) -> list[str]:
    d = api({"action": "query", "list": "categorymembers", "cmtitle": f"Category:{cat}", "cmtype": "subcat", "cmlimit": 100})
    return [m["title"].removeprefix("Category:") for m in d.get("query", {}).get("categorymembers", [])]


def files_in(cat: str):
    cont = {}
    while True:
        d = api({
            "action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{cat}",
            "gcmtype": "file", "gcmlimit": 200, "prop": "imageinfo",
            "iiprop": "url|size|extmetadata", "iiurlwidth": 900,
            "iiextmetadatafilter": "LicenseShortName", **cont,
        })
        for p in d.get("query", {}).get("pages", []):
            info = (p.get("imageinfo") or [{}])[0]
            lic = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            if ("ublic" in lic or "CC0" in lic) and p["title"].lower().endswith((".jpg", ".jpeg")) and info.get("width", 0) >= 900:
                yield p["title"], info["thumburl"]
        if "continue" not in d:
            return
        cont = d["continue"]
        time.sleep(0.5)


def main() -> None:
    for pid, cats in CATS.items():
        folder = OUT / pid
        folder.mkdir(parents=True, exist_ok=True)
        seen, index = set(), {}
        walk = []
        for cat in cats:
            walk += [cat] + subcats(cat)[:25]
        for cat in walk:
            if len(index) >= PER_PERSON:
                break
            for title, url in files_in(cat):
                if title in seen or len(index) >= PER_PERSON:
                    continue
                seen.add(title)
                n = len(index)
                data = fetch(url)
                if data:
                    (folder / f"{n}.jpg").write_bytes(data)
                    index[n] = title
                time.sleep(0.8)
        (folder / "index.json").write_text(json.dumps(index, indent=1))
        print(pid, len(index), flush=True)


if __name__ == "__main__":
    main()
