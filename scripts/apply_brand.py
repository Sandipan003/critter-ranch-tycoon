"""Sizes the brand images (rendered by tools/brand.html into brand-out/) into the Android launcher
icons, adaptive icon layers, splash screens and Play Store graphics.

Run from the project root:  python3 scripts/apply_brand.py
"""
import os
import shutil
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'brand-out')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
STORE = os.path.join(ROOT, 'store-assets')

LEGACY = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ADAPTIVE = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def webp(im, base):
    """Saves `base`.webp (lossy; Android 4.0+) and removes an older `base`.png of the same resource."""
    os.makedirs(os.path.dirname(base), exist_ok=True)
    im.save(base + '.webp', 'WEBP', quality=86, method=6)
    if os.path.exists(base + '.png'):
        os.remove(base + '.png')


def mask(size, shape):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    if shape == 'circle':
        d.ellipse([0, 0, size - 1, size - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.2), fill=255)
    return m


def cover(im, w, h):
    """Scale to cover w×h and centre-crop."""
    k = max(w / im.width, h / im.height)
    r = im.resize((max(w, round(im.width * k)), max(h, round(im.height * k))), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def main():
    icon = load('icon-1024.png')
    fg = load('icon-foreground-1024.png')
    bg = load('icon-background-1024.png')
    backdrop = load('backdrop-2048.png')
    logo = load('logo-1600.png')

    # Play Store
    save(icon.convert('RGB').resize((512, 512), Image.LANCZOS), os.path.join(STORE, 'icon-512.png'))
    shutil.copy(os.path.join(SRC, 'feature-graphic-1024x500.png'), os.path.join(STORE, 'feature-graphic-1024x500.png'))

    # legacy launcher icons (pre-Android 8) and adaptive layers
    big = {s: mask(1024, s) for s in ('square', 'circle')}
    for dpi, px in LEGACY.items():
        sq = icon.copy()
        sq.putalpha(big['square'])
        save(sq.resize((px, px), Image.LANCZOS), os.path.join(RES, f'mipmap-{dpi}', 'ic_launcher.png'))
        rd = icon.copy()
        rd.putalpha(big['circle'])
        save(rd.resize((px, px), Image.LANCZOS), os.path.join(RES, f'mipmap-{dpi}', 'ic_launcher_round.png'))
    for dpi, px in ADAPTIVE.items():
        save(fg.resize((px, px), Image.LANCZOS), os.path.join(RES, f'mipmap-{dpi}', 'ic_launcher_foreground.png'))
        webp(bg.convert('RGB').resize((px, px), Image.LANCZOS), os.path.join(RES, f'mipmap-{dpi}', 'ic_launcher_background'))
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
           '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
           '</adaptive-icon>\n')
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(RES, 'mipmap-anydpi-v26', name), 'w') as f:
            f.write(xml)
    with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4FB841</color>\n</resources>\n')

    # splash screens: the logo on the green backdrop, at every size Capacitor ships
    for root, _, files in os.walk(RES):
        name = 'splash.png' if 'splash.png' in files else 'splash.webp' if 'splash.webp' in files else None
        if not name:
            continue
        p = os.path.join(root, name)
        w, h = Image.open(p).size
        sp = cover(backdrop, w, h)
        lw = int(w * (0.82 if h >= w else 0.5))
        lh = int(logo.height * lw / logo.width)
        sp.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), ((w - lw) // 2, (h - lh) // 2 - int(h * 0.03)))
        webp(sp.convert('RGB'), os.path.join(root, 'splash'))
    print('launcher icons, adaptive layers, splash screens and store graphics written')


if __name__ == '__main__':
    main()
