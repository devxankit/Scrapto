"""
Generate every launcher icon from the one brand source (adapted from Driver Finder).

    python scripts/generate-icons.py

Source: ../frontend/src/assets/scraptox-removebg-preview.png (the Scraptox logo the
web app uses: green S-arrow mark over the "Scraptox" wordmark, transparent).
Only the mark is used; the wordmark is unreadable at launcher size.

NOTE: the source is 500 px, so the mark is only ~124 px and is upscaled here.
Replace SRC with a high-resolution (1024 px+) logo before the Play Store release.

Outputs
  android/app/src/main/res/mipmap-*/ic_launcher(_round|_foreground).png
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher(_round).xml
  android/app/src/main/res/values/ic_launcher_background.xml
  assets/brand/playstore-icon-512.png
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '..', 'frontend', 'src', 'assets', 'scraptox-removebg-preview.png')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def load_mark():
    im = Image.open(SRC).convert('RGBA')
    px = im.load()
    xs, ys = [], []
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a > 100 and g > r + 30:
                xs.append(x)
                ys.append(y)
    mark = im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    side = max(mark.size)
    square = Image.new('RGBA', (side, side), (255, 255, 255, 0))
    square.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
    return square


def tile(mark, size, scale, shape=None, bg=(255, 255, 255, 255)):
    base = Image.new('RGBA', (size, size), bg)
    m = mark.resize((int(size * scale),) * 2, Image.LANCZOS)
    base.paste(m, ((size - m.width) // 2, (size - m.height) // 2), m)
    if not shape:
        return base
    big = size * 4
    mask = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(mask)
    if shape == 'circle':
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


DEEP = (0, 84, 42, 255)  # Partner accent #00542A


def plated(mark, size, plate, scale, bg=DEEP, shape=None):
    """Partner icon: the logo on a white plate over deep green, so it reads apart from the customer app."""
    base = Image.new('RGBA', (size, size), bg)
    p = int(size * plate)
    big = p * 4
    m = Image.new('L', (big, big), 0)
    ImageDraw.Draw(m).ellipse((0, 0, big - 1, big - 1), fill=255)
    white = Image.new('RGBA', (p, p), (255, 255, 255, 255))
    base.paste(white, ((size - p) // 2, (size - p) // 2), m.resize((p, p), Image.LANCZOS))
    inner = tile(mark, p, scale / plate, bg=(255, 255, 255, 0))
    base.paste(inner, ((size - p) // 2, (size - p) // 2), inner)
    if not shape:
        return base
    big = size * 4
    mask = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(mask)
    if shape == 'circle':
        d.ellipse((0, 0, big - 1, big - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


def main():
    mark = load_mark()
    for name, k in DENSITIES.items():
        d = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        plated(mark, int(48 * k), 0.74, 0.5, shape='rounded').save(os.path.join(d, 'ic_launcher.png'))
        plated(mark, int(48 * k), 0.74, 0.5, shape='circle').save(os.path.join(d, 'ic_launcher_round.png'))
        plated(mark, int(108 * k), 0.5, 0.34, bg=(0, 0, 0, 0)).save(os.path.join(d, 'ic_launcher_foreground.png'))
    any_dir = os.path.join(RES, 'mipmap-anydpi-v26')
    os.makedirs(any_dir, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@color/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '</adaptive-icon>\n')
    for n in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        open(os.path.join(any_dir, n), 'w').write(xml)
    open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#00542A</color>\n</resources>\n')
    os.makedirs(os.path.join(ROOT, 'assets', 'brand'), exist_ok=True)
    plated(mark, 512, 0.74, 0.5).convert('RGB').save(os.path.join(ROOT, 'assets', 'brand', 'playstore-icon-512.png'))
    print('icons written')


if __name__ == '__main__':
    main()
