// build.js — turn a Design-board lecture deck into ONE self-contained reveal.js file.
//
// Usage: node build.js <project-dir> <out.html> [--copyright="Name"] [--year=YYYY] [--no-copyright] [--no-pdf]
//   <project-dir> holds canvas.json and the *.dc.html slides (as saved by an Artifact read).
//
// What it handles, with no per-deck code:
//   * slide order from canvas.json `order`; boards on page "hidden" stay in the file as
//     <section data-visibility="hidden">, so reveal.js drops them at load (move a board back
//     to a visible page to show it again)
//   * <sc-for>/<sc-if>/{{holes}} expanded by running each slide's own renderVals() in Node
//   * interactive slides (data-props "step" with a max): every step becomes a reveal fragment
//       - a step that only moves elements styled with a CSS `transition` on left/top is animated
//         (the elements glide to their new spots); any other step becomes a full fragment layer
//   * CSS @keyframes animations declared in a slide's <helmet><style> (plus any
//     prefers-reduced-motion @media block there): keyframe names are prefixed per slide, each
//     animation restarts when its click step is shown, and shows its end state when you come
//     back to the slide, print, or download the PDF
//   * board step builds: [data-build-step="k"] -> fragment k-1; [data-build-dot] circles follow data-track
//   * buttons (Next/Reset) removed; marker/element ids prefixed per slide so they stay unique
//   * IBM Plex Sans/Mono and reveal.js inlined; KaTeX inlined only if a slide uses \( \) or \[ \]
//   * student extras (extras.js): "Download slides as PDF" button on the title slide, a copyright
//     line on every slide, slide-sized Ctrl/Cmd+P printing
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const extras = require('./extras');

const PROJ = process.argv[2];
const OUT = process.argv[3];
if (!PROJ || !OUT) { console.error('usage: node build.js <project-dir> <out.html>'); process.exit(2); }
const OPT = extras.options(process.argv.slice(4));
const NM = path.join(__dirname, 'node_modules');
// reveal.js comes from Slidewright's vendor/ folder, so the deck and the editor use the same copy
const VENDOR = path.join(__dirname, '..', 'vendor');

const canvas = JSON.parse(fs.readFileSync(path.join(PROJ, 'canvas.json'), 'utf8'));
const order = canvas.order.filter(n => canvas.boards[n]);
const isHidden = n => (canvas.boards[n] || {}).page === 'hidden';
// the title slide is the first visible board (hidden boards may come first in the order)
const firstVisible = order.find(n => !isHidden(n));

const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const evalExpr = (expr, scope) => { const k = Object.keys(scope); return Function(...k, 'return (' + expr + ');')(...k.map(x => scope[x])); };

// Uploaded assets (/_blob/<id>) are inlined as data URIs. The Artifact `read` of an asset id
// saves it as <id>.<ext> next to the project/ folder; we look there, in the project folder,
// and in an assets/ folder beside either.
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const ASSET_DIRS = [PROJ, path.dirname(PROJ), path.join(PROJ, 'assets'), path.join(path.dirname(PROJ), 'assets')];
const assetCache = {};
function inlineAssets(html, file) {
  return html.replace(/\/_blob\/([0-9a-f]{32})/g, (m, id) => {
    if (assetCache[id]) return assetCache[id];
    for (const d of ASSET_DIRS) {
      if (!fs.existsSync(d)) continue;
      const f = fs.readdirSync(d).find(n => n.startsWith(id + '.'));
      if (f) {
        const ext = f.split('.').pop().toLowerCase();
        if (!MIME[ext]) unsupported(file, 'uploaded asset of type .' + ext);
        return (assetCache[id] = 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(path.join(d, f)).toString('base64'));
      }
    }
    unsupported(file, 'uploaded asset /_blob/' + id + ' not found locally. Artifact read with path "' + id + '" first (it saves next to project/)');
  });
}
function fillHoles(s, scope, live) {
  return s.replace(/\{\{([\s\S]*?)\}\}/g, (m, e) => {
    // time-animated slides: a hole outside any <sc-for> becomes a marker, bound again in the browser
    if (live) { live.push(e.trim()); return '\u0001' + (live.length - 1) + '\u0002'; }
    const v = evalExpr(e.trim(), scope);
    return typeof v === 'function' || v === undefined || v === null ? '' : esc(v);
  });
}
function matchClose(s, i, name) {
  const re = new RegExp('<' + name + '\\b|</' + name + '>', 'g');
  re.lastIndex = i + 1;
  let depth = 1, m;
  while ((m = re.exec(s))) { if (m[0][1] === '/') { if (--depth === 0) return m.index; } else depth++; }
  throw new Error('unclosed <' + name + '>');
}
function expand(s, scope, live) {
  let out = '', i = 0;
  const open = /<sc-(for|if)\b([^>]*)>/g;
  for (;;) {
    open.lastIndex = i;
    const m = open.exec(s);
    if (!m) { out += fillHoles(s.slice(i), scope, live); break; }
    out += fillHoles(s.slice(i, m.index), scope, live);
    const name = 'sc-' + m[1], close = matchClose(s, m.index, name);
    const inner = s.slice(m.index + m[0].length, close);
    if (m[1] === 'for') {
      const list = evalExpr(/list="\{\{([\s\S]*?)\}\}"/.exec(m[2])[1], scope);
      const as = /as="([^"]+)"/.exec(m[2])[1];
      (list || []).forEach(item => { out += expand(inner, Object.assign({}, scope, { [as]: item })); });
    } else if (evalExpr(/value="\{\{([\s\S]*?)\}\}"/.exec(m[2])[1], scope)) {
      out += expand(inner, scope, live);
    }
    i = close + name.length + 3;
  }
  return out;
}

