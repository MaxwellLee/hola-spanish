const fs = require('node:fs');
const path = require('node:path');
const { createWorker } = require(process.env.TESSERACT_MODULE || 'tesseract.js');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'private-book');
const outDir = path.join(dataDir, 'ocr');
fs.mkdirSync(outDir, { recursive: true });
const pages = process.argv.slice(2).map(Number);
const queue = pages.length ? pages : Array.from({ length: 305 }, (_, i) => i + 1);
let completed = 0;
async function run(id) {
  const worker = await createWorker('spa+chi_sim', 1, {
    langPath: path.join(root, 'tmp/tessdata'),
    cachePath: path.join(root, 'tmp/tessdata'),
    gzip: true,
  });
  await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
  while (queue.length) {
    const page = queue.shift();
    const file = path.join(outDir, `${String(page).padStart(3, '0')}.json`);
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file,'utf8')).lines.length) { completed++; continue; }
    const start = Date.now();
    const image = path.join(dataDir, 'pages', `${String(page).padStart(3, '0')}.jpg`);
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    let { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    if (!data.blocks?.length) {
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      ({ data } = await worker.recognize(image, {}, { text: true, blocks: true }));
    }
    const lines = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.map(l => ({
      text: l.text.trim(), confidence: Math.round(l.confidence), bbox: l.bbox,
      words: l.words.map(w => ({ text: w.text, confidence: Math.round(w.confidence), bbox: w.bbox })),
    }))));
    fs.writeFileSync(file, JSON.stringify({ page, confidence: Math.round(data.confidence), text: data.text, lines }));
    console.log(`Worker ${id} page ${page}: ${lines.length} lines, ${Math.round(data.confidence)}% confidence, ${Math.round((Date.now()-start)/1000)}s (${++completed} done)`);
  }
  await worker.terminate();
}
Promise.all(Array.from({length: pages.length ? Math.min(pages.length, 3) : 4}, (_,i)=>run(i+1))).catch(e=>{ console.error(e); process.exitCode=1; });
