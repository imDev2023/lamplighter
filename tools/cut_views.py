"""Cut a 4-view turnaround sheet into the separate views image-to-3D expects.

    python3 -I tools/cut_views.py <sheet.png> <out_dir> [--left N] [--right N] [--floor ROW]

The sheet holds four full-body views in a row on a flat background. Each view is cut out
as its largest connected figure, so stray marks elsewhere on the sheet are dropped, and is
pasted centred on a square canvas of the flat background colour, all at one scale.

Views are written as front.png, left.png, back.png and right.png, in the order fal's
tripo3d/h3.1/multiview-to-3d reads them: a left view shows the character's left side, so
the character faces the image's left edge; a right view faces its right edge.
Sheets often get the sides wrong (Lamplighter's first two sheets drew the left profile
twice), so check which way each profile faces first. --left N and --right N name the sheet
view (1 to 4) that holds each side (defaults 2 and 4); set both to the same view to make the
other side by mirroring it.
"""

import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("sheet")
ap.add_argument("out_dir")
ap.add_argument("--left", type=int, default=2, help="sheet view (1-4) whose profile faces the image's left edge")
ap.add_argument("--right", type=int, default=4, help="sheet view (1-4) whose profile faces the image's right edge, or the --left view to mirror it")
ap.add_argument("--size", type=int, default=1024)
ap.add_argument("--threshold", type=float, default=30.0, help="colour distance from the background")
ap.add_argument("--floor", type=int, help="sheet row below the lowest sole: anything under it is dropped")
a = ap.parse_args()

img = np.asarray(Image.open(a.sheet).convert("RGB")).astype(np.float32)
h, w, _ = img.shape

# The background: each row's median, since a sheet's grey can darken towards the bottom.
# Rows are mostly background, so the median ignores the figures. The canvas colour is the
# top band's, which holds no figure.
bg = np.median(img[: h // 40].reshape(-1, 3), axis=0)
row_bg = np.median(img, axis=1, keepdims=True)
dist = np.linalg.norm(img - row_bg, axis=2)
if a.floor:
    dist[a.floor :] = 0  # stray marks under the feet would join the figure
fg = ndimage.binary_closing(dist > a.threshold, iterations=3)
fg = ndimage.binary_opening(fg, iterations=2)

# Split the row into four figures at the emptiest columns between them.
cols = fg[: int(h * 0.85)].sum(axis=0).astype(np.float32)
cols = ndimage.uniform_filter1d(cols, 25)
cuts = [0]
for k in (1, 2, 3):
    lo, hi = int(w * (k / 4 - 0.08)), int(w * (k / 4 + 0.08))
    cuts.append(lo + int(np.argmin(cols[lo:hi])))
cuts.append(w)

views, boxes = [], []
for i in range(4):
    x0, x1 = cuts[i], cuts[i + 1]
    m = fg[:, x0:x1]
    lab, n = ndimage.label(m)
    if n == 0:
        raise SystemExit(f"view {i + 1}: no figure found")
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = ndimage.binary_fill_holes(lab == (1 + int(np.argmax(sizes))))
    ys, xs = np.nonzero(keep)
    y0, y1, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = img[y0:y1, x0 + xa : x0 + xb].copy()
    # Blend the outline into the flat canvas colour by how far each pixel is from the sheet's
    # own background there, so the sheet's darker or uneven grey leaves no halo.
    alpha = np.clip((dist[y0:y1, x0 + xa : x0 + xb] - a.threshold / 2) / (a.threshold / 2), 0, 1)
    inner = ndimage.binary_erosion(keep, iterations=2)[y0:y1, xa:xb]
    alpha = np.where(keep[y0:y1, xa:xb], np.maximum(alpha, inner), 0)[..., None]
    crop = crop * alpha + bg * (1 - alpha)
    views.append(crop)
    boxes.append((x0 + xa, y0, x0 + xb, y1))
    print(f"view {i + 1}: x {x0 + xa}-{x0 + xb}, y {y0}-{y1}, {xb - xa} x {y1 - y0} px, figure {int(keep.sum())} px")

# One scale for all views, so the figure is the same height in each.
tallest = max(v.shape[0] for v in views)
scale = a.size * 0.88 / max(tallest, max(v.shape[1] for v in views))


def square(v: np.ndarray) -> Image.Image:
    im = Image.fromarray(v.clip(0, 255).astype(np.uint8))
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (a.size, a.size), tuple(int(c) for c in bg))
    # Feet on one line: bottom-align each figure at the same height.
    top = a.size - round(a.size * 0.06) - im.height
    canvas.paste(im, ((a.size - im.width) // 2, top))
    return canvas


os.makedirs(a.out_dir, exist_ok=True)
out = {"front": square(views[0]), "left": square(views[a.left - 1]), "back": square(views[2])}
out["right"] = out["left"].transpose(Image.FLIP_LEFT_RIGHT) if a.right == a.left else square(views[a.right - 1])
for name in ("front", "left", "back", "right"):
    out[name].save(os.path.join(a.out_dir, f"{name}.png"))
strip = Image.new("RGB", (a.size * 4, a.size))
for i, name in enumerate(("front", "left", "back", "right")):
    strip.paste(out[name], (i * a.size, 0))
strip.resize((a.size * 2, a.size // 2)).save(os.path.join(a.out_dir, "strip.jpg"), quality=85)
print(f"background {bg.round().tolist()}, wrote {a.out_dir}")
