# 컨셉아트에서 게임 그림을 «잘라» 만든다.  python3 blackout/tests/concept-crops.py
#
# 왜: 설계자가 「컨셉아트 수준으로 올려라」고 했고, 그림 생성 도구는 쓰지 않기로 했다.
# 컨셉아트 두 장(assets/concept/concept-01.jpg · office.jpg)에 이미 위에서 본 가구·마루·
# 얼룩·발자국이 그려져 있으니, 거기서 조각을 오려 칸 규격(칸 = 100px)에 맞춘다.
# 오린 조각 둘레의 바닥은 같은 그림의 바닥이라 가장자리를 부드럽게(feather) 하면 게임
# 마루와 이어진다. 마루는 깨끗한 바닥 조각을 뒤집어 가며 깔고 조명 그라데이션을 굽는다.
#
# 결과: assets/rooms/<방>.jpg · assets/furniture/<kind>-<w>x<h>.png · assets/sprites/splat-N.png
# 그 뒤 `node blackout/tests/assets-manifest.js` 로 목록을 다시 만든다.
import os, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(HERE, '..', 'assets')
OFF = Image.open(os.path.join(A, 'concept', 'office.jpg')).convert('RGB')      # 750×553
CON = Image.open(os.path.join(A, 'concept', 'concept-01.jpg')).convert('RGB')  # 1200×800
random.seed(20260913)

def feather(im, px=7):
    """가장자리 알파를 부드럽게 — 조각 둘레의 컨셉 바닥이 게임 마루로 녹아든다."""
    im = im.convert('RGBA')
    w, h = im.size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((px, px, w - 1 - px, h - 1 - px), radius=px * 2, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(px))
    im.putalpha(mask)
    return im

