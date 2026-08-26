"""
Generates the Saloona PNG icon set.

Drawn rather than exported from a design tool so the set can be regenerated
after a brand change without a manual export step. Everything is rendered at 8x
and downsampled, which is cheaper than antialiased path rendering and produces
clean edges on the arcs.
"""
from PIL import Image, ImageDraw, ImageFont

TEAL = (15, 128, 120, 255)
INK = (16, 26, 45, 255)
WHITE = (255, 255, 255, 255)
GOLD = (224, 160, 32, 255)
SS = 8  # supersample factor


def rounded_mask(size, radius_ratio=0.225):
    m = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1],
                        radius=int(size * SS * radius_ratio), fill=255)
    return m


def draw_glyph(draw, size, colour, scale=1.0, offset=(0, 0)):
    """The Saloona 'S' swoosh: two overlapping arcs."""
    n = size * SS
    cx = n / 2 + offset[0] * SS
    cy = n / 2 + offset[1] * SS
    r = n * 0.155 * scale
    dy = n * 0.10 * scale
    w = max(1, int(n * 0.085 * scale))

    top = [cx - r, cy - dy - r, cx + r, cy - dy + r]
    bottom = [cx - r, cy + dy - r, cx + r, cy + dy + r]
    draw.arc(top, 90, 340, fill=colour, width=w)
    draw.arc(bottom, 270, 520, fill=colour, width=w)


def app_icon(size, bg=TEAL, fg=WHITE, rounded=True, pad=0.0):
    """`pad` reserves a safe area so maskable icons survive an aggressive crop."""
    n = size * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    plate = Image.new("RGBA", (n, n), bg)
    if rounded:
        plate.putalpha(rounded_mask(size))
    img.alpha_composite(plate)

    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    draw_glyph(ImageDraw.Draw(layer), size, fg, scale=1.0 - pad)
    img.alpha_composite(layer)
    return img.resize((size, size), Image.LANCZOS)


def square_icon(size, bg=TEAL, fg=WHITE):
    """No rounding and no transparency — required for apple-touch-icon."""
    n = size * SS
    img = Image.new("RGBA", (n, n), bg)
    draw_glyph(ImageDraw.Draw(img), size, fg, scale=0.92)
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


def load_font(px, bold=True):
    candidates = [
        "/System/Library/Fonts/Supplemental/Futura.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, px)
        except Exception:
            continue
    return ImageFont.load_default()


def og_image(w=1200, h=630):
    """Link preview card for WhatsApp, LinkedIn, and Twitter."""
    img = Image.new("RGB", (w, h), (16, 26, 45))
    d = ImageDraw.Draw(img)

    # Faint grid, matching the marketing hero.
    for x in range(0, w, 48):
        d.line([(x, 0), (x, h)], fill=(26, 39, 64), width=1)
    for y in range(0, h, 48):
        d.line([(0, y), (w, y)], fill=(26, 39, 64), width=1)

    # Teal wash on the right third.
    wash = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(wash).ellipse([w - 520, -260, w + 300, 520], fill=(15, 128, 120, 60))
    img.paste(Image.alpha_composite(img.convert("RGBA"), wash).convert("RGB"), (0, 0))
    d = ImageDraw.Draw(img)

    mark = app_icon(96)
    img.paste(mark, (72, 64), mark)
    d.text((186, 88), "Saloona", font=load_font(46), fill=WHITE[:3])

    d.text((72, 220), "Bring your customers", font=load_font(76), fill=WHITE[:3])
    d.text((72, 306), "back. Automatically.", font=load_font(76), fill=(93, 214, 198))

    d.text((72, 424),
           "Salon software for Pakistan. Track every visit, reward regulars,",
           font=load_font(30), fill=(154, 169, 200))
    d.text((72, 464),
           "and win back lapsed customers on your own WhatsApp number.",
           font=load_font(30), fill=(154, 169, 200))

    d.rounded_rectangle([72, 534, 320, 590], radius=14, fill=GOLD[:3])
    d.text((104, 550), "saloona.pk", font=load_font(26), fill=(16, 26, 45))
    return img


app_icon(192).save("public/icons/icon-192.png")
app_icon(512).save("public/icons/icon-512.png")
# Maskable icons are cropped to a circle by some launchers, so the glyph is
# shrunk to sit inside the 80% safe zone.
app_icon(512, pad=0.28).save("public/icons/maskable-512.png")
square_icon(180).save("public/icons/apple-touch-icon.png")
app_icon(32).save("public/icons/favicon-32.png")
og_image().save("public/icons/og-image.png", optimize=True)
print("written")
