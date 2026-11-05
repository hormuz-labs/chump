"""Cut each portrait out of its background and split it into head and body.

  - rembg (u2net_human_seg, with alpha matting for the hair) gives the person.
  - MediaPipe Face Mesh finds the chin and cheeks; the neck line runs just
    under the chin, tilted with the head. Above it, within the head's width,
    is the head; the rest is the body.
Writes public/img/cut/<id>-head.webp and <id>-body.webp (full frame,
transparent) and adds the neck pivot, in percent, to src/heads.json as "neck".
The reaction faces (tools/reactions.py) are masked to the head afterwards.

Run: python tools/cutout.py   (after tools/heads.py)
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
OUT = IMG / "cut"
CACHE = ROOT / "tools" / ".cache"  # the person matte, reused by reactions.py
HEADS = ROOT / "src" / "heads.json"
IDS = sys.argv[1:] or ["trump", "vance", "rubio", "hegseth", "netanyahu"]
# someone standing right behind the subject, joined to them in the mask: cleared
# by hand (x0, y0, x1, y1 in percent)
CLEAR = {"netanyahu": (0, 0, 30, 69)}
# grey hair on a pale wall: alpha matting makes a stair-stepped edge, so plain masks
NO_MATTING = {"netanyahu"}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    heads = json.loads(HEADS.read_text())
    session = new_session("u2net_human_seg")
    mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=3, refine_landmarks=True)

    for pid in IDS:
        src = Image.open(IMG / f"{pid}.jpg").convert("RGB")
        rgb = np.array(src)
        h, w = rgb.shape[:2]
        cut = np.array(remove(src, session=session, alpha_matting=pid not in NO_MATTING,
                              alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=12,
                              alpha_matting_erode_size=8))
        alpha = cut[..., 3].astype(np.float32) / 255

        faces = mesh.process(rgb).multi_face_landmarks
        face = max(faces, key=lambda f: max(p.x for p in f.landmark) - min(p.x for p in f.landmark)).landmark
        pt = lambda i: np.array([face[i].x * w, face[i].y * h])
        eye_l, eye_r = pt(33), pt(263)
        roll = math.atan2(eye_r[1] - eye_l[1], eye_r[0] - eye_l[0])
        right = np.array([math.cos(roll), math.sin(roll)])
        down = np.array([-right[1], right[0]])
        fw = np.linalg.norm(pt(454) - pt(234))
        chin = pt(152)
        neck = chin + down * fw * 0.03

        # only the subject: the blob that holds the face (photos can have people behind)
        # (eroded first, so someone standing just behind comes apart from them)
        e = max(9, int(fw * 0.08)) | 1
        core = cv2.erode((alpha > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (e, e)))
        n, labels = cv2.connectedComponents(core)
        keep = (labels == labels[int(pt(1)[1]), int(pt(1)[0])]).astype(np.uint8)
        keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (e + 6, e + 6))).astype(bool)
        alpha = alpha * keep

        ys, xs = np.mgrid[0:h, 0:w]
        rel = np.stack([xs - neck[0], ys - neck[1]], -1)
        below = rel @ down            # distance below the neck line
        across = np.abs(rel @ right)  # distance from the head's centre line
        # the head: hair (everything above the brows, which no shoulder reaches)
        # plus the face outline, widened for the ears, down to the neck line
        brow = min(pt(i)[1] for i in (70, 63, 105, 66, 107, 336, 296, 334, 293, 300))
        brow_c = np.array([neck[0], brow]) - down * fw * 0.05
        above_brow = (np.stack([xs - brow_c[0], ys - brow_c[1]], -1) @ down) < 0
        oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
                148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        hull = np.zeros((h, w), np.uint8)
        cv2.fillConvexPoly(hull, cv2.convexHull(np.int32([pt(i) for i in oval])), 1)
        d = max(9, int(fw * 0.28)) | 1
        hull = cv2.dilate(hull, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))).astype(bool)
        head = (((above_brow & (across < fw * 0.78)) | hull) & (below < 0)).astype(np.float32)
        # soften the cut so the seam doesn't show when the head is still
        if pid in CLEAR:
            # never inside the subject's own head
            x0, y0, x1, y1 = CLEAR[pid]
            box = np.zeros((h, w), bool)
            box[int(y0 * h / 100):int(y1 * h / 100), int(x0 * w / 100):int(x1 * w / 100)] = True
            g = max(25, int(fw * 0.18)) | 1
            guard = cv2.dilate(((head > 0.5) | hull).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g))).astype(bool)
            alpha[box & ~guard] = 0
        hard = head > 0.5
        head = cv2.GaussianBlur(head, (0, 0), fw * 0.008)
        head_a = alpha * head
        # the body stops a few pixels inside the head's soft edge, so the two
        # layers overlap there instead of meeting at half opacity (a seam)
        k = max(5, int(fw * 0.04)) | 1
        inside = cv2.erode(hard.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))).astype(np.float32)
        # the body reaches a little up under the chin, so a wobbling head never
        # opens a gap at the neck (the head covers it at rest)
        under = (below > -fw * 0.14).astype(np.float32)
        body_a = alpha * np.maximum(1 - inside, under)

        for name, a in (("head", head_a), ("body", body_a)):
            rgba = np.dstack([rgb, (a * 255).clip(0, 255).astype(np.uint8)])
            Image.fromarray(rgba, "RGBA").save(OUT / f"{pid}-{name}.webp", "WEBP", quality=88, method=6)
        CACHE.mkdir(exist_ok=True)
        Image.fromarray((alpha * 255).astype(np.uint8)).save(CACHE / f"{pid}-alpha.png")

        heads[pid]["neck"] = {"x": round(float(neck[0] / w * 100), 2), "y": round(float(neck[1] / h * 100), 2)}
        print(pid, heads[pid]["neck"], flush=True)

    HEADS.write_text(json.dumps(heads, indent=2) + "\n")


if __name__ == "__main__":
    main()
