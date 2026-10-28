# Icon theo loại file cho Explorer: chữ định dạng màu vàng (tone logo) trên nền vuông tối của logo.
# Cỡ 16/20/24 dùng chữ vẽ theo pixel cho nét; từ 32px dùng font Inter Display Black.
# Chạy: python3 build/icon-src/filetypes.py  (cần Pillow + numpy)
import io, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'filetypes')
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Black.otf'
TYPES = [('png', 'PNG'), ('jpg', 'JPG'), ('gif', 'GIF'), ('webp', 'WEBP'), ('ico', 'ICO'), ('bmp', 'BMP'),
         ('psd', 'PSD'), ('psb', 'PSB'), ('tga', 'TGA'), ('tif', 'TIFF')]
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
BG_TOP, BG_BOT = (38, 35, 40), (20, 19, 22)          # nền tối như logo
GOLD_TOP, GOLD_BOT = (252, 232, 182), (214, 160, 88)  # vàng như logo

F35 = {  # chữ 3x5 (M, N, W rộng hơn)
    'A': ['010', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'], 'C': ['011', '100', '100', '100', '011'],
    'D': ['110', '101', '101', '101', '110'], 'E': ['111', '100', '110', '100', '111'], 'F': ['111', '100', '110', '100', '100'],
    'G': ['011', '100', '101', '101', '011'], 'I': ['111', '010', '010', '010', '111'], 'J': ['001', '001', '001', '101', '010'],
    'M': ['10001', '11011', '10101', '10001', '10001'], 'N': ['1001', '1101', '1011', '1001', '1001'],
    'O': ['111', '101', '101', '101', '111'], 'P': ['110', '101', '110', '100', '100'], 'S': ['011', '100', '010', '001', '110'],
    'T': ['111', '010', '010', '010', '010'], 'W': ['1001', '1001', '1001', '1111', '0110'],
}
F57 = {  # chữ 5x7
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'], 'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'], 'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], 'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'], 'I': ['111', '010', '010', '010', '010', '010', '111'],
    'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'], 'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'], 'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'], 'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'], 'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
}

def vgrad(w, h, top, bot):
    t = np.linspace(0, 1, h)[:, None, None]
    a = np.array(top)[None, None] * (1 - t) + np.array(bot)[None, None] * t
    return Image.fromarray(np.repeat(a, w, 1).astype(np.uint8), 'RGB')

def background(s, ss=4):
    S = s * ss
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * 0.22), fill=255)
    bg = vgrad(S, S, BG_TOP, BG_BOT).convert('RGBA'); bg.putalpha(m)
    return bg.resize((s, s), Image.LANCZOS)

def gold_mask(mask):
    g = vgrad(mask.width, mask.height, GOLD_TOP, GOLD_BOT).convert('RGBA'); g.putalpha(mask); return g

def pixel_text(s, label, font, gap=1):
    rows = len(next(iter(font.values())))
    w = sum(len(font[c][0]) for c in label) + gap * (len(label) - 1)
    mask = Image.new('L', (s, s), 0); px = mask.load()
    x0, y0 = (s - w) // 2, (s - rows) // 2
    x = x0
    for c in label:
        g = font[c]
        for yy, row in enumerate(g):
            for xx, b in enumerate(row):
                if b == '1': px[x + xx, y0 + yy] = 255
        x += len(g[0]) + gap
    # dải vàng 1px trong chữ: tô gradient theo vùng chữ
    g = vgrad(s, s, GOLD_TOP, GOLD_BOT).convert('RGBA'); g.putalpha(mask)
    return g

def font_text(s, label, ss=4):
    S = s * ss
    size = S
    font = ImageFont.truetype(FONT, size)
    # co cỡ chữ cho vừa 80% chiều ngang
    while True:
        bb = font.getbbox(label)
        if bb[2] - bb[0] <= S * 0.8 and bb[3] - bb[1] <= S * 0.42: break
        size -= max(1, size // 40); font = ImageFont.truetype(FONT, size)
    m = Image.new('L', (S, S), 0)
    bb = font.getbbox(label)
    ImageDraw.Draw(m).text(((S - (bb[2] - bb[0])) / 2 - bb[0], (S - (bb[3] - bb[1])) / 2 - bb[1]), label, font=font, fill=255)
    return gold_mask(m).resize((s, s), Image.LANCZOS)

def icon(s, label):
    im = background(s)
    if s <= 20: txt = pixel_text(s, label, F35)
    elif s <= 24: txt = pixel_text(s, label, F57)
    else: txt = font_text(s, label)
    im.alpha_composite(txt)
    return im

def write_ico(path, ims):
    head = bytearray(6 + 16 * len(ims)); head[2:4] = (1).to_bytes(2, 'little'); head[4:6] = len(ims).to_bytes(2, 'little')
    off, body = len(head), b''
    for i, (s, im) in enumerate(ims):
        b = io.BytesIO(); im.save(b, 'PNG', optimize=True); d = b.getvalue()
        e = 6 + 16 * i; head[e] = head[e + 1] = 0 if s >= 256 else s
        head[e + 4:e + 6] = (1).to_bytes(2, 'little'); head[e + 6:e + 8] = (32).to_bytes(2, 'little')
        head[e + 8:e + 12] = len(d).to_bytes(4, 'little'); head[e + 12:e + 16] = off.to_bytes(4, 'little')
        off += len(d); body += d
    open(path, 'wb').write(bytes(head) + body)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for key, label in TYPES:
        ims = [(s, icon(s, label)) for s in SIZES]
        write_ico(os.path.join(OUT, key + '.ico'), ims)
        ims[-1][1].save(os.path.join(OUT, key + '.png'))
    print('done')
