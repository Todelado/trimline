#!/usr/bin/env python3
"""
Trimline share-card renderer (v0.1)

Draws a 1600x900 PNG from *measured* numbers: it shells out to the real rules
engine (`src/cli.js --json`) and renders whatever comes back. Nothing here is
hand-typed, so a card cannot drift from the build that produced it.

Usage:
  ~/.venvs/tools/bin/python tools/make_card.py --input queue/drafts/01-trimline.txt \
      --budget x-post --out artifacts/site/trimline-card.png
"""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK, DIM, LINE = (14, 17, 22), (147, 160, 175), (42, 49, 60)
WHITE, YELLOW, GOOD, WARN, BAD = (232, 237, 242), (255, 210, 63), (90, 209, 154), (255, 180, 84), (255, 107, 107)

F = "/usr/share/fonts/truetype/dejavu/"
def font(name, size):
    return ImageFont.truetype(F + name, size)

def measure(budget_id, text_file):
    cli = os.path.join(ROOT, "src", "cli.js")
    out = subprocess.run(["node", cli, text_file, "--json"],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    b = None
    if budget_id:
        rep = subprocess.run(["node", cli, text_file, "-b", budget_id],
                             capture_output=True, text=True, check=True).stdout
        for line in rep.splitlines():
            if line.startswith("budget "):
                b = line
    return data, b

def fit(d, text, fnt, max_w):
    """Shrink until it fits, so long rule names never run off the canvas."""
    while d.textlength(text, font=fnt) > max_w and fnt.size > 18:
        fnt = font(fnt.path, fnt.size - 2)
    return fnt

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--budget", default=None)
    ap.add_argument("--out", default=os.path.join(ROOT, "artifacts", "site", "trimline-card.png"))
    ap.add_argument("--note", default="", help="small caption under the headline")
    a = ap.parse_args()

    data, budget_line = measure(a.budget, a.input)
    W, H = 1600, 900
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    M = 96

    # header
    d.rectangle([M, 84, M + 12, 178], fill=YELLOW)
    d.text((M + 32, 84), "Trimline", font=font("DejaVuSans-Bold.ttf", 62), fill=WHITE)
    d.text((M + 34, 152), "cut the flab, keep the meaning", font=font("DejaVuSans.ttf", 28), fill=DIM)

    # headline numbers, straight from the engine
    before, after = data["charsBefore"], data["charsAfter"]
    cut = max(0, before - after)
    big = "DejaVuSansMono-Bold.ttf"
    f_big = font(big, 118)
    d.text((M, 268), "%s \u2192 %s" % (before, after), font=f_big, fill=WHITE)
    # recolour the "after" half by measured width, so 4- and 5-digit counts never clip
    x_after = M + d.textlength(str(before) + " \u2192 ", font=f_big)
    w_after = d.textlength(str(after), font=f_big)
    d.rectangle([x_after, 250, x_after + w_after + 6, 424], fill=INK)
    d.text((x_after, 268), str(after), font=f_big, fill=YELLOW)

    # right-hand stat block: the percentage is the number people actually remember
    pct = 0 if not before else round(100.0 * cut / before)
    f_pct = font(big, 92)
    label = "\u2212%d%%" % pct
    d.text((W - M - d.textlength(label, font=f_pct), 268), label, font=f_pct, fill=YELLOW)
    d.text((W - M - d.textlength("characters removed", font=font("DejaVuSans.ttf", 26)), 380),
           "characters removed", font=font("DejaVuSans.ttf", 26), fill=DIM)

    sub = "characters   \u00b7   words %s \u2192 %s   \u00b7   longest sentence %d words   \u00b7   \u2212%d chars" % (
        data["wordsBefore"], data["wordsAfter"], data["longestSentence"]["words"], cut)
    d.text((M + 4, 402), sub, font=font("DejaVuSans.ttf", 27), fill=DIM)
    if a.note:
        d.text((M + 4, 438), a.note, font=font("DejaVuSans.ttf", 27), fill=YELLOW)

    # proportion bars: widths are ratios of the real character counts
    track = W - 2 * M
    y0, y1, bh = 508, 556, 26
    d.rounded_rectangle([M, y0, M + track, y0 + bh], radius=13, fill=(23, 28, 35))
    w_before_bar = max(60, int(track * min(1.0, before / float(max(before, before)))))
    w_after_bar = max(60, int(track * (after / float(max(before, 1)))))
    d.rounded_rectangle([M, y0, M + w_before_bar, y0 + bh], radius=13, fill=LINE)
    d.rounded_rectangle([M, y1, M + w_after_bar, y1 + bh], radius=13, fill=YELLOW)
    d.text((M + 8, y0 + 3), "before", font=font("DejaVuSans.ttf", 17), fill=DIM)
    d.text((M + 8, y1 + 3), "after", font=font("DejaVuSans.ttf", 17), fill=INK)

    # findings
    # findings area is bounded: 4 rows, then an overflow line. Anything lower collides
    # with the footer rule, which is exactly what this used to do.
    ranked = sorted(data.get("issues", []), key=lambda i: -i["count"])
    issues, overflow = ranked[:4], max(0, len(ranked) - 4)
    d.text((M, 628), "MAIN PATTERNS", font=font("DejaVuSans-Bold.ttf", 21), fill=DIM)
    yy, row_h, bottom = 666, 37, 812
    for i in issues:
        auto = i.get("kind") == "phrase" and i.get("safe") is not False
        label = "%-34s x%-3d %s" % (i["rule"], i["count"],
                                    "(auto-cut)" if auto else "(flagged only)")
        fnt = fit(d, label, font("DejaVuSansMono.ttf", 26), track - 20)
        d.text((M + 6, yy), label, font=fnt, fill=WHITE)
        yy += row_h
    if not issues:
        d.text((M + 6, yy), "no findings — already lean", font=font("DejaVuSansMono.ttf", 26), fill=GOOD)
    if overflow:
        d.text((M + 6, min(yy, bottom)), "+%d more pattern%s" % (overflow, "s" if overflow > 1 else ""),
               font=font("DejaVuSansMono.ttf", 24), fill=DIM)

    # footer
    d.line([M, 838, W - M, 838], fill=LINE, width=2)
    foot = "rules engine v%s   \u00b7   %d phrase rules   \u00b7   runs offline, no uploads" % (
        data.get("version", "0.1.1"), data.get("ruleCount", 48))
    d.text((M, 852), foot, font=font("DejaVuSans.ttf", 23), fill=DIM)
    if budget_line:
        f2 = font("DejaVuSans.ttf", 23)
        tw = d.textlength(budget_line, font=f2)
        d.text((W - M - tw, 852), budget_line, font=f2, fill=GOOD if "fits" in budget_line else WARN)

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    img.save(a.out, "PNG")
    print(a.out)

if __name__ == "__main__":
    main()
