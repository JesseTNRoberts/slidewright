'use strict';
/* Notes to Claude, and Send to Claude.
   A note is a request for Claude ("make this a two-column comparison"), pinned to a slide or to one item on it.
   Notes live in the deck as <aside class="sw-claude-notes" hidden> inside the slide, one <p> per note; a note on an
   item names it with data-on="nK", and the item carries data-claude-note="nK". Hidden asides never show when
   presenting, in thumbnails or in the PDF. board-to-reveal/diff.js reports them when the deck goes back to Claude. */

function notesBox(sec, make){
  let a = sec.querySelector(':scope > aside.sw-claude-notes');
  if(!a && make){ a = document.createElement('aside'); a.className = 'sw-claude-notes'; a.hidden = true; a.setAttribute('aria-hidden', 'true'); sec.appendChild(a); }
  return a;
}
const notesOn = sec => { const a = sec && notesBox(sec, false); return a ? [...a.children] : []; };
const noteTarget = (sec, n) => { const id = n.getAttribute('data-on'); return id ? sec.querySelector(`[data-claude-note="${CSS.escape(id)}"]`) : null; };
function allNotes(){ return S.slides.reduce((k, s) => k + notesOn(s).length, 0); }

async function noteDialog(title, text, canDelete){
  const ta = document.createElement('textarea'); ta.rows = 5; ta.value = text || ''; ta.placeholder = 'What should Claude do here? e.g. “Turn this into a two-column comparison” or “Redraw this diagram with three experts”';
  ta.style.cssText = 'width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--ink)';
  const w = document.createElement('div'); w.className = 'stack';
  const p = document.createElement('p'); p.className = 'hint'; p.style.margin = '0 0 8px'; p.textContent = 'Notes are for Claude only. They are saved in the deck but never shown when presenting. Send to Claude (Review tab) takes them, with your edits, back to the board.';
  w.append(p, ta); setTimeout(() => ta.focus(), 30);
  const v = await modal(title, w, [...(canDelete ? [['Delete note', 'del']] : []), ['Cancel', null], ['Save note', 'ok', 'primary']]);
  return v === 'ok' ? { text: ta.value.trim() } : v === 'del' ? { del: true } : null;
}

// target: an item, null for the slide, or left out to use the selection (one item) or else the slide
async function addClaudeNote(target){
  const sec = curSec(); if(!sec) return; endEdit();
  if(target === undefined || (target && !(target instanceof Element))) target = S.sel.filter(e => e.isConnected).length === 1 ? S.sel[0] : null;
  const r = await noteDialog(target ? 'Note to Claude about this item' : 'Note to Claude about this slide', '', false);
  if(!r || !r.text) return;
  const box = notesBox(sec, true), p = document.createElement('p');
  if(target){
    let id = target.getAttribute('data-claude-note');
    if(!id){ let k = 1; while(sec.querySelector(`[data-claude-note="n${k}"]`) || box.querySelector(`[data-on="n${k}"]`)) k++; id = 'n' + k; target.setAttribute('data-claude-note', id); }
    p.setAttribute('data-on', id);
  }
  p.textContent = r.text; box.appendChild(p);
  commit('Note to Claude'); drawOverlay(); renderNoteCount();
  toast('Note saved. It stays out of the presentation.');
}

async function editClaudeNote(sec, n){
  const r = await noteDialog('Note to Claude', n.textContent, true); if(!r) return;
  if(r.del){
    const t = noteTarget(sec, n); const id = n.getAttribute('data-on'); n.remove();
    if(t && !notesOn(sec).some(x => x.getAttribute('data-on') === id)) t.removeAttribute('data-claude-note');
    const box = notesBox(sec, false); if(box && !box.children.length) box.remove();
    commit('Delete note to Claude');
  } else if(r.text && r.text !== n.textContent){ n.textContent = r.text; commit('Edit note to Claude'); }
  else return;
  drawOverlay(); renderNoteCount();
}

/* pins on the stage */
function drawNotes(){
  if(!S.slides.length || (typeof PV !== 'undefined' && PV.on)) return;
  const sec = curSec(); const list = notesOn(sec); if(!list.length) return;
  const sb = stageBox.getBoundingClientRect(); let free = 0; const taken = new Map();
  list.forEach((n, i) => {
    const t = noteTarget(sec, n); let x, y;
    if(t && t.isConnected && t.getClientRects().length){ const r = rectOf(t); const k = taken.get(t) || 0; taken.set(t, k + 1); x = r.x + r.w - 6 + k * 22; y = r.y - 14; }
    else { x = sb.width - 34 - (free % 8) * 26; y = 10 + Math.floor(free / 8) * 26; free++; }
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'sw-note-pin';
    pin.style.left = Math.max(2, Math.min(sb.width - 24, x)) + 'px'; pin.style.top = Math.max(2, y) + 'px';
    pin.textContent = String(i + 1); pin.title = 'Note to Claude' + (t ? ' about this item' : ' about this slide') + ': ' + n.textContent;
    pin.setAttribute('aria-label', pin.title);
    pin.addEventListener('pointerdown', e => e.stopPropagation());
    pin.addEventListener('click', e => { e.stopPropagation(); editClaudeNote(sec, n); });
    overlay.appendChild(pin);
  });
}
const _drawOverlay = drawOverlay;
drawOverlay = function(){ const r = _drawOverlay.apply(this, arguments); drawNotes(); renderNoteCount(); return r; };
function renderNoteCount(){ const b = $('#rNoteCount'); if(!b) return; const k = allNotes(); b.textContent = k ? String(k) : ''; b.hidden = !k; }

