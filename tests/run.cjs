// Slidewright end-to-end tests.
// Serves this repository locally, opens index.html in headless Chromium (failing any test
// that fetches a library from a CDN instead of vendor/), loads tests/sample-deck.html, and
// exercises the main features. Run with:  node tests/run.cjs
const playwright = require('playwright');
// BROWSER=webkit runs the same tests in Safari's engine; the default is Chromium (Chrome, Edge).
const ENGINE = process.env.BROWSER || 'chromium';
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SAMPLE = path.join(__dirname, 'sample-deck.html');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
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
  await page.setInputFiles('#fileDeck', SAMPLE);
  await page.waitForFunction(() => __deckEditor.S.slides.length === 5 && __deckEditor.S.name === 'sample-deck.html', null, { timeout: 15000 });
  await wait(300);
  return page;
}
const newCtx = () => browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
// Every library must come from this repository: any request to a script CDN fails the test.
function watchCDN(ctx) { const hits = []; ctx.on('request', q => { if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(q.url())) hits.push(q.url()); }); return hits; }

/* ---------------------------------------------------------------- tests */
test('opens the sample deck', async page => {
  const info = await page.evaluate(() => ({ n: __deckEditor.S.slides.length, title: __deckEditor.S.slides[0].dataset.title, thumbs: document.querySelectorAll('#slideList .thumb').length }));
  assert(info.n === 5 && info.thumbs === 5, `expected 5 slides, got ${info.n}/${info.thumbs}`);
  assert(info.title === 'Sample title slide', 'wrong first slide');
});

test('drag moves an item; undo and redo restore it', async page => {
  const r = await page.evaluate(() => { const el = [...document.querySelectorAll('#deck section div')].find(d => d.textContent === 'Sample title slide'); const b = el.getBoundingClientRect(); return { x: b.left + 40, y: b.top + 20 }; });
  await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.mouse.move(r.x + 60, r.y + 40, { steps: 6 }); await page.mouse.up();
  const left = () => page.evaluate(() => [...document.querySelectorAll('#deck section div')].find(d => d.textContent === 'Sample title slide').style.left);
  const moved = await left(); assert(moved !== '64px', 'item did not move');
  await page.keyboard.press('Control+z'); assert(await left() === '64px', 'undo did not restore position');
  await page.keyboard.press('Control+Shift+z'); assert(await left() === moved, 'redo did not reapply move');
});

test('typed LaTeX renders and prices stay as text', async page => {
  await page.evaluate(() => __deckEditor.insertText('It costs $5 and grows as \\(x^2\\)'));
  await page.waitForFunction(() => __deckEditor.S.sel[0] && __deckEditor.S.sel[0].querySelector('.sw-math math'), null, { timeout: 10000 });
  const t = await page.evaluate(() => __deckEditor.S.sel[0].textContent);
  assert(t.includes('$5'), 'dollar amount was turned into math');
});

test('existing \\( \\) equations render and save back unchanged', async page => {
  await page.evaluate(() => __deckEditor.go(3));
  await page.waitForFunction(() => document.querySelectorAll('#deck .sw-math math').length === 2, null, { timeout: 10000 });
  const out = await page.evaluate(() => __deckEditor.serialize());
  assert(out.includes('Logits \\( \\hat{Y} = \\mathbf{X}\\mathbf{W}^T \\) and display \\[ \\hat{p}_i'), 'LaTeX source not preserved on save');
});

test('linked build steps: an edit reaches the other step', async page => {
  await page.evaluate(() => { __deckEditor.go(1); __deckEditor.setLayer(0); });
  await page.evaluate(() => { const L = __deckEditor.S.slides[1].querySelectorAll('.step-layer'); const t = L[0].firstElementChild.firstElementChild; t.textContent += '!'; __deckEditor.commit('test'); });
  const titles = await page.evaluate(() => [...__deckEditor.S.slides[1].querySelectorAll('.step-layer')].map(l => l.firstElementChild.firstElementChild.textContent));
  assert(titles.every(t => t === 'Build steps!'), 'edit not propagated: ' + titles.join(' / '));
});

