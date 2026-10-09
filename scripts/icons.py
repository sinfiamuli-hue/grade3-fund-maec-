# Generates the app icons (needs Pillow): python3 scripts/icons.py
from PIL import Image, ImageDraw
import math, os
def make(size, maskable=False):
    s = size * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if maskable: d.rectangle([0, 0, s, s], fill=(181, 84, 31, 255))
    else: d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * .22), fill=(181, 84, 31, 255))
    cx, cy, R = s / 2, s / 2, s * (.26 if maskable else .30)
    d.ellipse([cx - R * 1.45, cy - R * 1.45, cx + R * 1.45, cy + R * 1.45], fill=(224, 160, 48, 60))
    # leaf
    pts = []
    for i in range(0, 361, 3):
        t = math.radians(i); r = R * (1 + .35 * math.cos(5 * t)) * 0.85
        pts.append((cx + r * math.sin(t), cy - r * math.cos(t) * 1.05))
    d.polygon(pts, fill=(250, 243, 230, 255))
    d.line([cx, cy - R * 1.1, cx, cy + R * 1.35], fill=(181, 84, 31, 255), width=int(s * .02))
    d.text((cx - s * .045, cy - s * .04), "", fill=(0, 0, 0, 0))
    return im.resize((size, size), Image.LANCZOS)
out = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
make(192).save(f"{out}/icon-192.png"); make(512).save(f"{out}/icon-512.png")
make(512, True).save(f"{out}/maskable-512.png")
im = make(180, True).convert("RGB"); im.save(f"{out}/apple-touch-icon.png")
print("icons written")
