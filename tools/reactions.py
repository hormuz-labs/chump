"""Put a real photo of the same person making a face onto the portrait.

For each person, tools/picks.json names two photos from the pool (see pool.py
and rank.py): "shock" (shown when the head opens) and "wince" (every knock
after), each as {"title": <Commons file>, "at": [x, y]} where "at" is the
face's centre as a fraction of the image (photos often hold several people).
The full-resolution original is downloaded, and for each one:
  - MediaPipe Face Landmarker finds 478 points on the portrait and the photo,
  - the photo is lined up on the portrait by the stable points (eye corners,
    nose bridge, cheekbones) with a similarity transform,
  - the face is cut along its own outline (and the portrait's), its colours are
    matched to the portrait's (Reinhard LAB transfer), and it is feathered in.
Writes public/img/faces/<id>-<kind>.webp (a crop around the face) and the
crop's box, in percent, to src/heads.json as "face".

Run: python tools/reactions.py <pool-folder> <face_landmarker.task>
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "img"
OUT = IMG / "faces"
HEADS = ROOT / "src" / "heads.json"
POOL = Path(sys.argv[1])
MODEL = sys.argv[2]

STABLE = [33, 133, 362, 263, 168, 6, 197, 234, 454, 127, 356]
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
        148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

lm = mp.tasks.vision.FaceLandmarker.create_from_options(mp.tasks.vision.FaceLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path=MODEL), num_faces=1,
))
detector = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)


def landmarks(rgb: np.ndarray, at=None) -> np.ndarray:
    """478 face points in image pixels: for the face nearest `at` (fractions),
    found by the full-range detector, read from an upscaled crop."""
    h, w = rgb.shape[:2]
    dets = detector.process(rgb).detections or []
    if not dets:
        raise SystemExit("no face")
    def centre(d):
        b = d.location_data.relative_bounding_box
        return b.xmin + b.width / 2, b.ymin + b.height / 2
    if at:
        det = min(dets, key=lambda d: (centre(d)[0] - at[0]) ** 2 + (centre(d)[1] - at[1]) ** 2)
    else:
        det = max(dets, key=lambda d: d.location_data.relative_bounding_box.width)
    b = det.location_data.relative_bounding_box
    cx, cy = centre(det)
    side = max(b.width * w, b.height * h) * 1.9
    x0, y0 = int(max(0, cx * w - side / 2)), int(max(0, cy * h - side / 2))
    x1, y1 = int(min(w, cx * w + side / 2)), int(min(h, cy * h + side / 2))
    crop = np.ascontiguousarray(rgb[y0:y1, x0:x1])
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop))
    if not res.face_landmarks:
        raise SystemExit("no landmarks")
    return np.array([[x0 + p.x * (x1 - x0), y0 + p.y * (y1 - y0)] for p in res.face_landmarks[0]])


def original(title: str) -> np.ndarray:
    """The Commons file at up to 3000px wide, cached in the pool folder."""
    cache = POOL / "originals" / title.replace("File:", "").replace("/", "_")
    if not cache.exists():
        cache.parent.mkdir(exist_ok=True)
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(title.replace("File:", "").replace(" ", "_")) + "?width=3000"
        req = urllib.request.Request(url, headers={"User-Agent": "anyone-home/1.0 (personal satire site)"})
        for attempt in range(8):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    cache.write_bytes(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise
                time.sleep(float(e.headers.get("retry-after") or 5) + 2 + attempt * 2)
    return np.array(Image.open(cache).convert("RGB"))


def hull_mask(pts: np.ndarray, shape) -> np.ndarray:
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillConvexPoly(m, cv2.convexHull(np.int32(pts)), 255, cv2.LINE_AA)
    return m


def main() -> None:
    picks = json.loads((ROOT / "tools" / "picks.json").read_text())
    heads = json.loads(HEADS.read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    for pid, choice in picks.items():
        base = np.array(Image.open(IMG / f"{pid}.jpg").convert("RGB"))
        H, W = base.shape[:2]
        bpts = landmarks(base)
        fw = np.ptp(bpts[:, 0])
        boxes = []
        outs = {}
        for kind, pick in choice.items():
            src = original(pick["title"])
            spts = landmarks(src, pick["at"])
            m, _ = cv2.estimateAffinePartial2D(spts[STABLE], bpts[STABLE], method=cv2.LMEDS)
            warped = cv2.warpAffine(src, m, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            wpts = cv2.transform(spts[None, :, :].astype(np.float32), m)[0]

            # the face along both outlines (an open jaw reaches lower than the portrait's)
            mask = cv2.bitwise_or(hull_mask(wpts[OVAL], base.shape), hull_mask(bpts[OVAL], base.shape))
            k = max(3, int(fw * 0.04)) | 1
            mask = cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
            ys, xs = np.nonzero(mask)
            # match skin tone and light: shift the photo's colours (LAB mean and
            # spread inside the face) onto the portrait's
            inner = mask > 200
            wl = cv2.cvtColor(warped, cv2.COLOR_RGB2LAB).astype(np.float32)
            bl = cv2.cvtColor(base, cv2.COLOR_RGB2LAB).astype(np.float32)
            for c in range(3):
                mu_w, sd_w = wl[..., c][inner].mean(), wl[..., c][inner].std() + 1e-6
                mu_b, sd_b = bl[..., c][inner].mean(), bl[..., c][inner].std()
                # lightness keeps the photo's own contrast (only its level moves);
                # the two colour channels take the portrait's tint fully
                k = 1.0 if c == 0 else sd_b / sd_w
                wl[..., c] = (wl[..., c] - mu_w) * k + mu_b
            cloned = cv2.cvtColor(wl.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
            soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), fw * 0.025)[..., None]
            outs[kind] = (cloned, soft[..., 0])
            boxes.append((xs.min(), ys.min(), xs.max(), ys.max()))

        pad = int(fw * 0.08)
        x0 = max(0, min(b[0] for b in boxes) - pad)
        y0 = max(0, min(b[1] for b in boxes) - pad)
        x1 = min(W, max(b[2] for b in boxes) + pad)
        y1 = min(H, max(b[3] for b in boxes) + pad)
        # transparent outside the face, and outside the person (the portraits are
        # cut out of their backgrounds by tools/cutout.py)
        person = np.array(Image.open(ROOT / "tools" / ".cache" / f"{pid}-alpha.png")).astype(np.float32) / 255
        for kind, (img, soft) in outs.items():
            a = (soft * person)[y0:y1, x0:x1, None] * 255
            rgba = np.dstack([img[y0:y1, x0:x1], a]).clip(0, 255).astype(np.uint8)
            Image.fromarray(rgba, "RGBA").save(OUT / f"{pid}-{kind}.webp", "WEBP", quality=86, method=6)
        heads[pid]["face"] = {
            "x": round(x0 / W * 100, 3), "y": round(y0 / H * 100, 3),
            "w": round((x1 - x0) / W * 100, 3), "h": round((y1 - y0) / H * 100, 3),
        }
        print(pid, heads[pid]["face"], flush=True)

    HEADS.write_text(json.dumps(heads, indent=2) + "\n")


if __name__ == "__main__":
    main()