test('click preview steps through fragments and cleans up', async page => {
  await page.evaluate(() => __deckEditor.go(3)); await page.keyboard.press('p'); await wait(200);
  assert(/2 clicks/.test(await page.textContent('#pvLabel')), 'preview label wrong');
  await page.keyboard.press('ArrowRight'); await wait(500);
  const vis = await page.evaluate(() => [...document.querySelectorAll('#deck .fragment')].map(f => getComputedStyle(f).visibility));
  assert(vis[0] === 'visible' && vis[1] === 'hidden', 'fragment visibility wrong: ' + vis);
  await page.keyboard.press('Escape');
  const left = await page.evaluate(() => __deckEditor.S.slides.reduce((n, s) => n + s.querySelectorAll('.de-shown,.de-cur').length, 0));
  assert(left === 0, 'preview classes left behind');
});

test('accessibility check finds the planted problems and fixes lift the score', async page => {
  await page.click('#bCheck'); await page.waitForSelector('.modal-bg.audit', { timeout: 60000 });
  const titles = await page.evaluate(() => [...document.querySelectorAll('.a11y-rule b')].map(b => b.textContent));
  for (const want of ['Pictures without alt text', 'Alt text longer than 120 characters', 'The deck has no headings', 'Text with low colour contrast', 'Tables without a header row', 'Text smaller than 12px'])
    assert(titles.includes(want), 'missing rule: ' + want + ' (got ' + titles.join(', ') + ')');
  const score0 = parseInt(await page.textContent('.score .big'));
  assert(score0 < 70, 'score should start below 70, got ' + score0);
  const clickAll = async () => { for (;;) { const did = await page.evaluate(() => { const b = [...document.querySelectorAll('.a11y-sec .btn')].find(x => !/Show/.test(x.textContent) && x.closest('.a11y-sec').querySelector('.chip.major,.chip.severe')); if (b) { b.click(); return true; } return false; }); if (!did) break; await wait(150); } };
  await clickAll();
  await page.evaluate(() => [...document.querySelectorAll('.modal .actions .btn')].find(b => b.textContent === 'Run again').click());
  await page.waitForSelector('.modal-bg.audit', { timeout: 60000 }); await wait(300);
  const score1 = parseInt(await page.textContent('.score .big'));
  assert(score1 >= 70, `score after fixes should be at least 70, got ${score1}`);
  const h = await page.evaluate(() => __deckEditor.S.slides[0].querySelector('h1') !== null);
  assert(h, 'first slide title was not made an h1');
});

test('code block: edit existing <pre>, highlight a line per click', async page => {
  await page.evaluate(() => __deckEditor.go(4));
  const r = await page.evaluate(() => { const b = document.querySelector('#deck pre').getBoundingClientRect(); return { x: b.left + 50, y: b.top + 20 }; });
  await page.mouse.dblclick(r.x, r.y); await page.waitForSelector('.modal textarea.code');
  await page.fill('.modal input[placeholder^="e.g."]', '1, 2'); await page.click('.modal .actions .btn.primary'); await wait(200);
  const info = await page.evaluate(() => { const p = document.querySelector('#deck pre'); return { cls: p.className, bands: p.querySelectorAll('.sw-codehl.fragment').length, code: p.querySelector('code').textContent }; });
  assert(/sw-code/.test(info.cls) && info.bands === 2, 'code block not rebuilt: ' + JSON.stringify(info));
  assert(info.code.startsWith('x = torch.randn(1, 3, 32, 32)'), 'code text changed');
});

test('standard layouts add a slide with a real heading and list', async page => {
  await page.click('#sAdd'); await page.waitForSelector('.lay-card');
  await page.evaluate(() => [...document.querySelectorAll('.lay-card')].find(c => c.querySelector('.lt').textContent === 'Title and content').click()); await wait(300);
  const ok = await page.evaluate(() => { const s = __deckEditor.S.slides[__deckEditor.S.cur]; return __deckEditor.S.slides.length === 6 && !!s.querySelector('h2') && s.querySelectorAll('ul li').length === 3; });
  assert(ok, 'layout slide wrong');
});

