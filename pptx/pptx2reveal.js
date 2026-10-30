/*
 * pptx2reveal: turns a PowerPoint (.pptx) file into a self-contained reveal.js deck in the structure
 * Slidewright edits (docs/DECK-FORMAT.md): one <section> per slide, one root <div> sized to the slide,
 * absolutely positioned items, speaker notes in <aside class="notes">, click builds as reveal fragments.
 *
 * Runs in the browser (Slidewright's Open menu) and in Node (pptx/convert.cjs). It needs a zip reader
 * (JSZip) and an XML DOMParser, passed in, and uses only basic DOM calls so @xmldom/xmldom works too.
 *
 *   const { html, report } = await PptxToReveal.convert(arrayBuffer, { JSZip, DOMParser, revealCss, revealJs, name })
 *
 * What converts: text (fonts, sizes, colours, bold/italic/underline, bullets and numbering, alignment,
 * spacing, links), shapes (common preset shapes and custom paths, fills, gradients, outlines, arrows),
 * pictures (with crop and alt text), video and audio, tables (merged cells, table styles), groups,
 * SmartArt (its drawing), simple bar/column/line/pie charts, master and layout artwork, backgrounds,
 * speaker notes, hidden slides, slide transitions, and click animations (entrance, exit, emphasis,
 * by paragraph). Not converted (reported): EMF/WMF pictures, 3D, WordArt effects, embedded fonts,
 * other chart types, OLE objects without a preview picture.
 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PptxToReveal = factory(); })(this, function () {
  'use strict';
  const EMU_PX = 1 / 9525;            // 914400 EMU per inch, 96 px per inch
  const px = v => Math.round((+v || 0) * EMU_PX * 10) / 10;
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /* ---------- tiny DOM helpers (work with browser DOMParser and xmldom) ---------- */
  const isEl = n => n && n.nodeType === 1;
  const ln = n => n.localName || String(n.nodeName).replace(/^.*:/, '');
  function kids(el, name) { const out = []; if (!el) return out; for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n) && (!name || ln(n) === name)) out.push(n); return out; }
  function kid(el, name) { if (!el) return null; for (let n = el.firstChild; n; n = n.nextSibling) if (isEl(n) && ln(n) === name) return n; return null; }
  function path(el, ...names) { for (const n of names) { el = kid(el, n); if (!el) return null; } return el; }
  function desc(el, name) { if (!el) return null; for (let n = el.firstChild; n; n = n.nextSibling) { if (!isEl(n)) continue; if (ln(n) === name) return n; const d = desc(n, name); if (d) return d; } return null; }
  function descs(el, name, out) { out = out || []; if (!el) return out; for (let n = el.firstChild; n; n = n.nextSibling) { if (!isEl(n)) continue; if (ln(n) === name) out.push(n); descs(n, name, out); } return out; }
  function at(el, name) { if (!el) return null; const v = el.getAttribute(name); return v === '' && !(el.hasAttribute && el.hasAttribute(name)) ? null : v; }
  const num = (el, name, d) => { const v = at(el, name); return v == null ? d : +v; };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r1 = v => Math.round(v * 10) / 10;

  /* ---------- colours ---------- */
  const hex2rgb = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  function rgb2hsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function hsl2rgb([h, s, l]) { if (!s) return [l, l, l].map(v => Math.round(v * 255)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255)); }
  const toL = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const toS = l => { l = Math.min(1, Math.max(0, l)); return Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255); };
  const PRESET = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', darkGray: 'A9A9A9', lightGray: 'D3D3D3' };
  const SYS = { windowText: '000000', window: 'FFFFFF', btnFace: 'F0F0F0', highlight: '0078D7', highlightText: 'FFFFFF' };
  /** colour element (srgbClr, schemeClr...) -> {rgb:[r,g,b], a} */
  function colorOf(c, ctx, ph) {
    if (!c) return null; let hex = null; const n = ln(c);
    if (n === 'srgbClr') hex = at(c, 'val');
    else if (n === 'schemeClr') { let v = at(c, 'val'); if (v === 'phClr') { if (ph) return applyMods(ph, c); v = 'accent1'; } hex = ctx.scheme(v); }
    else if (n === 'sysClr') hex = at(c, 'lastClr') || SYS[at(c, 'val')] || '000000';
    else if (n === 'prstClr') hex = PRESET[at(c, 'val')] || '000000';
    else if (n === 'scrgbClr') hex = ['r', 'g', 'b'].map(k => Math.round(Math.min(1, Math.max(0, num(c, k, 0) / 100000)) ** (1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
    else if (n === 'hslClr') hex = hsl2rgb([num(c, 'hue', 0) / 21600000, num(c, 'sat', 0) / 100000, num(c, 'lum', 0) / 100000]).map(v => v.toString(16).padStart(2, '0')).join('');
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) hex = '000000';
    return applyMods({ rgb: hex2rgb(hex), a: 1 }, c);
  }
  function applyMods(base, c) {
    let rgb = base.rgb.slice(), a = base.a;
    for (const m of kids(c)) { const v = num(m, 'val', 100000) / 100000, n = ln(m);
      if (n === 'alpha') a = v; else if (n === 'alphaMod') a *= v;
      else if (n === 'tint') rgb = rgb.map(x => toS(toL(x) * v + (1 - v)));   /* in linear light, as PowerPoint does */
      else if (n === 'shade') rgb = rgb.map(x => toS(toL(x) * v));
      else if (n === 'lumMod' || n === 'lumOff' || n === 'satMod') { const h = rgb2hsl(rgb); if (n === 'lumMod') h[2] *= v; else if (n === 'lumOff') h[2] += v; else h[1] *= v; h[1] = Math.min(1, Math.max(0, h[1])); h[2] = Math.min(1, Math.max(0, h[2])); rgb = hsl2rgb(h); }
      else if (n === 'inv') rgb = rgb.map(x => 255 - x);
      else if (n === 'gray') { const g = Math.round(0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]); rgb = [g, g, g]; } }
    return { rgb, a };
  }
  const css = c => !c ? null : c.a >= 0.999 ? '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() : `rgba(${c.rgb.join(', ')}, ${r1(c.a * 100) / 100})`;
  const COLOR_TAGS = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'];
  const colorChild = el => el ? kids(el).find(k => COLOR_TAGS.includes(ln(k))) : null;

  /* ---------- fonts ---------- */
  function fontStack(name) { if (!name) return null; const n = name.replace(/["']/g, '');
    const map = { 'Calibri': "Calibri, Carlito, 'Segoe UI', Arial, sans-serif", 'Calibri Light': "'Calibri Light', Calibri, Carlito, 'Segoe UI', Arial, sans-serif", 'Aptos': "Aptos, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", 'Aptos Display': "'Aptos Display', Aptos, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      'Cambria': 'Cambria, Caladea, Georgia, serif', 'Consolas': "Consolas, 'Courier New', ui-monospace, monospace", 'Courier New': "'Courier New', Courier, ui-monospace, monospace", 'Arial': 'Arial, Helvetica, sans-serif', 'Helvetica': 'Helvetica, Arial, sans-serif', 'Times New Roman': "'Times New Roman', Times, serif", 'Georgia': 'Georgia, serif', 'Segoe UI': "'Segoe UI', system-ui, sans-serif", 'Century Gothic': "'Century Gothic', Futura, sans-serif" };
    return map[n] || `'${n}', ${/times|georgia|garamond|cambria|serif|roman|book/i.test(n) ? 'serif' : /mono|courier|consolas|(^|\s)code(\s|$)/i.test(n) ? 'ui-monospace, monospace' : 'sans-serif'}`; }

  /* bullets drawn from symbol fonts (Wingdings, Symbol) mapped to the Unicode characters they show */
  const SYMBOLS = { wingdings: { 0x6C: '●', 0x6E: '■', 0x6F: '□', 0x71: '❑', 0x75: '◆', 0x76: '❖', 0xA7: '▪', 0xA8: '◻', 0xD8: '➢', 0xFC: '✔', 0xFB: '✘', 0xE0: '➔', 0xE8: '➔', 0x9F: '•', 0x77: '⬥', 0xAB: '★', 0x4A: '☺', 0xF0: '⇨' },
    'wingdings 2': { 0x97: '▪', 0x98: '◆', 0x99: '■', 0x9E: '●', 0xA1: '○', 0xF8: '✗', 0x50: '✓', 0x52: '☑' }, 'wingdings 3': { 0x7D: '▸', 0x75: '▸', 0x7C: '▴', 0x71: '►', 0xC4: '▶', 0xD8: '➢', 0x22: '▸' },
    symbol: { 0xB7: '•', 0x2D: '−', 0xA8: '♦', 0xAE: '→', 0xD7: '·', 0xE0: '◊' }, webdings: { 0x3D: '■', 0x6E: '●' } };
  function bulletChar(ch, fontName) { const f = (fontName || '').toLowerCase(); const cp = (ch || '•').codePointAt(0); const sym = /wingdings|symbol|webdings/.test(f) || (cp >= 0xF000 && cp <= 0xF0FF);
    if (!sym) return ch || '•'; const tbl = SYMBOLS[f] || SYMBOLS[(f.match(/wingdings( [23])?|symbol|webdings/) || ['wingdings'])[0]] || SYMBOLS.wingdings; return tbl[cp & 0xFF] || (/wingdings [23]/.test(f) ? '▪' : '•'); }

  /* ---------- zip parts and relationships ---------- */
  function resolvePath(base, target) { if (/^\//.test(target)) return target.slice(1); const parts = base.split('/'); parts.pop(); for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); } return parts.join('/'); }
  const relsPath = p => { const i = p.lastIndexOf('/'); return p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'; };
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', wmv: 'video/x-ms-wmv', avi: 'video/x-msvideo', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', wma: 'audio/x-ms-wma', ogg: 'audio/ogg' };

  async function convert(data, opts) {
    opts = opts || {}; const { JSZip, DOMParser } = opts; if (!JSZip || !DOMParser) throw new Error('pptx2reveal needs JSZip and a DOMParser');
    let zip; try { zip = await JSZip.loadAsync(data); } catch (e) { throw new Error('This file is damaged or is not a .pptx (' + (e && e.message || e) + ')'); } const parser = new DOMParser();
    const warnings = new Map(); const warn = (k, msg) => { const w = warnings.get(k) || { msg, n: 0 }; w.n++; warnings.set(k, w); };
    const xmlCache = new Map();
    async function xml(p) { if (xmlCache.has(p)) return xmlCache.get(p); const f = zip.file(p); const doc = f ? parser.parseFromString(await f.async('string'), 'application/xml') : null; const root = doc ? doc.documentElement : null; xmlCache.set(p, root); return root; }
    const relCache = new Map();
    async function rels(p) { if (relCache.has(p)) return relCache.get(p); const r = await xml(relsPath(p)); const m = {};
      for (const e of kids(r, 'Relationship')) { const mode = at(e, 'TargetMode'); m[at(e, 'Id')] = { type: (at(e, 'Type') || '').replace(/^.*\//, ''), target: mode === 'External' ? at(e, 'Target') : resolvePath(p, at(e, 'Target')), external: mode === 'External' }; }
      relCache.set(p, m); return m; }
    const relOfType = (r, type) => Object.values(r).find(x => x.type === type);
    const mediaCache = new Map(); let mediaBytes = 0;
    async function media(p) { if (mediaCache.has(p)) return mediaCache.get(p); const f = zip.file(p); if (!f) return null; const ext = (p.split('.').pop() || '').toLowerCase();
      const b64 = await f.async('base64'); mediaBytes += b64.length * 0.75; const v = { url: `data:${MIME[ext] || 'application/octet-stream'};base64,${b64}`, ext, bytes: b64.length * 0.75 }; mediaCache.set(p, v); return v; }

    /* presentation: size, slides, default text */
    const presP = 'ppt/presentation.xml'; const pres = await xml(presP); if (!pres) throw new Error('This file is not a PowerPoint .pptx (no ppt/presentation.xml). Old .ppt files must be saved as .pptx first.');
    const presRels = await rels(presP); const sz = kid(pres, 'sldSz'); const W = Math.round(num(sz, 'cx', 12192000) * EMU_PX), H = Math.round(num(sz, 'cy', 6858000) * EMU_PX);
    const slideParts = kids(kid(pres, 'sldIdLst'), 'sldId').map(s => presRels[at(s, 'r:id')]).filter(Boolean).map(r => r.target);
    const defaultTextStyle = kid(pres, 'defaultTextStyle');
    const tableStyles = await xml('ppt/tableStyles.xml');

    /* masters, layouts and themes, loaded once each */
    const ctxCache = new Map();
    async function masterCtx(masterP) {
      if (ctxCache.has(masterP)) return ctxCache.get(masterP);
      const master = await xml(masterP); const mr = await rels(masterP); const themeRel = relOfType(mr, 'theme'); const theme = themeRel ? await xml(themeRel.target) : null;
      const clrScheme = desc(theme, 'clrScheme'); const sch = {}; for (const c of kids(clrScheme)) { const cc = colorChild(c); sch[ln(c)] = cc ? (ln(cc) === 'sysClr' ? (at(cc, 'lastClr') || SYS[at(cc, 'val')]) : at(cc, 'val')) : '000000'; }
      const map = readMap(kid(master, 'clrMap')) || {};
      const fontScheme = desc(theme, 'fontScheme'); const fonts = { major: at(path(fontScheme, 'majorFont', 'latin'), 'typeface'), minor: at(path(fontScheme, 'minorFont', 'latin'), 'typeface') };
      const fmt = desc(theme, 'fmtScheme');
      const ctx = { master, masterP, theme, fonts, txStyles: kid(master, 'txStyles'), fills: kids(kid(fmt, 'fillStyleLst')), lines: kids(kid(fmt, 'lnStyleLst')), bgFills: kids(kid(fmt, 'bgFillStyleLst')),
        map, sch, scheme(v) { const k = this.map[v] || v; return this.sch[k] || this.sch[{ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }[k]] || '000000'; } };
      ctxCache.set(masterP, ctx); return ctx;
    }
    function readMap(cm) { if (!cm) return null; const m = {}; for (const k of ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) m[k] = at(cm, k) || k; return m; }
    const withMap = (ctx, m) => m ? Object.assign(Object.create(ctx), { map: Object.assign({}, ctx.map, m) }) : ctx;
    const font = (name, ctx) => !name ? null : name === '+mj-lt' ? ctx.fonts.major : name === '+mn-lt' ? ctx.fonts.minor : /^\+/.test(name) ? ctx.fonts.minor : name;

    /* ---------- placeholders and inherited text styles ---------- */
    const phOf = sp => path(sp, 'nvSpPr', 'nvPr', 'ph') || path(sp, 'nvPicPr', 'nvPr', 'ph') || path(sp, 'nvGraphicFramePr', 'nvPr', 'ph');
    const phType = ph => at(ph, 'type') || 'obj';
    const sameType = (a, b) => a === b || (a === 'ctrTitle' && b === 'title') || (a === 'title' && b === 'ctrTitle') || (/^(obj|body)$/.test(a) && /^(obj|body)$/.test(b)) || (a === 'subTitle' && b === 'body');
    function findPh(tree, ph) { if (!tree || !ph) return null; const idx = at(ph, 'idx'), type = phType(ph); const all = descs(tree, 'sp');
      return (idx != null && all.find(s => { const p = phOf(s); return p && at(p, 'idx') === idx; })) || all.find(s => { const p = phOf(s); return p && sameType(type, phType(p)); }) || null; }
    function styleFamily(type) { return /title/i.test(type) ? 'titleStyle' : /^(body|subTitle|obj)$/.test(type) ? 'bodyStyle' : 'otherStyle'; }

    /* ---------- fills, lines, geometry ---------- */
    function fillCSS(holder, ctx, styleRef) {
      if (!holder && styleRef) return refFill(styleRef, ctx);
      if (!holder) return null;
      const f = kids(holder).find(k => /Fill$/.test(ln(k))); if (!f) return styleRef ? refFill(styleRef, ctx) : null;
      const n = ln(f);
      if (n === 'noFill') return 'transparent';
      if (n === 'solidFill') return css(colorOf(colorChild(f), ctx));
      if (n === 'gradFill') { const stops = kids(kid(f, 'gsLst'), 'gs').map(g => `${css(colorOf(colorChild(g), ctx))} ${r1(num(g, 'pos', 0) / 1000)}%`); const lin = kid(f, 'lin');
        if (!stops.length) return null; return gradCSS(f, stops); }
      if (n === 'pattFill') return css(colorOf(colorChild(kid(f, 'fgClr')), ctx));
      if (n === 'grpFill') return 'inherit';
      return null;
    }
    function gradCSS(f, stops) { const p = kid(f, 'path'); if (p) { const r = kid(p, 'fillToRect'); const cx = r ? (num(r, 'l', 50000) + 100000 - num(r, 'r', 50000)) / 2000 : 50, cy = r ? (num(r, 't', 50000) + 100000 - num(r, 'b', 50000)) / 2000 : 50;
        return `radial-gradient(${at(p, 'path') === 'circle' ? 'circle' : 'ellipse'} farthest-corner at ${r1(cx)}% ${r1(cy)}%, ${stops.join(', ')})`; }
      return `linear-gradient(${r1(num(kid(f, 'lin'), 'ang', 0) / 60000 + 90)}deg, ${stops.join(', ')})`; }
    function refFill(ref, ctx) { if (!ref) return null; const idx = num(ref, 'idx', 0); if (!idx) return null; const base = colorOf(colorChild(ref), ctx);
      const tpl = idx >= 1001 ? ctx.bgFills[idx - 1001] : ctx.fills[idx - 1]; if (!tpl) return css(base);
      if (ln(tpl) === 'solidFill') return css(colorOf(colorChild(tpl), ctx, base)); if (ln(tpl) === 'gradFill') { const stops = kids(kid(tpl, 'gsLst'), 'gs').map(g => `${css(colorOf(colorChild(g), ctx, base))} ${r1(num(g, 'pos', 0) / 1000)}%`); return stops.length ? gradCSS(tpl, stops) : css(base); }
      if (ln(tpl) === 'noFill') return 'transparent'; return css(base); }
    function lineOf(spPr, ctx, styleRef) {
      const l = kid(spPr, 'ln'); let ref = null; if (styleRef && num(styleRef, 'idx', 0)) ref = { tpl: ctx.lines[num(styleRef, 'idx', 0) - 1], base: colorOf(colorChild(styleRef), ctx) };
      if (l && kid(l, 'noFill')) return null;
      let color = null, w = null, dash = null;
      if (l && kid(l, 'solidFill')) color = css(colorOf(colorChild(kid(l, 'solidFill')), ctx)); else if (l && kid(l, 'gradFill')) color = css(colorOf(colorChild(desc(kid(l, 'gradFill'), 'gs')), ctx));
      if (l && at(l, 'w') != null) w = num(l, 'w', 9525) * EMU_PX; if (l && kid(l, 'prstDash')) dash = at(kid(l, 'prstDash'), 'val');
      if (!color && ref) { const t = ref.tpl; if (t && kid(t, 'noFill')) return null; color = t && kid(t, 'solidFill') ? css(colorOf(colorChild(kid(t, 'solidFill')), ctx, ref.base)) : css(ref.base); if (w == null && t) w = num(t, 'w', 9525) * EMU_PX; if (!dash && t && kid(t, 'prstDash')) dash = at(kid(t, 'prstDash'), 'val'); }
      if (!color) return null;
      return { color, w: Math.max(0.5, r1(w == null ? 1 : w)), dash: dash && dash !== 'solid' ? dash : null, head: l && kid(l, 'headEnd') && at(kid(l, 'headEnd'), 'type') !== 'none' ? at(kid(l, 'headEnd'), 'type') : null, tail: l && kid(l, 'tailEnd') && at(kid(l, 'tailEnd'), 'type') !== 'none' ? at(kid(l, 'tailEnd'), 'type') : null };
    }
    const dashCSS = d => !d ? 'solid' : /dot/i.test(d) && !/dash/i.test(d) ? 'dotted' : 'dashed';
    const dashSVG = (d, w) => !d ? '' : /^(sysDot|dot)$/.test(d) ? `${w} ${w * 2}` : /dashDot/i.test(d) ? `${w * 4} ${w * 2} ${w} ${w * 2}` : `${w * 4} ${w * 3}`;

    /* preset shapes as SVG paths in a w x h box (the common ones; others fall back to rectangles) */
    function presetPath(prst, w, h, av) {
      const a = (k, d) => (av[k] != null ? av[k] : d) / 100000, m = Math.min(w, h);
      switch (prst) {
        case 'triangle': { const x = w * a('adj', 50000); return `M${x} 0L${w} ${h}L0 ${h}Z`; }
        case 'rtTriangle': return `M0 0L${w} ${h}L0 ${h}Z`;
        case 'diamond': return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
        case 'parallelogram': { const o = m * a('adj', 25000); return `M${o} 0L${w} 0L${w - o} ${h}L0 ${h}Z`; }
        case 'trapezoid': { const o = m * a('adj', 25000); return `M${o} 0L${w - o} 0L${w} ${h}L0 ${h}Z`; }
        case 'pentagon': return `M${w / 2} 0L${w} ${h * 0.38}L${w * 0.81} ${h}L${w * 0.19} ${h}L0 ${h * 0.38}Z`;
        case 'hexagon': { const o = m * a('adj', 25000); return `M${o} 0L${w - o} 0L${w} ${h / 2}L${w - o} ${h}L${o} ${h}L0 ${h / 2}Z`; }
        case 'octagon': { const o = m * a('adj', 29289); return `M${o} 0L${w - o} 0L${w} ${o}L${w} ${h - o}L${w - o} ${h}L${o} ${h}L0 ${h - o}L0 ${o}Z`; }
        case 'homePlate': { const o = m * a('adj', 50000); return `M0 0L${w - o} 0L${w} ${h / 2}L${w - o} ${h}L0 ${h}Z`; }
        case 'chevron': { const o = m * a('adj', 50000); return `M0 0L${w - o} 0L${w} ${h / 2}L${w - o} ${h}L0 ${h}L${o} ${h / 2}Z`; }
        case 'rightArrow': { const t = h * a('adj1', 50000), o = m * a('adj2', 50000); return `M0 ${(h - t) / 2}L${w - o} ${(h - t) / 2}L${w - o} 0L${w} ${h / 2}L${w - o} ${h}L${w - o} ${(h + t) / 2}L0 ${(h + t) / 2}Z`; }
        case 'leftArrow': { const t = h * a('adj1', 50000), o = m * a('adj2', 50000); return `M${w} ${(h - t) / 2}L${o} ${(h - t) / 2}L${o} 0L0 ${h / 2}L${o} ${h}L${o} ${(h + t) / 2}L${w} ${(h + t) / 2}Z`; }
        case 'upArrow': { const t = w * a('adj1', 50000), o = m * a('adj2', 50000); return `M${(w - t) / 2} ${h}L${(w - t) / 2} ${o}L0 ${o}L${w / 2} 0L${w} ${o}L${(w + t) / 2} ${o}L${(w + t) / 2} ${h}Z`; }
        case 'downArrow': { const t = w * a('adj1', 50000), o = m * a('adj2', 50000); return `M${(w - t) / 2} 0L${(w + t) / 2} 0L${(w + t) / 2} ${h - o}L${w} ${h - o}L${w / 2} ${h}L0 ${h - o}L${(w - t) / 2} ${h - o}Z`; }
        case 'leftRightArrow': { const t = h * a('adj1', 50000), o = m * a('adj2', 50000); return `M0 ${h / 2}L${o} 0L${o} ${(h - t) / 2}L${w - o} ${(h - t) / 2}L${w - o} 0L${w} ${h / 2}L${w - o} ${h}L${w - o} ${(h + t) / 2}L${o} ${(h + t) / 2}L${o} ${h}Z`; }
        case 'plus': case 'mathPlus': { const o = m * a('adj', 25000); return `M${o} 0L${w - o} 0L${w - o} ${o}L${w} ${o}L${w} ${h - o}L${w - o} ${h - o}L${w - o} ${h}L${o} ${h}L${o} ${h - o}L0 ${h - o}L0 ${o}L${o} ${o}Z`.replace(/L(\d)/g, 'L$1'); }
        case 'star5': { let d = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.38 : 0.5, t = -Math.PI / 2 + i * Math.PI / 5; d += (i ? 'L' : 'M') + r1(w / 2 + Math.cos(t) * w * r) + ' ' + r1(h / 2 + Math.sin(t) * h * r); } return d + 'Z'; }
        case 'flowChartDecision': return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
        case 'flowChartTerminator': return `M${h / 2} 0L${w - h / 2} 0A${h / 2} ${h / 2} 0 0 1 ${w - h / 2} ${h}L${h / 2} ${h}A${h / 2} ${h / 2} 0 0 1 ${h / 2} 0Z`;
        case 'can': { const e = h * a('adj', 25000) / 2; return `M0 ${e}A${w / 2} ${e} 0 0 1 ${w} ${e}L${w} ${h - e}A${w / 2} ${e} 0 0 1 0 ${h - e}Z M0 ${e}A${w / 2} ${e} 0 0 0 ${w} ${e}`; }
        case 'wedgeRectCallout': return `M0 0L${w} 0L${w} ${h}L${w * 0.42} ${h}L${w * 0.2} ${h * 1.25}L${w * 0.25} ${h}L0 ${h}Z`;
        case 'cloud': case 'cloudCallout': return `M${w * .25} ${h * .9}A${w * .2} ${h * .2} 0 0 1 ${w * .1} ${h * .5}A${w * .2} ${h * .25} 0 0 1 ${w * .35} ${h * .15}A${w * .22} ${h * .2} 0 0 1 ${w * .7} ${h * .12}A${w * .2} ${h * .25} 0 0 1 ${w * .9} ${h * .5}A${w * .2} ${h * .22} 0 0 1 ${w * .7} ${h * .9}Z`;
        default: return null;
      }
    }
    function customPath(cg, w, h) {
      let d = ''; for (const p of kids(kid(cg, 'pathLst'), 'path')) { const pw = num(p, 'w', 0) || w / EMU_PX, ph = num(p, 'h', 0) || h / EMU_PX; const sx = pw ? w / pw : EMU_PX, sy = ph ? h / ph : EMU_PX; let cx = 0, cy = 0;
        const pt = e => [num(e, 'x', 0) * sx, num(e, 'y', 0) * sy];
        for (const c of kids(p)) { const n = ln(c), pts = kids(c, 'pt').map(pt);
          if (n === 'moveTo') { [cx, cy] = pts[0]; d += `M${r1(cx)} ${r1(cy)}`; }
          else if (n === 'lnTo') { [cx, cy] = pts[0]; d += `L${r1(cx)} ${r1(cy)}`; }
          else if (n === 'cubicBezTo') { d += 'C' + pts.map(q => `${r1(q[0])} ${r1(q[1])}`).join(' '); [cx, cy] = pts[2]; }
          else if (n === 'quadBezTo') { d += 'Q' + pts.map(q => `${r1(q[0])} ${r1(q[1])}`).join(' '); [cx, cy] = pts[1]; }
          else if (n === 'arcTo') { const wr = num(c, 'wR', 0) * sx, hr = num(c, 'hR', 0) * sy, st = num(c, 'stAng', 0) / 60000 * Math.PI / 180, sw = num(c, 'swAng', 0) / 60000 * Math.PI / 180;
            const ox = cx - wr * Math.cos(st), oy = cy - hr * Math.sin(st), ex = ox + wr * Math.cos(st + sw), ey = oy + hr * Math.sin(st + sw);
            d += `A${r1(wr)} ${r1(hr)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${r1(ex)} ${r1(ey)}`; cx = ex; cy = ey; }
          else if (n === 'close') d += 'Z'; } }
      return d;
    }

    /* ---------- text ---------- */
    function lvlPPr(container, lvl) { return container ? kid(container, `lvl${lvl + 1}pPr`) : null; }
    /** list of pPr-like elements from most to least specific, for a paragraph at level lvl */
    function chain(p, lvl, sh) {
      const out = []; const pPr = kid(p, 'pPr'); if (pPr) out.push(pPr);
      const own = lvlPPr(sh.lstStyles[0] && sh.ownLst ? sh.lstStyles[0] : null, lvl); out.nLocal = out.length + (own ? 1 : 0);
      for (const ls of sh.lstStyles) { const e = lvlPPr(ls, lvl); if (e) out.push(e); }
      const fam = sh.family && kid(sh.ctx.txStyles, sh.family); if (fam) { const e = lvlPPr(fam, lvl); if (e) out.push(e); }
      const d = lvlPPr(defaultTextStyle, lvl); if (d) out.push(d);
      return out;
    }
    const firstAttr = (list, name) => { for (const e of list) { const v = at(e, name); if (v != null) return v; } return null; };
    const firstKid = (list, name) => { for (const e of list) { const v = kid(e, name); if (v) return v; } return null; };
    function runStyle(rPr, defs, sh, nLocal) {
      const all = [rPr, ...defs].filter(Boolean); const st = [];
      const szv = firstAttr(all, 'sz'); const size = (szv != null ? +szv / 100 : 18) * (96 / 72) * sh.fontScale; st.push(`font-size: ${r1(size)}px`);
      const b = firstAttr(all, 'b'), i = firstAttr(all, 'i'), u = firstAttr(all, 'u'), s = firstAttr(all, 'strike'), base = firstAttr(all, 'baseline');
      if (b === '1' || b === 'true') st.push('font-weight: 700'); else if (b === '0' && sh.bold) st.push('font-weight: 400');
      if (i === '1' || i === 'true') st.push('font-style: italic');
      const deco = []; if (u && u !== 'none') deco.push('underline'); if (s && s !== 'noStrike') deco.push('line-through'); if (deco.length) st.push('text-decoration: ' + deco.join(' '));
      const local = rPr ? [rPr, ...defs.slice(0, nLocal || 0)] : defs.slice(0, nLocal || 0); const lf = local.map(e => kid(e, 'solidFill')).find(Boolean);
      const fill = lf || (sh.refColor ? null : all.map(e => kid(e, 'solidFill')).find(Boolean)); const color = fill ? css(colorOf(colorChild(fill), sh.ctx)) : sh.refColor || sh.color; if (color) st.push('color: ' + color);
      const lat = all.map(e => kid(e, 'latin')).find(Boolean); const fam = fontStack(font(lat ? at(lat, 'typeface') : sh.font, sh.ctx)); if (fam && fam !== sh.baseFont) st.push('font-family: ' + fam);
      const hl = all.map(e => kid(e, 'highlight')).find(Boolean); if (hl) st.push('background: ' + css(colorOf(colorChild(hl), sh.ctx)));
      if (base && +base) st.push(`vertical-align: ${+base > 0 ? 'super' : 'sub'}`, `font-size: ${r1(size * 0.7)}px`);
      const cap = firstAttr(all, 'cap'); if (cap === 'all') st.push('text-transform: uppercase'); else if (cap === 'small') st.push('font-variant: small-caps');
      const spc = firstAttr(all, 'spc'); if (spc && +spc) st.push(`letter-spacing: ${r1(+spc / 100 * 96 / 72)}px`);
      return { css: st.join('; '), size };
    }
    async function paragraphs(txBody, sh, slideRels, slideNo) {
      const out = []; // {lvl, bullet, html, css}
      for (const p of kids(txBody, 'p')) {
        const pPr = kid(p, 'pPr'); const lvl = num(pPr, 'lvl', 0); const ch = chain(p, lvl, sh);
        const defs = ch.map(e => kid(e, 'defRPr')); const nLocal = ch.nLocal || 0; const defsF = defs.filter(Boolean); const nl = defs.slice(0, nLocal).filter(Boolean).length;
        let html = '', maxSize = 0;
        for (const r of kids(p)) { const n = ln(r);
          if (n === 'r' || n === 'fld') { const rPr = kid(r, 'rPr'); const st = runStyle(rPr, defsF, sh, nl); maxSize = Math.max(maxSize, st.size);
            let t = n === 'fld' && /slidenum/i.test(at(r, 'type') || '') ? String(slideNo) : (kid(r, 't') ? kid(r, 't').textContent : '');
            const link = kid(rPr, 'hlinkClick'); let rcss = st.css; if (link && !kid(rPr, 'solidFill')) rcss = rcss.replace(/(^|; )color: [^;]+/, '$1color: #' + sh.ctx.scheme('hlink')) + (/text-decoration/.test(rcss) ? '' : '; text-decoration: underline');
            let h = `<span style="${rcss}">${esc(t)}</span>`;
            if (link) { const rel = slideRels[at(link, 'r:id')]; if (rel && rel.external && /^(https?:|mailto:)/i.test(rel.target)) h = `<a href="${esc(rel.target)}" target="_blank" rel="noopener">${h}</a>`; }
            html += h; }
          else if (n === 'br') html += '<br>';
        }
        if (!maxSize) maxSize = runStyle(kid(p, 'endParaRPr'), defsF, sh, nl).size;
        const pc = []; const algn = firstAttr(ch, 'algn'); if (algn) pc.push('text-align: ' + ({ l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || 'left'));
        const ls = firstKid(ch, 'lnSpc'); if (ls && kid(ls, 'spcPct')) pc.push(`line-height: ${r1(num(kid(ls, 'spcPct'), 'val', 100000) / 100000 * 1.2 * 100) / 100}`); else if (ls && kid(ls, 'spcPts')) pc.push(`line-height: ${r1(num(kid(ls, 'spcPts'), 'val', 0) / 100 * 96 / 72)}px`); else pc.push('line-height: 1.2');
        const sp = (k, prop) => { const e = firstKid(ch, k); if (!e) return; if (kid(e, 'spcPts')) pc.push(`${prop}: ${r1(num(kid(e, 'spcPts'), 'val', 0) / 100 * 96 / 72)}px`); else if (kid(e, 'spcPct')) pc.push(`${prop}: ${r1(num(kid(e, 'spcPct'), 'val', 0) / 100000 * maxSize * 1.2)}px`); };
        sp('spcBef', 'margin-top'); sp('spcAft', 'margin-bottom');
        const marL = +(firstAttr(ch, 'marL') || 0) * EMU_PX, indent = +(firstAttr(ch, 'indent') || 0) * EMU_PX;
        let bullet = null;
        const first = ch.find(e => kid(e, 'buNone') || kid(e, 'buChar') || kid(e, 'buAutoNum'));
        if (first && !kid(first, 'buNone') && html) { if (kid(first, 'buAutoNum')) bullet = { num: at(kid(first, 'buAutoNum'), 'type') || 'arabicPeriod', start: num(kid(first, 'buAutoNum'), 'startAt', 1) }; else { const bf = firstKid(ch, 'buFont'); bullet = { ch: bulletChar(at(kid(first, 'buChar'), 'char'), bf && at(bf, 'typeface')) }; }
          const bc = firstKid(ch, 'buClr'); if (bc) bullet.color = css(colorOf(colorChild(bc), sh.ctx)); }
        if (bullet) { const bs = firstKid(ch, 'buSzPct'); bullet.size = maxSize * (bs ? num(bs, 'val', 100000) / 100000 : 1); }
        out.push({ lvl, bullet, html: html || '<br>', css: pc.join('; '), marL, indent, size: maxSize });
      }
      return out;
    }
    function paragraphsHTML(paras, fragFor) {
      let h = '', open = null; const close = () => { if (open) { h += `</${open}>`; open = null; } };
      paras.forEach((p, i) => { const frag = fragFor ? fragFor(i) : '';
        if (p.bullet) { const tag = p.bullet.num ? 'ol' : 'ul'; if (open !== tag) { close(); h += `<${tag} style="margin: 0; padding: 0; list-style-position: outside">`; open = tag; }
          const type = p.bullet.num ? ({ arabicPeriod: 'decimal', arabicParenR: 'decimal', alphaLcPeriod: 'lower-alpha', alphaUcPeriod: 'upper-alpha', alphaLcParenR: 'lower-alpha', romanLcPeriod: 'lower-roman', romanUcPeriod: 'upper-roman' }[p.bullet.num] || 'decimal') : `'${p.bullet.ch.replace(/['"\\]/g, '')}  '`;
          const ml = Math.max(p.marL, p.size * 0.9); h += `<li${frag} style="${p.css}; margin-left: ${r1(ml)}px; list-style-type: ${type}${p.bullet.color ? `; --bu: ${p.bullet.color}` : ''}">${p.html}</li>`; }
        else { close(); h += `<p${frag} style="margin: 0; ${p.css}${p.marL || p.indent ? `; padding-left: ${r1(p.marL)}px; text-indent: ${r1(p.indent)}px` : ''}">${p.html}</p>`; } });
      close(); return h;
    }

    const pos = (b, ox, oy) => `position: absolute; left: ${r1(b.x - ox)}px; top: ${r1(b.y - oy)}px; width: ${r1(Math.max(b.w, 0))}px; height: ${r1(Math.max(b.h, 0))}px` + (b.rot || b.flipH || b.flipV ? `; transform: ${b.rot ? `rotate(${r1(b.rot)}deg)` : ''}${b.flipH ? ' scaleX(-1)' : ''}${b.flipV ? ' scaleY(-1)' : ''}` : '').replace('transform:  scale', 'transform: scale');

    /* Move the most common run size and colour up to the text box, so the box's own Font size and Colour (what an editor shows) are the real ones. */
    function hoist(inner) { const count = re => { const m = {}; let x; while ((x = re.exec(inner))) m[x[1]] = (m[x[1]] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1])[0]; };
      const sz = count(/<span style="font-size: ([\d.]+)px/g), col = count(/<span style="[^"]*?; color: (#[0-9A-F]{6}|rgba\([^)]*\))/g); let out = inner;
      if (sz) out = out.split(`<span style="font-size: ${sz[0]}px; `).join('<span style="').split(`<span style="font-size: ${sz[0]}px"`).join('<span');
      if (col) out = out.replace(/<span style="([^"]*)"/g, (m, st) => { const t = st.split('; ').filter(p => p !== 'color: ' + col[0]).join('; '); return t ? `<span style="${t}"` : '<span'; });
      return { inner: out, size: sz ? sz[0] : null, color: col ? col[0] : null }; }

    /* ---------- one slide ---------- */
    async function renderSlide(slideP, slideNo) {
      const slide = await xml(slideP); const sr = await rels(slideP); const layoutRel = relOfType(sr, 'slideLayout'); const layoutP = layoutRel ? layoutRel.target : null;
      const layout = layoutP ? await xml(layoutP) : null; const lr = layoutP ? await rels(layoutP) : {}; const masterRel = relOfType(lr, 'slideMaster');
      const ovr = d => readMap(path(d, 'clrMapOvr', 'overrideClrMapping'));
      const ctx = withMap(await masterCtx(masterRel ? masterRel.target : 'ppt/slideMasters/slideMaster1.xml'), ovr(slide) || ovr(layout));
      const layoutTree = path(layout, 'cSld', 'spTree'), masterTree = path(ctx.master, 'cSld', 'spTree');
      const anim = animations(slide); let title = '';
      const textColor = '#' + ctx.scheme('tx1'), baseFont = fontStack(ctx.fonts.minor);

      async function bgCSS() { for (const [doc, r] of [[slide, sr], [layout, lr], [ctx.master, await rels(ctx.masterP)]]) { const bg = path(doc, 'cSld', 'bg'); if (!bg) continue; const pr = kid(bg, 'bgPr');
          if (pr) { const blip = desc(pr, 'blip'); if (blip) { const rel = r[at(blip, 'r:embed')]; const m = rel && await media(rel.target); if (m) return `url(${m.url}) center / cover no-repeat`; } const f = fillCSS(pr, ctx); if (f) return f; }
          const ref = kid(bg, 'bgRef'); if (ref) { const f = refFill(ref, ctx); if (f) return f; } }
        return '#' + ctx.scheme('bg1'); }

      /* xfrm to a box in px, through any enclosing groups */
      const boxOf = (xfrm, T) => { const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext'); const x = num(off, 'x', 0), y = num(off, 'y', 0), w = num(ext, 'cx', 0), h = num(ext, 'cy', 0);
        const p = T([x, y]), q = T([x + w, y + h]); return { x: p[0], y: p[1], w: q[0] - p[0], h: q[1] - p[1], rot: num(xfrm, 'rot', 0) / 60000, flipH: at(xfrm, 'flipH') === '1', flipV: at(xfrm, 'flipV') === '1' }; };
      const ID = v => [v[0] * EMU_PX, v[1] * EMU_PX];
      const fragAttr = id => { const a = anim.get(String(id)); if (!a || a.para) return ''; return ` class="fragment${a.fx ? ' ' + a.fx : ''}" data-fragment-index="${a.k}"`; };

      async function shapeHTML(sp, T, ox, oy, fromLayout, rr) {
        rr = rr || sr; const n = ln(sp);
        if (n === 'AlternateContent') { const alt = kid(sp, 'Fallback') || kid(sp, 'Choice'); let h = ''; for (const c of kids(alt)) h += await shapeHTML(c, T, ox, oy, fromLayout, rr); return h; }
        if (n === 'grpSp') { const gp = kid(sp, 'grpSpPr'), xf = kid(gp, 'xfrm'); const b = boxOf(xf, T); const chOff = kid(xf, 'chOff'), chExt = kid(xf, 'chExt'), off = kid(xf, 'off'), ext = kid(xf, 'ext');
          const sx = num(chExt, 'cx', 0) ? num(ext, 'cx', 0) / num(chExt, 'cx', 1) : 1, sy = num(chExt, 'cy', 0) ? num(ext, 'cy', 0) / num(chExt, 'cy', 1) : 1;
          const T2 = v => T([num(off, 'x', 0) + (v[0] - num(chOff, 'x', 0)) * sx, num(off, 'y', 0) + (v[1] - num(chOff, 'y', 0)) * sy]);
          let inner = ''; for (const c of kids(sp)) if (/^(sp|pic|grpSp|graphicFrame|cxnSp|AlternateContent)$/.test(ln(c))) inner += await shapeHTML(c, T2, b.x, b.y, fromLayout, rr);
          const id = at(path(sp, 'nvGrpSpPr', 'cNvPr'), 'id'); const nm = at(path(sp, 'nvGrpSpPr', 'cNvPr'), 'descr');
          return inner ? `<div${fromLayout ? '' : fragAttr(id)} style="${pos(b, ox, oy)}"${nm ? ` role="group" aria-label="${esc(nm)}"` : ''}>${inner}</div>` : ''; }
        if (n === 'sp' || n === 'cxnSp') return spHTML(sp, T, ox, oy, fromLayout, rr);
        if (n === 'pic') return picHTML(sp, T, ox, oy, fromLayout, rr);
        if (n === 'graphicFrame') return frameHTML(sp, T, ox, oy, rr);
        return '';
      }

      async function spHTML(sp, T, ox, oy, fromLayout, rr) {
        const ph = phOf(sp); const isCxn = ln(sp) === 'cxnSp';
        if (fromLayout && ph) return '';             // layout/master placeholders are prompts, not content
        const nv = path(sp, isCxn ? 'nvCxnSpPr' : 'nvSpPr', 'cNvPr'); const id = at(nv, 'id');
        const lph = ph && !fromLayout ? findPh(layoutTree, ph) : null; const mph = ph && !fromLayout ? findPh(masterTree, lph ? phOf(lph) : ph) : null;
        const spPr = kid(sp, 'spPr'); const xf = kid(spPr, 'xfrm') || kid(kid(lph, 'spPr'), 'xfrm') || kid(kid(mph, 'spPr'), 'xfrm'); if (!xf) return '';
        const b = boxOf(xf, T); const style = kid(sp, 'style');
        const type = ph ? phType(ph) : null; if (type && /^(dt|ftr|sldNum|hdr)$/.test(type)) { const t = desc(kid(sp, 'txBody'), 't'); if (!t || !t.textContent.trim()) return ''; }
        // text
        const txBody = kid(sp, 'txBody'); let textHTML = '', textTag = 'div', textCSS = '', textInner = '';
        const hasText = txBody && descs(txBody, 't').some(t => t.textContent.trim());
        if (hasText) {
          const bodyPr = [kid(txBody, 'bodyPr'), kid(kid(lph, 'txBody'), 'bodyPr'), kid(kid(mph, 'txBody'), 'bodyPr')].filter(Boolean);
          const ins = k => { const v = firstAttr(bodyPr, k); return (v == null ? (k[0] === 'l' || k[0] === 'r' ? 91440 : 45720) : +v) * EMU_PX; };
          const anchor = firstAttr(bodyPr, 'anchor') || (type && /title/i.test(type) ? 'ctr' : 't');
          const na = bodyPr.map(e => kid(e, 'normAutofit')).find(Boolean); const fontScale = na ? num(na, 'fontScale', 100000) / 100000 : 1;
          const fontRef = kid(style, 'fontRef'); const refColor = fontRef && colorChild(fontRef) ? css(colorOf(colorChild(fontRef), ctx)) : null;
          const family = ph ? styleFamily(type) : 'otherStyle';
          const own = kid(txBody, 'lstStyle'); const sh = { ctx, family, fontScale, color: textColor, refColor, font: family === 'titleStyle' ? '+mj-lt' : '+mn-lt', baseFont, ownLst: !!own,
            lstStyles: [own, kid(kid(lph, 'txBody'), 'lstStyle'), kid(kid(mph, 'txBody'), 'lstStyle')].filter(Boolean) };
          const paras = await paragraphs(txBody, sh, rr, slideNo);
          const a = anim.get(String(id)); const fragFor = a && a.para ? (i => { const k = a.para[i]; return k == null ? '' : ` class="fragment${a.fx ? ' ' + a.fx : ''}" data-fragment-index="${k}"`; }) : null;
          const inner = paragraphsHTML(paras, fragFor);
          const isTitle = type && /title/i.test(type) && type !== 'subTitle'; if (isTitle && !title) title = descs(txBody, 't').map(t => t.textContent).join('').trim();
          const wrapNone = firstAttr(bodyPr, 'wrap') === 'none'; const just = { t: 'flex-start', ctr: 'center', b: 'flex-end' }[anchor] || 'flex-start';
          const tag = isTitle ? (slideNo === 1 ? 'h1' : 'h2') : 'div';
          const hz = hoist(inner); textTag = tag; textInner = hz.inner; textCSS = (hz.size ? `font-size: ${hz.size}px; ` : '') + `margin: 0; padding: ${r1(ins('tIns'))}px ${r1(ins('rIns'))}px ${r1(ins('bIns'))}px ${r1(ins('lIns'))}px; display: flex; flex-direction: column; justify-content: ${just}; font-weight: 400; font-family: ${baseFont}; color: ${hz.color || sh.refColor || sh.color}${wrapNone ? '; white-space: nowrap' : ''}; overflow-wrap: break-word`;
          textHTML = `<${tag} style="position: absolute; inset: 0; margin: 0; box-sizing: border-box; padding: ${r1(ins('tIns'))}px ${r1(ins('rIns'))}px ${r1(ins('bIns'))}px ${r1(ins('lIns'))}px; display: flex; flex-direction: column; justify-content: ${just}; font-weight: 400; font-family: ${baseFont}; color: ${sh.refColor || sh.color}${wrapNone ? '; white-space: nowrap' : ''}; overflow-wrap: break-word">${inner}</${tag}>`;
        }
        // geometry and paint
        const prst = at(kid(spPr, 'prstGeom'), 'prst'); const cust = kid(spPr, 'custGeom');
        const av = {}; for (const g of kids(kid(kid(spPr, 'prstGeom'), 'avLst'), 'gd')) { const m = /val\s+(-?\d+)/.exec(at(g, 'fmla') || ''); if (m) av[at(g, 'name')] = +m[1]; }
        let fill = fillCSS(spPr, ctx, kid(style, 'fillRef')); const line = lineOf(spPr, ctx, kid(style, 'lnRef'));
        if (ph && !kid(spPr, 'solidFill') && !kid(spPr, 'gradFill') && !kid(style, 'fillRef')) fill = fillCSS(kid(lph, 'spPr'), ctx) || null;
        if (fill === 'inherit') fill = null;
        const isLine = isCxn || prst === 'line' || /Connector/.test(prst || '');
        if (!hasText && !isLine && (!fill || fill === 'transparent') && !line) return '';
        const frag = fromLayout ? '' : (anim.get(String(id)) && anim.get(String(id)).para ? '' : fragAttr(id));
        const label = at(nv, 'descr');
        if (isLine) { // straight line with optional arrowheads, as SVG
          if (!line) return ''; const w = Math.max(b.w, 1), h = Math.max(b.h, 1); const x1 = b.flipH ? w : 0, y1 = b.flipV ? h : 0, x2 = b.flipH ? 0 : w, y2 = b.flipV ? 0 : h;
          const mk = (k, t) => t ? `<marker id="${k}" viewBox="0 0 10 10" refX="${k[0] === 'h' ? 1 : 9}" refY="5" markerWidth="${Math.max(4, 3)}" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${line.color}"/></marker>` : '';
          const uid = 'm' + slideNo + '_' + id; const bb = { x: b.x, y: b.y, w: Math.max(b.w, 0.1), h: Math.max(b.h, 0.1), rot: b.rot };
          const elbow = /bentConnector/.test(prst || '') ? `M${x1} ${y1}L${(x1 + x2) / 2} ${y1}L${(x1 + x2) / 2} ${y2}L${x2} ${y2}` : `M${x1} ${y1}L${x2} ${y2}`;
          return `<svg${frag} style="${pos(bb, ox, oy)}; overflow: visible" viewBox="0 0 ${r1(w)} ${r1(h)}" preserveAspectRatio="none" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}><defs>${mk('h' + uid, line.head)}${mk('t' + uid, line.tail)}</defs><path d="${elbow}" fill="none" stroke="${line.color}" stroke-width="${line.w}" vector-effect="non-scaling-stroke"${line.dash ? ` stroke-dasharray="${dashSVG(line.dash, line.w)}"` : ''}${line.head ? ` marker-start="url(#h${uid})"` : ''}${line.tail ? ` marker-end="url(#t${uid})"` : ''}/></svg>`;
        }
        const svgPath = cust ? customPath(cust, b.w, b.h) : prst && !/^(rect|roundRect|ellipse|snip|flowChartProcess|flowChartAlternateProcess|round)/.test(prst) ? presetPath(prst, b.w, b.h, av) : null;
        if (prst && !cust && !svgPath && !/^(rect|roundRect|ellipse|flowChartProcess|flowChartAlternateProcess)$/.test(prst)) warn('shape-' + prst, `Shape “${prst}” drawn as a rectangle`);
        const box = pos(b, ox, oy); const a11y = label ? ` role="img" aria-label="${esc(label)}"` : '';
        if (svgPath) {
          const paint = `fill="${fill && fill !== 'transparent' && !/gradient/.test(fill) ? fill : /gradient/.test(fill || '') ? (fill.match(/(#[0-9A-F]{6}|rgba\([^)]*\))/i) || ['none'])[0] : 'none'}"` + (line ? ` stroke="${line.color}" stroke-width="${line.w}"${line.dash ? ` stroke-dasharray="${dashSVG(line.dash, line.w)}"` : ''}` : '');
          const svg = `<svg style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible" viewBox="0 0 ${r1(b.w)} ${r1(b.h)}" preserveAspectRatio="none" aria-hidden="true"><path d="${svgPath}" ${paint} vector-effect="non-scaling-stroke"/></svg>`;
          return `<div${frag} style="${box}"${!hasText ? a11y : ''}>${svg}${textHTML}</div>`;
        }
        const radius = prst === 'ellipse' ? '50%' : prst === 'roundRect' || prst === 'flowChartAlternateProcess' ? r1(Math.min(b.w, b.h) * ((av.adj != null ? av.adj : 16667) / 100000)) + 'px' : null;
        const deco = [fill && fill !== 'transparent' ? `background: ${fill}` : '', line ? `border: ${line.w}px ${dashCSS(line.dash)} ${line.color}` : '', radius ? `border-radius: ${radius}` : '', 'box-sizing: border-box'].filter(Boolean).join('; ');
        if (hasText) return `<${textTag}${frag} style="${box}; ${deco}; ${textCSS}">${textInner}</${textTag}>`;
        return `<div${frag} style="${box}; ${deco}"${a11y}></div>`;
      }

      async function picHTML(pic, T, ox, oy, fromLayout, rr) {
        const nv = path(pic, 'nvPicPr', 'cNvPr'); const id = at(nv, 'id'); const spPr = kid(pic, 'spPr'); const ph = phOf(pic);
        const xf = kid(spPr, 'xfrm') || (ph ? kid(kid(findPh(layoutTree, ph), 'spPr'), 'xfrm') : null); if (!xf) return '';
        const b = boxOf(xf, T); const frag = fromLayout ? '' : fragAttr(id);
        const deco = descs(nv, 'decorative').some(d => at(d, 'val') === '1'); const alt = deco ? '' : (at(nv, 'descr') || at(nv, 'title') || '');
        const nvPr = path(pic, 'nvPicPr', 'nvPr'); const vid = kid(nvPr, 'videoFile'), aud = kid(nvPr, 'audioFile'); const p14 = desc(nvPr, 'media');
        const blipFill = kid(pic, 'blipFill'); const blip = kid(blipFill, 'blip');
        if (vid || aud || p14) { const relId = at(p14, 'r:embed') || at(vid || aud, 'r:link'); const rel = rr[relId];
          if (rel && !rel.external) { const m = await media(rel.target); if (m) { const isAud = !!aud || /^audio/.test(MIME[m.ext] || ''); const poster = blip ? rr[at(blip, 'r:embed')] : null; const pm = poster && !isAud ? await media(poster.target) : null;
              if (/wmv|avi|wma/.test(m.ext)) warn('media-' + m.ext, `${m.ext.toUpperCase()} media can’t play in browsers; convert it to MP4 or MP3`);
              return `<${isAud ? 'audio' : 'video'}${frag} controls preload="metadata"${isAud ? '' : ' playsinline'}${pm ? ` poster="${pm.url}"` : ''} title="${esc(alt || (isAud ? 'Audio' : 'Video'))}" style="${pos(b, ox, oy)}${isAud ? '' : '; background: #000000; object-fit: contain'}"><source src="${m.url}" type="${MIME[m.ext] || ''}"></${isAud ? 'audio' : 'video'}>`; } }
          if (rel && rel.external) { const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/.exec(rel.target); if (yt) return `<div${frag} class="sw-embed" style="${pos(b, ox, oy)}; background: #000000"><iframe data-src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&amp;cc_load_policy=1" title="${esc(alt || 'YouTube video')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="width: 100%; height: 100%; border: 0; display: block"></iframe></div>`; }
          warn('media-missing', 'A video or audio clip linked outside the file was left out'); }
        if (!blip) return '';
        const svgExt = descs(blip, 'svgBlip')[0]; const relId = (svgExt && at(svgExt, 'r:embed')) || at(blip, 'r:embed'); const rel = rr[relId];
        if (!rel || rel.external) { warn('pic-link', 'Linked pictures (not stored in the file) were left out'); return ''; }
        const m = await media(rel.target); if (!m) return '';
        if (/^(emf|wmf|tif|tiff)$/.test(m.ext)) { warn('pic-' + m.ext, `${m.ext.toUpperCase()} pictures can’t be shown in browsers; replace them with PNG or SVG`); return `<div${frag} style="${pos(b, ox, oy)}; box-sizing: border-box; border: 2px dashed #B9BEC8; display: flex; align-items: center; justify-content: center; color: #7A8292; font-size: 14px; text-align: center">${esc(m.ext.toUpperCase())} picture: replace it</div>`; }
        const src = kid(blipFill, 'srcRect'); const l = num(src, 'l', 0) / 100000, t = num(src, 't', 0) / 100000, r = num(src, 'r', 0) / 100000, bt = num(src, 'b', 0) / 100000;
        const altAttr = ` alt="${esc(alt)}"`; if (!alt && !deco) warn('alt', 'Pictures without alt text (Check finds them)');
        const prst = at(kid(spPr, 'prstGeom'), 'prst'); const round = prst === 'ellipse' ? '; border-radius: 50%' : prst === 'roundRect' ? `; border-radius: ${r1(Math.min(b.w, b.h) * 0.1667)}px` : '';
        if (l || t || r || bt) { const fw = 1 - l - r, fh = 1 - t - bt;
          return `<div${frag} style="${pos(b, ox, oy)}; overflow: hidden${round}"${alt ? ` role="img" aria-label="${esc(alt)}"` : ' aria-hidden="true"'}><img src="${m.url}" alt="" style="position: absolute; left: ${r1(-l / fw * 100)}%; top: ${r1(-t / fh * 100)}%; width: ${r1(100 / fw)}%; height: ${r1(100 / fh)}%; max-width: none"></div>`; }
        return `<img${frag} src="${m.url}"${altAttr} style="${pos(b, ox, oy)}; object-fit: fill${round}">`;
      }

      async function frameHTML(gf, T, ox, oy, rr) {
        const nv = path(gf, 'nvGraphicFramePr', 'cNvPr'); const id = at(nv, 'id'); const b = boxOf(kid(gf, 'xfrm'), T); const gd = path(gf, 'graphic', 'graphicData'); const uri = at(gd, 'uri') || ''; const frag = fragAttr(id);
        if (/table$/.test(uri)) return tableHTML(kid(gd, 'tbl'), b, ox, oy, frag, rr);
        if (/chart$/.test(uri)) { const rel = rr[at(desc(gd, 'chart'), 'r:id')]; return rel ? chartHTML(rel.target, b, ox, oy, frag, at(nv, 'descr'), ctx) : ''; }
        if (/diagram$/.test(uri)) { const dm = desc(gd, 'relIds'); const dataRel = dm && rr[at(dm, 'r:dm')]; let drawP = null;
          if (dataRel) { const dr = await rels(dataRel.target); const x = Object.values(dr).find(v => /diagramDrawing/.test(v.type)); if (x) drawP = x.target; const dd = await xml(dataRel.target); const ext = desc(dd, 'dataModelExt'); if (!drawP && ext) { const rid = at(ext, 'relId'); if (rr[rid]) drawP = rr[rid].target; } }
          if (!drawP) { const x = Object.values(rr).find(v => /diagramDrawing/.test(v.type)); if (x) drawP = x.target; }
          const drawing = drawP ? await xml(drawP) : null; if (!drawing) { warn('smartart', 'SmartArt without a saved drawing was left out'); return ''; }
          const dRels = await rels(drawP); const off = kid(kid(gf, 'xfrm'), 'off'); const T2 = v => T([num(off, 'x', 0) + v[0], num(off, 'y', 0) + v[1]]);
          let inner = ''; for (const c of kids(desc(drawing, 'spTree'))) if (/^(sp|pic|grpSp|cxnSp)$/.test(ln(c))) inner += await shapeHTML(c, T2, b.x, b.y, false, dRels);
          return `<div${frag} style="${pos(b, ox, oy)}"${at(nv, 'descr') ? ` role="group" aria-label="${esc(at(nv, 'descr'))}"` : ''}>${inner}</div>`; }
        const fb = desc(gf, 'Fallback'); const pic = fb ? desc(fb, 'pic') : null; if (pic) return picHTML(pic, T, ox, oy, false, rr);
        warn('ole', 'Embedded objects without a preview picture were left out'); return '';
      }

      async function tableHTML(tbl, b, ox, oy, frag, rr) {
        const tblPr = kid(tbl, 'tblPr'); const flag = k => at(tblPr, k) === '1'; const firstRow = flag('firstRow'), bandRow = flag('bandRow'), firstCol = flag('firstCol'), lastRow = flag('lastRow');
        const styleId = kid(tblPr, 'tableStyleId') ? kid(tblPr, 'tableStyleId').textContent.trim() : (tableStyles ? at(tableStyles, 'def') : null);
        const st = styleId && tableStyles ? kids(tableStyles, 'tblStyle').find(s => at(s, 'styleId') === styleId) : null;
        const part = k => st ? kid(st, k) : null;
        const partFill = k => { const p = part(k); const f = p && path(p, 'tcStyle', 'fill'); if (f) return fillCSS(f, ctx); const r = p && path(p, 'tcStyle', 'fillRef'); return r ? refFill(r, ctx) : null; };
        const partText = k => { const p = part(k) && kid(part(k), 'tcTxStyle'); if (!p) return null; return { b: at(p, 'b') === 'on', color: colorChild(p) ? css(colorOf(colorChild(p), ctx)) : null }; };
        const partBorder = (k, side) => { const p = part(k); const e = p && path(p, 'tcStyle', 'tcBdr', side); const l = e && kid(e, 'ln'); if (!l || kid(l, 'noFill')) return null; const c = kid(l, 'solidFill'); return c ? `${r1(num(l, 'w', 12700) * EMU_PX)}px solid ${css(colorOf(colorChild(c), ctx))}` : null; };
        const builtIn = !st; const acc = '#' + ctx.scheme('accent1'); const accRGB = hex2rgb(ctx.scheme('accent1'));
        const tintOf = f => css({ rgb: accRGB.map(x => Math.round(x + (255 - x) * f)), a: 1 });
        const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map(c => num(c, 'w', 0) * EMU_PX); const rows = kids(tbl, 'tr');
        let h = `<table${frag} style="${pos(b, ox, oy).replace(/height: [\d.]+px/, 'height: auto')}; border-collapse: collapse; table-layout: fixed; font-family: ${baseFont}; color: ${textColor}"><colgroup>${cols.map(w => `<col style="width: ${r1(w)}px">`).join('')}</colgroup>`;
        const sh = { ctx, family: 'otherStyle', fontScale: 1, color: textColor, font: '+mn-lt', baseFont, lstStyles: [] };
        if (firstRow) h += '<thead>';
        for (let ri = 0; ri < rows.length; ri++) { const tr = rows[ri]; if (firstRow && ri === 1) h += '</thead><tbody>'; if (!firstRow && ri === 0) h += '<tbody>';
          h += `<tr style="height: ${r1(num(tr, 'h', 0) * EMU_PX)}px">`; const tcs = kids(tr, 'tc');
          for (let ci = 0; ci < tcs.length; ci++) { const tc = tcs[ci]; if (at(tc, 'hMerge') === '1' || at(tc, 'vMerge') === '1') continue;
            const isHead = firstRow && ri === 0, isFirstCol = firstCol && ci === 0, isLast = lastRow && ri === rows.length - 1, band = bandRow && ((ri - (firstRow ? 1 : 0)) % 2 === 0);
            const tcPr = kid(tc, 'tcPr'); let bg = fillCSS(tcPr, ctx); let tx = null;
            if (!bg) bg = isHead ? partFill('firstRow') : isLast ? partFill('lastRow') : isFirstCol ? partFill('firstCol') : band ? partFill('band1H') : null; if (!bg) bg = partFill('wholeTbl');
            tx = isHead ? partText('firstRow') : isFirstCol ? partText('firstCol') : isLast ? partText('lastRow') : null;
            if (builtIn) { if (isHead) { bg = bg || acc; tx = { b: true, color: '#FFFFFF' }; } else if (!bg) bg = band ? tintOf(0.6) : tintOf(0.8); }
            const borders = ['L', 'R', 'T', 'B'].map(sd => { const l = kid(tcPr, 'ln' + sd); if (l && kid(l, 'solidFill')) return `border-${{ L: 'left', R: 'right', T: 'top', B: 'bottom' }[sd]}: ${r1(num(l, 'w', 12700) * EMU_PX)}px solid ${css(colorOf(colorChild(kid(l, 'solidFill')), ctx))}`;
              const s2 = partBorder('wholeTbl', { L: 'left', R: 'right', T: 'top', B: 'bottom' }[sd]) || partBorder('wholeTbl', sd === 'L' || sd === 'R' ? 'insideV' : 'insideH'); return s2 ? `border-${{ L: 'left', R: 'right', T: 'top', B: 'bottom' }[sd]}: ${s2}` : builtIn ? `border-${{ L: 'left', R: 'right', T: 'top', B: 'bottom' }[sd]}: 1px solid #FFFFFF` : ''; }).filter(Boolean);
            const sh2 = Object.assign({}, sh, { color: (tx && tx.color) || textColor }); const paras = await paragraphs(kid(tc, 'txBody'), sh2, rr, slideNo);
            const pad = k => (at(tcPr, k) != null ? num(tcPr, k, 0) : (k === 'marL' || k === 'marR' ? 91440 : 45720)) * EMU_PX;
            const tag = isHead ? 'th' : isFirstCol && firstCol ? 'th' : 'td'; const scope = isHead ? ' scope="col"' : tag === 'th' ? ' scope="row"' : '';
            const span = (at(tc, 'gridSpan') ? ` colspan="${at(tc, 'gridSpan')}"` : '') + (at(tc, 'rowSpan') ? ` rowspan="${at(tc, 'rowSpan')}"` : '');
            const va = { ctr: 'middle', b: 'bottom' }[at(tcPr, 'anchor')] || 'top';
            h += `<${tag}${scope}${span} style="padding: ${r1(pad('marT'))}px ${r1(pad('marR'))}px ${r1(pad('marB'))}px ${r1(pad('marL'))}px; vertical-align: ${va}; text-align: left${bg ? `; background: ${bg}` : ''}${tx && tx.b ? '; font-weight: 700' : '; font-weight: 400'}${tx && tx.color ? `; color: ${tx.color}` : ''}${borders.length ? '; ' + borders.join('; ') : ''}">${paragraphsHTML(paras)}</${tag}>`; }
          h += '</tr>'; }
        h += firstRow && rows.length === 1 ? '</thead>' : '</tbody>'; return h + '</table>';
      }
      return { ctx, bgCSS, shapeHTML, ID, get title() { return title; }, set title(v) { title = v; }, layoutTree, masterTree, layout, lr, slide, sr };
    }

    /* ---------- charts: simple bar, column, line and pie charts as SVG ---------- */
    async function chartHTML(chartP, b, ox, oy, frag, descr, ctx) {
      const ch = await xml(chartP); const plot = desc(ch, 'plotArea'); const kinds = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'areaChart'];
      const kindEl = kids(plot).find(k => kinds.includes(ln(k))); const pts = c => kids(desc(c, 'strCache') || desc(c, 'numCache'), 'pt').sort((a, z) => num(a, 'idx', 0) - num(z, 'idx', 0)).map(p => kid(p, 'v') ? kid(p, 'v').textContent : '');
      const chartEl = desc(ch, 'chart'); const titleEl = desc(kid(chartEl, 'title'), 'rich'); let ttl = titleEl ? descs(titleEl, 't').map(t => t.textContent).join('') : '';
      const box = pos(b, ox, oy);
      if (!kindEl) { warn('chart', 'Charts other than bar, column, line and pie became a placeholder'); return `<div${frag} style="${box}; box-sizing: border-box; border: 2px dashed #B9BEC8; display: flex; align-items: center; justify-content: center; color: #7A8292">Chart: ${esc(ttl || 'not converted')}</div>`; }
      const kind = ln(kindEl), series = kids(kindEl, 'ser').map(s => ({ name: (desc(kid(s, 'tx'), 'v') || {}).textContent || '', cats: pts(kid(s, 'cat')), vals: pts(kid(s, 'val')).map(Number), color: (() => { const f = path(s, 'spPr', 'solidFill'); return f ? css(colorOf(colorChild(f), ctx)) : null; })() }));
      const pal = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(a => '#' + ctx.scheme(a));
      if (!ttl && series.length === 1 && at(kid(chartEl, 'autoTitleDeleted'), 'val') !== '1' && !/pie|doughnut/.test(kind)) ttl = series[0].name;
      const W = b.w, H = b.h, fs = r1(Math.max(13, Math.min(22, H / 26))), top = ttl ? fs * 3 : 14, left = fs * 4, right = 16, bottom = fs * 3 + (series.length > 1 ? fs * 2 : 0); const cw = W - left - right, chh = H - top - bottom;
      const all = series.flatMap(s => s.vals).filter(v => isFinite(v)); let max = Math.max(0, ...all), min = Math.min(0, ...all);
      const step = (() => { const raw = (max - min || 1) / 5, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw); })();
      max = Math.ceil(max / step - 1e-9) * step; min = Math.floor(min / step + 1e-9) * step; const span = max - min || 1;
      const yv = v => top + chh - (v - min) / span * chh; let g = '';
      const summary = (descr ? descr + '. ' : '') + (ttl ? ttl + ': ' : '') + series.map(s => `${s.name ? s.name + ': ' : ''}${s.cats.map((c, i) => `${c} ${s.vals[i]}`).join(', ')}`).join('; ');
      if (/pie|doughnut/.test(kind)) { const s = series[0] || { vals: [], cats: [] }; const tot = s.vals.reduce((a, v) => a + (v || 0), 0) || 1; const R = Math.min(cw, chh) / 2, cx = left + cw / 2 - 40, cy = top + chh / 2; let a0 = -Math.PI / 2;
        s.vals.forEach((v, i) => { const a1 = a0 + v / tot * Math.PI * 2; const big = a1 - a0 > Math.PI ? 1 : 0; g += `<path d="M${r1(cx)} ${r1(cy)}L${r1(cx + R * Math.cos(a0))} ${r1(cy + R * Math.sin(a0))}A${r1(R)} ${r1(R)} 0 ${big} 1 ${r1(cx + R * Math.cos(a1))} ${r1(cy + R * Math.sin(a1))}Z" fill="${pal[i % 6]}" stroke="#FFFFFF" stroke-width="2"/>`;
          g += `<rect x="${r1(cx + R + 24)}" y="${r1(top + i * 24)}" width="14" height="14" fill="${pal[i % 6]}"/><text x="${r1(cx + R + 44)}" y="${r1(top + i * 24 + 12)}" font-size="${fs}">${esc(s.cats[i])} (${v})</text>`; a0 = a1; }); }
      else { for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) g += `<line x1="${left}" x2="${r1(W - right)}" y1="${r1(yv(v))}" y2="${r1(yv(v))}" stroke="#E3E5E8"/><text x="${left - 8}" y="${r1(yv(v) + 4)}" font-size="${fs}" text-anchor="end" fill="#5A5F6B">${+v.toFixed(6)}</text>`;
        const cats = (series[0] || { cats: [] }).cats; const n = Math.max(1, cats.length), slot = cw / n;
        cats.forEach((c, i) => { g += `<text x="${r1(left + slot * (i + 0.5))}" y="${r1(top + chh + fs * 1.6)}" font-size="${fs}" text-anchor="middle" fill="#5A5F6B">${esc(c)}</text>`; });
        const horiz = kind.startsWith('bar') && at(kid(kindEl, 'barDir'), 'val') === 'bar';
        if (/bar/.test(kind)) { const bw = slot * 0.7 / Math.max(1, series.length); series.forEach((s, si) => s.vals.forEach((v, i) => { const x = left + slot * i + slot * 0.15 + bw * si; const y0 = yv(Math.max(0, v)), y1 = yv(Math.min(0, v)); g += `<rect x="${r1(x)}" y="${r1(y0)}" width="${r1(bw)}" height="${r1(Math.max(0.5, y1 - y0))}" fill="${s.color || pal[si % 6]}"/>`; })); if (horiz) warn('chart-bar', 'Horizontal bar charts were drawn as columns'); }
        else series.forEach((s, si) => { const d = s.vals.map((v, i) => `${i ? 'L' : 'M'}${r1(left + slot * (i + 0.5))} ${r1(yv(v))}`).join(''); g += `<path d="${d}" fill="none" stroke="${s.color || pal[si % 6]}" stroke-width="3"/>` + s.vals.map((v, i) => `<circle cx="${r1(left + slot * (i + 0.5))}" cy="${r1(yv(v))}" r="4" fill="${s.color || pal[si % 6]}"/>`).join(''); });
        g += `<line x1="${left}" x2="${r1(W - right)}" y1="${r1(yv(0))}" y2="${r1(yv(0))}" stroke="#9AA0AC"/>`;
        if (series.length > 1) series.forEach((s, si) => { g += `<rect x="${r1(left + si * 150)}" y="${r1(H - 18)}" width="14" height="14" fill="${s.color || pal[si % 6]}"/><text x="${r1(left + si * 150 + 20)}" y="${r1(H - 6)}" font-size="${fs}">${esc(s.name)}</text>`; }); }
      if (ttl) g += `<text x="${r1(W / 2)}" y="${r1(fs * 1.8)}" font-size="${r1(fs * 1.3)}" font-weight="600" text-anchor="middle">${esc(ttl)}</text>`;
      return `<svg${frag} style="${box}" viewBox="0 0 ${r1(W)} ${r1(H)}" role="img" aria-label="${esc(summary)}" font-family="${esc(fontStack(ctx.fonts.minor))}" fill="#16181D">${g}</svg>`;
    }

    /* ---------- animations: click builds from p:timing ---------- */
    function animations(slide) {
      const res = new Map(); const tm = kid(slide, 'timing'); if (!tm) return res;
      const main = descs(tm, 'cTn').find(c => at(c, 'nodeType') === 'mainSeq'); if (!main) return res;
      let k = -1; const bld = {}; for (const b of descs(kid(tm, 'bldLst'), 'bldP')) bld[at(b, 'spid')] = at(b, 'build');
      for (const top of kids(kid(main, 'childTnLst'), 'par')) {
        const effects = descs(top, 'cTn').filter(c => at(c, 'presetClass')); if (!effects.length) continue;
        if (effects.some(e => at(e, 'nodeType') === 'clickEffect') || k < 0 && effects.some(e => at(e, 'nodeType') !== 'withEffect' && at(e, 'nodeType') !== 'afterEffect')) k++;
        if (k < 0) continue; // effects that run by themselves when the slide starts: shown from the start
        for (const e of effects) { const tgt = desc(e, 'spTgt'); if (!tgt) continue; const id = at(tgt, 'spid'); const cls = at(e, 'presetClass'), pid = num(e, 'presetID', 0), sub = num(e, 'presetSubtype', 0);
          let fx = ''; if (cls === 'entr') fx = pid === 2 || pid === 12 || pid === 47 ? ({ 4: 'fade-up', 1: 'fade-down', 8: 'fade-right', 2: 'fade-left' }[sub] || 'fade-up') : '';
          else if (cls === 'exit') fx = 'fade-out'; else if (cls === 'emph') fx = pid === 6 ? 'grow' : pid === 9 ? 'semi-fade-out' : 'highlight-red'; else continue;
          const pr = desc(tgt, 'pRg'); const cur = res.get(id) || {};
          if (pr) { cur.para = cur.para || {}; for (let i = num(pr, 'st', 0); i <= num(pr, 'end', 0); i++) if (cur.para[i] == null) cur.para[i] = k; cur.fx = cur.fx || fx; }
          else if (cur.k == null) { cur.k = k; cur.fx = fx; } else if (cls === 'exit' && cur.k === k - 1 && !cur.fx) cur.fx = 'fade-in-then-out';
          res.set(id, cur); }
      }
      return res;
    }

    /* ---------- slides ---------- */
    const sections = []; let deckTitle = '';
    for (let i = 0; i < slideParts.length; i++) {
      const sp = slideParts[i], no = i + 1; const R = await renderSlide(sp, no); const slide = R.slide;
      const bg = await R.bgCSS(); let body = '';
      const showMaster = at(path(slide, 'cSld'), 'showMasterSp') !== '0' && at(R.layout, 'showMasterSp') !== '0';
      if (showMaster && R.masterTree) for (const c of kids(R.masterTree)) if (/^(sp|pic|grpSp|cxnSp|graphicFrame)$/.test(ln(c))) body += await R.shapeHTML(c, R.ID, 0, 0, true, await rels(R.ctx.masterP));
      if (at(path(slide, 'cSld'), 'showMasterSp') !== '0' && R.layoutTree) for (const c of kids(R.layoutTree)) if (/^(sp|pic|grpSp|cxnSp|graphicFrame)$/.test(ln(c))) body += await R.shapeHTML(c, R.ID, 0, 0, true, R.lr);
      for (const c of kids(path(slide, 'cSld', 'spTree'))) if (/^(sp|pic|grpSp|cxnSp|graphicFrame|AlternateContent)$/.test(ln(c))) body += await R.shapeHTML(c, R.ID, 0, 0, false, R.sr);
      // notes
      let notes = ''; const nRel = relOfType(R.sr, 'notesSlide'); if (nRel) { const nd = await xml(nRel.target); const bodySp = descs(nd, 'sp').find(s => { const p = phOf(s); return p && phType(p) === 'body'; });
        if (bodySp) { const ps = kids(kid(bodySp, 'txBody'), 'p').map(p => descs(p, 't').map(t => t.textContent).join('')).filter(t => t.trim()); if (ps.length) notes = `\n<aside class="notes">${ps.map(t => `<p>${esc(t)}</p>`).join('')}</aside>`; } }
      // transition
      let tr = ''; const trEl = kid(slide, 'transition') || (() => { const ac = kid(slide, 'AlternateContent'); return ac ? desc(kid(ac, 'Fallback') || kid(ac, 'Choice'), 'transition') : null; })();
      if (trEl) { const kind = kids(trEl)[0] ? ln(kids(trEl)[0]) : 'fade'; const t = { fade: 'fade', cut: 'none', push: 'slide', pull: 'slide', cover: 'slide', wipe: 'slide', split: 'slide', zoom: 'zoom', newsflash: 'zoom', vortex: 'zoom' }[kind] || 'fade';
        tr = ` data-transition="${t}"`; const spd = at(trEl, 'spd'); if (spd === 'slow' || spd === 'fast') tr += ` data-transition-speed="${spd}"`; }
      const hidden = at(slide, 'show') === '0' ? ' data-visibility="hidden"' : '';
      const title = R.title || `Slide ${no}`; if (!deckTitle && R.title) deckTitle = R.title;
      sections.push(`<section data-title="${esc(title)}"${tr}${hidden}>\n<div style="position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: ${bg}">\n${body}\n</div>${notes}\n</section>`);
      if (opts.onProgress) opts.onProgress(no, slideParts.length);
    }

    const name = (opts.name || 'presentation').replace(/\.pptx?$/i, '');
    const revealCss = opts.revealCss ? `<style>\n${opts.revealCss}\n</style>` : '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">';
    const revealJs = opts.revealJs ? `<script>\n${opts.revealJs.replace(/<\/script/gi, '<\\/script')}\n</script>` : '<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>';
    const html = `<!doctype html>
<html lang="${esc(opts.lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Slidewright pptx2reveal">
<title>${esc(deckTitle || name)}</title>
${revealCss}
<style>
html,body{background:#FFFFFF}
.reveal{font-size:16px}
.reveal .slides{text-align:left}
.reveal .slides section{padding:0;width:${W}px;height:${H}px;box-sizing:border-box;line-height:normal}
.reveal .slides section > div{position:absolute;left:0;top:0}
.reveal .slides section p,.reveal .slides section ul,.reveal .slides section ol{margin:0}
.reveal .slides section li::marker{color:var(--bu,inherit)}
.reveal .slides section a{color:inherit}
.reveal .controls,.reveal .progress{color:#2557D6}
</style>
</head>
<body>
<div class="reveal"><div class="slides">
${sections.join('\n')}
</div></div>
${revealJs}
<script>
Reveal.initialize({width:${W},height:${H},margin:0.04,minScale:0.05,maxScale:20,center:false,hash:true,controls:true,progress:true,slideNumber:false,transition:'fade'});
</script>
</body>
</html>
`;
    return { html, report: { slides: slideParts.length, width: W, height: H, mediaMB: Math.round(mediaBytes / 1e5) / 10, warnings: [...warnings.values()].map(w => (w.n > 1 ? `${w.msg} (${w.n})` : w.msg)) } };
  }
  return { convert };
});
