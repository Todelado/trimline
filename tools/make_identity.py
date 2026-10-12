#!/usr/bin/env python3
"""
Identity crops for @todelado (deterministic, from the generated source art).

Nothing here invents pixels: the avatar is the source image rescaled, the banner is the source
placed on a background sampled from its own edge colour. Re-run after changing the source.

  ~/.venvs/tools/bin/python tools/make_identity.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))  # .../workspace
SRC_AVATAR = os.path.join(ROOT, "artifacts", "media", "c62789cb78e761c4a6f350bbef1f43b6.png")
SRC_MARK = os.path.join(ROOT, "artifacts", "media", "0e64cef8a51c8a42588f1c32fc51e87f.png")
OUT = os.path.join(ROOT, "artifacts", "site")

def edge_color(im, band=12):
    """Average of the outer band — the flat backdrop the source art was rendered on."""
    px = im.load()
    w, h = im.size
    acc = [0, 0, 0]
    n = 0
    for x in range(0, w, 3):
        for y in (0, h - 1):
            c = px[x, y]
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n += 1
    for y in range(0, h, 3):
        for x in (0, w - 1):
            c = px[x, y]
            acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n += 1
    return tuple(v // n for v in acc)

def main():
    os.makedirs(OUT, exist_ok=True)
    src = Image.open(SRC_AVATAR).convert("RGB")
    w, h = src.size

    # avatar: square by construction, two sizes so the crop UI has room to move
    src.resize((800, 800), Image.LANCZOS).save(os.path.join(OUT, "avatar-800.png"))
    src.resize((400, 400), Image.LANCZOS).save(os.path.join(OUT, "avatar-400.png"))

    # banner 1500x500: sampled backdrop + art on the right + one yellow rule
    bg = edge_color(src)
    canvas = Image.new("RGB", (1500, 500), bg)
    art = src.resize((500, 500), Image.LANCZOS)
    x0 = 1500 - 500
    canvas.paste(art, (x0, 0))
    # feather the paste edge: a hard seam on a flat backdrop is the one flaw everyone notices
    cp, ap = canvas.load(), art.load()
    band = 72
    for y in range(500):
        for x in range(x0, min(x0 + band, 1500)):
            t = (x - x0) / float(band)
            a = ap[x - x0, y]
            cp[x, y] = tuple(int(bg[i] * (1 - t) + a[i] * t) for i in range(3))
    d = ImageDraw.Draw(canvas)
    d.rectangle([96, 246, 152, 254], fill=(255, 210, 63))
    canvas.save(os.path.join(OUT, "banner-1500x500.png"))

    # favicon/mark at the sizes a site actually asks for
    mark = Image.open(SRC_MARK).convert("RGB")
    for size in (64, 192, 512):
        mark.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, "mark-%d.png" % size))

    print("backdrop sampled from source:", bg)
    for f in sorted(os.listdir(OUT)):
        print(" ", f, os.path.getsize(os.path.join(OUT, f)))

if __name__ == "__main__":
    main()