test('saving round-trips the deck cleanly', async page => {
  const out = await page.evaluate(() => __deckEditor.serialize());
  const src = fs.readFileSync(SAMPLE, 'utf8');
  const count = (s, re) => (s.match(re) || []).length;
  assert(count(out, /<section/g) === 5, 'section count changed');
  assert(count(out, /<script/g) === count(src, /<script/g), 'scripts changed');
  for (const bad of ['contenteditable', 'de-shown', 'de-cur', 'de-deck']) assert(!out.includes(bad), 'editor marker leaked: ' + bad);
});

test('PDF export downloads a PDF using the bundled jsPDF', async page => {
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.evaluate(() => { __deckEditor.exportPDF(); }); await page.click('.modal .btn.primary');
  const d = await dl; const f = await d.path(); const head = fs.readFileSync(f).subarray(0, 5).toString();
  assert(head === '%PDF-', 'not a PDF'); assert(fs.statSync(f).size > 20000, 'PDF suspiciously small');
});

test('present: pen strokes stay with their slide', async page => {
  await page.evaluate(() => __deckEditor.go(1));
  await page.click('#bPresent'); await page.evaluate(() => [...document.querySelectorAll('.menu button')].find(b => /Present here/.test(b.textContent)).click());
  const fr = await (await page.waitForSelector('#present iframe')).contentFrame();
  await fr.waitForFunction(() => window.SW_ink, null, { timeout: 20000 });
  await fr.evaluate(() => { SW_ink.setTool('pen'); SW_ink.begin(100, 100); SW_ink.move(200, 150); SW_ink.move(300, 120); SW_ink.end(); });
  assert(await fr.evaluate(() => document.querySelectorAll('.sw-ink path').length) === 1, 'stroke not drawn');
  await fr.evaluate(() => Reveal.slide(2)); await wait(200);
  assert(await fr.evaluate(() => document.querySelectorAll('.sw-ink path').length) === 0, 'stroke leaked to next slide');
  await fr.evaluate(() => Reveal.slide(1)); await wait(200);
  assert(await fr.evaluate(() => document.querySelectorAll('.sw-ink path').length) === 1, 'stroke lost on return');
});

test('presenter view drives the audience window and mirrors ink', async (page, ctx) => {
  const pop = ctx.waitForEvent('page');
  await page.click('#bPresent'); await page.evaluate(() => [...document.querySelectorAll('.menu button')].find(b => /Presenter view/.test(b.textContent)).click());
  const aw = await pop; await aw.waitForFunction(() => window.SW_ink && window.Reveal && Reveal.isReady(), null, { timeout: 20000 }); await wait(600);
  await page.keyboard.press('d');
  const b = await (await page.$('.pv-cur')).boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width * (0.3 + i * 0.04), b.y + b.height * 0.4 + i * 3); await page.mouse.up(); await wait(200);
  assert(await aw.evaluate(() => document.querySelectorAll('.sw-ink path').length) === 1, 'audience did not get the stroke');
  assert(await page.evaluate(() => document.querySelectorAll('.pv-ink path').length) === 1, 'presenter mirror missing');
  await page.keyboard.press('Escape'); await page.keyboard.press('ArrowRight'); await wait(400);
  assert(await aw.evaluate(() => Reveal.getIndices().h) >= 0, 'navigation failed');
});

test('compare finds a one-word change', async page => {
  await page.evaluate(() => { const el = [...document.querySelectorAll('#deck section div')].find(d => d.textContent === 'Sample title slide'); el.textContent = 'Sample cover slide'; __deckEditor.commit('x'); });
  await page.evaluate(t => __deckEditor.compareDecks(t, 'the sample'), fs.readFileSync(SAMPLE, 'utf8')); await wait(300);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.modal .chips .chip')].map(c => c.textContent).join(' | '));
  assert(/1 changed/.test(chips) && /0 new/.test(chips) && /0 removed/.test(chips), 'compare summary wrong: ' + chips);
});

