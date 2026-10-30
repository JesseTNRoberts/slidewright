'use strict';
/* Ribbon: tabs across the top, one row of grouped commands underneath.
   Most ribbon controls are stand-ins for controls that already live in the properties panel:
   data-proxy="<selector>"  clicks that control (and copies its pressed / checked / disabled state)
   data-mirror="<selector>" a select or input that copies the panel control's options and value, and writes back to it
   data-fn="<name>"         calls a global function
   So the panel stays the single source of behaviour and the ribbon never needs its own logic per command. */
function presentFromStart(){ go(0); present(); }

const RB = { tab: 'home', min: false };
const ribbon = $('#ribbon');
const tabBtns = () => $$('#top .tab[data-tab]');

function unavailable(src, always){
  if(!src) return true;
  if(src.disabled) return true;
  if(!always && src.closest('[hidden]')) return true;
  return false;
}

function setTab(k, focus){
  const t = $(`#top .tab[data-tab="${k}"]`); if(!t || t.hidden) k = 'home';
  RB.tab = k;
  tabBtns().forEach(b => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  $$('#ribbon .rp').forEach(p => p.hidden = p.dataset.panel !== k);
  if(RB.min){ RB.min = false; $('#app').classList.remove('ribbon-min'); relayoutSoon(); }
  if(focus) $(`#top .tab[data-tab="${k}"]`).focus();
  ribbonSync();
}
function relayoutSoon(){ requestAnimationFrame(() => { try { applyZoom(); } catch(_){} }); }

tabBtns().forEach(b => {
  b.addEventListener('click', () => setTab(b.dataset.tab));
  b.addEventListener('dblclick', () => { RB.min = !RB.min; $('#app').classList.toggle('ribbon-min', RB.min); relayoutSoon(); });
  b.addEventListener('mousedown', e => e.preventDefault());
});
$('#top .tabs').addEventListener('keydown', e => {
  const vis = tabBtns().filter(b => !b.hidden); const i = vis.indexOf(document.activeElement); if(i < 0) return;
  let j = null;
  if(e.key === 'ArrowRight') j = (i + 1) % vis.length; else if(e.key === 'ArrowLeft') j = (i - 1 + vis.length) % vis.length;
  else if(e.key === 'Home') j = 0; else if(e.key === 'End') j = vis.length - 1;
  if(j != null){ e.preventDefault(); setTab(vis[j].dataset.tab, true); }
});

/* commands */
$$('#ribbon [data-proxy]').forEach(b => {
  b.addEventListener('mousedown', e => e.preventDefault());   // keep the text selection while typing
  b.addEventListener('click', () => { const src = $(b.dataset.proxy); if(unavailable(src)) return; src.click(); ribbonSync(); });
});
$$('#ribbon [data-fn]').forEach(b => b.addEventListener('click', () => { const f = window[b.dataset.fn]; if(typeof f === 'function') f(); }));
$('#rAlign').addEventListener('click', e => menu(e.currentTarget, [
  ['Align left', () => alignSel('l')], ['Align centres', () => alignSel('c')], ['Align right', () => alignSel('r')],
  ['Align top', () => alignSel('t')], ['Align middles', () => alignSel('m')], ['Align bottom', () => alignSel('b')],
  ...(S.sel.length > 2 ? [['Space evenly across', () => $('[data-dist="h"]').click()], ['Space evenly down', () => $('[data-dist="v"]').click()]] : [])]));

$$('#ribbon [data-mirror]').forEach(m => {
  const src = () => $(m.dataset.mirror);
  if(m.type === 'color'){
    m.addEventListener('input', () => { const s = src(); s.value = m.value; s.dispatchEvent(new Event('input', { bubbles: true })); });
    m.addEventListener('change', () => { const s = src(); s.value = m.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  } else {
    m.addEventListener('change', () => { const s = src(); s.value = m.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
    if(m.tagName === 'INPUT') m.addEventListener('keydown', e => { if(e.key === 'Enter') m.blur(); if(e.key === 'Escape'){ ribbonSync(); m.blur(); } });
  }
});

/* keep the ribbon in step with the panel */
function ribbonSync(){
  const sel = S.sel.filter(e => e.isConnected); const one = sel.length === 1 ? sel[0] : null;
  const ctx = { table: one && one.tagName === 'TABLE', picture: one && one.tagName === 'IMG', media: one && typeof isMediaEl === 'function' && isMediaEl(one) };
  for(const k in ctx){ const t = $(`#tab-${k}`); t.hidden = !ctx[k]; }
  if(ctx.media) $('#tab-media').textContent = $('#mHead').textContent || 'Media';
  if($(`#tab-${RB.tab}`).hidden) setTab('home');
  const panel = $(`#rp-${RB.tab}`);
  $$('[data-proxy]', panel).forEach(b => {
    const s = $(b.dataset.proxy); b.disabled = unavailable(s);
    if(s && s.type === 'checkbox') b.setAttribute('aria-pressed', String(s.checked));
    else if(s && s.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', s.getAttribute('aria-pressed'));
  });
  $$('[data-proxy-state]', panel).forEach(b => b.disabled = unavailable($(b.dataset.proxyState)));
  $$('[data-when="gh"]', panel).forEach(b => b.hidden = !S.gh);
  $$('[data-mirror]', panel).forEach(m => {
    const s = $(m.dataset.mirror); m.disabled = unavailable(s, m.hasAttribute('data-always'));
    if(!s) return;
    if(m.tagName === 'SELECT'){
      const sig = [...s.options].map(o => o.value + '\u0001' + o.text).join('\u0002');
      if(m._sig !== sig){ m.replaceChildren(...[...s.options].map(o => new Option(o.text, o.value))); m._sig = sig; }
    }
    if(document.activeElement !== m) m.value = s.value;
  });
}
let rbQueued = false;
function ribbonSoon(){ if(rbQueued) return; rbQueued = true; requestAnimationFrame(() => { rbQueued = false; ribbonSync(); }); }
new MutationObserver(ribbonSoon).observe($('#insp'), { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'aria-pressed'], childList: true });
new MutationObserver(ribbonSoon).observe($('#side'), { subtree: true, attributes: true, attributeFilter: ['disabled'] });
const _syncInspector = syncInspector;
syncInspector = function(){ const r = _syncInspector.apply(this, arguments); ribbonSoon(); return r; };

/* properties panel on / off (remembered per browser) */
function setPanel(on){ $('#app').classList.toggle('no-insp', !on); $('#bPanel').setAttribute('aria-pressed', String(on)); relayoutSoon(); try { localStorage.setItem('slidewright.panel', on ? '1' : '0'); } catch(_){} }
$('#bPanel').addEventListener('click', () => setPanel($('#app').classList.contains('no-insp')));
try { if(localStorage.getItem('slidewright.panel') === '0') setPanel(false); } catch(_){}

ribbonSync();
if(window.__deckEditor) Object.assign(window.__deckEditor, { setTab });
