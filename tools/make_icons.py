"""Generate the Soboscuba app icons (run: python3 tools/make_icons.py)."""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'www', 'icons')
S = 1024


def icon(pad=0.0):
    img = Image.new('RGB', (S, S))
    d = ImageDraw.Draw(img)
    top, bot = (17, 104, 138), (3, 17, 31)
    for y in range(S):
        t = y / (S - 1)
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    k = 1 - pad * 2
    cx, cy = S / 2, S / 2 + 30 * k

    def blob(x, y, rx, ry, fill, edge):
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=edge)
        e = 18 * k
        d.ellipse([x - rx + e, y - ry + e, x + rx - e, y + ry - e], fill=fill)

    # small teal blob behind, big coral-gold blob in front
    blob(cx + 250 * k, cy + 215 * k, 150 * k, 130 * k, (95, 211, 198), (40, 110, 110))
    blob(cx - 40 * k, cy, 340 * k, 300 * k, (255, 209, 102), (140, 100, 40))
    # gloss
    gl = Image.new('L', (S, S), 0)
    ImageDraw.Draw(gl).ellipse([cx - 260 * k, cy - 200 * k, cx - 120 * k, cy - 135 * k], fill=110)
    gl = gl.filter(ImageFilter.GaussianBlur(6))
    img.paste((255, 255, 255), (0, 0), gl)
    # eyes
    ink = (11, 34, 57)
    for ex in (-130, 70):
        x, y, r = cx + ex * k, cy - 40 * k, 34 * k
        d.ellipse([x - r, y - r, x + r, y + r], fill=ink)
        d.ellipse([x - r * 0.1, y - r * 0.75, x + r * 0.55, y - r * 0.1], fill=(255, 255, 255))
    # smile
    d.arc([cx - 100 * k, cy + 10 * k, cx + 40 * k, cy + 110 * k], 20, 160, fill=ink, width=int(16 * k))
    # bubbles
    for bx, by, br in ((780, 210, 34), (850, 330, 20), (720, 120, 16)):
        d.ellipse([bx - br, by - br, bx + br, by + br], outline=(220, 245, 255), width=7)
    return img


os.makedirs(OUT, exist_ok=True)
full = icon()
full.save(os.path.join(OUT, 'icon-1024.png'))
for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    full.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
icon(pad=0.1).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('icons written to', os.path.normpath(OUT))
