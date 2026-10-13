"""Generate the Soboscuba app icons (run: python3 tools/make_icons.py)."""
import os
import math
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'www', 'icons')
S = 1024


def poly(cx, cy, rx, ry, n, rot=0.3):
    return [(cx + math.cos(rot + a * 2 * math.pi / n) * rx, cy + math.sin(rot + a * 2 * math.pi / n) * ry) for a in range(n)]


def icon(pad=0.0):
    # A black tank with cut bottom corners in a dark grey frame, a pressure
    # pad on each wall and a few flat neon sobos packed inside.
    img = Image.new('RGB', (S, S), (27, 27, 27))
    d = ImageDraw.Draw(img)
    k = 1 - pad * 2
    o = S * (1 - k) / 2

    def P(x, y):
        return (o + x * k, o + y * k)

    L, R, T, F, C = 170, 854, 150, 900, 150
    frame = 46
    outer = [P(L - frame, T - frame), P(R + frame, T - frame), P(R + frame, F - C + 19), P(R - C + 19, F + frame),
             P(L + C - 19, F + frame), P(L - frame, F - C + 19)]
    inner = [P(L, T), P(R, T), P(R, F - C), P(R - C, F), P(L + C, F), P(L, F - C)]
    d.polygon(outer, fill=(51, 51, 51))
    d.polygon(inner, fill=(0, 0, 0))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(inner, fill=255)
    layer = Image.new('RGB', (S, S), (0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for x in (L - 70, R + 70):
        ld.ellipse([P(x - 140, 300), P(x + 140, 580)], fill=(102, 102, 102))
    for cx, cy, rx, ry, n, col in ((520, 760, 250, 170, 22, (51, 255, 255)),
                                   (280, 640, 125, 150, 14, (255, 116, 51)),
                                   (760, 620, 115, 135, 14, (255, 52, 180)),
                                   (500, 470, 105, 95, 12, (217, 255, 51)),
                                   (330, 335, 62, 60, 9, (255, 46, 46))):
        ld.polygon([P(x, y) for x, y in poly(cx, cy, rx, ry, n)], fill=col)
    img.paste(layer, (0, 0), mask)
    return img


os.makedirs(OUT, exist_ok=True)
full = icon()
full.save(os.path.join(OUT, 'icon-1024.png'))
for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    full.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
icon(pad=0.1).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('icons written to', os.path.normpath(OUT))