test('slide sorter moves a slide and undo restores the order', async page => {
  await page.click('#sSort'); await page.waitForSelector('.sorter-card');
  await page.evaluate(() => document.querySelectorAll('.sorter-card')[1].click());
  await page.evaluate(() => [...document.querySelectorAll('.sorter-top .btn')].find(b => b.textContent === 'Move to end').click()); await wait(200);
  const order = () => page.evaluate(() => __deckEditor.S.slides.map(s => s.dataset.title));
  assert((await order())[4] === 'Build steps', 'slide not moved');
  await page.keyboard.press('Control+z'); await wait(200);
  assert((await order())[1] === 'Build steps', 'undo did not restore order');
});

test('Google Drive: open, save back, and save a copy (Google mocked)', async (_, ctx) => {
  const deck = fs.readFileSync(SAMPLE, 'utf8'); const seen = { puts: [], creates: [] }; let version = '5';
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Location' };
  await ctx.route(/\/index\.html$/, async r => { const res = await r.fetch(); let b = await res.text();
    b = b.replace('name="slidewright-google-client-id" content=""', 'name="slidewright-google-client-id" content="test.apps.googleusercontent.com"').replace('name="slidewright-google-api-key" content=""', 'name="slidewright-google-api-key" content="key"');
    r.fulfill({ response: res, body: b }); });
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'application/javascript', body:
    `window.google=window.google||{};google.accounts={oauth2:{initTokenClient(c){const t={callback:c.callback,requestAccessToken(){setTimeout(()=>t.callback({access_token:'tok',expires_in:3600}),10);}};return t;},revoke(t,cb){cb&&cb();}}};` }));
  await ctx.route('https://apis.google.com/js/api.js', r => r.fulfill({ contentType: 'application/javascript', body:
    `window.gapi={load(n,o){const V=function(){};['setMimeTypes','setIncludeFolders','setMode','setSelectFolderEnabled'].forEach(m=>V.prototype[m]=function(){return this;});
      const B=function(){};['addView','setOAuthToken','setDeveloperKey','setTitle','setAppId'].forEach(m=>B.prototype[m]=function(){return this;});
      B.prototype.setCallback=function(cb){this.cb=cb;return this;}; B.prototype.build=function(){const cb=this.cb;return{setVisible(){setTimeout(()=>cb({action:'picked',docs:[window.__pick]}),10);}};};
      google.picker={DocsView:V,DocsUploadView:V,PickerBuilder:B,ViewId:{DOCS:'d',FOLDERS:'f'},DocsViewMode:{LIST:'l'},Action:{PICKED:'picked',CANCEL:'cancel'}}; o.callback();}};` }));
  await ctx.route(/^https:\/\/www\.googleapis\.com\//, async r => { const q = r.request(), u = new URL(q.url()), m = q.method();
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    assert(m === 'PUT' || q.headers().authorization === 'Bearer tok', 'missing Drive token on ' + u.pathname);
    const json = o => r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify(o) });
    if (m === 'GET' && u.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/html' }, cors), body: deck });
    if (m === 'GET') return json({ id: 'deck1', name: 'drive-deck.html', version, parents: ['folderA'] });
    if (u.searchParams.get('uploadType') === 'resumable') { const meta = JSON.parse(q.postData() || '{}'); if (m === 'POST') seen.creates.push(meta);
      return r.fulfill({ status: 200, headers: Object.assign({ location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=' + (m === 'POST' ? 'new' : 'deck1') }, cors), body: '' }); }
    if (m === 'PUT') { const id = u.searchParams.get('upload_id'); seen.puts.push({ id }); version = String(+version + 1);
      return json(id === 'new' ? { id: 'deck2', name: seen.creates[0].name, version: '1', parents: seen.creates[0].parents } : { id: 'deck1', name: 'drive-deck.html', version, parents: ['folderA'] }); }
    r.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const page = await openEditor(ctx);
  // Record upload bodies in the page (WebKit does not hand Blob bodies to Playwright's route handler).
  await page.evaluate(() => { window.__puts = []; const f = window.fetch; window.fetch = async (u, o) => { if (o && o.method === 'PUT') window.__puts.push(await new Response(o.body).text()); return f(u, o); };
    window.__pick = { id: 'deck1', name: 'drive-deck.html' }; });
  await page.evaluate(() => __deckEditor.gdrive.openFromDrive());
  await page.waitForFunction(() => __deckEditor.gdrive.state() && __deckEditor.S.slides.length === 5, null, { timeout: 15000 });
  assert((await page.textContent('#fileName')).includes('Drive: drive-deck.html'), 'file name does not show Drive');
  await page.evaluate(() => { const h = __deckEditor.S.slides[0].querySelector('h1,h2,[data-title],div div'); h.textContent += ' DRIVEEDIT'; __deckEditor.commit('t'); });
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => !__deckEditor.S.dirty, null, { timeout: 15000 });
  const put = await page.evaluate(() => window.__puts[0] || '');
  assert(seen.puts.length === 1 && seen.puts[0].id === 'deck1' && put.includes('DRIVEEDIT'), 'save did not upload the edited deck to the same file');
  assert((put.match(/<section/g) || []).length === 5, 'uploaded deck lost slides');
  await page.evaluate(() => { window.__pick = { id: 'folderB', name: 'Lectures' }; });
  await page.evaluate(() => __deckEditor.gdrive.saveToDrive(true));
  await page.waitForFunction(() => __deckEditor.gdrive.state().id === 'deck2', null, { timeout: 15000 });
  assert(seen.creates[0].parents[0] === 'folderB' && /copy\.html$/.test(seen.creates[0].name), 'copy not created in the chosen folder');
  if (page.errors.length) throw new Error('page error: ' + page.errors[0]);
});

test('a deck from someone else’s repo: Save offers sign-in, then a copy when GitHub refuses', async (page, ctx) => {
  await page.evaluate(() => { __deckEditor.S.gh = { owner: 'someone', repo: 'lectures', branch: 'main', path: 'w1.html', sha: null, fromDeck: true }; });
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal h2')].some(h => h.textContent === 'Save this deck'));
  await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Cancel').click());
  // signed in, but without write access: GitHub answers 404 or 403
  await ctx.route(/^https:\/\/api\.github\.com\//, r => r.fulfill({ status: r.request().method() === 'PUT' ? 403 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"Resource not accessible"}' }));
  await page.evaluate(() => { try { localStorage.setItem('slidewright.ghToken', 'tok'); } catch (_) { __deckEditor.S.ghTokenMem = 'tok'; } });
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal h2')].some(h => h.textContent === 'Commit to GitHub'));
  await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Commit').click());
  await page.waitForFunction(() => [...document.querySelectorAll('.modal h2')].some(h => h.textContent === 'You can’t save to this repository'), null, { timeout: 10000 });
  const buttons = await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].map(b => b.textContent));
  assert(buttons.includes('Download a copy') && buttons.includes('Save to my GitHub…'), 'copy options missing: ' + buttons);
});

test('a deck sent from a web page finds its own file on GitHub (GitHub mocked)', async (page, ctx) => {
  const html = fs.readFileSync(SAMPLE, 'utf8'); const b = Buffer.from(html, 'utf8');
  const sha = require('crypto').createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])).digest('hex');
  const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  await ctx.route(/^https:\/\/api\.github\.com\//, r => { const u = new URL(r.request().url()); const p = u.pathname; const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(o) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: hdr });
    if (p === '/user') return json({ login: 'JesseTNRoberts' });
    if (p === '/user/repos') return json([{ owner: { login: 'JesseTNRoberts' }, name: 'ml-lectures', has_pages: true }, { owner: { login: 'JesseTNRoberts' }, name: 'other', has_pages: true }]);
    if (p === '/repos/JesseTNRoberts/ml-lectures/pages') return json({ html_url: 'https://www.jessetnroberts.com/ml-lectures/', source: { branch: 'main', path: '/' } });
    if (p === '/repos/JesseTNRoberts/other/pages') return json({ html_url: 'https://www.jessetnroberts.com/other/', source: { branch: 'main', path: '/' } });
    if (p === '/repos/JesseTNRoberts/ml-lectures/contents/week3/cnn.html' && u.searchParams.get('ref') === 'main') return json({ sha });
    json({ message: 'Not Found' }, 404); });
  // not signed in: Save explains and offers sign-in
  await page.evaluate(h => { window.__html = h; }, html);
  await page.evaluate(() => { __deckEditor.receiveDeck({ html: window.__html, exact: true, name: 'cnn.html', url: 'https://jessetnroberts.com/ml-lectures/week3/cnn.html' }, 'https://www.jessetnroberts.com'); });
  await page.waitForFunction(() => [...document.querySelectorAll('.modal h2')].some(h => /^Present /.test(h.textContent)));
  await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Just edit').click());
  assert(!(await page.evaluate(() => __deckEditor.S.gh)), 'should not know the repo before signing in');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => [...document.querySelectorAll('.modal h2')].some(h => h.textContent === 'Save this deck'));
  await page.evaluate(() => [...document.querySelectorAll('.modal .btn')].find(b => b.textContent === 'Cancel').click());
  // signed in: found quietly, by an identical file in the right Pages site
  await page.evaluate(() => { try { localStorage.setItem('slidewright.ghToken', 'tok'); } catch (_) { __deckEditor.S.ghTokenMem = 'tok'; } });
  await page.evaluate(() => { __deckEditor.receiveDeck({ html: window.__html, exact: true, name: 'cnn.html', url: 'https://jessetnroberts.com/ml-lectures/week3/cnn.html' }, 'https://www.jessetnroberts.com'); });
  await page.waitForFunction(() => __deckEditor.S.gh, null, { timeout: 10000 });
  const g = await page.evaluate(() => __deckEditor.S.gh);
  assert(g.owner === 'JesseTNRoberts' && g.repo === 'ml-lectures' && g.branch === 'main' && g.path === 'week3/cnn.html' && g.sha === sha, 'wrong file: ' + JSON.stringify(g));
  // a changed copy is not matched
  assert(await page.evaluate(() => __deckEditor.findOnGitHub('https://jessetnroberts.com/ml-lectures/week3/cnn.html', 'deadbeef')) === null, 'matched a file that differs');
});

