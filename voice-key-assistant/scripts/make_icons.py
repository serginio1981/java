"""Genera los iconos PNG de la PWA (ejecutar una vez: python scripts/make_icons.py)."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "web" / "icons"


def icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), "#101828")
    d = ImageDraw.Draw(img)
    u = size / 100
    # llave: anillo + vástago
    d.ellipse((22 * u, 18 * u, 58 * u, 54 * u), outline="#7dd3fc", width=int(8 * u))
    d.rounded_rectangle((44 * u, 44 * u, 82 * u, 56 * u), radius=int(4 * u), fill="#7dd3fc")
    d.rectangle((68 * u, 56 * u, 76 * u, 66 * u), fill="#7dd3fc")
    # ondas de voz
    for i, h in enumerate((10, 22, 34, 22, 10)):
        x = (20 + i * 15) * u
        d.rounded_rectangle((x, (82 - h / 2) * u, x + 7 * u, (82 + h / 2) * u), radius=int(3 * u), fill="#f8fafc")
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for s in (180, 192, 512):
        icon(s).save(OUT / f"icon-{s}.png")
    print("iconos generados en", OUT)
