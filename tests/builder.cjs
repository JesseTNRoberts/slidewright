// Converter + Slidewright together.
// Builds board-to-reveal/test-board (one slide per pattern the converter supports) into a deck,
// opens it in Slidewright, edits and saves it, then presents the saved deck and checks that every
// converter feature still works. A converter change that breaks this is fixed in the same change.
//   Run with:  (cd board-to-reveal && npm install --omit=optional) && node tests/builder.cjs
const playwright = require('playwright');
// BROWSER=webkit runs the same tests in Safari's engine; the default is Chromium (Chrome, Edge).
const ENGINE = process.env.BROWSER || 'chromium';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-builder-'));
const DECK = path.join(TMP, 'test-board.html');
const SAVED = path.join(TMP, 'saved.html');
execFileSync(process.execPath, [path.join(ROOT, 'board-to-reveal/build.js'), path.join(ROOT, 'board-to-reveal/test-board'), DECK], { stdio: 'inherit' });

const canvas = JSON.parse(fs.readFileSync(path.join(ROOT, 'board-to-reveal/test-board/canvas.json'), 'utf8'));
const VISIBLE = canvas.order.filter(n => canvas.boards[n].page !== 'hidden').length;
const ALL = canvas.order.length;
// the titles the converter wrote, one per board in order (hidden ones marked)
const BUILT = [...fs.readFileSync(DECK, 'utf8').matchAll(/<section data-title="([^"]*)"([^>]*)>/g)].map(m => ({ title: m[1].replace(/&amp;/g, '&'), hidden: /data-visibility="hidden"/.test(m[2]) }));

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/__tmp/') ? path.join(TMP, p.slice(7)) : path.join(ROOT, p);
  if (!(f.startsWith(ROOT) || f.startsWith(TMP)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

const tests = []; const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));
let BASE, browser;

async function openEditor(ctx) {
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForFunction(() => window.__deckEditor && __deckEditor.S.slides.length > 0);
  await page.setInputFiles('#fileDeck', DECK);
  await page.waitForFunction(() => __deckEditor.S.name === 'test-board.html', null, { timeout: 15000 });
  await wait(300);
  return page;
}
// Present a deck file the way a student would: offline, nothing fetched from the network.
async function present(ctx, file) {
  const page = await ctx.newPage(); page.errors = []; page.requests = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('request', q => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(q.url())) page.requests.push(q.url()); });
  await page.goto(BASE + '/__tmp/' + path.basename(file));
  await page.waitForFunction(() => window.Reveal && Reveal.isReady(), null, { timeout: 20000 });
  await wait(300);
  return page;
}
const slideIndex = file => canvas.order.filter(n => canvas.boards[n].page !== 'hidden').indexOf(file);

/* ---------------------------------------------------------------- tests */
test('Slidewright opens every slide of the built deck, with its title', async page => {
  const info = await page.evaluate(() => __deckEditor.S.slides.map(s => s.dataset.title));
  assert(info.length === ALL || info.length === VISIBLE, `expected ${VISIBLE} (or ${ALL} with hidden) slides, got ${info.length}`);
  const want = BUILT.filter(x => info.length === ALL || !x.hidden).map(x => x.title);
  info.forEach((t, i) => assert(t === want[i], `slide ${i + 1}: title "${t}", expected "${want[i]}"`));
});

test('click-step layers show up as build steps', async page => {
  const i = await page.evaluate(() => __deckEditor.S.slides.findIndex(s => s.querySelector('.step-layer') && !s.querySelector('[data-live]') && !s.dataset.live));
  assert(i >= 0, 'no slide with step layers found');
  await page.evaluate(i => { __deckEditor.go(i); __deckEditor.setLayer(1); }, i);
  const n = await page.evaluate(() => document.querySelectorAll('#deck section .step-layer').length || __deckEditor.S.slides[__deckEditor.S.cur].querySelectorAll('.step-layer').length);
  assert(n === 2, 'expected 2 step layers on the click-step slide, got ' + n);
});