// Top-level CSS blocks that start with `at` (e.g. '@keyframes'), braces balanced.
function atBlocks(css, at) {
  const out = [];
  let i = 0;
  for (;;) {
    const j = css.indexOf(at, i);
    if (j < 0) break;
    const open = css.indexOf('{', j);
    if (open < 0) break;
    let d = 0, k = open;
    for (; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}' && --d === 0) break; }
    out.push(css.slice(j, k + 1));
    i = k + 1;
  }
  return out;
}
// The slide's own CSS animations: @keyframes blocks and prefers-reduced-motion @media blocks.
function slideAnimations(src) {
  const helmet = (/<helmet>([\s\S]*?)<\/helmet>/.exec(src) || [null, ''])[1];
  const css = (helmet.match(/<style>[\s\S]*?<\/style>/g) || []).map(s => s.replace(/<\/?style>/g, '')).join('\n');
  const keyframes = atBlocks(css, '@keyframes').map(b => ({ name: /@keyframes\s+([\w-]+)/.exec(b)[1], css: b }));
  const media = atBlocks(css, '@media').filter(b => /prefers-reduced-motion/.test(b));
  return { keyframes, media };
}
// Prefix keyframe names (in the CSS and in the slide's animation / animation-name declarations).
function renameAnimations(html, anim, pre) {
  if (!anim.keyframes.length) return { html, css: '' };
  const names = anim.keyframes.map(k => k.name).sort((a, b) => b.length - a.length);
  const swap = s => names.reduce((t, n) => t.replace(new RegExp('(^|[\\s,:])' + n.replace(/[-]/g, '\\-') + '(?=[\\s,;"]|$)', 'g'), '$1' + pre + n), s);
  html = html.replace(/animation(-name)?:\s*[^;"]*/g, m => swap(m));
  const css = anim.keyframes.map(k => k.css.replace(/@keyframes\s+([\w-]+)/, '@keyframes ' + pre + k.name)).join('\n') +
    (anim.media.length ? '\n' + anim.media.join('\n') : '');
  return { html, css };
}

function readSlide(file) {
  const src = fs.readFileSync(path.join(PROJ, file), 'utf8');
  const body = /<x-dc>([\s\S]*)<\/x-dc>/.exec(src)[1].replace(/<helmet>[\s\S]*?<\/helmet>/, '').trim();
  const sm = /<script type="text\/x-dc"([^>]*)>([\s\S]*?)<\/script>/.exec(src);
  let props = {};
  const pm = sm && /data-props='([^']*)'/.exec(sm[1]);
  if (pm) props = JSON.parse(pm[1]);
  const steps = props.step && Number.isFinite(props.step.max) ? props.step.max : 0;
  if (/<dc-import\b/.test(body)) unsupported(file, '<dc-import> child component');
  // a slide that animates itself over time (componentDidMount starting a timer that calls setState)
  const live = !!sm && /componentDidMount\s*\(/.test(sm[2]) && /\b(setInterval|setTimeout|requestAnimationFrame)\s*\(/.test(sm[2]);
  const otherState = sm && /this\.state\.(?!step\b)\w+/.exec(sm[2]);
  if (otherState && !live) unsupported(file, 'interactive state other than step (' + otherState[0] + ')');
  const anim = slideAnimations(src);
  if (/\banimation(-name)?:/.test(body) && !anim.keyframes.length) unsupported(file, 'CSS animation with no @keyframes in the slide\'s <helmet><style>');
  return { file, body, script: sm ? sm[2] : '', steps, anim, live };
}
function unsupported(file, what) {
  console.error('\nNot supported yet in ' + file + ': ' + what +
    '\nThe converter needs an update for this kind of slide (see COVERAGE.md). Ask Claude to extend build.js.');
  process.exit(3);
}
// ---------- time-animated ("live") slides ----------
// The slide's own component runs on a fake clock: timers are collected, Date.now() is ours.
function harness(slide, reduce) {
  let clock = 1.7e12; const timers = [];
  const ctx = {
    window: { matchMedia: () => ({ matches: !!reduce }) },
    setInterval: f => { timers.push(f); return timers.length; }, clearInterval() {},
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {},
    requestAnimationFrame: f => { timers.push(() => f(clock)); return timers.length; }, cancelAnimationFrame() {},
    console, __clock: () => clock
  };
  vm.createContext(ctx);
  vm.runInContext('Date.now = function(){ return __clock(); };\nclass DCLogic { constructor(){ this.props = {}; this.state = {}; } setState(o){ Object.assign(this.state, typeof o === "function" ? o(this.state) : o); } }\n' + slide.script + '\nvar __C = Component;', ctx);
  const c = new ctx.__C();
  return { c, mount() { if (c.componentDidMount) c.componentDidMount(); }, tick(ms) { clock += ms; timers.slice().forEach(f => f()); } };
}
// what the slide shows when it is not playing (print, PDF, other slides): its reduced-motion state
function staticVals(slide, step) {
  const h = harness(slide, true);
  h.c.state = step === null || step === undefined ? {} : { step };
  h.mount();
  return h.c.renderVals();
}
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, d) => String.fromCodePoint(parseInt(d, 16))).replace(/&amp;/g, '&');
const holeVal = (e, v) => { const x = evalExpr(e, v); return typeof x === 'function' || x === undefined || x === null ? '' : String(x); };
// markers -> static values plus a data-lv list of [attribute or "#text", template] the browser re-evaluates
function bindLive(html, exprs, vals, file) {
  const fill = t => t.replace(/\u0001(\d+)\u0002/g, (m, i) => esc(holeVal(exprs[+i], vals)));
  const tpl = t => decode(t.replace(/\u0001(\d+)\u0002/g, (m, i) => '{{' + exprs[+i] + '}}'));
  // text that is an element's whole content
  html = html.replace(/<([a-zA-Z][\w:.-]*)\b([^>]*)>([^<]*\u0001[^<]*)<\/\1>/g, (m, tag, attrs, text) =>
    '<' + tag + attrs + ' data-lvtext="' + text.replace(/"/g, '&quot;') + '">' + fill(text) + '</' + tag + '>');
  html = html.replace(/<([a-zA-Z][\w:.-]*)\b([^>]*\u0001[^>]*)>/g, (m, tag, attrs) => {
    const binds = [];
    attrs = attrs.replace(/\s([\w:.-]+)="([^"]*\u0001[^"]*)"/g, (a, name, val) => {
      if (name === 'data-lvtext') { binds.push(['#text', tpl(val.replace(/&quot;/g, '"'))]); return ''; }
      binds.push([name, tpl(val)]); return ' ' + name + '="' + fill(val) + '"';
    });
    const self = /\/\s*$/.test(attrs);
    if (self) attrs = attrs.replace(/\/\s*$/, '');
    return '<' + tag + attrs + " data-lv='" + JSON.stringify(binds).replace(/&/g, '&amp;').replace(/'/g, '&#39;') + "'" + (self ? '/' : '') + '>';
  });
  if (/\u0001/.test(html)) unsupported(file, 'a time-animated value in a place that cannot be bound (only attributes and an element\'s whole text can change)');
  return html;
}
function cleanRender(html, file) {
  html = html.replace(/<button\b[\s\S]*?<\/button>/g, '');
  html = html.replace(/<div style="[^"]*display: flex[^"]*">\s*<\/div>/g, '');
  html = html.replace(/\s(onClick|disabled|hint-placeholder-[a-z]+)="[^"]*"/g, '');
  return inlineAssets(html, file);
}
// every state the slide passes through while playing must have the same markup as its bound template
function checkLive(slide) {
  const tplFor = {};
  const template = st => {
    const k = st === undefined || st === null ? 'x' : st;
    if (!tplFor[k]) { const ex = []; tplFor[k] = { ex, html: expand(slide.body, staticVals(slide, slide.steps ? st : null), ex) }; }
    return tplFor[k];
  };
  const starts = slide.steps ? [...Array(slide.steps + 1).keys()] : [null];
  starts.forEach(k => {
    const h = harness(slide, false);
    h.c.state = k === null ? {} : { step: k };
    h.mount();
    let v = h.c.renderVals();
    if (k !== null && k < slide.steps && typeof v.next === 'function') v.next();
    for (let i = 0; i <= 100; i++) {
      v = h.c.renderVals();
      const T = template(slide.steps ? h.c.state.step : null);
      const want = expand(slide.body, v);
      const got = T.html.replace(/\u0001(\d+)\u0002/g, (m, j) => esc(holeVal(T.ex[+j], v)));
      if (got !== want) unsupported(slide.file, 'a time animation that changes the slide\'s structure (<sc-for>/<sc-if>) while it plays');
      h.tick(250);
    }
  });
}
function renderSlide(slide, step) {
  if (slide.live) {
    const vals = staticVals(slide, slide.steps ? step : null), ex = [];
    return bindLive(cleanRender(expand(slide.body, vals, ex), slide.file), ex, vals, slide.file);
  }
  const ctx = { result: null };
  vm.createContext(ctx);
  vm.runInContext('class DCLogic { constructor(){ this.props = {}; this.state = {}; } setState(){} }\n' + slide.script +
    '\nvar __c = new Component(); __c.state = ' + JSON.stringify(step === null ? {} : { step }) + '; result = __c.renderVals();', ctx);
  let html = expand(slide.body, ctx.result || {});
  html = html.replace(/<button\b[\s\S]*?<\/button>/g, '');
  html = html.replace(/<div style="[^"]*display: flex[^"]*">\s*<\/div>/g, '');
  html = html.replace(/\s(onClick|disabled|hint-placeholder-[a-z]+)="[^"]*"/g, '');
  return inlineAssets(html, slide.file);
}
function prefixIds(html, pre) {
  const ids = new Set();
  html.replace(/\sid="([^"]+)"/g, (m, id) => ids.add(id));
  ids.forEach(id => {
    const e = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp('id="' + e + '"', 'g'), 'id="' + pre + id + '"')
      .replace(new RegExp('url\\(#' + e + '\\)', 'g'), 'url(#' + pre + id + ')')
      .replace(new RegExp('href="#' + e + '"', 'g'), 'href="#' + pre + id + '"');
  });
  return html;
}
// the title text ends at its own closing tag (a <div> or an <h1>), never running into the subtitle
const titleOf = html => { const m = /font-size: (?:4[0-9]|5[0-9]|6[0-9]|72)px[^>]*>([\s\S]*?)<\/(?:div|h1)>/.exec(html); return m ? m[1].replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''; };

// Movers: tags whose inline style animates left/top with a CSS transition.
const MOVER = /<([a-z]+)([^>]*?)style="([^"]*\btransition:[^"]*\bleft\b[^"]*)"/g;
function movers(html) {
  const out = []; let m;
  MOVER.lastIndex = 0;
  while ((m = MOVER.exec(html))) {
    const l = /(?:^|;)\s*left:\s*([-\d.]+)px/.exec(m[3]), t = /(?:^|;)\s*top:\s*([-\d.]+)px/.exec(m[3]);
    // width/height also animate when the transition names them (e.g. a region that grows)
    const w = /\btransition:[^;]*\bwidth\b/.test(m[3]) && /(?:^|;)\s*width:\s*([-\d.]+)px/.exec(m[3]);
    const h = /\btransition:[^;]*\bheight\b/.test(m[3]) && /(?:^|;)\s*height:\s*([-\d.]+)px/.exec(m[3]);
    out.push(l && t ? (w && h ? [l[1], t[1], w[1], h[1]] : [l[1], t[1]]) : null);
  }
  return out;
}
const stripMoverPos = html => html.replace(MOVER, (all, tag, pre, st) =>
  '<' + tag + pre + 'style="' + st.replace(/(^|;)\s*left:\s*[-\d.]+px/, '$1left:X').replace(/(^|;)\s*top:\s*[-\d.]+px/, '$1top:Y')
    .replace(/(^|;)\s*width:\s*[-\d.]+px/, (m0, a) => /\btransition:[^;]*\bwidth\b/.test(st) ? a + 'width:W' : m0)
    .replace(/(^|;)\s*height:\s*[-\d.]+px/, (m0, a) => /\btransition:[^;]*\bheight\b/.test(st) ? a + 'height:H' : m0) + '"');
