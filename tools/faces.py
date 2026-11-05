"""Make each portrait pull faces: a shocked face and a wince, warped from the real photo.

MediaPipe Face Mesh gives 478 points on the face. Handle points (brows, eyelids,
lips, jaw) move along the face's own up direction, the move spreads smoothly to
nearby points, and the photo is warped triangle by triangle (Delaunay) from the
old points to the new ones. The shocked face also gets the dark inside of an
open mouth painted between the parted lips.

Writes public/img/faces/<id>-shock.webp, <id>-wince.webp (a crop around the
face) and adds each crop's box, in percent, to src/heads.json as "face".

Run: python tools/faces.py   (from head-poke/, after tools/heads.py)
"""

import json
import math
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "img"
OUT = IMG / "faces"
HEADS = ROOT / "src" / "heads.json"
IDS = sys.argv[1:] or ["trump", "vance", "rubio", "hegseth", "netanyahu"]

BROW_IN = [55, 65, 107, 66, 285, 295, 336, 296]
BROW_OUT = [46, 53, 52, 70, 63, 105, 276, 283, 282, 300, 293, 334]
LID_UP = [159, 158, 160, 161, 157, 173, 386, 385, 387, 388, 384, 398]
LID_DOWN = [145, 144, 153, 154, 163, 374, 373, 380, 381, 390]
LIP_UP_IN = [13, 82, 81, 80, 191, 312, 311, 310, 415]
LIP_UP_OUT = [0, 37, 39, 40, 185, 267, 269, 270, 409]
LIP_LO_IN = [14, 87, 178, 88, 95, 317, 402, 318, 324]
LIP_LO_OUT = [17, 84, 181, 91, 146, 314, 405, 321, 375]
CORNERS = [61, 291, 78, 308]
CHIN = [152, 148, 176, 149, 150, 377, 400, 378, 379, 199, 175]
JAW = [136, 172, 365, 397]
# inner lip outline, in order around the mouth (for the open-mouth fill)
MOUTH = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]


