// Builds templates/lecture.html from one of the instructor's real decks: same fonts, colours, scripts,
// PDF button and Present button, with placeholder slides made from the deck's own layouts plus
// Slidewright's standard ones (table, code, equation). Run:  node tools/make_template.cjs <deck.html> [out.html]
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'); const SRC = path.resolve(process.argv[2]); const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'templates/lecture.html'));
const T = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.error('page error:', e.message));
  await p.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await p.waitForFunction(() => window.__deckEditor && __deckEditor.S.slides.length > 0);
  await p.setInputFiles('#fileDeck', SRC); await p.waitForFunction(n => __deckEditor.S.name === n, path.basename(SRC), { timeout: 30000 }); await p.waitForTimeout(1500);
  const html = await p.evaluate(() => {
    const D = __deckEditor, S = D.S, src = S.slides.slice();
    const named = (sec, t) => { sec.setAttribute('data-title', t); return sec; };
    const std = Object.fromEntries(D.stdLayouts().map(([n, , f]) => [n, f]));
    const setText = (sec, from, to) => { const w = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.trim() === from) { n.data = n.data.replace(from, to); return true; } return false; };
    const root = sec => sec.querySelector(':scope > div');
    // 1. title slide from the deck's own title slide, keeping its PDF button
    const title = named(D.layoutSection(src[0]), 'Title slide'); const pdf = src[0].querySelector(':scope > .pdf-get'); if (pdf) title.appendChild(pdf.cloneNode(true));
    { /* keep the course label, title and subtitle; drop anything below them (that lecture's own journey row) */
      const r = root(title), head = r.firstElementChild; [...r.children].slice(1).forEach(x => x.remove());
      const leaves = [...head.querySelectorAll('*')].filter(x => !x.children.length && x.textContent.trim()); const words = ['COURSE 1234', 'Lecture title', 'One line on what this lecture covers'];
      leaves.slice(0, 3).forEach((x, k) => { x.textContent = words[k]; }); }
    const notes = document.createElement('aside'); notes.className = 'notes'; notes.textContent = 'Speaker notes for this slide go here. Only you see them, in presenter view.'; title.appendChild(notes);
    // 2. the deck's own most-used layouts (not the title slide)
    const lays = [] && D.collectLayouts().filter(l => l.i !== 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 5).map((l, k) => named(D.layoutSection(l.rep), 'Layout ' + (k + 1) + ' from your decks'));
    // 3. table, code and equation slides on the standard title layout
    const tbl = named(std['Title only'](), 'Table'); setText(tbl, 'Slide title', 'Comparing results');
    const t = D.makeTable(4, 3, true); t.style.left = '64px'; t.style.top = '180px'; t.style.width = '760px';
    [['Model', 'Parameters', 'Accuracy'], ['Small', '10M', '81%'], ['Base', '110M', '88%'], ['Large', '340M', '91%']].forEach((r, i) => r.forEach((v, j) => { t.rows[i].cells[j].textContent = v; }));
    t.querySelector('caption').textContent = 'Accuracy by model size'; root(tbl).appendChild(t);
    const code = named(std['Title only'](), 'Code'); setText(code, 'Slide title', 'In code');
    const pre = document.createElement('pre'); pre.style.cssText = 'position: absolute; left: 64px; top: 180px; width: 760px';
    D.buildCode(pre, { src: 'import torch\n\nX = torch.randn(32, 4)      # 32 examples, 4 features\nW = torch.randn(3, 4)       # 3 outputs\nY_hat = X @ W.T             # predictions, shape (32, 3)\nprint(Y_hat.shape)', lang: 'python', theme: 'dark', ln: true, steps: '4,5', size: 20 });
    root(code).appendChild(pre);
    const eq = named(std['Title only'](), 'Equation'); setText(eq, 'Slide title', 'The model');
    const m = document.createElement('div'); m.style.cssText = 'position: absolute; left: 64px; top: 240px; width: 1152px; font-size: 40px; line-height: 56px; text-align: center'; m.textContent = '\\( \\hat{Y} = X W^\\top \\)'; root(eq).appendChild(m);
    const slides = [title, named(std['Section header'](), 'Section'), named(std['Title and content'](), 'Title and content'), named(std['Two columns'](), 'Two columns'), named(std['Picture with caption'](), 'Picture with caption'), tbl, code, eq,
      named(std['Key number'](), 'Key number'), named(std['Statement'](), 'Statement')];
    const q = named(std['Section header'](), 'Questions'); setText(q, 'PART 02', 'WRAPPING UP'); setText(q, 'Section title', 'Questions?'); setText(q, 'What this part covers, in one line', 'Office hours, and where to find the notebook'); slides.push(q);
    D.setSlides(slides, 0); D.commit('Template');
    S.doc.title = 'Lecture title'; const meta = S.doc.head.querySelector('meta[name="slidewright-source"]'); if (meta) meta.remove();
    return D.serialize();
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, html); console.log('wrote', OUT, (html.length / 1e6).toFixed(1), 'MB');
  await b.close(); srv.close();
})();
