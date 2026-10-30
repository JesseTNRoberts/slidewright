#!/usr/bin/env node
// diff.js — what changed between a board export and the same deck after editing in Slidewright.
//
//   node diff.js <baseline.html> <edited.html> [--json]
//
// <baseline.html> is a fresh export of the board (or the export the edits started from).
// <edited.html>   is the deck saved from Slidewright.
// Slides are matched by data-board-slide (written by build.js), so reordering, hiding and
// deleting slides are reported as such. Inside a slide, elements are matched by id, tag and
// text, and every difference is listed: text, position and size, other style, attributes,
// click builds, removed and added items, speaker notes, and notes to Claude
// (<aside class="sw-claude-notes"> written by Slidewright).
// The report is for Claude to apply to the board by hand, with the smallest matching edit.
'use strict';
const fs = require('fs');
const { parseHTML } = require('linkedom');

const SKIP = '.slide-copy, .pdf-get, .sw-present, aside.notes, aside.sw-claude-notes, script, style';
const POS = new Set(['left', 'top', 'right', 'bottom', 'transform', 'translate', 'inset', 'margin-left', 'margin-top']);
const SIZE = new Set(['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height']);

function load(file) {
  const { document } = parseHTML(fs.readFileSync(file, 'utf8'));
  const meta = n => { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.getAttribute('content') : ''; };
  const secs = [...document.querySelectorAll('.reveal .slides > section, .slides > section')];
  return { board: meta('slidewright-board'), exported: meta('slidewright-board-export'), secs: [...new Set(secs)] };
}

