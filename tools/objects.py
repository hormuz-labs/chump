"""Cut the things that live inside the heads out of their photos (rembg).

Sources are CC0 / public-domain photos from Wikimedia Commons, downloaded to
the folder given as the first argument. Each cut-out is trimmed to its
content and saved as a transparent PNG in public/img/objects/.

Run: python tools/objects.py <source-folder>
"""

import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "img" / "objects"
SRC = Path(sys.argv[1])

# name: (source file, crop box in source pixels or None, model, max size)
JOBS = {
    "peanut-bucket": ("pods.jpg", (470, 0, 1165, 735), "isnet-general-use", 640),
    "peanut-1": ("pods.jpg", (30, 1040, 185, 1225), "isnet-general-use", 220),
    "peanut-2": ("pods.jpg", (290, 1280, 495, 1450), "isnet-general-use", 220),
    "cat-poop": ("poop.jpg", (60, 140, 1270, 920), "isnet-general-use", 720),
    "khamenei": ("khamenei.jpg", None, "u2net_human_seg", 640),
    "bottle": ("bottle.jpg", None, "isnet-general-use", 400),
}
# ecoli.webp is not cut out: it's the micrograph itself (scale bar cropped off),
# used as the texture inside Hegseth's head.


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sessions = {}
    for name, (file, box, model, size) in JOBS.items():
        img = Image.open(SRC / file).convert("RGB")
        if box:
            img = img.crop(box)
        sessions.setdefault(model, new_session(model))
        cut = remove(img, session=sessions[model], post_process_mask=True)
        cut = cut.crop(cut.getbbox())
        cut.thumbnail((size, size), Image.LANCZOS)
        cut.save(OUT / f"{name}.webp", "WEBP", quality=84, method=6)
        print(name, cut.size)


if __name__ == "__main__":
    main()