def piece(src, box, size, name, rotate=0, mirror=False, sharpen=1.15):
    im = src.crop(box)
    if rotate: im = im.rotate(rotate, expand=True)
    if mirror:
        im = Image.new('RGB', (im.width * 2, im.height)).paste(im, (0, 0)) or im
    im = im.resize(size, Image.LANCZOS)
    im = ImageEnhance.Sharpness(im).enhance(sharpen)
    im = feather(im, max(4, size[0] // 40))
    im.save(os.path.join(A, 'furniture', name + '.png'), optimize=True)
    return im

def mirrored(src, box):
    """왼쪽 절반을 오른쪽에 거울로 — 침대처럼 대칭인 물건에서 얼룩이 그려진 쪽을 버린다."""
    im = src.crop(box)
    out = Image.new('RGB', (im.width * 2, im.height))
    out.paste(im, (0, 0)); out.paste(ImageOps.mirror(im), (im.width, 0))
    return out

def tiled(src, box, size, name):
    """세로 1칸짜리 조각을 옆으로 세 번 — 수납장 3칸."""
    im = src.crop(box)
    out = Image.new('RGB', (im.width * 3, im.height))
    for i in range(3): out.paste(im if i % 2 == 0 else ImageOps.mirror(im), (i * im.width, 0))
    out = out.resize(size, Image.LANCZOS)
    out = feather(out, 6)
    out.save(os.path.join(A, 'furniture', name + '.png'), optimize=True)
    return out

# ── 가구 (컨셉 좌표는 tests/…-grid.png 로 잰 것) ──────────────────────────────
piece(OFF, (128, 38, 348, 132), (300, 100), 'desk-3x1')          # 긴 책상: 모니터·키보드·머그
piece(OFF, (128, 38, 275, 132), (200, 100), 'desk-2x1')          # 짧은 책상/탁자
piece(OFF, (198, 102, 288, 192), (100, 100), 'chair-1x1')        # 사무용 의자
piece(OFF, (662, 240, 722, 338), (100, 200), 'cabinet-1x2')      # 초록 철제 서랍장
piece(OFF, (548, 112, 688, 212), (200, 100), 'cabinet-2x1')      # 둘째 책상(스탠드·모니터) → TV 장
unit = OFF.crop((355, 25, 415, 125)).rotate(90, expand=True)     # 검은 선반 유닛(책·상자) → 눕혀서 셋 = 책장
row = Image.new('RGB', (unit.width * 3, unit.height))
for i in range(3): row.paste(unit if i % 2 == 0 else ImageOps.mirror(unit), (i * unit.width, 0))
row = row.resize((300, 100), Image.LANCZOS); feather(row, 6).save(os.path.join(A, 'furniture', 'shelf-3x1.png'), optimize=True)
tiled(OFF, (662, 240, 722, 338), (300, 100), 'cabinet-3x1')      # 서랍장 셋 = 수납장 (세로 조각을 눕힌다)
piece(OFF, (470, 240, 570, 300), (200, 100), 'papers-2x1')       # 흩어진 서류
bed = mirrored(CON, (750, 55, 850, 335)).resize((200, 300), Image.LANCZOS)
feather(bed, 6).save(os.path.join(A, 'furniture', 'bed-2x3.png'), optimize=True)   # 침대(왼쪽 절반 거울)
piece(CON, (700, 88, 762, 150), (100, 100), 'nightstand-1x1')    # 협탁 + 스탠드
piece(OFF, (285, 168, 468, 306), (300, 200), 'rug-3x2')          # 꽃무늬 러그
piece(CON, (1000, 158, 1112, 270), (200, 200), 'rug-2x2')        # 둥근 라탄 러그
piece(CON, (652, 286, 728, 362), (100, 100), 'basket-1x1')       # 빨래 바구니
piece(OFF, (52, 28, 122, 98), (100, 100), 'plant-1x1')           # 화분
piece(CON, (790, 290, 930, 335), (300, 100), 'sofa-3x1')         # 침대 발치 벤치 → 긴 의자

# ── 마루: 깨끗한 바닥 조각 하나를 거울처럼 뒤집어 가며 깐다(거울 타일은 이음매가 없다) ──
#  그 위에 방마다 다른 조명(스탠드 불빛·창가 달빛)과 가장자리 그늘을 굽는다.
PATCH = OFF.crop((472, 312, 548, 438))          # 사무실 오른쪽 아래의 맨 마루 76×126
def floor(name, light, tone=(1.0, 1.0, 1.0)):
    W = 800
    p = PATCH.resize((100, int(126 * 100 / 76)), Image.LANCZOS)   # 칸당 100px
    p = ImageEnhance.Sharpness(p).enhance(1.2)
    out = Image.new('RGB', (W + p.width, W + p.height))
    for j in range(0, W + p.height, p.height):
        for i in range(0, W + p.width, p.width):
            q = p
            if (i // p.width) % 2: q = ImageOps.mirror(q)
            if (j // p.height) % 2: q = ImageOps.flip(q)
            out.paste(q, (i, j))
    out = out.crop((0, 0, W, W)).filter(ImageFilter.GaussianBlur(0.4))
    r, g, b = out.split()
    out = Image.merge('RGB', (r.point(lambda v: min(255, int(v * tone[0]))), g.point(lambda v: min(255, int(v * tone[1]))), b.point(lambda v: min(255, int(v * tone[2])))))
    L = Image.new('RGB', (W, W), (0, 0, 0))
    for (lx, ly, rad, col, k) in light:
        glow = Image.new('RGB', (W, W), (0, 0, 0))
        ImageDraw.Draw(glow).ellipse((lx - rad, ly - rad, lx + rad, ly + rad), fill=tuple(int(c * k) for c in col))
        glow = glow.filter(ImageFilter.GaussianBlur(rad * .55))
        L = ImageChops.add(L, glow)
    base = ImageEnhance.Brightness(out).enhance(.72)
    out = ImageChops.add(base, ImageChops.multiply(out, L))
    vign = Image.new('L', (W, W), 0)
    ImageDraw.Draw(vign).rounded_rectangle((26, 26, W - 26, W - 26), radius=70, fill=255)
    vign = vign.filter(ImageFilter.GaussianBlur(55))
    out = Image.composite(out, ImageEnhance.Brightness(out).enhance(.55), vign)
    out.save(os.path.join(A, 'rooms', name + '.jpg'), quality=84, optimize=True)
    return out

floor('office',  [(160, 120, 420, (255, 214, 150), .8), (700, 140, 300, (255, 200, 140), .55), (500, 700, 260, (120, 140, 200), .3)])
floor('bedroom', [(60, 300, 380, (150, 180, 255), .9), (330, 120, 260, (255, 210, 150), .6), (700, 650, 260, (255, 190, 130), .35)], tone=(.92, .96, 1.08))
floor('living',  [(400, 160, 420, (255, 220, 170), .75), (150, 650, 300, (255, 200, 140), .45), (700, 400, 260, (140, 170, 210), .35)], tone=(1.04, 1.0, .94))

# ── 얼룩: 그림 속 페인트에서 «페인트다움»(분홍·청록 채도)을 뽑아 흰 마스크로 ─────
def splat(src, box, name):
    im = src.crop(box).convert('RGB')
    hsv = im.convert('HSV')
    W, H = im.size
    m = Image.new('L', (W, H), 0)
    px = hsv.load(); out = m.load()
    for yy in range(H):
        for xx in range(W):
            h, s, v = px[xx, yy]
            hue = h * 360 / 255
            pink = (hue > 300 or hue < 20) and s > 70 and v > 120
            cyan = 165 < hue < 205 and s > 60 and v > 110
            out[xx, yy] = 255 if (pink or cyan) else 0
    m = m.filter(ImageFilter.GaussianBlur(1.2)).point(lambda a: 255 if a > 90 else 0).filter(ImageFilter.GaussianBlur(0.6))
    bbox = m.getbbox()
    if not bbox: raise SystemExit('no paint found in ' + name)
    m = m.crop(bbox)
    side = max(m.size) + 24
    sq = Image.new('L', (side, side), 0); sq.paste(m, ((side - m.width) // 2, (side - m.height) // 2))
    sq = sq.resize((256, 256), Image.LANCZOS)
    png = Image.new('RGBA', (256, 256), (255, 255, 255, 0)); png.putalpha(sq)
    png.save(os.path.join(A, 'sprites', name + '.png'), optimize=True)
    return png

splat(OFF, (498, 160, 568, 222), 'splat-1')     # 서류 위 분홍 얼룩
splat(CON, (855, 165, 955, 255), 'splat-2')     # 이불 위 분홍+청록
splat(CON, (1012, 92, 1066, 135), 'splat-3')    # 서랍장 위
splat(OFF, (548, 198, 588, 240), 'splat-4')     # 책상 위 작은 얼룩
print('done', sorted(os.listdir(os.path.join(A, 'furniture'))), sorted(os.listdir(os.path.join(A, 'rooms'))))