test('edit, save, and the saved deck still presents with every converter feature', async (page, ctx) => {
  await page.evaluate(() => { __deckEditor.go(0); const el = [...document.querySelectorAll('#deck section div')].find(d => d.textContent === 'Static slide with a list'); el.textContent = 'Static slide, edited'; __deckEditor.commit('test'); });
  const html = await page.evaluate(() => __deckEditor.serialize());
  fs.writeFileSync(SAVED, html);
  for (const [label, needle] of [['live-slide scripts', 'window.__LIVE='], ['live bindings', 'data-lv'], ['time-animated section', 'data-live='], ['PDF button', 'class="pdf-get"'], ['copyright', 'class="slide-copy"'], ['hidden slide', 'data-visibility="hidden"'], ['KaTeX source', '\\( \\hat{Y} = XW^T \\)']])
    assert(html.includes(needle), 'saved deck lost the ' + label);

  const deck = await present(ctx, SAVED);
  assert(await deck.evaluate(() => Reveal.getTotalSlides()) === VISIBLE, 'saved deck has the wrong number of slides');
  assert(await deck.evaluate(() => [...document.querySelectorAll('.reveal .slides > section')][0].textContent.includes('Static slide, edited')), 'edit not in the saved deck');

  // time-driven loop: its bound values change while the slide is shown
  await deck.evaluate(i => Reveal.slide(i), slideIndex('LiveLoop.dc.html'));
  const read = () => deck.evaluate(() => Reveal.getCurrentSlide().querySelector('[data-lv]').getAttribute('transform'));
  const a = await read(); await wait(700); const b = await read();
  assert(a !== b, 'time-driven loop does not animate after saving: ' + a);

  // time-driven click step: Next starts the flight, which finishes at its resting spot
  await deck.evaluate(i => Reveal.slide(i, 0, -1), slideIndex('LiveSteps.dc.html'));
  await deck.evaluate(() => Reveal.next()); await wait(300);
  const flying = await deck.evaluate(() => { const L = [...Reveal.getCurrentSlide().querySelectorAll('.step-layer')].filter(l => !l.getAttribute('aria-hidden')); return L[L.length - 1].querySelector('g[data-lv]').getAttribute('transform'); });
  await wait(1300);
  const landed = await deck.evaluate(() => { const L = [...Reveal.getCurrentSlide().querySelectorAll('.step-layer')].filter(l => !l.getAttribute('aria-hidden')); return L[L.length - 1].querySelector('g[data-lv]').getAttribute('transform'); });
  assert(flying !== landed && landed === 'translate(300.0 100)', `click-step flight wrong: ${flying} -> ${landed}`);

  // build dot, CSS animation and KaTeX
  await deck.evaluate(i => Reveal.slide(i, 0, -1), slideIndex('Builds.dc.html'));
  await deck.evaluate(() => Reveal.next()); await wait(700);
  const cx = await deck.evaluate(() => Reveal.getCurrentSlide().querySelector('[data-build-dot]').style.cx);
  assert(cx === '60px', 'build dot not on its first point: ' + cx);
  assert(await deck.evaluate(() => Reveal.getCurrentSlide().querySelectorAll('.katex').length) === 2, 'equations not rendered');
  await deck.evaluate(i => Reveal.slide(i, 0, -1), slideIndex('Keyframes.dc.html'));
  await deck.evaluate(() => Reveal.next()); await wait(100);
  assert(await deck.evaluate(() => Reveal.getCurrentSlide().getAnimations({ subtree: true }).some(x => x.animationName)), 'CSS animation did not start on its click');

  assert(await deck.evaluate(() => !!document.querySelector('.pdf-btn')), 'PDF button missing');
  assert(!deck.errors.length, 'saved deck error: ' + deck.errors[0]);
  assert(!deck.requests.length, 'saved deck fetched ' + deck.requests[0]);
});

test('Slidewright presents the built deck (presenter preview) without errors', async (page, ctx) => {
  const html = await page.evaluate(() => __deckEditor.serialize());
  fs.writeFileSync(path.join(TMP, 'unedited.html'), html);
  const deck = await present(ctx, path.join(TMP, 'unedited.html'));
  for (let i = 0; i < 30 && !(await deck.evaluate(() => Reveal.isLastSlide() && !Reveal.availableFragments().next)); i++) { await deck.evaluate(() => Reveal.next()); await wait(80); }
  assert(!deck.errors.length, 'error while stepping through: ' + deck.errors[0]);
});

/* ---------------------------------------------------------------- runner */
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); BASE = 'http://127.0.0.1:' + server.address().port;
  browser = await playwright[ENGINE].launch(); let failed = 0; console.log('Browser engine: ' + ENGINE);
  for (const t of tests) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const t0 = Date.now(); let page;
    try { page = await openEditor(ctx); await t.fn(page, ctx); if (page.errors.length) throw new Error('page error: ' + page.errors[0]); console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`); }
    catch (e) { failed++; console.log(`  ✗ ${t.name}\n      ${e.message}`); if (page) await page.screenshot({ path: path.join(__dirname, 'failure-builder-' + ENGINE + '-' + tests.indexOf(t) + '.png') }).catch(() => {}); }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`\n${tests.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