/* Send to Claude: put the deck where Claude can read it, then open a new Claude chat with the request filled in. */
function deckMeta(n){ const m = S.doc && S.doc.querySelector(`meta[name="${n}"]`); return m ? m.getAttribute('content') : ''; }
function deckLink(){
  if(S.gdrive) return S.gdrive.link || `https://drive.google.com/file/d/${S.gdrive.id}/view`;
  if(S.gh) return `https://github.com/${S.gh.owner}/${S.gh.repo}/blob/${encodeURIComponent(S.gh.branch)}/${S.gh.path.split('/').map(encodeURIComponent).join('/')}`;
  return '';
}
function claudeRequest(link){
  const board = deckMeta('slidewright-board'), k = allNotes();
  const what = 'my Slidewright edits' + (k ? ` and ${k} note${k > 1 ? 's' : ''} to Claude` : '');
  const from = link ? `from ${link}` : `from the deck I’ve attached (${S.name})`;
  return board
    ? `Bring ${what} ${from} back to the board ${board}, using the lecture-deck-builder skill.`
    : `Here are ${what} ${from}. This deck has no board address, so ${k ? 'do what the notes ask and ' : ''}tell me how you’d like to continue: rebuild it as a Design board, or edit the deck directly.`;
}
async function sendToClaude(){
  endEdit();
  let link = deckLink();
  const where = S.gdrive ? 'Google Drive' : S.gh ? 'GitHub' : '';
  const body = document.createElement('div'); body.className = 'stack';
  const p1 = document.createElement('p'); p1.style.margin = '0 0 8px';
  p1.textContent = where
    ? `Slidewright saves the deck to ${where}, then opens a new Claude chat with the request filled in (press Send if Claude doesn’t start by itself). Claude reads the deck from ${where} and brings your edits${allNotes() ? ' and notes' : ''} back to the board.`
    : 'This deck isn’t saved to Google Drive or GitHub, where Claude can read it. Slidewright will download it; attach the file in the Claude chat that opens. (Saving to Google Drive first makes this one click next time.)';
  body.appendChild(p1);
  if(!deckMeta('slidewright-board')){ const p2 = document.createElement('p'); p2.className = 'hint'; p2.style.margin = '0'; p2.textContent = 'This deck didn’t come from a Claude board, so Claude will ask how you want to continue.'; body.appendChild(p2); }
  const v = await modal('Send to Claude', body, [...(where ? [] : [['Save to Google Drive instead', 'drive']]), ['Cancel', null], ['Send to Claude', 'ok', 'primary']]);
  if(v === 'drive'){ await saveToDrive(true); if(!S.gdrive) return; link = deckLink(); }
  else if(v !== 'ok') return;
  else if(where){ if(S.dirty) await save(false); if(S.dirty){ toast('The deck didn’t save, so nothing was sent.', 'warn'); return; } link = deckLink(); }
  else await saveLocal(true);
  const text = claudeRequest(link);
  try { await navigator.clipboard.writeText(text); } catch(_){}
  const w = window.open('https://claude.ai/new?q=' + encodeURIComponent(text), '_blank', 'noopener');
  toast(w === null ? 'Your browser blocked the new tab. The request is on your clipboard: paste it into a new Claude chat.' : 'Opened Claude with your request (also on your clipboard).');
}

/* right-click a slide in the list: note to Claude about that slide */
$('#slideList').addEventListener('contextmenu', e => {
  const li = e.target.closest('#slideList > li'); if(!li) return; e.preventDefault();
  const i = [...$('#slideList').children].indexOf(li); if(i < 0) return; go(i);
  ctxMenu(e.clientX, e.clientY, [['Note to Claude about this slide…', () => addClaudeNote(null)], '-',
    ['Duplicate slide', () => $('#sDup').click()], S.slides.length > 1 ? ['Delete slide', () => $('#sDel').click(), null, 'danger'] : null]);
});
/* right-click a note pin: edit it */
overlay.addEventListener('contextmenu', e => { const pin = e.target.closest('.sw-note-pin'); if(!pin) return; e.preventDefault(); e.stopPropagation(); pin.click(); }, true);

renderNoteCount();
if(window.__deckEditor) Object.assign(window.__deckEditor, { addClaudeNote, sendToClaude, claudeRequest, deckLink });
