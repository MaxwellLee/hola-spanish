from pathlib import Path
from pypdf import PdfReader
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'private-book'
(OUT / 'pages').mkdir(parents=True, exist_ok=True)
if len(sys.argv) != 2:
    raise SystemExit('Usage: python tools/extract_book.py <source.pdf>')
source = Path(sys.argv[1])
reader = PdfReader(source)
manifest = {'title': '新版现代西班牙语 · 第一册', 'sourcePages': len(reader.pages), 'pages': []}
for i, page in enumerate(reader.pages, 1):
    images = list(page.images)
    if len(images) != 1:
        raise RuntimeError(f'Page {i}: expected one scan, got {len(images)}')
    scan = images[0].image.convert('RGB')
    path = OUT / 'pages' / f'{i:03}.jpg'
    scan.save(path, quality=90, optimize=True)
    manifest['pages'].append({'id': i, 'image': f'pages/{i:03}.jpg', 'width': scan.width, 'height': scan.height})
    if i % 25 == 0:
        print(f'Extracted {i}/{len(reader.pages)}', flush=True)
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
print(f'Extracted all {len(reader.pages)} pages', flush=True)
