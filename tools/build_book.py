from pathlib import Path
from PIL import Image
import json
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'private-book'
DEST = ROOT / 'site' / 'book'
(DEST / 'pages').mkdir(parents=True, exist_ok=True)
(DEST / 'text').mkdir(exist_ok=True)
manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf8'))
starts = [16,32,48,64,80,98,114,130,146,164,180,198,216,236,258,276]
cn = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六']
manifest['chapters'] = [{'number':i+1,'title':f'第{cn[i]}课' + (' · 初次见面' if i==0 else ''),'subtitle':f'UNIDAD {i+1:02} · 书内第 {p-15} 页','page':p} for i,p in enumerate(starts)]
manifest['defaultPage']=17
manifest['ocrStatus']='automated-not-fully-proofread'
(DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',',':')),encoding='utf8')
first = [
  'Ana: Hola, buenos días.',
  'Paco: Buenos días. Yo soy Paco. Y tú, ¿cómo te llamas?',
  'Ana: Yo me llamo Ana. Ellos son mis amigos. Ella se llama Susana y él se llama Tomás.',
  'Paco: ¿Son ustedes españoles?',
  'Ana: Yo soy española, Susana es cubana y Tomás, chileno.',
  'Paco: Encantado de conocerlos.',
  'Ana: Mucho gusto. ¿Es usted profesor?',
  'Paco: Sí, soy profesor de chino.',
  'Ana: Ah, usted es nuestro profesor de chino. Entonces, somos sus alumnos.'
]

def build_page(entry):
    page = entry['id']
    image = DEST/'pages'/f'{page:03}.webp'
    if not image.exists():
        with Image.open(SOURCE/'pages'/f'{page:03}.jpg') as im:
            im.save(image, 'WEBP', quality=88, method=4)
    raw = json.loads((SOURCE/'ocr'/f'{page:03}.json').read_text(encoding='utf8'))
    if page == 17:
        raw['readingLines']=[{'text':text} for text in first]
        raw['heading']='¿Cómo te llamas?'
        raw['reviewed']=True
    (DEST/'text'/f'{page:03}.json').write_text(json.dumps(raw,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    return {'page':page,'text':raw['text']}

with ThreadPoolExecutor(max_workers=4) as pool:
    search = list(pool.map(build_page, manifest['pages']))
(DEST/'search.json').write_text(json.dumps(search,ensure_ascii=False,separators=(',',':')),encoding='utf8')
assert len(list((DEST/'pages').glob('*.webp'))) == 305
assert len(list((DEST/'text').glob('*.json'))) == 305
print('Built and verified all 305 pages',flush=True)
print('Images:',round(sum(p.stat().st_size for p in (DEST/'pages').glob('*'))/1024/1024,1),'MiB',flush=True)
