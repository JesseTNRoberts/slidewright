const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(process.argv[2]);
const SHOTS = path.resolve(process.argv[3]);
fs.mkdirSync(SHOTS, { recursive: true });

// the part of a box that is actually drawn: cut by every ancestor inside the slide that clips (overflow hidden/clip, or an <svg>)
const CLIP = `window.__clip = function(el, r, stop){ var l=r.left,t=r.top,R=r.right,B=r.bottom; for(var a=el.parentElement; a && a!==stop; a=a.parentElement){ var cs=getComputedStyle(a);
  var clips = a.tagName.toLowerCase()==='svg' ? cs.overflow!=='visible' : (cs.overflowX!=='visible' || cs.overflowY!=='visible');
  if(!clips) continue; var q=a.getBoundingClientRect(); l=Math.max(l,q.left); t=Math.max(t,q.top); R=Math.min(R,q.right); B=Math.min(B,q.bottom); }
  return {left:l, top:t, right:R, bottom:B, width:Math.max(0,R-l), height:Math.max(0,B-t)}; }`;
(async () => {
  const root = '/opt/pw-browsers';
  const shell = fs.existsSync(root) && fs.readdirSync(root).filter(d => d.startsWith('chromium_headless_shell-')).map(d => path.join(root, d, 'chrome-linux/headless_shell')).find(f => fs.existsSync(f));
  // Chromium as preinstalled in Claude's workspace (any layout), else Playwright's own download
  const shells = fs.existsSync(root) ? fs.readdirSync(root).filter(d => d.startsWith('chromium_headless_shell-')).flatMap(d => ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell'].map(x => path.join(root, d, x))) : [];
  const exe = shells.find(f => fs.existsSync(f)) || (fs.existsSync(path.join(root, 'chromium')) ? path.join(root, 'chromium') : null);
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const errors = [], requests = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); requests.push(u); return r.abort(); });
  await p.addInitScript(CLIP);
  await p.goto('file://' + FILE);
  await p.waitForFunction(() => window.Reveal && Reveal.isReady());
  await p.evaluate(() => document.fonts.ready);
  const info = await p.evaluate(() => ({
    total: Reveal.getTotalSlides(),
    sans: document.fonts.check("16px 'IBM Plex Sans'"),
    sans600: document.fonts.check("600 16px 'IBM Plex Sans'"),
    mono: document.fonts.check("16px 'IBM Plex Mono'"),
    loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).filter((v, i, a) => a.indexOf(v) === i)
  }));
  console.log(JSON.stringify(info));
  const brokenImgs = await p.evaluate(async () => { const im = [...document.querySelectorAll('.reveal img')]; await Promise.all(im.map(i => i.decode().catch(() => {}))); return im.filter(i => !i.naturalWidth).map(i => (i.getAttribute('alt') || i.src).slice(0, 80)); });
  console.log('images', JSON.stringify({ total: await p.evaluate(() => document.querySelectorAll('.reveal img').length), broken: brokenImgs }));
  // the PDF button and copyright line find their spots once the fonts are in
  await p.waitForFunction(() => document.documentElement.dataset.extrasPlaced === '1' || !document.querySelector('.pdf-get,.slide-copy'), null, { timeout: 15000 }).catch(() => {});
  // overflow: every element must stay within its section box
  const overflow = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.reveal .slides > section').forEach((sec, i) => {
      const prev = [sec.style.display, sec.style.visibility];
      sec.style.display = 'block';
      sec.querySelectorAll('.fragment').forEach(f => f.classList.add('visible'));
      const sr = sec.getBoundingClientRect();
      const sx = sr.width / 1280;
      sec.querySelectorAll('*').forEach(el => {
        const r0 = el.getBoundingClientRect();
        if (!r0.width && !r0.height) return;
        const r = __clip(el, r0, sec);
        if (!r.width || !r.height) return; // fully clipped away
        if (r.left < sr.left - 1 || r.top < sr.top - 1 || r.right > sr.right + 1 || r.bottom > sr.bottom + 1) {
          // ignore children clipped by an overflow:hidden ancestor inside the slide root
          bad.push({ slide: i + 1, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), l: Math.round((r.left - sr.left) / sx), t: Math.round((r.top - sr.top) / sx), r: Math.round((r.right - sr.left) / sx), b: Math.round((r.bottom - sr.top) / sx) });
        }
      });
      sec.querySelectorAll('.fragment').forEach(f => f.classList.remove('visible'));
      sec.style.display = prev[0];
    });
    return bad;
  });
  // overlapping text: two separate pieces of text drawn on top of each other in the same view
  const overlaps = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.reveal .slides > section').forEach((sec, i) => {
      const views = sec.querySelectorAll('.step-layer').length ? [...sec.querySelectorAll('.step-layer')] : [sec];
      sec.style.display = 'block';
      sec.querySelectorAll('.fragment').forEach(f => f.classList.add('visible'));
      const sr = sec.getBoundingClientRect(); const k = sr.width / 1280;
      views.forEach(v => {
        const texts = [];
        v.querySelectorAll('*').forEach(el => {
          if (el.closest('[aria-hidden="true"]') && !el.closest('.step-layer[aria-hidden]')) return;
          if (el.closest('[style*="opacity: 0"][style*="animation"]')) return; // shown only during its own animation slot
          [...el.childNodes].forEach(n => {
            if (n.nodeType === 3 && n.textContent.trim()) {
              const r = document.createRange(); r.selectNodeContents(n);
              [...r.getClientRects()].forEach(q0 => { const q = __clip(el, q0, sec); q.right = q.left + q.width; q.bottom = q.top + q.height; if (q.width > 1 && q.height > 1) texts.push({ el, q, t: n.textContent.trim().slice(0, 30) }); });
            }
          });
        });
        for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
          const A = texts[a], B = texts[b];
          if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
          const w = Math.min(A.q.right, B.q.right) - Math.max(A.q.left, B.q.left);
          const h = Math.min(A.q.bottom, B.q.bottom) - Math.max(A.q.top, B.q.top);
          if (w > 3 * k && h > 3 * k) bad.push({ slide: i + 1, a: A.t, b: B.t });
        }
      });
      sec.querySelectorAll('.fragment').forEach(f => f.classList.remove('visible'));
      sec.style.display = '';
    });
    return bad;
  });
  console.log('text overlaps', overlaps.length, JSON.stringify(overlaps.slice(0, 20)), JSON.stringify(overlaps.reduce((a, o) => (a[o.slide] = (a[o.slide] || 0) + 1, a), {})));
  console.log('overflow', overflow.length, JSON.stringify(overflow.slice(0, 15)));
  // screenshots of every slide and every fragment state (CSS animations shown finished)
  await p.evaluate(() => Reveal.slide(0, 0, -1));
  let shot = 0;
  const seen = new Set();
  for (let guard = 0; guard < 200; guard++) {
    await p.waitForTimeout(900);
    await p.evaluate(() => document.getAnimations().forEach(a => { if (a.animationName) { try { a.finish(); } catch (e) {} } }));
    await p.waitForTimeout(50);
    const st = await p.evaluate(() => { const i = Reveal.getIndices(); return { h: i.h, f: i.f === undefined ? -1 : i.f, last: Reveal.isLastSlide() && !Reveal.availableFragments().next }; });
    const key = st.h + '_' + st.f;
    if (seen.has(key)) break;
    seen.add(key);
    await p.screenshot({ path: path.join(SHOTS, String(st.h + 1).padStart(2, '0') + '_' + String(st.f + 1).padStart(2, '0') + '.png') });
    shot++;
    if (st.last) break;
    await p.evaluate(() => Reveal.next());
  }
  console.log('screenshots', shot);
  // CSS keyframe animations: each restarts when its click step is shown, a mid-way screenshot
  // is taken 3 s in, and every one of them reaches its end state
  const animSlides = await p.evaluate(() => [...document.querySelectorAll('.reveal .slides > section')].map((s, i) => s.querySelector('[style*="animation"]') ? i : -1).filter(i => i >= 0));
  const cssAnim = [];
  for (const i of animSlides) {
    await p.evaluate(i => Reveal.slide(i, 0, -1), i);
    await p.waitForTimeout(400);
    let total = 0, restarted = 0, finished = 0;
    for (let f = 1; await p.evaluate(() => !!Reveal.availableFragments().next); f++) {
      const t0 = await p.evaluate(() => { const t = document.timeline.currentTime; Reveal.next(); return t; });
      await p.waitForTimeout(100);
      // restarted = (re)started at or after the click, whether it is still running or already done
      const st = await p.evaluate(t0 => {
        const fr = [...document.querySelectorAll('.reveal .slides > section.present .fragment.current-fragment')];
        const an = fr.flatMap(x => x.getAnimations({ subtree: true }).filter(a => a.animationName));
        window.__cssAnims = an; // the same objects are finished below (ones that already played drop out of getAnimations)
        return { n: an.length, fresh: an.filter(a => a.startTime !== null && a.startTime >= t0 - 1).length };
      }, t0);
      total += st.n; restarted += st.fresh;
      if (st.n) {
        await p.waitForTimeout(3000);
        await p.screenshot({ path: path.join(SHOTS, String(i + 1).padStart(2, '0') + '_' + String(f).padStart(2, '0') + '_mid.png') });
        finished += await p.evaluate(() => {
          const an = window.__cssAnims || [];
          an.forEach(a => { try { a.finish(); } catch (e) {} });
          return an.filter(a => a.playState === 'finished').length;
        });
      }
    }
    cssAnim.push({ slide: i + 1, animations: total, restarted, finished, bad: (total - restarted) + (total - finished) });
  }
  console.log('css animations', JSON.stringify(cssAnim));
  // animated elements: at every fragment step each [data-pos] element sits at its expected spot
  const anim = await p.evaluate(async () => {
    const out = [];
    const secs = [...document.querySelectorAll('.reveal .slides > section')];
    for (let i = 0; i < secs.length; i++) {
      const els = [...secs[i].querySelectorAll('[data-pos]')];
      if (!els.length) continue;
      Reveal.slide(i, 0, -1); await new Promise(r => setTimeout(r, 50));
      let bad = 0, checks = 0;
      for (let k = 0; ; k++) {
        const cur = Math.max(0, ...[...secs[i].querySelectorAll('.fragment.visible[data-fragment-index]')].map(f => +f.dataset.fragmentIndex + 1));
        els.forEach(m => {
          const pos = JSON.parse(m.dataset.pos); const ks = Object.keys(pos).map(Number).sort((a, b) => a - b);
          const s = ks.filter(x => x <= cur).pop(); const want = pos[s === undefined ? ks[0] : s].split(',');
          checks++; if (m.style.left !== want[0] + 'px' || m.style.top !== want[1] + 'px' || (want.length > 3 && (m.style.width !== want[2] + 'px' || m.style.height !== want[3] + 'px'))) bad++;
        });
        if (!Reveal.availableFragments().next) break;
        Reveal.next(); await new Promise(r => setTimeout(r, 50));
      }
      out.push({ slide: i + 1, elements: els.length, checks, bad });
    }
    return out;
  });
  console.log('animated', JSON.stringify(anim));
  // step-build markers: at each step every dot sits on its data-track point (hidden before step 1)
  const dots = await p.evaluate(async () => {
    const out = [];
    const secs = [...document.querySelectorAll('.reveal .slides > section')];
    for (let i = 0; i < secs.length; i++) {
      const ds = [...secs[i].querySelectorAll('[data-build-dot]')];
      if (!ds.length) continue;
      Reveal.slide(i, 0, -1); await new Promise(r => setTimeout(r, 50));
      let bad = 0, checks = 0;
      for (;;) {
        let k = 0; secs[i].querySelectorAll('[data-build-step].visible').forEach(e => { k = Math.max(k, +e.dataset.buildStep); });
        ds.forEach(d => {
          const t = d.dataset.track.split(';').map(q => q.split(',').map(Number)); const q = t[Math.max(k, 1) - 1];
          checks++;
          if (d.style.cx !== q[0] + 'px' || d.style.cy !== q[1] + 'px' || d.style.opacity !== (k ? '1' : '0')) bad++;
        });
        if (!Reveal.availableFragments().next) break;
        Reveal.next(); await new Promise(r => setTimeout(r, 50));
      }
      out.push({ slide: i + 1, dots: ds.length, checks, bad });
    }
    return out;
  });
  console.log('build dots', JSON.stringify(dots));
  // student extras: download button only on the title slide and clear of content;
  // a copyright line on every slide, each clear of content
  const ext = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('.reveal .slides > section')];
    const cps = secs.map(s => s.querySelector(':scope > .slide-copy'));
    const btn = document.querySelector('.pdf-get');
    return {
      button_on: secs.map((s, i) => s.querySelector(':scope > .pdf-get') ? i + 1 : 0).filter(Boolean),
      button_spot: btn ? (btn.dataset.placed || 'not placed') : null,
      copyright: cps.filter(Boolean).length,
      copyright_text: cps[0] ? cps[0].textContent : null,
      copyright_not_clear: cps.map((c, i) => c && c.dataset.placed !== 'ok' ? i + 1 : 0).filter(Boolean)
    };
  });
  console.log('extras', JSON.stringify(ext));
  // the download itself: one page per slide
  if (ext.button_on.length) {
    await p.evaluate(() => Reveal.slide(0, 0, -1)); await p.waitForTimeout(500);
    const t0 = Date.now();
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 180000 }), p.click('.pdf-btn')]);
    const fp = path.join(SHOTS, 'deck.pdf'); await dl.saveAs(fp);
    const buf = fs.readFileSync(fp);
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log('pdf', JSON.stringify({ name: dl.suggestedFilename(), pages, mb: +(buf.length / 1e6).toFixed(1), seconds: +((Date.now() - t0) / 1000).toFixed(1) }));
  }
  // axe with all sections visible
  await p.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const axe = await p.evaluate(async () => {
    document.querySelectorAll('.reveal .slides > section').forEach(s => { s.style.display = 'block'; s.classList.add('present'); s.removeAttribute('hidden'); s.removeAttribute('aria-hidden'); });
    const r = await axe.run(document, { runOnly: { type: 'rule', values: ['image-alt', 'svg-img-alt', 'role-img-alt', 'aria-hidden-focus'] } });
    return r.violations.map(v => ({ id: v.id, n: v.nodes.length, ex: v.nodes.slice(0, 3).map(n => n.html.slice(0, 160)) }));
  });
  // plot SVGs with text/axes but no label
  const unlabeled = await p.evaluate(() => [...document.querySelectorAll('.reveal svg')].filter(s => !s.closest('.katex') && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label')).map(s => s.outerHTML.slice(0, 120)));
  console.log('axe', JSON.stringify(axe));
  console.log('unlabeled svgs', unlabeled.length, JSON.stringify(unlabeled.slice(0, 5)));
  console.log('errors', JSON.stringify(errors));
  console.log('requests', JSON.stringify(requests));
  await b.close();
})();
