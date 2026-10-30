/* Slidewright: core. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const deck=$('#deck'), deckSlides=$('#deckSlides'), stageBox=$('#stageBox'), stageScroll=$('#stageScroll'), overlay=$('#overlay');
const S={doc:null,host:null,name:'sample-deck.html',handle:null,slides:[],cur:0,layerIdx:new WeakMap(),sel:[],scope:null,editing:null,
  zoom:'fit',scale:1,showAlt:false,snap:true,W:1280,H:720,dirty:false,fonts:[],thumbCSS:'',guides:null,marq:null,hover:null,tag:null,clip:null,clipPlain:null,accent:'#2557D6'};
const origHTML=new WeakMap();
const INLINE=new Set(['b','i','em','strong','span','br','sub','sup','a','code','u','s','small','mark','abbr','kbd','var','q','cite','time','wbr','font','del','ins']);
const r1=v=>Math.round(v*10)/10, r0=v=>Math.round(v);

/* ======================= deck CSS ======================= */
function splitSel(s){const out=[];let d=0,cur='';for(const ch of s){if(ch==='('||ch==='[')d++;else if(ch===')'||ch===']')d--;if(ch===','&&!d){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out.map(x=>x.trim()).filter(Boolean);}
function scopeSel(sel){
  const parts=[];
  for(const s of splitSel(sel)){
    if(/print-pdf|reveal-viewport|reveal-full-page|reveal-scroll|:fullscreen|::backdrop|#pdf-progress/.test(s)) continue;
    if(/\.reveal(?![\w-])/.test(s)){parts.push(s);continue;}
    const m=s.match(/^(html|body|:root)((?:\[[^\]]*\]|\.[\w-]+|#[\w-]+|:[\w-]+(?:\([^)]*\))?)*)\s*(.*)$/i);
    if(m){ if(m[2]) continue; const rest=m[3].replace(/^[>+~]\s*/,'').replace(/^body\b\s*/i,''); parts.push(rest?'.de-deck '+rest:'.de-deck'); continue; }
    parts.push('.de-deck '+s);
  }
  return parts.join(', ');
}
function scopeCSS(text){
  const sh=new CSSStyleSheet(); try{sh.replaceSync(text);}catch(e){return {full:'',thumb:'',fonts:[]};}
  const fonts=[], faces=[];
  const walk=(rules,F,T)=>{for(const r of rules){
    const n=r.constructor.name;
    if(n==='CSSStyleRule'){const sel=scopeSel(r.selectorText); if(!sel) continue; const body=r.cssText.slice(r.cssText.indexOf('{')); F.push(sel+body); T.push(sel+body);}
    else if(n==='CSSMediaRule'){ if(/print/i.test(r.conditionText||r.media.mediaText)) continue; const f=[],t=[]; walk(r.cssRules,f,t); const c=r.conditionText||r.media.mediaText; if(f.length){F.push('@media '+c+'{'+f.join('\n')+'}'); if(t.length) T.push('@media '+c+'{'+t.join('\n')+'}');} }
    else if(n==='CSSSupportsRule'){ const f=[],t=[]; walk(r.cssRules,f,t); if(f.length){F.push('@supports '+r.conditionText+'{'+f.join('\n')+'}'); T.push('@supports '+r.conditionText+'{'+t.join('\n')+'}');} }
    else if(n==='CSSFontFaceRule'){ F.push(r.cssText); faces.push({css:r.cssText,ranges:(r.style.getPropertyValue('unicode-range')||'U+0-10FFFF').split(',').map(x=>{const m=x.trim().replace(/^U\+/i,'').split('-'); const lo=parseInt(m[0].replace(/\?/g,'0'),16), hi=m[1]?parseInt(m[1],16):parseInt(m[0].replace(/\?/g,'F'),16); return [lo,hi];})}); const fam=(r.style.getPropertyValue('font-family')||'').replace(/["']/g,'').trim(); if(fam&&!fonts.includes(fam)) fonts.push(fam); }
    else if(n==='CSSKeyframesRule'){ F.push(r.cssText); }
    else if(n==='CSSImportRule'||n==='CSSPageRule'){ }
    else { try{F.push(r.cssText);}catch(e){} }
  }};
  const F=[],T=[]; walk(sh.cssRules,F,T);
  return {full:F.join('\n'),thumb:T.join('\n'),fonts,faces};
}
function OVR(D,P){P=P||D; return `${D} .slides{position:static!important;inset:auto!important;transform:none!important;zoom:1!important;width:100%!important;height:100%!important;margin:0!important;pointer-events:auto!important;perspective:none!important}
${D} .slides>section{display:block!important;position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;width:var(--de-w)!important;height:var(--de-h)!important;overflow:hidden!important;pointer-events:auto!important;margin:0!important}
${P} .slides section .fragment{opacity:1!important;visibility:visible!important}
${P} .slides section .fragment.current-visible{opacity:0!important;visibility:hidden!important}
${P} *,${P} *::before,${P} *::after{animation:none!important;transition:none!important}
${D} aside.notes{display:none!important}`;}
const ovrStyle=document.createElement('style'); ovrStyle.textContent=OVR('#deck.de-deck','#deck.de-deck:not(.de-play)')+'\n#deck.de-deck .slides section *{pointer-events:auto!important}\n#deck.de-deck .slides section .sw-embed iframe{pointer-events:none!important}\n#deck.de-deck .slides section .sw-embed::before{content:\"\\25B6  Plays when you present\";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;border-radius:8px;background:rgba(0,0,0,.65);color:#fff;font:600 18px/1.2 system-ui,sans-serif;white-space:nowrap;pointer-events:none}\n#deck.de-deck.de-play .slides section .fragment:not(.de-shown){opacity:0!important;visibility:hidden!important}\n#deck.de-deck.de-play .slides section .fragment.de-shown{opacity:1!important;visibility:inherit!important}\n#deck.de-deck.de-play .slides section .fragment.current-visible.de-shown:not(.de-cur){opacity:0!important;visibility:hidden!important}';
const layerStyle=document.createElement('style');
function injectDeckCSS(doc){
  $$('style[data-deck],link[data-deck]').forEach(n=>n.remove());
  let full='',thumb='';const fonts=[]; const faces=[];
  for(const st of doc.querySelectorAll('style, link[rel~="stylesheet"]')){
    if(st.closest('section')) continue;
    if(st.tagName==='LINK'){const href=st.getAttribute('href')||''; if(/^https:\/\/fonts\.googleapis\.com\//.test(href)){const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; l.dataset.deck=''; document.head.appendChild(l);} continue;}
    const r=scopeCSS(st.textContent); full+=r.full+'\n'; thumb+=r.thumb+'\n'; r.fonts.forEach(f=>{if(!fonts.includes(f)) fonts.push(f);}); faces.push(...(r.faces||[]));
  }
  const el=document.createElement('style'); el.dataset.deck=''; el.textContent=full; document.head.appendChild(el);
  document.head.appendChild(ovrStyle); document.head.appendChild(layerStyle);
  S.thumbCSS=thumb; S.fonts=fonts; S.fontFaces=faces; thumbSheet=null;
}

/* ======================= load / structure ======================= */
function detectSize(doc){
  let W=0,H=0;
  for(const sc of doc.querySelectorAll('script')){const t=sc.textContent; const re=/Reveal\.initialize\s*\(\s*\{([\s\S]{0,3000}?)\}\s*\)/g; let m;
    while((m=re.exec(t))){const w=m[1].match(/\bwidth\s*:\s*['"]?(\d+)/), h=m[1].match(/\bheight\s*:\s*['"]?(\d+)/); if(w)W=+w[1]; if(h)H=+h[1];}}
  S.W=W||1280; S.H=H||720;
  deck.style.setProperty('--de-w',S.W+'px'); deck.style.setProperty('--de-h',S.H+'px');
}
/* While a deck is open for editing, nothing in it may run: inline event handlers (onerror=, onload=...), srcdoc frames,
   javascript: and HTML data: addresses, meta refresh and base are parked in data-sw-* attributes and put back on save. */
const UNSAFE_URL=/^\s*(javascript|vbscript)\s*:|^\s*data\s*:\s*(text\/html|image\/svg\+xml|application\/xhtml)/i;
function defang(root){ if(!root||!root.querySelectorAll) return root;
  for(const e of root.querySelectorAll('*')){ for(const a of Array.from(e.attributes)){ const n=a.name.toLowerCase(); if(n.startsWith('data-')) continue;
      const tag=e.tagName.toLowerCase(); const park=n.startsWith('on')||(n==='srcdoc')||(tag==='meta'&&n==='http-equiv')||(tag==='base'&&n==='href')||(/^(src|href|xlink:href|data|action|formaction|to|values|from|by|poster)$/.test(n)&&UNSAFE_URL.test(a.value)&&!(tag==='img'&&/^\s*data\s*:\s*image\/svg/i.test(a.value)));
      if(park){ e.setAttribute('data-sw-x-'+n.replace(/:/g,'--'),a.value); e.removeAttribute(a.name); } } }
  return root; }
function undefang(root){ const all=[root,...root.querySelectorAll('*')];
  for(const e of all){ if(!e.attributes) continue; for(const a of Array.from(e.attributes)){ if(!a.name.startsWith('data-sw-x-')) continue; const n=a.name.slice(10).replace(/--/g,':'); e.removeAttribute(a.name); try{ if(n.includes(':')) e.setAttributeNS('http://www.w3.org/1999/xlink',n,a.value); else e.setAttribute(n,a.value); }catch(_){} } }
  return root; }
function loadHTML(text,name,handle){
  const doc=new DOMParser().parseFromString(text,'text/html');
  let secs=$$('.reveal .slides > section',doc);
  if(!secs.length) secs=$$('section',doc).filter(s=>!(s.parentElement&&s.parentElement.closest('section')));
  if(!secs.length){toast('No slides found. The file needs reveal.js <section> slides.','warn');return false;}
  if(PV.on) stopPreview(); if(S.painter) stopPainter(); endEdit(true); mo.disconnect(); pending=[]; undoStack.length=0; redoStack.length=0; S.gh=null; S.gdrive=null; S.web=null; lastAudit=null; S.localPath=null; S.localGit=false;
  S.host=secs[0].parentNode;
  S.doc=doc; S.name=name||'deck.html'; S.handle=handle||null;
  detectSize(doc);
  S.slides=secs.map(s=>document.adoptNode(defang(s)));  /* only slides enter the page; the rest of the file is kept as text-like DOM */
  S.slides.forEach(observe);
  S.layerIdx=new WeakMap(); S.cur=0; S.sel=[]; S.scope=null; thumbCache=new WeakMap();
  injectDeckCSS(doc);
  S.accent=guessAccent();
  fillFonts();
  S.dirty=false; updateFileName(); updateUndoButtons();
  loadCustomStyles(); detectStyles();
  renderSlideList(); showSlide(); applyZoom(); updateAltStatus();
  convertDelims();
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>drawOverlay());
  return true;
}
const curSec=()=>S.slides[S.cur];
const layersOf=sec=>Array.from(sec.children).filter(c=>c.classList.contains('step-layer'));
function layerIndex(sec){const L=layersOf(sec); if(!L.length) return -1; let i=S.layerIdx.get(sec); if(i==null||i>=L.length) i=L.length-1; return i;}
function baseOf(sec){const L=layersOf(sec); return L.length?L[layerIndex(sec)]:sec;}
const isExtra=c=>/^(STYLE|SCRIPT|ASIDE|TEMPLATE|LINK|META)$/.test(c.tagName);
function rootOf(sec){
  const b=baseOf(sec); const kids=Array.from(b.children).filter(c=>!isExtra(c)&&!c.classList.contains('slide-copy')&&!c.classList.contains('pdf-get')&&!c.classList.contains('step-layer'));
  if(kids.length===1&&kids[0].tagName==='DIV'){const k=kids[0]; if(!k.isConnected) return k; if(k.offsetWidth>=S.W*0.9&&k.offsetHeight>=S.H*0.9) return k;}
  return b;
}
const kidsOf=p=>Array.from(p.children).filter(c=>!isExtra(c));
function topLevel(){const sec=curSec(), base=baseOf(sec), root=rootOf(sec); let items=kidsOf(root);
  if(root!==base) items=items.concat(kidsOf(base).filter(c=>c!==root));
  if(base!==sec) items=items.concat(kidsOf(sec).filter(c=>!c.classList.contains('step-layer')));
  return items;}
function topItems(){return (S.scope&&S.scope.isConnected)?kidsOf(S.scope):topLevel();}
function itemFor(t){
  const sec=curSec(); let el=t&&(t.nodeType===1?t:t.parentElement); if(!el||!sec.contains(el)||el===sec) return null;
  while(el.ownerSVGElement) el=el.ownerSVGElement;
  if(S.scope&&S.scope.isConnected&&S.scope.contains(el)&&el!==S.scope){while(el.parentElement!==S.scope) el=el.parentElement; return el;}
  const set=new Set(topLevel()); while(el&&el!==sec&&!set.has(el)) el=el.parentElement;
  return (el&&set.has(el))?el:null;
}
function isGhost(el){const sec=curSec(); for(let e=el;e&&e!==sec&&e.nodeType===1;e=e.parentElement){const cs=getComputedStyle(e); if(cs.opacity==='0'||cs.visibility==='hidden'||cs.display==='none') return true;} return false;}
function unpainted(h){
  const tag=h.tagName.toLowerCase(); if(h.ownerSVGElement||/^(img|video|canvas|picture|input|button|iframe)$/.test(tag)) return false;
  const cs=getComputedStyle(h);
  if(cs.backgroundColor!=='rgba(0, 0, 0, 0)'&&cs.backgroundColor!=='transparent') return false;
  if(cs.backgroundImage!=='none'||cs.boxShadow!=='none') return false;
  if(parseFloat(cs.borderTopWidth)||parseFloat(cs.borderLeftWidth)||parseFloat(cs.borderRightWidth)||parseFloat(cs.borderBottomWidth)) return false;
  for(const n of h.childNodes) if(n.nodeType===3&&n.data.trim()) return false;
  return true;
}
function pickAt(x,y){
  let fallback=null;
  for(const h of document.elementsFromPoint(x,y)){
    if(!deck.contains(h)) continue;
    const it=itemFor(h); if(!it) continue; if(isGhost(h)) continue;
    // Transparent wrappers (an empty spot on a full-slide graphic or layout box) yield to whatever is painted beneath.
    if(unpainted(h)&&!S.sel.includes(it)){ if(!fallback) fallback={item:it,hit:h}; continue; }
    return {item:it,hit:h};
  }
  return fallback;
}
/* Paragraphs, lists and headings inside a box are its text, not separate items: the box is typed into as one piece. */
const TEXTFLOW=new Set(['p','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote']);
const textFlowOnly=el=>Array.from(el.children).every(c=>{const t=c.tagName.toLowerCase(); if(INLINE.has(t)) return true; if(!TEXTFLOW.has(t)) return false; const cs=c.style; if(cs&&(cs.position==='absolute'||cs.position==='fixed')) return false; return textFlowOnly(c);});
const hasBlockKids=el=>el.tagName.toLowerCase()!=='svg'&&!/^(TABLE|VIDEO|AUDIO)$/.test(el.tagName)&&!(el.classList&&el.classList.contains('sw-embed'))&&Array.from(el.children).some(c=>!INLINE.has(c.tagName.toLowerCase())&&!isExtra(c))&&!(Array.from(el.children).some(c=>TEXTFLOW.has(c.tagName.toLowerCase()))&&textFlowOnly(el));

/* ======================= undo (mutation journal) ======================= */
let pending=[]; const undoStack=[], redoStack=[]; const IGN=new Set(['contenteditable','spellcheck']);
const mo=new MutationObserver(recs=>{for(const r of recs) pending.push(r);});
function observe(sec){mo.observe(sec,{subtree:true,childList:true,attributes:true,attributeOldValue:true,characterData:true,characterDataOldValue:true});}
function takeRecs(){
  const recs=pending.concat(mo.takeRecords()); pending=[];
  const seenA=new Map(), seenC=new Set(), out=[];
  for(const r of recs){
    if(r.type==='attributes'){ if(IGN.has(r.attributeName)) continue; let s=seenA.get(r.target); if(!s){s=new Set();seenA.set(r.target,s);} if(s.has(r.attributeName)) continue; s.add(r.attributeName); }
    else if(r.type==='characterData'){ if(seenC.has(r.target)) continue; seenC.add(r.target); }
    out.push(r);
  }
  return out;
}
function commit(label){let recs=takeRecs(); if(!recs.length) return false; const n=propagateSteps(recs); if(n){recs=recs.concat(takeRecs()); flashLink(n);} undoStack.push({kind:'dom',recs,label}); if(undoStack.length>300) undoStack.shift(); redoStack.length=0; afterChange(recs); refreshStepSnap(); return true;}
function revert(recs){
  for(let i=recs.length-1;i>=0;i--){const r=recs[i];
    if(r.type==='attributes'){const el=r.target; if(r.oldValue===null){ if(r.attributeNamespace) el.removeAttributeNS(r.attributeNamespace,r.attributeName); else el.removeAttribute(r.attributeName);} else { if(r.attributeNamespace) el.setAttributeNS(r.attributeNamespace,r.attributeName,r.oldValue); else el.setAttribute(r.attributeName,r.oldValue);} }
    else if(r.type==='characterData'){r.target.data=r.oldValue;}
    else { for(const n of Array.from(r.addedNodes)) if(n.parentNode===r.target) r.target.removeChild(n);
      const ref=(r.nextSibling&&r.nextSibling.parentNode===r.target)?r.nextSibling:null;
      for(const n of Array.from(r.removedNodes)) r.target.insertBefore(n,ref); }
  }
}
function invertTx(t){
  if(t.kind==='slides'){setSlides(t.before,t.curBefore); return {kind:'slides',before:t.after,after:t.before,curBefore:t.curAfter,curAfter:t.curBefore,label:t.label};}
  revert(t.recs); const recs=takeRecs(); return {kind:'dom',recs,label:t.label};
}
function undo(){ if(S.editing) endEdit(); commit(); const t=undoStack.pop(); if(!t) return; const inv=invertTx(t); redoStack.push(inv); afterHistory(t,inv,'Undid'); }
function redo(){ if(S.editing) endEdit(); commit(); const t=redoStack.pop(); if(!t) return; const inv=invertTx(t); undoStack.push(inv); afterHistory(t,inv,'Redid'); }
function afterHistory(t,inv,verb){
  if(inv.kind==='dom'){
    const first=inv.recs[0]; const sec=first&&secOf(first.target);
    if(sec){const i=S.slides.indexOf(sec); const lay=(first.target.nodeType===1?first.target:first.target.parentElement); const L=lay&&lay.closest&&lay.closest('.step-layer');
      if(L&&L.parentElement===sec) S.layerIdx.set(sec,layersOf(sec).indexOf(L));
      if(i!==S.cur){S.cur=i; S.sel=[]; S.scope=null;} showSlide(); }
    afterChange(inv.recs);
  } else { S.dirty=true; updateFileName(); scheduleAutosave(); }
  S.sel=S.sel.filter(e=>e.isConnected&&curSec().contains(e)); refreshStepSnap();
  drawOverlay(); syncInspector(); updateUndoButtons();
  toast(verb+' '+(t.label||'change').toLowerCase());
}
function slidesOp(label,fn){
  endEdit(); commit(); const before=S.slides.slice(), cb=S.cur; fn(); const after=S.slides.slice();
  after.forEach(observe);
  undoStack.push({kind:'slides',before,after,curBefore:cb,curAfter:S.cur,label}); redoStack.length=0;
  S.dirty=true; updateFileName(); updateUndoButtons(); renderSlideList(); showSlide(); scheduleAutosave(); updateAltStatus();
}
function setSlides(arr,cur){S.slides=arr.slice(); S.slides.forEach(observe); S.cur=Math.max(0,Math.min(cur,arr.length-1)); S.sel=[]; S.scope=null; renderSlideList(); showSlide(); updateAltStatus();}
function secOf(n){for(let e=n&&(n.nodeType===1?n:n.parentNode);e;e=e.parentNode){if(e.tagName==='SECTION'&&S.slides.includes(e)) return e;} return null;}
function afterChange(recs){
  S.dirty=true; updateFileName(); updateUndoButtons();
  const secs=new Set(); for(const r of recs){const s=secOf(r.target); if(s) secs.add(s);} secs.forEach(scheduleThumb);
  scheduleAutosave(); updateAltStatusSoon();
}
function updateUndoButtons(){$('#bUndo').disabled=!undoStack.length&&!pending.length; $('#bRedo').disabled=!redoStack.length;
  $('#bUndo').title='Undo'+(undoStack.length?' '+undoStack[undoStack.length-1].label.toLowerCase():'')+' (Ctrl/Cmd+Z)';}

/* ======================= slide display ======================= */
function applyLayerStyle(){
  if(PV.on){layerStyle.textContent='';return;}
  const sec=curSec(), L=layersOf(sec); let css='';
  if(L.length){const k=Array.from(sec.children).indexOf(L[layerIndex(sec)])+1;
    css=`#deck.de-deck .slides>section>.step-layer{display:none!important}#deck.de-deck .slides>section>.step-layer:nth-child(${k}){display:block!important}`;}
  layerStyle.textContent=css;
}
function showSlide(){
  const sec=curSec(); if(!sec) return;
  if(deckSlides.firstChild!==sec||deckSlides.childNodes.length!==1) deckSlides.replaceChildren(sec);
  applyLayerStyle();
  S.sel=S.sel.filter(e=>e.isConnected&&sec.contains(e)&&!hiddenByLayer(e)); if(S.scope&&(!sec.contains(S.scope)||hiddenByLayer(S.scope))) S.scope=null;
  $('#slidePos').textContent=`Slide ${S.cur+1} of ${S.slides.length}`;
  $$('#slideList .thumb').forEach((b,i)=>{b.classList.toggle('cur',i===S.cur); b.setAttribute('aria-current',i===S.cur?'true':'false');});
  renderSteps(); refreshStepSnap(); drawOverlay(); syncInspector();
  $('#sUp').disabled=S.cur===0; $('#sDown').disabled=S.cur===S.slides.length-1; $('#sDel').disabled=S.slides.length<2;
}
function hiddenByLayer(el){const L=el.closest('.step-layer'); return !!(L&&L!==baseOf(curSec()));}
function go(i){i=Math.max(0,Math.min(S.slides.length-1,i)); if(i===S.cur&&deckSlides.firstChild===curSec()) return; endEdit(); S.cur=i; S.sel=[]; S.scope=null; showSlide();
  const b=$$('#slideList .thumb')[i]; if(b) b.scrollIntoView({block:'nearest'});}
function setLayer(i){const sec=curSec(); endEdit(); S.layerIdx.set(sec,i); S.sel=[]; S.scope=null; applyLayerStyle(); renderSteps(); refreshStepSnap(); drawOverlay(); syncInspector();}
function renderSteps(){
  const sec=curSec(), L=layersOf(sec), li=layerIndex(sec);
  const mk=host=>{host.replaceChildren(); L.forEach((_,i)=>{const b=document.createElement('button'); b.className='pill'; b.textContent=i+1; b.setAttribute('aria-pressed',i===li?'true':'false'); b.title='Edit build step '+(i+1); b.onclick=()=>setLayer(i); host.appendChild(b);});};
  $('#stepGrp').hidden=!L.length; $('#sSteps').hidden=!L.length; mk($('#stepPills')); mk($('#sStepPills'));
}

/* ======================= thumbnails ======================= */
let thumbCache=new WeakMap(); const thumbDirty=new Set(); let thumbT=null; let io=null;
let thumbSheet=null;
function thumbCSSText(){return S.thumbCSS+'\n'+OVR('.de-deck')+'\n.de-deck{position:absolute;left:0;top:0;width:var(--de-w);height:var(--de-h);overflow:hidden;transform-origin:0 0;transform:scale(var(--tk,0.125));background:#fff;pointer-events:none;margin:0}';}
function renderThumb(sec){
  const i=S.slides.indexOf(sec); if(i<0) return;
  const host=makeThumbHost(sec);
  thumbCache.set(sec,host);
  const tf=$$('#slideList .thumb .tf')[i]; if(tf){const old=tf.querySelector('.th-host'); if(old) old.replaceWith(host); else tf.prepend(host);}
}
function sizeThumbs(){const list=$('#slideList'), tf=list.querySelector('.tf'); if(tf&&tf.clientWidth) list.style.setProperty('--tk',String(tf.clientWidth/S.W));}
new ResizeObserver(sizeThumbs).observe($('#slideList'));
function scheduleThumb(sec){thumbDirty.add(sec); sorterCache.delete(sec); clearTimeout(thumbT); thumbT=setTimeout(()=>{thumbDirty.forEach(s=>{if(S.slides.includes(s)) renderThumb(s);}); thumbDirty.clear();},700);}
const thumbQueue=[]; let thumbBusy=false;
function queueThumb(sec){if(!thumbQueue.includes(sec)) thumbQueue.push(sec); if(!thumbBusy){thumbBusy=true; setTimeout(drainThumbs,0);}}
function drainThumbs(){const sec=thumbQueue.shift(); if(!sec){thumbBusy=false;return;} if(!thumbCache.has(sec)&&S.slides.includes(sec)) renderThumb(sec); setTimeout(drainThumbs,16);}
function slideTitle(sec,i){const t=sec.getAttribute('data-title'); if(t) return t; const h=sec.querySelector('h1,h2,h3'); if(h) return h.textContent.trim().slice(0,60); const tx=(sec.textContent||'').replace(/\s+/g,' ').trim(); return tx.slice(0,40)||('Slide '+(i+1));}
function renderSlideList(){
  const list=$('#slideList'); list.replaceChildren(); if(io) io.disconnect();
  io=new IntersectionObserver(ents=>{for(const e of ents){if(e.isIntersecting){const i=+e.target.dataset.i; const sec=S.slides[i]; if(sec&&!thumbCache.has(sec)) queueThumb(sec);}}},{root:list,rootMargin:'300px'});
  S.slides.forEach((sec,i)=>{
    const li=document.createElement('li'); li.dataset.i=i; li.draggable=true;
    const b=document.createElement('button'); b.className='thumb'+(i===S.cur?' cur':''); b.type='button';
    const title=slideTitle(sec,i); b.setAttribute('aria-label',`Slide ${i+1}: ${title}`);
    b.innerHTML=`<span class="n">${i+1}</span><span class="tf"></span><span class="tt"></span>`;
    b.querySelector('.tt').textContent=title;
    const th=thumbCache.get(sec); if(th) b.querySelector('.tf').prepend(th);
    const miss=missingCount(sec); if(miss){const m=document.createElement('span'); m.className='miss'; m.textContent=miss+' alt'; m.title=miss+' picture(s) without alt text'; b.querySelector('.tf').appendChild(m);}
    b.onclick=()=>go(i);
    li.appendChild(b); list.appendChild(li); io.observe(li);
  });
  sizeThumbs();
}
let dragIdx=null;
$('#slideList').addEventListener('dragstart',e=>{const li=e.target.closest('li'); if(!li) return; dragIdx=+li.dataset.i; e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/x-deck-slide',String(dragIdx));}catch(_){}});
$('#slideList').addEventListener('dragover',e=>{if(dragIdx==null) return; e.preventDefault(); const li=e.target.closest('li'); $$('#slideList li').forEach(l=>l.classList.remove('drop-before','drop-after')); if(!li) return; const r=li.getBoundingClientRect(); const after=(window.innerWidth<=860)?(e.clientX>r.left+r.width/2):(e.clientY>r.top+r.height/2); li.classList.add(after?'drop-after':'drop-before');});
$('#slideList').addEventListener('drop',e=>{if(dragIdx==null) return; e.preventDefault(); e.stopPropagation(); const li=e.target.closest('li'); $$('#slideList li').forEach(l=>l.classList.remove('drop-before','drop-after')); if(!li){dragIdx=null;return;}
  let to=+li.dataset.i; const r=li.getBoundingClientRect(); const after=(window.innerWidth<=860)?(e.clientX>r.left+r.width/2):(e.clientY>r.top+r.height/2); if(after) to++; const from=dragIdx; dragIdx=null; if(to>from) to--; if(to===from) return;
  slidesOp('Move slide',()=>{const [s]=S.slides.splice(from,1); S.slides.splice(to,0,s); S.cur=to;});});
$('#slideList').addEventListener('dragend',()=>{dragIdx=null; $$('#slideList li').forEach(l=>l.classList.remove('drop-before','drop-after'));});

/* ======================= zoom ======================= */
function fitScale(){const pad=window.innerWidth<=860?32:80; const w=stageScroll.clientWidth-pad, h=stageScroll.clientHeight-pad; return Math.max(0.05,Math.min(w/S.W,h/S.H));}
function applyZoom(){S.scale=S.zoom==='fit'?fitScale():S.zoom; deck.style.transform=`scale(${S.scale})`; stageBox.style.width=S.W*S.scale+'px'; stageBox.style.height=S.H*S.scale+'px'; drawOverlay();
  const zs=$('#zoomSel'); if(S.zoom==='fit') zs.value='fit'; else { let o=[...zs.options].find(o=>+o.value===S.zoom); if(!o){o=new Option(Math.round(S.zoom*100)+'%',S.zoom); o.dataset.custom='1'; $$('option[data-custom]',zs).forEach(x=>x.remove()); zs.add(o);} zs.value=String(S.zoom);} }
new ResizeObserver(()=>{if(S.zoom==='fit') applyZoom(); else drawOverlay();}).observe(stageScroll);
$('#zoomSel').onchange=e=>{const v=e.target.value; S.zoom=v==='fit'?'fit':+v; applyZoom();};
stageScroll.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey)) return; e.preventDefault(); const z=Math.max(0.1,Math.min(4,S.scale*(e.deltaY<0?1.1:1/1.1))); S.zoom=Math.round(z*100)/100; applyZoom();},{passive:false});
stageScroll.addEventListener('scroll',()=>{ if(S.svgEdit) S.svgEdit.blur(); });

/* ======================= geometry helpers ======================= */
function rectOf(el){const r=el.getBoundingClientRect(), b=stageBox.getBoundingClientRect(); return {x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height};}
function slideRect(el){const r=rectOf(el); return {x:r.x/S.scale,y:r.y/S.scale,w:r.w/S.scale,h:r.h/S.scale};}
function union(rs){if(!rs.length) return null; let x=Infinity,y=Infinity,X=-Infinity,Y=-Infinity; for(const r of rs){x=Math.min(x,r.x);y=Math.min(y,r.y);X=Math.max(X,r.x+r.w);Y=Math.max(Y,r.y+r.h);} return {x,y,w:X-x,h:Y-y};}
function posStart(el){const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); let left=0,top=0; const k=cs.position;
  if(k!=='static'){left=parseFloat(cs.left)||0; top=parseFloat(cs.top)||0;}
  return {el,kind:k,left,top,w:r.width,h:r.height,fixed:false};}
function applyPos(s,x,y){const st=s.el.style; if(s.kind==='static'){st.position='relative'; s.kind='relative';}
  st.left=r0(x)+'px'; st.top=r0(y)+'px';
  if(!s.fixed&&(s.kind==='absolute'||s.kind==='fixed')){s.fixed=true; const r=s.el.getBoundingClientRect();
    if(Math.abs(r.width-s.w)>0.5) st.right='auto'; if(Math.abs(r.height-s.h)>0.5) st.bottom='auto';}}
function snapTargets(excl){const xs=[0,S.W/2,S.W,64,S.W-64], ys=[0,S.H/2,S.H];
  for(const it of topItems()){if(excl.includes(it)||isGhost(it)) continue; const r=slideRect(it); if(r.w>=S.W*0.98&&r.h>=S.H*0.98) continue; xs.push(r.x,r.x+r.w/2,r.x+r.w); ys.push(r.y,r.y+r.h/2,r.y+r.h);} return {xs,ys};}
function snap1(cands,targets){const thr=6/S.scale; let best=null; for(const c of cands) for(const t of targets){const d=t-c; if(Math.abs(d)<=thr&&(!best||Math.abs(d)<Math.abs(best.d))) best={d,v:t};} return best;}

/* ======================= overlay ======================= */
let ovRAF=0; function drawOverlaySoon(){if(!ovRAF) ovRAF=requestAnimationFrame(()=>{ovRAF=0; drawOverlay();});}
function box(r,cls){const d=document.createElement('div'); d.className=cls; d.style.cssText=`left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`; overlay.appendChild(d); return d;}
function drawOverlay(){
  overlay.replaceChildren(); if(!S.slides.length||PV.on) return;
  if(S.showAlt) drawAlt();
  if(S.scope&&S.scope.isConnected) box(rectOf(S.scope),'de-scope');
  if(S.hover&&S.hover.isConnected&&!S.sel.includes(S.hover)&&!S.marq) box(rectOf(S.hover),'de-hover');
  const live=S.sel.filter(e=>e.isConnected);
  for(const el of live){box(rectOf(el),'de-selbox'+(live.length>1?' multi':'')+(S.editing===el?' editing':''));}
  if(live.length>1){const u=union(live.map(rectOf)); box(u,'de-selbox');}
  if(live.length===1&&!S.editing){const r=rectOf(live[0]);
    const H={nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5]};
    for(const k in H){ if((k==='n'||k==='s')&&r.w<24) continue; if((k==='e'||k==='w')&&r.h<24) continue; const h=document.createElement('div'); h.className='de-h'; h.dataset.h=k; h.style.left=(r.x+r.w*H[k][0])+'px'; h.style.top=(r.y+r.h*H[k][1])+'px'; h.addEventListener('pointerdown',ev=>startResize(ev,k)); overlay.appendChild(h);}
    const ln=document.createElement('div'); ln.className='de-rotline'; ln.style.cssText=`left:${r.x+r.w/2}px;top:${r.y-22}px;height:22px`; overlay.appendChild(ln);
    const ro=document.createElement('div'); ro.className='de-rot'; ro.title='Rotate (Shift snaps to 15°)'; ro.style.left=(r.x+r.w/2)+'px'; ro.style.top=(r.y-22)+'px'; ro.addEventListener('pointerdown',startRotate); overlay.appendChild(ro);}
  if(S.guides){const g=S.guides; if(g.x!=null){const d=document.createElement('div'); d.className='de-guide'; d.style.cssText=`left:${g.x*S.scale}px;top:0;width:1px;height:${S.H*S.scale}px`; overlay.appendChild(d);}
    if(g.y!=null){const d=document.createElement('div'); d.className='de-guide'; d.style.cssText=`left:0;top:${g.y*S.scale}px;height:1px;width:${S.W*S.scale}px`; overlay.appendChild(d);}}
  if(S.marq) box(S.marq,'de-marq');
  if(S.tag&&live.length){const u=union(live.map(rectOf)); const t=document.createElement('div'); t.className='de-tag'; t.textContent=S.tag; t.style.left=(u.x+u.w/2)+'px'; t.style.top=(u.y+u.h)+'px'; overlay.appendChild(t);}
  if(S.svgEdit) overlay.appendChild(S.svgEdit);
}
deck.addEventListener('load',drawOverlaySoon,true);

/* ======================= selection & pointer ======================= */
function setSel(arr){S.sel=Array.from(new Set(arr.filter(Boolean)));
  for(const el of S.sel) if(!origHTML.has(el)){try{const h=el.outerHTML; if(h.length<4e6) origHTML.set(el,h);}catch(e){}}
  drawOverlay(); syncInspector();}
function drag(e,onMove,onEnd){const sx=e.clientX,sy=e.clientY; let moved=false;
  const mv=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy; if(!moved&&Math.hypot(dx,dy)<3) return; moved=true; onMove(dx/S.scale,dy/S.scale,ev);};
  const up=ev=>{window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); window.removeEventListener('pointercancel',up); onEnd(moved,ev);};
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up);}
function blurFields(){const a=document.activeElement; if(a&&a!==document.body&&!deck.contains(a)&&a.blur) a.blur();}
stageScroll.addEventListener('pointerdown',e=>{
  if(e.button!==0) return;
  if(e.target.closest('.de-h,.de-rot,.de-badge,.de-svgedit,#pvBar')) return;
  if(PV.on){e.preventDefault(); pvStep(1); return;}
  if(S.painter){const pp=pickAt(e.clientX,e.clientY); e.preventDefault(); if(pp){paintOnto(pp.item); if(!S.painter.sticky) stopPainter();} else stopPainter(); return;}
  if(S.editing&&S.editing.contains(e.target)) return;
  blurFields();
  if(S.editing) endEdit();
  const p=pickAt(e.clientX,e.clientY);
  if(!p){ if(!e.shiftKey){S.scope=null; setSel([]);} startMarquee(e); return; }
  let it=p.item; if(S.scope&&!S.scope.contains(it)) S.scope=null;
  if(e.shiftKey||e.metaKey||e.ctrlKey){const i=S.sel.indexOf(it); if(i>=0) S.sel.splice(i,1); else S.sel.push(it); setSel(S.sel); e.preventDefault(); return;}
  /* A click (not a drag) on a part of the selected group selects that part; dragging still moves the whole group. */
  if(S.sel.length===1&&S.sel[0]===it&&hasBlockKids(it)){ const sc0=S.scope; S.scope=it; const inner=itemFor(p.hit); S.scope=sc0;
    if(inner&&inner!==it){ const x0=e.clientX, y0=e.clientY; const up=ev=>{ window.removeEventListener('pointerup',up,true); if(Math.hypot(ev.clientX-x0,ev.clientY-y0)<4&&S.sel.length===1&&S.sel[0]===it&&inner.isConnected){ S.scope=it; setSel([inner]); } }; window.addEventListener('pointerup',up,true); } }
  if(!S.sel.includes(it)) setSel([it]);
  e.preventDefault(); stageScroll.focus({preventScroll:true});
  startMove(e);
});
stageScroll.addEventListener('pointermove',e=>{if(e.buttons) return; const p=(e.target.closest&&e.target.closest('.de-h,.de-rot,.de-badge'))?null:pickAt(e.clientX,e.clientY); const h=p?p.item:null; if(h!==S.hover){S.hover=h; drawOverlaySoon();}});
stageScroll.addEventListener('pointerleave',()=>{if(S.hover){S.hover=null; drawOverlaySoon();}});
deck.addEventListener('click',e=>{if(e.target.closest('a,button,label')) e.preventDefault();},true);
deck.addEventListener('dragstart',e=>e.preventDefault());
function startMove(e){
  const items=S.sel.filter(el=>el.isConnected); if(!items.length) return;
  const starts=items.map(posStart); const bb=union(items.map(slideRect)); const tg=S.snap?snapTargets(items):null;
  drag(e,(dx,dy,ev)=>{
    if(ev.shiftKey){if(Math.abs(dx)>Math.abs(dy)) dy=0; else dx=0;}
    let gx=null,gy=null;
    if(S.snap&&!ev.altKey){const sx=snap1([bb.x+dx,bb.x+bb.w/2+dx,bb.x+bb.w+dx],tg.xs); if(sx){dx+=sx.d; gx=sx.v;} const sy=snap1([bb.y+dy,bb.y+bb.h/2+dy,bb.y+bb.h+dy],tg.ys); if(sy){dy+=sy.d; gy=sy.v;}}
    starts.forEach(s=>applyPos(s,s.left+dx,s.top+dy));
    S.guides={x:gx,y:gy}; S.tag=`${r0(bb.x+dx)}, ${r0(bb.y+dy)}`; drawOverlay(); syncGeom();
  },moved=>{S.guides=null; S.tag=null; if(moved) commit('Move'); drawOverlay(); syncInspector();});
}
function startMarquee(e){
  const b=stageBox.getBoundingClientRect(); const x0=e.clientX-b.left, y0=e.clientY-b.top; const base=e.shiftKey?S.sel.slice():[];
  drag(e,(dx,dy,ev)=>{const x1=ev.clientX-b.left,y1=ev.clientY-b.top; const m=S.marq={x:Math.min(x0,x1),y:Math.min(y0,y1),w:Math.abs(x1-x0),h:Math.abs(y1-y0)};
    const hits=topItems().filter(it=>{if(isGhost(it)) return false; const r=rectOf(it); return r.w>0&&r.x>=m.x&&r.y>=m.y&&r.x+r.w<=m.x+m.w&&r.y+r.h<=m.y+m.h;});
    S.sel=Array.from(new Set(base.concat(hits))); drawOverlay();},
  ()=>{S.marq=null; setSel(S.sel);});
}
const PX_ALL=['width','height','min-width','min-height','max-width','max-height','font-size','line-height','letter-spacing','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','row-gap','column-gap','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','left','top','right','bottom','text-indent','flex-basis'];
const PX_TEXT=['font-size','line-height','letter-spacing'];
function scaleNodes(el){return [el,...el.querySelectorAll('*')].filter(n=>!n.ownerSVGElement);}
function snapshotStyles(el){return scaleNodes(el).map(n=>[n,n.getAttribute('style'),n.getAttribute('width'),n.getAttribute('height')]);}
function restoreStyles(snap){for(const [n,s,w,h] of snap){if(n.getAttribute('style')!==s){if(s==null) n.removeAttribute('style'); else n.setAttribute('style',s);} if(w!=null&&n.getAttribute('width')!==w) n.setAttribute('width',w); if(h!=null&&n.getAttribute('height')!==h) n.setAttribute('height',h);}}
function scaleContent(el,f,props){
  props=props||PX_ALL; const textOnly=props===PX_TEXT;
  const cs=getComputedStyle(el);
  const rootFS=el.style.getPropertyValue('font-size'), rootLH=el.style.getPropertyValue('line-height');
  for(const n of scaleNodes(el)){const st=n.style; if(!st) continue;
    for(const p of props){ if(n===el&&(p==='left'||p==='top'||p==='right'||p==='bottom')) continue;
      const v=st.getPropertyValue(p); if(!v||!/px/.test(v)) continue;
      const nv=v.replace(/(-?\d*\.?\d+)px/g,(m,a)=>r1(a*f)+'px'); if(nv!==v) st.setProperty(p,nv,st.getPropertyPriority(p)); }
    if(!textOnly&&n!==el&&(n.tagName.toLowerCase()==='svg'||n.tagName==='IMG')){for(const a of ['width','height']){const v=n.getAttribute(a); if(v&&/^\d*\.?\d+$/.test(v)) n.setAttribute(a,r1(v*f));}}
  }
  if(!rootFS){const fs=parseFloat(cs.fontSize); if(fs) el.style.fontSize=r1(fs*f)+'px';}
  if(!rootLH&&/px$/.test(cs.lineHeight)){el.style.lineHeight=r1(parseFloat(cs.lineHeight)*f)+'px';}
  if(!textOnly&&(el.tagName.toLowerCase()==='svg'||el.tagName==='IMG')){
    for(const a of ['width','height']){ if(!el.style.getPropertyValue(a)){const v=parseFloat(cs[a]); if(v) el.style.setProperty(a,r1(v*f)+'px');} }}
}
function startResize(e,h){
  e.stopPropagation(); e.preventDefault(); blurFields();
  const el=S.sel[0]; if(!el) return; const s=posStart(el); const cs=getComputedStyle(el); const rr=slideRect(el);
  const w0=parseFloat(cs.width)||rr.w, h0=parseFloat(cs.height)||rr.h; const dW=rr.w-w0, dH=rr.h-h0;
  const media=/^(img|svg|video|canvas|picture)$/i.test(el.tagName)||el.getAttribute('role')==='img';
  const scaleMode=e.altKey; const snap=scaleMode?snapshotStyles(el):null;
  drag(e,(dx,dy,ev)=>{
    let w=w0,hh=h0;
    if(h.includes('e')) w=w0+dx; if(h.includes('w')) w=w0-dx; if(h.includes('s')) hh=h0+dy; if(h.includes('n')) hh=h0-dy;
    const lock=scaleMode||(h.length===2?(media?!ev.shiftKey:ev.shiftKey):ev.shiftKey);
    if(lock){const fx=w/w0,fy=hh/h0; let f; if(h.length===2) f=Math.abs(fx-1)>Math.abs(fy-1)?fx:fy; else f=(h==='e'||h==='w')?fx:fy; w=w0*f; hh=h0*f;}
    w=Math.max(4,w); hh=Math.max(4,hh);
    if(scaleMode){restoreStyles(snap); const f=w/w0; scaleContent(el,f); const nw=rr.w*f, nh=rr.h*f;
      applyPos(s,s.left+(h.includes('w')?rr.w-nw:0),s.top+(h.includes('n')?rr.h-nh:0)); S.tag=Math.round(f*100)+'%';}
    else{
      if(h.includes('e')||h.includes('w')||lock) el.style.width=r0(w)+'px';
      if(h.includes('n')||h.includes('s')||lock) el.style.height=r0(hh)+'px';
      if(h.includes('w')||h.includes('n')) applyPos(s,s.left+(h.includes('w')?w0-w:0),s.top+(h.includes('n')?h0-hh:0));
      S.tag=`${r0(w+dW)} × ${r0(hh+dH)}`;}
    drawOverlay(); syncGeom();
  },moved=>{S.tag=null; if(moved) commit(scaleMode?'Scale':'Resize'); drawOverlay(); syncInspector();});
}
function startRotate(e){
  e.stopPropagation(); e.preventDefault(); blurFields();
  const el=S.sel[0]; const r=el.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
  const a0=Math.atan2(e.clientY-cy,e.clientX-cx); const start=parseFloat(getComputedStyle(el).rotate)||0;
  drag(e,(dx,dy,ev)=>{let deg=start+(Math.atan2(ev.clientY-cy,ev.clientX-cx)-a0)*180/Math.PI;
    if(ev.shiftKey) deg=Math.round(deg/15)*15; else {const n=Math.round(deg/90)*90; if(Math.abs(deg-n)<3) deg=n;}
    deg=((deg%360)+540)%360-180; el.style.rotate=Math.abs(deg)<0.05?'':r1(deg)+'deg'; S.tag=r0(deg)+'°'; drawOverlay(); syncGeom();},
  moved=>{S.tag=null; if(moved) commit('Rotate'); drawOverlay();});
}
stageScroll.addEventListener('dblclick',e=>{
  if(PV.on||S.painter||S.editing||e.target.closest('.de-badge,.de-h,.de-rot,.de-svgedit,#pvBar')) return;
  const p=pickAt(e.clientX,e.clientY); if(!p) return; const it=p.item, hit=p.hit;
  const pre=(hit.closest&&hit.closest('pre'))||(it.tagName==='PRE'?it:null); if(pre&&curSec().contains(pre)){editCode(pre); return;}
  const mth=(hit.closest&&hit.closest('.sw-math'))||(it.children.length===1&&it.firstElementChild.classList.contains('sw-math')?it.firstElementChild:null); if(mth){editMath(mth); return;}
  if(hit.ownerSVGElement||hit.tagName==='svg'){const tx=hit.closest&&hit.closest('text'); if(tx){svgTextEdit(hit.tagName==='tspan'?hit:tx); return;}
    if(it===hit||hit.ownerSVGElement){toast('Graphics move and resize as one piece. Double-click a label inside one to change its words.'); return;}}
  if(it.tagName==='IMG'){replaceImage(it); return;}
  if(isMediaEl(it)){ if(it.tagName==='VIDEO'||it.tagName==='AUDIO'){ it.paused?it.play().catch(()=>{}):it.pause(); } else toast('Embedded videos play when you present. Use the Media panel to change the start time.'); return; }
  if(hasBlockKids(it)){S.scope=it; const inner=itemFor(hit); if(inner&&inner!==it){ if(!hasBlockKids(inner)&&inner.textContent.trim()&&inner.tagName.toLowerCase()!=='svg'&&inner.tagName!=='IMG'&&!S.sel.includes(inner)) { setSel([inner]); } else setSel([inner]); } else {startEdit(it,e.clientX,e.clientY);} return;}
  if(it.tagName.toLowerCase()==='svg') return;
  startEdit(it,e.clientX,e.clientY);
});