function tagMovers(html, positions) { // positions: array per mover of {step: "l,t"}
  let i = 0;
  return html.replace(MOVER, (all, tag, pre, st) => '<' + tag + pre + "data-pos='" + JSON.stringify(positions[i++]) + "' style=\"" + st + '"');
}

const sections = [];
const liveScripts = [];
let usesMath = false;
let animCss = '';
order.forEach((file, n) => {
  const N = n + 1;
  const slide = readSlide(file);
  if (slide.live) { checkLive(slide); liveScripts.push('__LIVE[' + N + ']=function(DCLogic){\n' + slide.script + '\nreturn Component;};'); }
  let inner, title;
  if (!slide.steps) {
    inner = prefixIds(renderSlide(slide, null), 's' + N + '-');
    title = titleOf(inner);
  } else {
    const renders = [];
    for (let k = 0; k <= slide.steps; k++) renders.push(renderSlide(slide, k));
    title = titleOf(renders[0]);
    // group steps into layers; an animated step extends the current layer
    const layers = [{ start: 0, html: renders[0], pos: movers(renders[0]).map(p => p ? { 0: p.join(',') } : {}) }];
    const triggers = [];
    for (let k = 1; k <= slide.steps; k++) {
      const cur = layers[layers.length - 1];
      const prevM = movers(renders[k - 1]), nowM = movers(renders[k]);
      const animated = nowM.length > 0 && nowM.length === prevM.length && nowM.every(Boolean) &&
        stripMoverPos(renders[k]) === stripMoverPos(renders[k - 1]);
      if (animated) {
        nowM.forEach((p, i) => { cur.pos[i][k] = p.join(','); });
        triggers.push(k);
      } else {
        // a new layer whose movers match the previous step's movers one-to-one starts them at their
        // old spots, so they glide to the new ones while the rest of the slide fades in
        const carry = nowM.length > 0 && nowM.length === prevM.length && nowM.every(Boolean) && prevM.every(Boolean);
        layers.push({ start: k, html: renders[k], pos: nowM.map((p, i) => p ? (carry ? { [k - 1]: prevM[i].join(','), [k]: p.join(',') } : { [k]: p.join(',') }) : {}) });
      }
    }
    inner = layers.map((L, li) => {
      const h = prefixIds(L.pos.length ? tagMovers(L.html, L.pos) : L.html, 's' + N + '-L' + li + '-');
      return L.start === 0
        ? '<div class="step-layer">' + h + '</div>'
        : '<div class="step-layer fragment" data-fragment-index="' + (L.start - 1) + '">' + h + '</div>';
    }).join('\n') + triggers.map(k => '\n<div class="fragment step-trigger" data-fragment-index="' + (k - 1) + '" aria-hidden="true"></div>').join('');
  }
  // a slide with no big title text (e.g. an image title slide) takes its board name
  if (!title) title = String((canvas.boards[file] || {}).title || '').replace(/\s*\(click Next\)\s*$/i, '');
  // the slide's own CSS animations, with keyframe names made unique per slide
  const an = renameAnimations(inner, slide.anim, 's' + N + '-');
  inner = an.html;
  if (an.css) animCss += '/* slide ' + N + ' */\n' + an.css + '\n';
  // board step builds
  inner = inner.replace(/<([a-zA-Z]+)\b([^>]*?\bdata-build-step="(\d+)"[^>]*?)(\/?)>/g, (m, tag, attrs, k, sc) => {
    const idx = ' data-fragment-index="' + (k - 1) + '"';
    return /\bclass="/.test(attrs) ? '<' + tag + attrs.replace(/\bclass="/, 'class="fragment ') + idx + sc + '>' : '<' + tag + attrs + ' class="fragment"' + idx + sc + '>';
  });
  if (/\\\(|\\\[/.test(inner)) usesMath = true;
  // student extras: download button on the title slide, copyright line on every slide
  const isFirst = file === firstVisible;
  const extra = (isFirst && OPT.pdf ? '\n' + extras.BUTTON : '') + (OPT.copyright ? '\n' + extras.copyright(isFirst ? 1 : N + 1, OPT.holder, OPT.year) : '');
  const hid = isHidden(file);
  sections.push({ N, file, title, hidden: hid, live: slide.live, anim: slide.anim.keyframes.length, html: '<!-- ===== Slide ' + N + ': ' + title + (hid ? ' (HIDDEN: on the board\'s Hidden page)' : '') + ' ===== -->\n<section data-title="' + esc(title) + '"' + (slide.live ? ' data-live="' + N + '"' + (slide.steps ? ' data-live-steps="1"' : '') : '') + (hid ? ' data-visibility="hidden"' : '') + '>\n' + inner + extra + '\n</section>' });
});

// ---------- assets ----------
const rd = p => fs.readFileSync(path.join(NM, p), 'utf8');
const b64 = p => fs.readFileSync(p).toString('base64');
const noClose = s => s.replace(/<\/script/gi, '<\\/script');
function fontCss(pkg, weights) {
  let css = '';
  weights.forEach(w => {
    const t = rd('@fontsource/' + pkg + '/' + w + '.css');
    t.replace(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g, (m, name, decl) => {
      const subset = name.replace(pkg + '-', '').replace(/-\d+-normal$/, '');
      if (!['latin', 'latin-ext', 'greek'].includes(subset)) return;
      const u = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(decl);
      const fp = u && path.join(NM, '@fontsource', pkg, 'files', u[1]);
      if (!fp || !fs.existsSync(fp)) return; // e.g. Plex Mono has no greek subset
      const fam = /font-family:\s*'([^']+)'/.exec(decl)[1];
      const range = /unicode-range:\s*([^;]+);/.exec(decl);
      css += "@font-face{font-family:'" + fam + "';font-style:normal;font-display:block;font-weight:" + w +
        ';src:url(data:font/woff2;base64,' + b64(fp) + ") format('woff2');" + (range ? 'unicode-range:' + range[1] + ';' : '') + '}\n';
    });
  });
  return css;
}
let katexCss = '', katexJs = '';
if (usesMath) {
  const kd = path.join(NM, 'katex/dist');
  katexCss = fs.readFileSync(path.join(kd, 'katex.min.css'), 'utf8')
    .replace(/url\((fonts\/[^)]+?\.woff2)\)\s*format\("woff2"\)(,\s*url\([^)]+\)\s*format\("[^"]+"\))*/g,
      (m, f) => 'url(data:font/woff2;base64,' + b64(path.join(kd, f)) + ') format("woff2")');
  katexJs = noClose(fs.readFileSync(path.join(kd, 'katex.min.js'), 'utf8')) + '\n' +
    noClose(fs.readFileSync(path.join(kd, 'contrib/auto-render.min.js'), 'utf8'));
}

