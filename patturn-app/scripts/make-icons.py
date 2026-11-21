"""Rebuild desktop icons; optional tooling dependency: Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
folder = Path(__file__).resolve().parents[1] / 'apps/desktop/src-tauri/icons'
folder.mkdir(parents=True, exist_ok=True)
size = 1024
image = Image.new('RGBA', (size, size), (247, 243, 236, 255))
draw = ImageDraw.Draw(image)
# Bowl with a thick rounded rim and a foot; original geometric artwork.
draw.rounded_rectangle((40, 40, 984, 984), radius=220, fill='#efe9df')
draw.pieslice((205, 170, 819, 820), 0, 180, fill='#c4622d')
draw.rounded_rectangle((185, 460, 839, 530), radius=35, fill='#a94f21')
draw.rounded_rectangle((394, 775, 630, 835), radius=24, fill='#a94f21')
for n, name in [(32, '32x32.png'), (128, '128x128.png'), (256, '128x128@2x.png')]:
    image.resize((n, n), Image.Resampling.LANCZOS).save(folder / name)
image.save(folder / 'icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