test('Open and Save offer where to go; Save goes straight back once connected', async page => {
  const items = () => page.evaluate(() => [...document.querySelectorAll('.menu button')].map(b => b.firstChild.textContent));
  await page.click('#bOpen'); const open = await items();
  for (const x of ['From this computer…', 'From Google Drive…', 'From GitHub…']) assert(open.includes(x), 'Open menu lacks ' + x + ': ' + open);
  await page.keyboard.press('Escape');
  await page.click('#bSave'); const save = await items();
  assert(save.join('|') === 'To this computer…|To Google Drive…|To GitHub…', 'Save menu: ' + save);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); __deckEditor.S.gh = { owner: 'a', repo: 'b', branch: 'main', path: 'c.html', sha: 'x' }; });
  await page.click('#bSave'); await wait(200);
  assert(!(await page.$('.menu')), 'Save showed a menu for a deck connected to GitHub');
});

test('presenter view: audience on the external display, presenter on the built-in one; swap and duplicate', async (page, ctx) => {
  await page.evaluate(() => {
    const mk = (label, left, internal) => ({ label, availLeft: left, availTop: 0, availWidth: 1920, availHeight: 1080, width: 1920, height: 1080, isInternal: internal, isPrimary: internal });
    const inner = mk('Built-in Retina Display', 0, true), outer = mk('Projector', 1920, false);
    window.getScreenDetails = async () => ({ screens: [inner, outer], currentScreen: inner, addEventListener() {}, removeEventListener() {} });
    const q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = d => /window-(management|placement)/.test(d.name) ? Promise.resolve({ state: 'granted' }) : q(d);
    window.__opens = []; const o = window.open; window.open = (u, n, f) => { window.__opens.push(f); return o.call(window, u, n, 'popup,width=1280,height=760'); };
    window.__fs = []; Element.prototype.requestFullscreen = function (opt) { window.__fs.push(opt && opt.screen && opt.screen.label); return Promise.resolve(); };
  });
  let pop = ctx.waitForEvent('page');
  await page.click('#bPresent'); await page.evaluate(() => [...document.querySelectorAll('.menu button')].find(b => /Presenter view/.test(b.textContent)).click());
  let aw = await pop; await aw.waitForFunction(() => window.SW_ink && window.Reveal && Reveal.isReady(), null, { timeout: 20000 }); await wait(500);
  let st = await page.evaluate(() => ({ opens: window.__opens, fs: window.__fs }));
  assert(/left=1920/.test(st.opens[0]) && /fullscreen/.test(st.opens[0]), 'audience not placed on the projector: ' + st.opens[0]);
  assert(st.fs[0] === 'Built-in Retina Display', 'presenter view not full screen on the built-in display: ' + st.fs);
  await aw.evaluate(() => { Reveal.slide(1); SW_ink.setTool('pen'); SW_ink.begin(100, 100); SW_ink.move(200, 150); SW_ink.end(); SW_ink.setTool('pen'); }); await wait(300);
  const display = () => page.evaluate(() => [...document.querySelectorAll('#presenter .btn')].find(b => /Display/.test(b.textContent)).click());
  const pick = re => page.evaluate(src => [...document.querySelectorAll('.menu button')].find(b => new RegExp(src).test(b.textContent)).click(), re);
  await display(); pop = ctx.waitForEvent('page'); await pick('^Swap displays');
  aw = await pop; await aw.waitForFunction(() => window.SW_ink && window.Reveal && Reveal.isReady() && Reveal.getIndices().h === 1, null, { timeout: 20000 }); await wait(500);
  st = await page.evaluate(() => ({ opens: window.__opens, fs: window.__fs }));
  assert(/left=0,/.test(st.opens[1]), 'swap did not move the audience to the built-in display: ' + st.opens[1]);
  assert(st.fs[st.fs.length - 1] === 'Projector', 'swap did not move presenter view to the projector: ' + st.fs);
  assert(await aw.evaluate(() => document.querySelectorAll('.sw-ink path').length) === 1, 'drawing lost when swapping');
  assert(await page.evaluate(() => !!document.querySelector('#presenter')), 'presenter view closed during the swap');
  await display(); await pick('^Duplicate');
  assert(await page.evaluate(() => document.querySelector('#presenter').classList.contains('pv-dup')), 'duplicate mode not on');
  await display(); await pick('^Extend');
  assert(await page.evaluate(() => !document.querySelector('#presenter').classList.contains('pv-dup')), 'extend did not turn duplicate off');
});

/* ---------------------------------------------------------------- runner */
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); BASE = 'http://127.0.0.1:' + server.address().port;
  browser = await playwright[ENGINE].launch(); let failed = 0; console.log('Browser engine: ' + ENGINE);
  for (const t of tests) {
    const ctx = await newCtx(); const cdn = watchCDN(ctx); const t0 = Date.now(); let page;
    try { page = await openEditor(ctx); await t.fn(page, ctx); if (page.errors.length) throw new Error('page error: ' + page.errors[0]); if (cdn.length) throw new Error('loaded from a CDN: ' + cdn[0]); console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`); }
    catch (e) { failed++; console.log(`  ✗ ${t.name}\n      ${e.message}`); if (process.env.GITHUB_ACTIONS) console.log(`::error title=${ENGINE}: ${t.name.replace(/[:,\n]/g, ' ')}::${String(e.message).replace(/\n/g, ' ').slice(0, 900)}`); if (page) await page.screenshot({ path: path.join(__dirname, 'failure-' + ENGINE + '-' + tests.indexOf(t) + '.png') }).catch(() => {}); }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`\n${tests.length - failed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