const css = `
html,body{background:#FBFBFA}
.reveal{font-family:'IBM Plex Sans',sans-serif;color:#16181D}
.reveal .slides{text-align:left}
.reveal .slides section{padding:0;width:1280px;height:720px;box-sizing:border-box;line-height:normal;font-size:16px}
.reveal .slides section > div{position:absolute;left:0;top:0}
.reveal .step-layer{width:1280px;height:720px}
.reveal .slides section .fragment.step-layer{transition:opacity .35s ease}
.reveal .controls,.reveal .progress{color:#2557D6}
[data-build-dot]{transition:cx .55s ease, cy .55s ease, opacity .3s;opacity:0}
${animCss}
${extras.CSS}
${OPT.present ? extras.PRESENT_CSS : ''}
`;
const js = `
function curStep(sec){ var k=0; sec.querySelectorAll('.fragment.visible[data-fragment-index]').forEach(function(f){ k=Math.max(k, +f.dataset.fragmentIndex+1); }); return k; }
function syncSteps(){
  document.querySelectorAll('.reveal .slides > section').forEach(function(sec){
    var k=curStep(sec);
    sec.querySelectorAll('[data-pos]').forEach(function(m){
      var pos=JSON.parse(m.dataset.pos), best=null, bs=-1;
      Object.keys(pos).forEach(function(s){ s=+s; if(s<=k && s>bs){ bs=s; best=pos[s]; } });
      if(best===null){ var ks=Object.keys(pos).map(Number).sort(function(a,b){return a-b;}); best=pos[ks[0]]; }
      var p=best.split(','); m.style.left=p[0]+'px'; m.style.top=p[1]+'px'; if(p.length>3){ m.style.width=p[2]+'px'; m.style.height=p[3]+'px'; }
    });
    var layers=[].slice.call(sec.querySelectorAll('.step-layer'));
    if(layers.length){
      var top=layers[0];
      layers.forEach(function(l){ if(!l.classList.contains('fragment')||l.classList.contains('visible')) top=l; });
      layers.forEach(function(l){ if(l===top) l.removeAttribute('aria-hidden'); else l.setAttribute('aria-hidden','true'); });
    }
  });
}
function buildDots(){
  document.querySelectorAll('.reveal section').forEach(function(sec){
    var k=0; sec.querySelectorAll('[data-build-step].visible').forEach(function(e){k=Math.max(k,+e.dataset.buildStep);});
    sec.querySelectorAll('[data-build-dot]').forEach(function(d){
      var t=d.dataset.track.split(';').map(function(p){return p.split(',').map(Number);});
      var q=t[Math.max(k,1)-1]; d.style.cx=q[0]+'px'; d.style.cy=q[1]+'px'; d.style.opacity=k?1:0;
    });
  });
}
/* CSS animations: play from the start when their click step is shown; already finished otherwise */
function cssAnims(root){ return root && root.getAnimations ? root.getAnimations({subtree:true}).filter(function(a){ return a.animationName; }) : []; }
function finishAnims(root){ cssAnims(root).forEach(function(a){ try{ a.finish(); }catch(e){} }); }
// restart by resetting each element's own animation style, so animations that were finished (and so no longer
// listed by getAnimations, e.g. ones only visible during their own time slot) start again too
function restartAnims(root){ var els=[].slice.call(root.querySelectorAll('[style*="animation"]')); if(root.matches && root.matches('[style*="animation"]')) els.push(root);
  els.forEach(function(e){ if(e.dataset.anim===undefined) e.dataset.anim=e.style.animation; e.style.animation='none'; }); void root.offsetWidth;
  els.forEach(function(e){ e.style.animation=e.dataset.anim; }); }
Reveal.on('fragmentshown', function(e){ (e.fragments||[e.fragment]).forEach(restartAnims); });
// animations outside any click step play each time the slide is shown; ones inside a step show finished
function restartLoose(sec){ var els=[].filter.call(sec.querySelectorAll('[style*="animation"]'), function(e){ return !e.closest('.fragment'); }); if(!els.length) return;
  els.forEach(function(e){ if(e.dataset.anim===undefined) e.dataset.anim=e.style.animation; e.style.animation='none'; }); void sec.offsetWidth;
  els.forEach(function(e){ e.style.animation=e.dataset.anim; }); }
Reveal.on('slidechanged', function(e){ finishAnims(e.currentSlide); restartLoose(e.currentSlide); });
/* time-animated slides: the slide's own component runs while the slide is shown; elsewhere (other slides,
   print, PDF) every bound value shows its static, finished state */
var LIVE=window.__LIVE||{}, liveOn={}, liveOrig=new WeakMap();
function LiveBase(){ this.props={}; this.state={}; }
LiveBase.prototype.setState=function(o){ Object.assign(this.state, typeof o==='function'?o(this.state):o); if(this.__sec) liveRender(this); };
function liveEval(t, v){ var k=Object.keys(v); return t.replace(/\\{\\{([\\s\\S]*?)\\}\\}/g, function(m,e){ var r; try{ r=Function.apply(null, k.concat('return ('+e+');')).apply(null, k.map(function(x){ return v[x]; })); }catch(err){ r=''; } return (typeof r==='function'||r===undefined||r===null)?'':String(r); }); }
function liveTop(sec){ var ls=[].slice.call(sec.querySelectorAll('.step-layer')); if(!ls.length) return sec; var top=ls[0]; ls.forEach(function(l){ if(!l.classList.contains('fragment')||l.classList.contains('visible')) top=l; }); return top; }
function liveRender(c){ var v=c.renderVals(), top=liveTop(c.__sec); top.querySelectorAll('[data-lv]').forEach(function(e){
  JSON.parse(e.getAttribute('data-lv')).forEach(function(b){ var val=liveEval(b[1], v), o=liveOrig.get(e)||{};
    if(b[0]==='#text'){ if(!('#text' in o)) o['#text']=e.textContent; if(e.textContent!==val) e.textContent=val; }
    else { if(!(b[0] in o)) o[b[0]]=e.getAttribute(b[0]); if(e.getAttribute(b[0])!==val) e.setAttribute(b[0], val); }
    liveOrig.set(e,o); }); }); }
function liveRestore(sec){ sec.querySelectorAll('[data-lv]').forEach(function(e){ var o=liveOrig.get(e); if(!o) return;
  Object.keys(o).forEach(function(n){ if(n==='#text') e.textContent=o[n]; else if(o[n]===null) e.removeAttribute(n); else e.setAttribute(n,o[n]); }); liveOrig.delete(e); }); }
function liveMount(sec){ if(!sec||!sec.dataset.live||liveOn[sec.dataset.live]||!LIVE[sec.dataset.live]) return;
  var C=LIVE[sec.dataset.live](LiveBase), c=new C(); c.state=sec.dataset.liveSteps?{step:curStep(sec)}:{}; c.__sec=sec; liveOn[sec.dataset.live]=c;
  liveRender(c); if(c.componentDidMount) c.componentDidMount(); }
function liveUnmount(sec){ if(!sec||!sec.dataset.live) return; var c=liveOn[sec.dataset.live]; if(!c) return;
  if(c.componentWillUnmount) c.componentWillUnmount(); c.__sec=null; delete liveOn[sec.dataset.live]; liveRestore(sec); }
function liveStep(sec, forward){ var c=sec&&sec.dataset.live&&liveOn[sec.dataset.live]; if(!c||!sec.dataset.liveSteps) return; var k=curStep(sec);
  /* one click forward does what the board's Next button did, so its animation plays; anything else jumps */
  liveRestore(sec); var v=c.renderVals(); if(forward && k===c.state.step+1 && typeof v.next==='function') v.next(); else { c.state={step:k}; liveRender(c); } }
Reveal.on('slidechanged', function(e){ liveUnmount(e.previousSlide); liveMount(e.currentSlide); });
Reveal.on('fragmentshown', function(){ liveStep(Reveal.getCurrentSlide(), true); });
Reveal.on('fragmenthidden', function(){ liveStep(Reveal.getCurrentSlide(), false); });
window.addEventListener('beforeprint', function(){ liveUnmount(Reveal.getCurrentSlide()); });
window.addEventListener('afterprint', function(){ liveMount(Reveal.getCurrentSlide()); });
['fragmentshown','fragmenthidden','slidechanged','ready'].forEach(function(e){ Reveal.on(e, syncSteps); Reveal.on(e, buildDots); });
${usesMath ? `renderMathInElement(document.body,{delimiters:[{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}],throwOnError:false});
document.querySelectorAll('.katex svg').forEach(function(el){ el.setAttribute('aria-hidden','true'); el.setAttribute('focusable','false'); el.setAttribute('role','presentation'); });` : ''}
Reveal.initialize({width:1280,height:720,margin:0.03,center:false,hash:true,controls:true,progress:true,slideNumber:false,transition:'fade'}).then(function(){ syncSteps(); buildDots(); finishAnims(Reveal.getCurrentSlide()); liveMount(Reveal.getCurrentSlide()); });
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${extras.sourceMeta(OPT.source)}
<title>${esc(canvas.title || 'Lecture')}</title>
<style>
${fontCss('ibm-plex-sans', ['300', '400', '500', '600'])}${fontCss('ibm-plex-mono', ['400', '500'])}
${fs.readFileSync(path.join(VENDOR, 'reveal.js-5.1.0/reveal.css'), 'utf8')}
${katexCss}
${css}
</style>
</head>
<body>
<div class="reveal"><div class="slides">
${sections.map(s => s.html).join('\n')}
</div></div>
${OPT.present ? extras.presentButton() + '\n' + extras.CAPTURE : ''}
<script>
${noClose(fs.readFileSync(path.join(VENDOR, 'reveal.js-5.1.0/reveal.js'), 'utf8'))}
</script>
${usesMath ? '<script>\n' + katexJs + '\n</script>' : ''}
${liveScripts.length ? '<script>\nwindow.__LIVE={};\n' + noClose(liveScripts.join('\n')) + '\n</script>' : ''}
<script>
${js}
</script>
${OPT.pdf ? extras.jspdfScript() : ''}
${(OPT.pdf || OPT.copyright) ? extras.runtimeScript() : ''}
${OPT.present ? extras.presentRuntime(OPT.slidewright) : ''}
</body>
</html>
`;
fs.writeFileSync(OUT, html);
console.log('built', OUT, '|', sections.filter(s => !s.hidden).length, 'slides' + (sections.some(s => s.hidden) ? ' (+' + sections.filter(s => s.hidden).length + ' hidden)' : '') + ' |', (html.length / 1e6).toFixed(1), 'MB |', usesMath ? 'KaTeX inlined' : 'no math',
  '|', OPT.pdf ? 'PDF button' : 'no PDF button', '|', OPT.present ? 'Present button' : 'no Present button', '|', OPT.copyright ? '© ' + OPT.year + ' ' + OPT.holder : 'no copyright');
sections.forEach(s => console.log(String(s.N).padStart(3), s.file.padEnd(28), (s.hidden ? '[hidden] ' : '') + s.title + (s.anim ? '  [' + s.anim + ' keyframes]' : '') + (s.live ? '  [time-animated]' : '')));
