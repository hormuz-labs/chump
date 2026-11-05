"""Rank a pool of real photos by facial expression (MediaPipe Face Landmarker blendshapes).

Every face in a photo is found (OpenCV YuNet), kept only if it is the same
person as the official portrait (OpenCV SFace, cosine similarity), and if it
is roughly frontal it is scored on:
  shock    jaw open, brows up, eyes wide
  laugh    big smile, jaw open, eyes squinting
  grimace  mouth stretched, brows down, eyes squinting
and a contact sheet of the top faces per expression is written to
<pool>/<id>-<expression>.jpg, numbered by file, so they can be picked by eye.

Run: python tools/rank.py <pool-folder> <face_landmarker.task> [ids...]
"""

import json
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw

POOL = Path(sys.argv[1])
MODEL = sys.argv[2]
ONLY = set(sys.argv[3:])
MODELS = Path(MODEL).parent  # yunet.onnx and sface.onnx (OpenCV Zoo) sit beside the .task
ROOT = Path(__file__).resolve().parent.parent
TOP = 8

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
Options = mp.tasks.vision.FaceLandmarkerOptions


def scores(b: dict) -> dict:
    g = lambda k: b.get(k, 0.0)
    return {
        "shock": g("jawOpen") * 0.55 + g("browInnerUp") * 0.25 + (g("eyeWideLeft") + g("eyeWideRight")) * 0.1,
        "laugh": (g("mouthSmileLeft") + g("mouthSmileRight")) * 0.3 + g("jawOpen") * 0.3 + (g("eyeSquintLeft") + g("eyeSquintRight")) * 0.1 + g("cheekSquintLeft") * 0.1,
        "grimace": (g("mouthStretchLeft") + g("mouthStretchRight")) * 0.25 + (g("browDownLeft") + g("browDownRight")) * 0.15 + (g("eyeSquintLeft") + g("eyeSquintRight")) * 0.1 + g("mouthFrownLeft") * 0.1,
    }


def main() -> None:
    lm = FaceLandmarker.create_from_options(Options(
        base_options=BaseOptions(model_asset_path=MODEL), num_faces=1, output_face_blendshapes=True,
    ))
    yunet = cv2.FaceDetectorYN.create(str(MODELS / "yunet.onnx"), "", (320, 320), 0.7)
    sface = cv2.FaceRecognizerSF.create(str(MODELS / "sface.onnx"), "")
    results = {}
    for folder in sorted(p for p in POOL.iterdir() if p.is_dir() and (not ONLY or p.name in ONLY)):
        pid = folder.name
        index = json.loads((folder / "index.json").read_text())
        # who we're looking for: the face in the official portrait
        portrait = cv2.imread(str(ROOT / "public" / "img" / f"{pid}.jpg"))
        yunet.setInputSize((portrait.shape[1], portrait.shape[0]))
        _, pf = yunet.detect(portrait)
        pf = max(pf, key=lambda f: f[2])
        ref = sface.feature(sface.alignCrop(portrait, pf))
        rows = []
        for n, title in index.items():
            path = folder / f"{n}.jpg"
            try:
                rgb = np.array(Image.open(path).convert("RGB"))
            except Exception:
                continue
            h, w = rgb.shape[:2]
            # every face (YuNet), kept only if it's this person (SFace vs. the portrait),
            # then its expression read from an upscaled crop
            yunet.setInputSize((w, h))
            _, found = yunet.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
            for k, f in enumerate(found if found is not None else []):
                x, y, bw, bh = f[:4]
                if bw < 40:
                    continue
                feat = sface.feature(sface.alignCrop(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), f))
                sim = sface.match(ref, feat, cv2.FaceRecognizerSF_FR_COSINE)
                if sim < 0.36:
                    continue
                cx, cy = x + bw / 2, y + bh / 2
                side = max(bw, bh) * 1.9
                x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
                x1, y1 = int(min(w, cx + side / 2)), int(min(h, cy + side / 2))
                crop = np.array(Image.fromarray(rgb[y0:y1, x0:x1]).resize((512, 512)))
                res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
                if not res.face_landmarks:
                    continue
                pts, shapes = res.face_landmarks[0], res.face_blendshapes[0]
                xs = np.array([p.x for p in pts])
                nose, l, r = xs[1], xs[234], xs[454]
                asym = abs((nose - l) - (r - nose)) / max(1e-6, r - l)
                if asym > 0.35:
                    continue
                rows.append({
                    "n": n, "face": k, "title": title, "box": [float(v) for v in (x, y, x + bw, y + bh)], "rel": [float(cx / w), float(cy / h)],
                    "px": round(float(bw)), "sim": round(float(sim), 2), "s": scores({c.category_name: c.score for c in shapes}),
                })
        results[pid] = rows
        for kind in ("shock", "laugh", "grimace"):
            top = sorted(rows, key=lambda r: -r["s"][kind])[:TOP]
            sheet = Image.new("RGB", (TOP * 220, 250), "black")
            d = ImageDraw.Draw(sheet)
            for i, r in enumerate(top):
                x0, y0, x1, y1 = r["box"]
                pad = (x1 - x0) * 0.25
                im = Image.open(folder / f"{r['n']}.jpg").convert("RGB")
                c = im.crop((int(x0 - pad), int(y0 - pad), int(x1 + pad), int(y1 + pad)))
                c.thumbnail((210, 210))
                sheet.paste(c, (i * 220 + 5, 5))
                d.text((i * 220 + 6, 222), f"#{r['n']}.{r['face']} {r['s'][kind]:.2f} {r['px']}px id{r['sim']}", fill="white")
            sheet.save(POOL / f"{pid}-{kind}.jpg", quality=85)
        print(pid, len(rows), "faces", flush=True)
    (POOL / f"ranked-{'-'.join(sorted(results))}.json").write_text(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