const norm = s => (s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 70) => { s = norm(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const shortVal = v => /^data:/.test(v) ? v.slice(0, 30) + `… (${v.length} chars)` : clip(v, 90);
function styleMap(el) {
  const m = {};
  (el.getAttribute('style') || '').split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) m[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); });
  return m;
}
const allText = el => { const out = []; (function walk(n) { for (const c of n.childNodes) c.nodeType === 3 ? out.push(c.textContent) : c.nodeType === 1 && walk(c); })(el); return norm(out.join(' ')); };
const ownText = el => norm([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
const kids = el => [...el.children].filter(c => !c.matches(SKIP));
function label(el) {
  let s = el.tagName.toLowerCase();
  if (el.id) s += '#' + el.id;
  else if (el.getAttribute('class')) s += '.' + el.getAttribute('class').trim().split(/\s+/).filter(c => c !== 'fragment' && c !== 'visible').slice(0, 2).join('.');
  const t = clip(allText(el), 50); if (t) s += ` "${t}"`;
  else if (el.getAttribute('alt')) s += ` [alt: ${clip(el.getAttribute('alt'), 40)}]`;
  else if (el.getAttribute('aria-label')) s += ` [${clip(el.getAttribute('aria-label'), 40)}]`;
  return s;
}
// the item itself with its text, after its two nearest parents, e.g.  div > div > div "1. Gradients vanish"
function where(el, root) {
  const path = []; let e = el.parentElement;
  while (e && e !== root && path.length < 2) { path.unshift(label(e).replace(/ ["\[].*$/, '')); e = e.parentElement; }
  return [...path, label(el)].join(' > ');
}
const key = el => el.tagName + '|' + (el.id || '') + '|' + (el.id ? '' : (el.getAttribute('class') || '').replace(/\b(fragment|visible|current-fragment)\b/g, '').trim() + '|' + norm(el.textContent).slice(0, 40));

// Align two child lists: longest common subsequence on key, then pair what's left in each gap by tag.
function align(a, b) {
  const n = a.length, m = b.length, ka = a.map(key), kb = b.map(key);
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = ka[i] === kb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = [], gapsA = [[]], gapsB = [[]];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ka[i] === kb[j]) { pairs.push([a[i], b[j]]); gapsA.push([]); gapsB.push([]); i++; j++; }
    else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) gapsA[gapsA.length - 1].push(a[i++]);
    else gapsB[gapsB.length - 1].push(b[j++]);
  }
  const removed = [], added = [];
  gapsA.forEach((ga, g) => {
    const gb = gapsB[g].slice();
    ga.forEach(x => { const k = gb.findIndex(y => y.tagName === x.tagName); if (k >= 0) pairs.push([x, gb.splice(k, 1)[0]]); else removed.push(x); });
    added.push(...gb);
  });
  return { pairs, removed, added };
}

function compareEl(a, b, rootA, rootB, out) {
  const at = ownText(a), bt = ownText(b);
  if (at !== bt) out.push({ kind: 'text', item: where(a, rootA), before: clip(at, 200), after: clip(bt, 200) });
  const sa = styleMap(a), sb = styleMap(b);
  const props = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  const ch = { position: [], size: [], style: [] };
  props.forEach(p => { if ((sa[p] || '') !== (sb[p] || '')) (POS.has(p) ? ch.position : SIZE.has(p) ? ch.size : ch.style).push(`${p}: ${sa[p] || '(none)'} → ${sb[p] || '(none)'}`); });
  for (const k of ['position', 'size', 'style']) if (ch[k].length) out.push({ kind: k, item: where(a, rootA), changes: ch[k] });
  const attrs = new Set([...a.getAttributeNames(), ...b.getAttributeNames()]);
  const ca = c => new Set((c || '').split(/\s+/).filter(x => x && !['visible', 'current-fragment', 'present', 'past', 'future'].includes(x)));
  attrs.forEach(n => {
    if (n === 'style' || n === 'data-claude-note' || /^data-sw-/.test(n)) return;
    let va = a.getAttribute(n), vb = b.getAttribute(n);
    if (n === 'class') {
      const A = ca(va), B = ca(vb), plus = [...B].filter(x => !A.has(x)), minus = [...A].filter(x => !B.has(x));
      if (!plus.length && !minus.length) return;
      const build = [...plus, ...minus].some(x => x === 'fragment' || /^(fade|grow|shrink|highlight|strike|semi|current-visible)/.test(x));
      out.push({ kind: build ? 'build' : 'attr', item: where(a, rootA), changes: [...plus.map(x => '+class ' + x), ...minus.map(x => '−class ' + x)] });
      return;
    }
    if (va !== vb) out.push({ kind: n === 'data-fragment-index' ? 'build' : 'attr', item: where(a, rootA), changes: [`${n}: ${va == null ? '(none)' : shortVal(va)} → ${vb == null ? '(removed)' : shortVal(vb)}`] });
  });
  const r = align(kids(a), kids(b));
  r.removed.forEach(x => out.push({ kind: 'removed', item: where(x, rootA) }));
  r.added.forEach(x => out.push({ kind: 'added', item: label(x), inside: where(b, rootB) || 'slide', html: shortVal(x.outerHTML.replace(/\s+/g, ' ')), style: x.getAttribute('style') || '' }));
  r.pairs.forEach(([x, y]) => compareEl(x, y, rootA, rootB, out));
}

function notesOf(sec) {
  const n = sec.querySelector(':scope > aside.notes');
  return n ? norm(n.textContent) : '';
}
function claudeNotes(sec) {
  return [...sec.querySelectorAll(':scope > aside.sw-claude-notes > *')].map(p => {
    const id = p.getAttribute('data-on'), t = id ? sec.querySelector(`[data-claude-note="${id}"]`) : null;
    return { text: norm(p.textContent), on: t ? where(t, sec) : '' };
  });
}

function diff(baseFile, editFile) {
  const A = load(baseFile), B = load(editFile);
  const id = s => s.getAttribute('data-board-slide') || '';
  const title = s => s.getAttribute('data-title') || clip((s.querySelector('h1,h2,h3') || {}).textContent || '', 40);
  const byA = new Map(A.secs.map(s => [id(s), s]));
  const res = { board: B.board || A.board, exported: B.exported || A.exported, slides: [], order: null };
  const seen = new Set();
  B.secs.forEach((sb, i) => {
    const k = id(sb), sa = k && byA.get(k);
    const entry = { position: i + 1, boardSlide: k || null, title: title(sb), status: sa ? 'kept' : 'new', changes: [], notesToClaude: claudeNotes(sb) };
    if (sa) {
      seen.add(k);
      const ha = sa.getAttribute('data-visibility') === 'hidden', hb = sb.getAttribute('data-visibility') === 'hidden';
      if (ha !== hb) entry.changes.push({ kind: hb ? 'hidden' : 'unhidden', item: 'slide' });
      for (const n of ['data-transition', 'data-transition-speed', 'data-background-color', 'data-title'])
        if ((sa.getAttribute(n) || '') !== (sb.getAttribute(n) || '')) entry.changes.push({ kind: 'slide', item: 'slide', changes: [`${n}: ${sa.getAttribute(n) || '(none)'} → ${sb.getAttribute(n) || '(none)'}`] });
      if (notesOf(sa) !== notesOf(sb)) entry.changes.push({ kind: 'speaker notes', item: 'slide', before: notesOf(sa), after: notesOf(sb) });
      compareEl(sa, sb, sa, sb, entry.changes);
    } else {
      entry.html = sb.outerHTML.length > 4000 ? sb.outerHTML.slice(0, 4000) + '…' : sb.outerHTML;
      if (!k) entry.copyOf = null;
    }
    res.slides.push(entry);
  });
  A.secs.forEach(sa => { const k = id(sa); if (k && !seen.has(k)) res.slides.push({ position: null, boardSlide: k, title: title(sa), status: 'deleted', changes: [], notesToClaude: [] }); });
  const before = A.secs.map(id).filter(k => B.secs.some(s => id(s) === k)), after = B.secs.map(id).filter(k => byA.has(k));
  if (before.join() !== after.join()) res.order = after;
  res.untagged = !A.secs.some(id);
  return res;
}

function report(r) {
  const L = [];
  L.push('# Slidewright edits to bring back to the board', '');
  if (r.board) L.push(`Board: ${r.board}`); if (r.exported) L.push(`Exported: ${r.exported}`);
  if (r.untagged) L.push('', 'Warning: the baseline has no data-board-slide tags (exported before converter 1.9); slides were not matched by board file.');
  const busy = r.slides.filter(s => s.status !== 'kept' || s.changes.length || s.notesToClaude.length);
  if (r.order) L.push('', '## Slide order changed', '', r.order.map((k, i) => `${i + 1}. ${k}`).join('\n'));
  if (!busy.length && !r.order) { L.push('', 'No differences.'); return L.join('\n'); }
  for (const s of busy) {
    L.push('', `## ${s.status === 'kept' ? '' : s.status.toUpperCase() + ': '}${s.title || '(untitled)'}${s.boardSlide ? ` (${s.boardSlide})` : ''}`);
    if (s.status === 'new') L.push('', 'A slide made in Slidewright. Rebuild it as a board slide from this HTML:', '', '```html', s.html, '```');
    if (s.notesToClaude.length) L.push('');
    for (const n of s.notesToClaude) L.push(`- **Note to Claude** ${n.on ? `about ${n.on}` : 'about the slide'}: ${n.text}`);
    for (const c of s.changes) {
      if (c.kind === 'text') L.push(`- text of ${c.item}: "${c.before}" → "${c.after}"`);
      else if (c.kind === 'removed') L.push(`- removed ${c.item}`);
      else if (c.kind === 'added') L.push(`- added ${c.item} inside ${c.inside}${c.style ? ` (style: ${clip(c.style, 160)})` : ''}`);
      else if (c.kind === 'speaker notes') L.push(`- speaker notes: "${clip(c.before, 120)}" → "${clip(c.after, 120)}"`);
      else if (c.kind === 'hidden' || c.kind === 'unhidden') L.push(`- slide ${c.kind}`);
      else L.push(`- ${c.kind} of ${c.item}: ${c.changes.join('; ')}`);
    }
  }
  return L.join('\n');
}

module.exports = { diff, report };
if (require.main === module) {
  const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--'));
  if (pos.length < 2) { console.error('usage: node diff.js <baseline.html> <edited.html> [--json]'); process.exit(2); }
  const r = diff(pos[0], pos[1]);
  console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : report(r));
}