def warp(img: np.ndarray, src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    rect = (0, 0, w, h)
    sub = cv2.Subdiv2D(rect)
    inside = [(float(np.clip(x, 0, w - 1)), float(np.clip(y, 0, h - 1))) for x, y in dst]
    for p in inside:
        sub.insert(p)
    index = {(round(x, 3), round(y, 3)): i for i, (x, y) in enumerate(inside)}
    out = img.copy()
    for t in sub.getTriangleList():
        pts = [(round(t[0], 3), round(t[1], 3)), (round(t[2], 3), round(t[3], 3)), (round(t[4], 3), round(t[5], 3))]
        if not all(p in index for p in pts):
            continue
        ids = [index[p] for p in pts]
        s_tri = np.float32([src[i] for i in ids])
        d_tri = np.float32([dst[i] for i in ids])
        if np.allclose(s_tri, d_tri, atol=0.05):
            continue
        x, y, bw, bh = cv2.boundingRect(d_tri)
        if bw == 0 or bh == 0:
            continue
        m = cv2.getAffineTransform(s_tri, d_tri - [x, y])
        patch = cv2.warpAffine(img, m, (bw, bh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        mask = np.zeros((bh, bw), np.float32)
        cv2.fillConvexPoly(mask, np.int32(np.round(d_tri - [x, y])), 1.0, cv2.LINE_AA)
        x0, y0 = max(x, 0), max(y, 0)
        x1, y1 = min(x + bw, w), min(y + bh, h)
        if x1 <= x0 or y1 <= y0:
            continue
        m3 = mask[y0 - y:y1 - y, x0 - x:x1 - x, None]
        out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m3) + patch[y0 - y:y1 - y, x0 - x:x1 - x] * m3
    return out


def expression(kind: str, pts: np.ndarray, up: np.ndarray, right: np.ndarray, fw: float):
    """Handle moves for one expression, as (landmark ids, displacement) pairs."""
    mouth_c = pts[[61, 291]].mean(axis=0)
    half = np.linalg.norm(pts[291] - pts[61]) / 2
    # how far a lip point is from the middle of the mouth: 1 at the middle, 0 at the corners
    def mid(i: int) -> float:
        t = abs(float(np.dot(pts[i] - mouth_c, right))) / half
        return max(0.0, 1 - t * t) ** 0.7
    moves: list[tuple[list[int], np.ndarray]] = []
    if kind == "shock":
        moves += [(BROW_IN + BROW_OUT, up * 0.1 * fw)]
        moves += [(LID_UP, up * 0.035 * fw), (LID_DOWN, -up * 0.014 * fw)]
        moves += [([i], up * (0.004 + 0.022 * mid(i)) * fw) for i in LIP_UP_IN + LIP_UP_OUT]
        moves += [([i], -up * (0.035 + 0.1 * mid(i)) * fw) for i in LIP_LO_IN + LIP_LO_OUT]
        moves += [(CHIN, -up * 0.12 * fw), (JAW, -up * 0.065 * fw)]
        for i in CORNERS:
            toward = (mouth_c - pts[i]) / (np.linalg.norm(mouth_c - pts[i]) + 1e-6)
            moves += [([i], -up * 0.05 * fw + toward * 0.025 * fw)]
    else:
        for i in BROW_IN:
            side = np.sign(np.dot(pts[i] - mouth_c, right))
            moves += [([i], -up * 0.045 * fw - right * side * 0.022 * fw)]
        moves += [(BROW_OUT, -up * 0.012 * fw)]
        moves += [(LID_UP, -up * 0.042 * fw), (LID_DOWN, up * 0.016 * fw)]
        # the irises go with the closing lids, or they'd hold the eyes open
        moves += [(list(range(468, 478)), -up * 0.02 * fw)]
        for i in [61, 291, 78, 308]:
            side = np.sign(np.dot(pts[i] - mouth_c, right))
            moves += [([i], right * side * 0.045 * fw + up * 0.02 * fw)]
        moves += [(LIP_UP_OUT, up * 0.014 * fw), (LIP_LO_OUT, -up * 0.006 * fw)]
        moves += [([129, 358, 98, 327], up * 0.01 * fw)]
    return moves


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    heads = json.loads(HEADS.read_text())
    mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=3, refine_landmarks=True)

    for pid in IDS:
        rgb = np.array(Image.open(IMG / f"{pid}.jpg").convert("RGB"))
        H, W = rgb.shape[:2]
        faces = mesh.process(rgb).multi_face_landmarks
        face = max(faces, key=lambda f: max(p.x for p in f.landmark) - min(p.x for p in f.landmark)).landmark
        pts = np.array([[p.x * W, p.y * H] for p in face], np.float64)

        eye_l, eye_r = pts[33], pts[263]
        right = (eye_r - eye_l) / np.linalg.norm(eye_r - eye_l)
        up = np.array([right[1], -right[0]])
        fw = np.linalg.norm(pts[454] - pts[234])

        # crop: the face, from just above the brows to well under the chin
        brow_top = pts[BROW_IN + BROW_OUT][:, 1].min()
        x0 = int(max(0, pts[:, 0].min() - fw * 0.18))
        x1 = int(min(W, pts[:, 0].max() + fw * 0.18))
        y0 = int(max(0, brow_top - fw * 0.16))
        y1 = int(min(H, pts[152, 1] + fw * 0.42))
        crop = rgb[y0:y1, x0:x1].astype(np.float32)
        local = pts - [x0, y0]
        ch, cw = crop.shape[:2]

        # fixed anchors: the crop's edges and the neck under the chin
        border = [[x, y] for x in np.linspace(0, cw - 1, 7) for y in (0, ch - 1)]
        border += [[x, y] for y in np.linspace(0, ch - 1, 7)[1:-1] for x in (0, cw - 1)]
        neck = [local[152] - up * fw * f + right * fw * s for f in (0.3, 0.38) for s in (-0.25, 0, 0.25)]
        anchors = np.array(border + neck)

        for kind in ("shock", "wince"):
            exact: dict[int, np.ndarray] = {}
            for ids, d in expression(kind, local, up, right, fw):
                for i in ids:
                    exact[i] = d
            idx = np.array(list(exact))
            disp = np.array([exact[i] for i in idx])
            # spread each handle's move to the points around it (Gaussian, normalised);
            # the handles themselves take their exact move, so lips that touch
            # (upper going up, lower going down) still part
            sigma = fw * 0.045
            d2 = ((local[:, None, :] - local[idx][None, :, :]) ** 2).sum(-1)
            wgt = np.exp(-d2 / (2 * sigma**2))
            moved = local + (wgt @ disp) / np.maximum(1.0, wgt.sum(1, keepdims=True))
            moved[idx] = local[idx] + disp

            src = np.vstack([local, anchors])
            dst = np.vstack([moved, anchors])
            out = warp(crop, src, dst)

            if kind == "shock":
                # the inside of the open mouth, between the parted inner lips
                poly = np.int32(np.round(moved[MOUTH] * 4))
                mask = np.zeros((ch * 4, cw * 4), np.uint8)
                cv2.fillPoly(mask, [poly], 255, cv2.LINE_AA, shift=0)
                mask = cv2.resize(mask, (cw, ch), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
                mask = cv2.GaussianBlur(mask, (0, 0), fw * 0.006)
                yy, xx = np.mgrid[0:ch, 0:cw]
                mc = moved[MOUTH].mean(axis=0)
                dist = np.sqrt((xx - mc[0]) ** 2 + (yy - mc[1]) ** 2) / (fw * 0.1)
                dark = np.stack([70 - 60 * dist, 22 - 18 * dist, 24 - 20 * dist], -1).clip(6, 80)
                out = out * (1 - mask[..., None]) + dark * mask[..., None]

            Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(OUT / f"{pid}-{kind}.webp", "WEBP", quality=86, method=6)

        heads[pid]["face"] = {
            "x": round(x0 / W * 100, 3),
            "y": round(y0 / H * 100, 3),
            "w": round((x1 - x0) / W * 100, 3),
            "h": round((y1 - y0) / H * 100, 3),
        }
        print(pid, heads[pid]["face"])

    HEADS.write_text(json.dumps(heads, indent=2) + "\n")


if __name__ == "__main__":
    main()
