"""Measure each portrait's head with ML and write the masks the site uses.

For every photo in public/img/<id>.jpg:
  - MediaPipe Face Mesh finds the brows, eyes and cheeks (roll angle, face width).
  - rembg (u2net_human_seg) separates the person from the background.
  - The lid is the part of that person mask above a forehead line that follows
    the head's tilt; the hole is the lid shrunk inward, so a rim of scalp shows.

Writes public/img/masks/<id>-lid.png, <id>-hole.png and src/heads.json
(head centre, width, top and forehead line in percent, plus the tilt).

Run: python tools/heads.py   (from head-poke/, in a venv with rembg, mediapipe, opencv)
"""

import json
import math
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "img"
OUT = IMG / "masks"
IDS = sys.argv[1:] or ["trump", "vance", "rubio", "hegseth", "netanyahu"]

# Face Mesh landmark indices
BROWS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300]
EYE_L, EYE_R = 33, 263
CHEEK_L, CHEEK_R = 234, 454
FOREHEAD = 10


def largest_component_at(mask: np.ndarray, x: int, y: int) -> np.ndarray:
    n, labels = cv2.connectedComponents(mask.astype(np.uint8))
    lab = labels[y, x]
    if lab == 0:
        # centre fell in a gap; take the biggest blob instead
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        lab = counts.argmax()
    return labels == lab


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    session = new_session("u2net_human_seg")
    mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=3, refine_landmarks=True)
    result = {}

    for pid in IDS:
        path = IMG / f"{pid}.jpg"
        rgb = np.array(Image.open(path).convert("RGB"))
        h, w = rgb.shape[:2]

        faces = mesh.process(rgb).multi_face_landmarks
        if not faces:
            raise SystemExit(f"{pid}: no face found")
        # the subject is the biggest face in frame
        def span(f):
            xs = [p.x for p in f.landmark]
            return max(xs) - min(xs)
        face = max(faces, key=span).landmark
        pt = lambda i: np.array([face[i].x * w, face[i].y * h])

        eye_l, eye_r = pt(EYE_L), pt(EYE_R)
        roll = math.atan2(eye_r[1] - eye_l[1], eye_r[0] - eye_l[0])
        brow_y = min(pt(i)[1] for i in BROWS)
        cheek_l, cheek_r = pt(CHEEK_L), pt(CHEEK_R)
        face_w = np.linalg.norm(cheek_r - cheek_l)
        forehead = pt(FOREHEAD)

        # person mask, then only the blob that holds the face
        alpha = np.array(remove(Image.open(path).convert("RGB"), session=session, only_mask=True))
        person = alpha > 127
        person = largest_component_at(person, int(forehead[0]), int(forehead[1]))

        # forehead line: a little above the brows, tilted with the head
        cx_line, cy_line = forehead[0], brow_y - face_w * 0.12
        ys, xs = np.mgrid[0:h, 0:w]
        # distance below the tilted line; negative is above it
        down = (ys - cy_line) * math.cos(roll) - (xs - cx_line) * math.sin(roll)
        above = down < 0

        # keep it to the head: within a generous band around the face
        band = np.abs((xs - cx_line) * math.cos(roll) + (ys - cy_line) * math.sin(roll)) < face_w * 0.85
        lid = person & above & band
        lid = cv2.morphologyEx(lid.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        lid = cv2.GaussianBlur(lid, (0, 0), 1.2)

        # the hole: the lid pulled in from the sides and top, flush at the forehead line
        k = max(3, int(face_w * 0.07)) | 1
        hole = cv2.erode((lid > 127).astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        # erosion lifts the bottom edge too; extend the hole back down to the line
        strip = (down > -k) & (down < 1.5) & band
        cols = hole.max(axis=0) > 0
        strip &= cols[np.newaxis, :] & (lid > 127)
        hole = np.maximum(hole, cv2.erode(strip.astype(np.uint8) * 255, np.ones((1, k), np.uint8)))
        hole = cv2.GaussianBlur(hole, (0, 0), 1.0)

        # CSS masks read alpha, so the mask goes in the alpha channel
        for name, m in (("lid", lid), ("hole", hole)):
            Image.fromarray(np.dstack([np.full_like(m, 255), m]), "LA").save(OUT / f"{pid}-{name}.png", optimize=True)

        ys_lid, xs_lid = np.nonzero(lid > 127)
        top = ys_lid.min()
        left, right = xs_lid.min(), xs_lid.max()
        result[pid] = {
            "cx": round(float((left + right) / 2 / w * 100), 2),
            "rx": round(float((right - left) / 2 / w * 100), 2),
            "top": round(float(top / h * 100), 2),
            "cut": round(float(cy_line / h * 100), 2),
            "lineX": round(float(cx_line / w * 100), 2),
            "roll": round(math.degrees(roll), 2),
            "faceW": round(float(face_w / w * 100), 2),
        }
        print(pid, result[pid])

    (ROOT / "src" / "heads.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
