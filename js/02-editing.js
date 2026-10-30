/* Slidewright: editing. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= text editing ======================= */
let savedRange=null;
document.addEventListener('selectionchange',()=>{if(!S.editing) return; const s=getSelection(); if(s.rangeCount&&S.editing.contains(s.anchorNode)) savedRange=s.getRangeAt(0).cloneRange();});
function startEdit(el,x,y){
  if(S.editing===el) return; endEdit(); if(!el||el.tagName.toLowerCase()==='svg'||el.tagName==='IMG') return;
  S.scope=S.scope&&S.scope.contains(el)?S.scope:(el.parentElement&&topLevel().includes(el)?null:el.parentElement);
  if(!window.katex) loadKatex().catch(()=>{});
  S.editing=el; S.sel=[el]; el.setAttribute('contenteditable','true'); el.querySelectorAll('.sw-math').forEach(m=>m.setAttribute('contenteditable','false')); el.focus({preventScroll:true});
  let r=null; if(x!=null){ if(document.caretRangeFromPoint) r=document.caretRangeFromPoint(x,y); else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y); if(p){r=document.createRange(); r.setStart(p.offsetNode,p.offset);}} }
  const s=getSelection(); s.removeAllRanges();
  if(r&&el.contains(r.startContainer)){r.collapse(true); s.addRange(r);} else {const rr=document.createRange(); rr.selectNodeContents(el); s.addRange(rr);}
  if(s.rangeCount) savedRange=s.getRangeAt(0).cloneRange();
  try{document.execCommand('styleWithCSS',false,true);}catch(_){}
  drawOverlay(); syncInspector();
}
function endEdit(silent){const el=S.editing; if(!el) return; S.editing=null; savedRange=null; el.removeAttribute('contenteditable'); {const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let tn; const zs=[]; while((tn=tw.nextNode())) if(tn.data.includes('\u200B')) zs.push(tn); zs.forEach(t=>{t.data=t.data.replace(/\u200B/g,''); if(!t.data) t.remove();});} el.querySelectorAll('.sw-math[contenteditable]').forEach(m=>m.removeAttribute('contenteditable')); if(el.innerHTML==='<br>') el.innerHTML='';
  try{getSelection().removeAllRanges();}catch(_){} if(!silent){ if(window.katex) renderTyped(el); commit('Edit text'); if(!window.katex) renderTypedSoon(el); drawOverlay(); syncInspector();}}
function restoreRange(){if(S.editing&&savedRange){S.editing.focus({preventScroll:true}); const s=getSelection(); s.removeAllRanges(); s.addRange(savedRange); return !savedRange.collapsed;} return false;}
function svgTextEdit(t){
  if(S.svgEdit) S.svgEdit.blur();
  const r=rectOf(t); const inp=document.createElement('input'); inp.className='de-svgedit'; inp.value=t.textContent; inp.setAttribute('aria-label','Label text');
  inp.style.left=r.x+'px'; inp.style.top=(r.y-4)+'px'; inp.style.width=Math.max(140,r.w+40)+'px';
  let done=false; const fin=ok=>{if(done) return; done=true; S.svgEdit=null; if(ok&&inp.value!==t.textContent){const tsp=t.tagName==='text'?t.querySelectorAll('tspan'):[]; if(tsp.length===1) tsp[0].textContent=inp.value; else t.textContent=inp.value; commit('Edit label');} drawOverlay(); syncInspector();};
  inp.addEventListener('keydown',ev=>{ev.stopPropagation(); if(ev.key==='Enter'){fin(true);} if(ev.key==='Escape'){fin(false);}});
  inp.addEventListener('blur',()=>fin(true));
  S.svgEdit=inp; drawOverlay(); inp.focus(); inp.select();
}

/* ======================= commands ======================= */
function deleteSel(){const els=S.sel.filter(e=>e.isConnected); if(!els.length) return; els.forEach(el=>el.remove()); S.sel=[]; commit(els.length>1?'Delete items':'Delete'); drawOverlay(); syncInspector();}
function offsetCopy(src,c,d){const cs=getComputedStyle(src); if(cs.position==='absolute'||cs.position==='relative'){c.style.left=r0((parseFloat(cs.left)||0)+d)+'px'; c.style.top=r0((parseFloat(cs.top)||0)+d)+'px';}}
function duplicateSel(){const els=S.sel.filter(e=>e.isConnected); if(!els.length) return; const out=[]; for(const el of els){const c=el.cloneNode(true); offsetCopy(el,c,20); el.after(c); out.push(c);} commit('Duplicate'); setSel(out);}
function zOrder(mode){const els=S.sel.filter(e=>e.isConnected); if(!els.length) return;
  const list=(mode==='front'||mode==='forward')?els.slice().reverse():els;
  for(const el of list){const p=el.parentElement;
    if(mode==='front') p.appendChild(el); else if(mode==='back') p.insertBefore(el,p.firstChild);
    else if(mode==='forward'){let n=el.nextElementSibling; while(n&&isExtra(n)) n=n.nextElementSibling; if(n) p.insertBefore(el,n.nextSibling);}
    else {let pv=el.previousElementSibling; while(pv&&isExtra(pv)) pv=pv.previousElementSibling; if(pv) p.insertBefore(el,pv);}}
  commit('Reorder'); drawOverlay();}
function groupSel(){const els=S.sel.filter(e=>e.isConnected); if(els.length<2){toast('Select two or more items to group (Shift-click).');return;}
  const p=els[0].parentElement; if(!els.every(e=>e.parentElement===p)){toast('Group works on items that sit in the same container.','warn');return;}
  if(!els.every(e=>getComputedStyle(e).position==='absolute')){toast('Only freely placed items can be grouped.','warn');return;}
  const pb=p.getBoundingClientRect(); const rects=els.map(e=>{const r=e.getBoundingClientRect(); return {x:(r.left-pb.left)/S.scale-p.clientLeft,y:(r.top-pb.top)/S.scale-p.clientTop,w:r.width/S.scale,h:r.height/S.scale};});
  const u=union(rects); const ordered=els.slice().sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
  const g=document.createElement('div'); g.style.cssText=`position: absolute; left: ${r0(u.x)}px; top: ${r0(u.y)}px; width: ${r0(u.w)}px; height: ${r0(u.h)}px`;
  const starts=ordered.map(posStart); ordered[ordered.length-1].after(g);
  starts.forEach(s=>{g.appendChild(s.el); s.el.style.left=r0(s.left-r0(u.x))+'px'; s.el.style.top=r0(s.top-r0(u.y))+'px';});
  commit('Group'); S.scope=null; setSel([g]);}
function ungroupSel(){const g=S.sel[0]; if(!g||S.sel.length!==1||!hasBlockKids(g)){toast('Select a group to ungroup.');return;}
  const kids=kidsOf(g); if(!kids.every(k=>getComputedStyle(k).position==='absolute')||getComputedStyle(g).position==='static'){toast('This container lays its items out automatically, so it can’t be ungrouped here. Double-click into it to edit items.','warn');return;}
  const gl=parseFloat(getComputedStyle(g).left)||0, gt=parseFloat(getComputedStyle(g).top)||0; const starts=kids.map(posStart);
  starts.forEach(s=>{g.before(s.el); s.el.style.left=r0(s.left+gl)+'px'; s.el.style.top=r0(s.top+gt)+'px';}); g.remove();
  commit('Ungroup'); setSel(kids);}
function alignSel(mode){const els=S.sel.filter(e=>e.isConnected); if(!els.length) return;
  const rs=els.map(slideRect); const B=els.length>1?union(rs):{x:0,y:0,w:S.W,h:S.H};
  els.forEach((el,i)=>{const r=rs[i]; let dx=0,dy=0;
    if(mode==='l') dx=B.x-r.x; if(mode==='c') dx=B.x+B.w/2-(r.x+r.w/2); if(mode==='r') dx=B.x+B.w-(r.x+r.w);
    if(mode==='t') dy=B.y-r.y; if(mode==='m') dy=B.y+B.h/2-(r.y+r.h/2); if(mode==='b') dy=B.y+B.h-(r.y+r.h);
    const s=posStart(el); applyPos(s,s.left+dx,s.top+dy);});
  commit('Align'); drawOverlay(); syncGeom();}
function distribute(axis){const els=S.sel.filter(e=>e.isConnected); if(els.length<3) return;
  const items=els.map(el=>({el,r:slideRect(el)})).sort((a,b)=>axis==='h'?a.r.x-b.r.x:a.r.y-b.r.y);
  const first=items[0].r, last=items[items.length-1].r; const total=items.reduce((t,i)=>t+(axis==='h'?i.r.w:i.r.h),0);
  const span=axis==='h'?(last.x+last.w-first.x):(last.y+last.h-first.y); const gap=(span-total)/(items.length-1);
  let pos=axis==='h'?first.x:first.y;
  items.forEach(it=>{const s=posStart(it.el); if(axis==='h'){applyPos(s,s.left+(pos-it.r.x),s.top); pos+=it.r.w+gap;} else {applyPos(s,s.left,s.top+(pos-it.r.y)); pos+=it.r.h+gap;}});
  commit('Distribute'); drawOverlay();}
function nudge(dx,dy){const els=S.sel.filter(e=>e.isConnected); if(!els.length) return; els.forEach(el=>{const s=posStart(el); applyPos(s,s.left+dx,s.top+dy);}); drawOverlay(); syncGeom(); clearTimeout(S.nudgeT); S.nudgeT=setTimeout(()=>commit('Nudge'),500);}

/* ---------- inserting ---------- */
function guessAccent(){
  const sec=S.slides[Math.min(2,S.slides.length-1)]||S.slides[0]; if(!sec) return '#2557D6';
  const txt=(sec.innerHTML||'').slice(0,300000); const cnt={}; (txt.match(/#[0-9a-fA-F]{6}\b/g)||[]).forEach(h=>{h=h.toUpperCase(); cnt[h]=(cnt[h]||0)+1;});
  let best=null,bn=0; for(const h in cnt){const [r,g,b]=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255); const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, s=mx===mn?0:(mx-mn)/(1-Math.abs(2*l-1)); if(s>0.45&&l>0.25&&l<0.62&&cnt[h]>bn){best=h;bn=cnt[h];}}
  return best||'#2557D6';
}
function tint(hex,a){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.substr(i,2),16)); const m=v=>Math.round(v+(255-v)*a).toString(16).padStart(2,'0'); return '#'+m(r)+m(g)+m(b);}
function insertTarget(){if(S.scope&&S.scope.isConnected&&getComputedStyle(S.scope).position!=='static') return S.scope; return rootOf(curSec());}
function viewCenter(){const sb=stageBox.getBoundingClientRect(), sv=stageScroll.getBoundingClientRect();
  const x=((Math.max(sb.left,sv.left)+Math.min(sb.right,sv.right))/2-sb.left)/S.scale, y=((Math.max(sb.top,sv.top)+Math.min(sb.bottom,sv.bottom))/2-sb.top)/S.scale;
  return {x:isFinite(x)?x:S.W/2,y:isFinite(y)?y:S.H/2};}
function placeIn(el,parent,cx,cy,w,h){
  parent.appendChild(el);
  const pr=parent===rootOf(curSec())?{x:0,y:0}:slideRect(parent);
  el.style.left=r0(cx-w/2-pr.x-(parent.clientLeft||0))+'px'; el.style.top=r0(cy-h/2-pr.y-(parent.clientTop||0))+'px';
}
function insertText(text,at){
  endEdit(); const d=document.createElement('div'); const c=at||viewCenter(); const w=text&&text.length>60?640:400;
  d.style.cssText=`position: absolute; width: ${w}px; font-size: 24px; line-height: 32px`;
  d.textContent=text||'New text'; placeIn(d,insertTarget(),c.x,c.y,w,32); if(text&&window.katex) renderTyped(d); commit('Add text'); setSel([d]); if(!text) startEdit(d); else if(!window.katex) renderTypedSoon(d);
}
function insertShape(kind){
  endEdit(); const a=S.accent, c=viewCenter(); let el, w=240, h=140;
  if(kind==='rect'||kind==='round'||kind==='ellipse'){el=document.createElement('div');
    el.style.cssText=`position: absolute; width: ${w}px; height: ${h}px; box-sizing: border-box; background: ${tint(a,0.85)}; border: 2px solid ${a}; border-radius: ${kind==='round'?'12px':kind==='ellipse'?'50%':'0'}`;}
  else if(kind==='line'){w=240;h=2; el=document.createElement('div'); el.style.cssText=`position: absolute; width: ${w}px; height: 2px; background: #16181D`;}
  else if(kind==='arrow'){w=200;h=16; el=document.createElement('div');
    el.style.cssText=`position: absolute; width: ${w}px; height: ${h}px; display: flex; align-items: center; color: #16181D`;
    el.innerHTML='<div style="flex: 1; height: 2.5px; background: currentColor"></div><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style="flex: none; display: block"><path d="M0 0L14 7L0 14Z" fill="currentColor"/></svg>';}
  else if(kind==='label'){w=0;h=0; el=document.createElement('div'); el.style.cssText=`position: absolute; box-sizing: border-box; height: 26px; padding: 0 12px; background: #FFFFFF; border: 1.5px solid ${a}; border-radius: 13px; font-size: 14px; line-height: 22px; font-weight: 600; color: ${a}; white-space: nowrap`; el.textContent='Label';}
  placeIn(el,insertTarget(),c.x,c.y,w||100,h||26); commit('Add shape'); setSel([el]);
  if(kind==='label') startEdit(el);
}
function readAsDataURL(f){return new Promise((ok,bad)=>{const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>bad(r.error); r.readAsDataURL(f);});}
async function prepImage(file){
  let url=await readAsDataURL(file); const im=new Image(); im.src=url; try{await im.decode();}catch(_){}
  let w=im.naturalWidth||400, h=im.naturalHeight||300;
  if(!/svg/.test(file.type)&&(Math.max(w,h)>2600||file.size>4e6)){const f=Math.min(1,2600/Math.max(w,h)); const cv=document.createElement('canvas'); cv.width=Math.round(w*f); cv.height=Math.round(h*f); cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height); url=cv.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',0.9); w=cv.width; h=cv.height;}
  return {url,w,h};
}
async function insertImageFile(file,at){
  if(!file||!/^image\//.test(file.type)) return null; endEdit();
  const {url,w,h}=await prepImage(file); const f=Math.min(1,(S.W*0.5)/w,(S.H*0.6)/h); const dw=r0(w*f), dh=r0(h*f);
  const c=at||viewCenter(); const img=document.createElement('img'); img.src=url;
  img.style.cssText=`position: absolute; width: ${dw}px; height: ${dh}px; object-fit: contain`;
  placeIn(img,insertTarget(),c.x,c.y,dw,dh); commit('Add image'); setSel([img]);
  focusAlt(); toast('Image added. Describe it in the Alt text box on the right.'); return img;
}
function replaceImage(img){pickImage(async files=>{const f=files[0]; if(!f) return; const {url}=await prepImage(f); img.src=url; img.removeAttribute('srcset'); commit('Replace image'); drawOverlay(); toast('Image replaced. Check that its alt text still fits.');});}
let imgCb=null; function pickImage(cb){imgCb=cb; $('#fileImg').value=''; $('#fileImg').click();}
$('#fileImg').onchange=e=>{const fs=Array.from(e.target.files||[]); if(imgCb){const cb=imgCb; imgCb=null; cb(fs);}};

/* ---------- clipboard ---------- */
const CLIPKEY='data-deck-editor-clip';
const isField=t=>t&&t.closest&&t.closest('input,textarea,select,.modal');
document.addEventListener('copy',e=>{if(isField(e.target)||S.editing||!S.sel.length) return; const html=S.sel.map(el=>el.outerHTML).join(''); const plain=S.sel.map(el=>el.textContent.trim()).join('\n');
  S.clip=html; S.clipPlain=plain; S.pasteN=0; e.clipboardData.setData('text/html',`<div ${CLIPKEY}="1">${html}</div>`); e.clipboardData.setData('text/plain',plain||' '); e.preventDefault();});
document.addEventListener('cut',e=>{if(isField(e.target)||S.editing||!S.sel.length) return; const html=S.sel.map(el=>el.outerHTML).join(''); const plain=S.sel.map(el=>el.textContent.trim()).join('\n');
  S.clip=html; S.clipPlain=plain; S.pasteN=-1; e.clipboardData.setData('text/html',`<div ${CLIPKEY}="1">${html}</div>`); e.clipboardData.setData('text/plain',plain||' '); e.preventDefault(); deleteSel();});
document.addEventListener('paste',async e=>{
  if(isField(e.target)&&!S.editing) return;
  const dt=e.clipboardData; if(!dt) return; const files=Array.from(dt.files||[]).filter(f=>/^image\//.test(f.type));
  if(S.editing){ e.preventDefault(); if(files.length){endEdit(); for(const f of files) await insertImageFile(f); return;} document.execCommand('insertText',false,dt.getData('text/plain')); return; }
  if(files.length){e.preventDefault(); for(const f of files) await insertImageFile(f); return;}
  const html=dt.getData('text/html')||''; const plain=dt.getData('text/plain')||'';
  let src=null; if(html.includes(CLIPKEY)){const t=document.createElement('template'); t.innerHTML=html; const w=t.content.querySelector('['+CLIPKEY+']'); if(w) src=w.innerHTML;}
  if(!src&&S.clip&&plain===(S.clipPlain||' ')) src=S.clip;
  if(src){e.preventDefault(); pasteElements(src); return;}
  const m=html.match(/<img[^>]+src="(data:image\/[^"]+)"/i); if(m){e.preventDefault(); const b=await (await fetch(m[1])).blob(); await insertImageFile(new File([b],'pasted',{type:b.type})); return;}
  if(plain.trim()){e.preventDefault(); insertText(plain.trim());}
});
function pasteElements(html){
  endEdit(); const t=document.createElement('template'); t.innerHTML=html; const els=Array.from(t.content.children); if(!els.length) return;
  const parent=insertTarget(); S.pasteN=(S.pasteN||0)+1; const off=S.pasteN>0?20*S.pasteN:0;
  const out=[]; for(const el of els){parent.appendChild(el); const cs=getComputedStyle(el); if(off&&(cs.position==='absolute'||cs.position==='relative')){el.style.left=r0((parseFloat(cs.left)||0)+off)+'px'; el.style.top=r0((parseFloat(cs.top)||0)+off)+'px';} out.push(el);}
  commit('Paste'); setSel(out);
}

/* ======================= slides ======================= */
function makeBlankSection(){
  const ref=curSec(); const sec=document.createElement('section'); sec.setAttribute('data-title','New slide');
  const refRoot=rootOf(ref); let root;
  if(refRoot&&refRoot!==baseOf(ref)){root=refRoot.cloneNode(false);} else {root=document.createElement('div'); root.style.cssText=`width: ${S.W}px; height: ${S.H}px; position: relative; box-sizing: border-box; background: #FBFBFA; color: #16181D; overflow: hidden`;}
  root.style.position='relative'; root.style.display=''; root.style.flexDirection=''; root.style.justifyContent=''; root.style.padding='';
  let tStyle=null,sStyle=null;
  for(const s of S.slides){const L=layersOf(s); const b=L.length?L[0]:s; const r=b.querySelector(':scope > div'); if(!r) continue; const k=kidsOf(r);
    if(k[0]&&/position:\s*absolute/.test(k[0].getAttribute('style')||'')&&parseFloat(k[0].style.fontSize)>=36){tStyle=k[0].getAttribute('style'); if(k[1]&&parseFloat(k[1].style.fontSize)<36) sStyle=k[1].getAttribute('style'); break;}}
  const t=document.createElement('div'); t.setAttribute('style',tStyle||'position: absolute; left: 64px; top: 48px; width: 1152px; font-size: 48px; line-height: 56px; font-weight: 600'); t.textContent='Slide title'; root.appendChild(t);
  if(sStyle){const s=document.createElement('div'); s.setAttribute('style',sStyle); s.textContent='Subtitle'; root.appendChild(s);}
  sec.appendChild(root);
  const cp=ref.querySelector(':scope > .slide-copy'); if(cp) sec.appendChild(cp.cloneNode(true));
  return sec;
}
$('#sAdd').onclick=()=>pickLayout();
$('#sDup').onclick=()=>slidesOp('Duplicate slide',()=>{const s=curSec().cloneNode(true); if(s.dataset.title) s.dataset.title+=' (copy)'; S.slides.splice(S.cur+1,0,s); S.cur++;});
$('#sDel').onclick=()=>{if(S.slides.length<2) return; slidesOp('Delete slide',()=>{S.slides.splice(S.cur,1); S.cur=Math.min(S.cur,S.slides.length-1);});};
$('#sUp').onclick=()=>{if(S.cur===0) return; slidesOp('Move slide',()=>{const [s]=S.slides.splice(S.cur,1); S.cur--; S.slides.splice(S.cur,0,s);});};
$('#sDown').onclick=()=>{if(S.cur>=S.slides.length-1) return; slidesOp('Move slide',()=>{const [s]=S.slides.splice(S.cur,1); S.cur++; S.slides.splice(S.cur,0,s);});};

/* ======================= alt text ======================= */
function altInfo(el){
  const tag=el.tagName.toLowerCase(), role=el.getAttribute('role');
  const graphic=tag==='img'||tag==='svg'||role==='img'||tag==='canvas'||tag==='video'||tag==='picture'||tag==='object';
  if(el.getAttribute('aria-hidden')==='true') return graphic?{kind:'deco'}:null;
  if(role==='presentation'||role==='none') return graphic?{kind:'deco'}:null;
  if(tag==='img'){if(!el.hasAttribute('alt')) return {kind:'missing'}; const a=el.getAttribute('alt'); return a.trim()?{kind:'ok',text:a}:{kind:'deco'};}
  const lab=el.getAttribute('aria-label'); if(lab&&lab.trim()) return {kind:'ok',text:lab.trim()};
  const lb=el.getAttribute('aria-labelledby'); if(lb){const root=secOf(el)||document; const t=lb.split(/\s+/).map(id=>{try{const n=root.querySelector('#'+CSS.escape(id)); return n?n.textContent:'';}catch(_){return '';}}).join(' ').trim(); if(t) return {kind:'ok',text:t};}
  if(tag==='svg'){const t=el.querySelector(':scope > title'); if(t&&t.textContent.trim()) return {kind:'ok',text:t.textContent.trim()}; return {kind:'missing'};}
  if(graphic) return {kind:'missing'};
  return null;
}
function altWalk(root,skipLayers,out){
  for(const c of root.children){ if(isExtra(c)) continue; if(skipLayers&&c.classList.contains('step-layer')&&skipLayers!==c) continue;
    const info=altInfo(c); if(info){out.push(Object.assign({el:c},info)); continue;}
    if(c.tagName.toLowerCase()==='svg'||c.getAttribute('aria-hidden')==='true') continue;
    altWalk(c,null,out);}
  return out;
}
function altTargetsCurrent(){const sec=curSec(); const L=layersOf(sec); return altWalk(sec,L.length?baseOf(sec):null,[]);}
function missingCount(sec){const L=layersOf(sec); if(!L.length) return altWalk(sec,null,[]).filter(a=>a.kind==='missing').length;
  let m=0; for(const l of L){m=Math.max(m,altWalk(sec,l,[]).filter(a=>a.kind==='missing').length);} return m;}
function drawAlt(){
  const items=altTargetsCurrent(); const W=S.W*S.scale;
  for(const a of items){ if(isGhost(a.el)) continue; const r=rectOf(a.el); if(r.w<2||r.h<2) continue;
    box(r,'de-altbox '+a.kind);
    const b=document.createElement('button'); b.type='button'; b.className='de-badge '+a.kind;
    const k=document.createElement('span'); k.className='k'; k.textContent=a.kind==='ok'?'Alt text':a.kind==='missing'?'No alt text':'Decorative'; b.appendChild(k);
    if(a.kind==='ok') b.appendChild(document.createTextNode(a.text)); else if(a.kind==='missing') b.appendChild(document.createTextNode('Click to describe this'));
    const bw=Math.max(170,Math.min(r.w,360)); b.style.width=a.kind==='ok'?bw+'px':'auto'; b.style.maxWidth=bw+'px';
    b.style.left=Math.max(0,Math.min(r.x,W-bw))+'px'; b.style.top=Math.max(0,r.y)+'px';
    b.title=a.kind==='ok'?a.text:k.textContent;
    b.addEventListener('pointerdown',ev=>ev.stopPropagation());
    b.addEventListener('click',()=>{const it=itemFor(a.el)||a.el; S.scope=(it===a.el||!a.el.parentElement)?S.scope:null; if(it!==a.el){S.scope=a.el.parentElement;} setSel([a.el]); focusAlt();});
    overlay.appendChild(b);}
}
function toggleAlt(on){S.showAlt=on==null?!S.showAlt:on; $('#bAlt').setAttribute('aria-pressed',S.showAlt); drawOverlay();}
let altT=null; function updateAltStatusSoon(){clearTimeout(altT); altT=setTimeout(updateAltStatus,600);}
function updateAltStatus(){
  let tot=0; const per=S.slides.map(s=>{const n=missingCount(s); tot+=n; return n;});
  const b=$('#altStatus'); b.classList.toggle('bad',tot>0); b.classList.toggle('good',tot===0);
  b.textContent=tot?`Alt text: ${tot} missing`:'Alt text: all described'; b.title=tot?'Jump to the next picture without alt text':'Every picture has alt text or is marked decorative';
  $$('#slideList .thumb').forEach((t,i)=>{const tf=t.querySelector('.tf'); let m=tf.querySelector('.miss'); if(per[i]){if(!m){m=document.createElement('span'); m.className='miss'; tf.appendChild(m);} m.textContent=per[i]+' alt'; m.title=per[i]+' picture(s) without alt text';} else if(m) m.remove();});
  return per;
}
$('#altStatus').onclick=()=>{
  const per=updateAltStatus(); if(!per.some(Boolean)){toast('Every picture in this deck has alt text or is marked decorative.');return;}
  const n=S.slides.length;
  const tryOn=i=>{const sec=S.slides[i]; const L=layersOf(sec); const cands=L.length?L.map((l,li)=>({li,list:altWalk(sec,l,[]).filter(a=>a.kind==='missing')})):[{li:-1,list:altWalk(sec,null,[]).filter(a=>a.kind==='missing')}];
    for(const c of cands){ const after=(i===S.cur)?c.list.filter(a=>!S.sel.includes(a.el)&&(!S.sel[0]||(S.sel[0].compareDocumentPosition(a.el)&Node.DOCUMENT_POSITION_FOLLOWING))):c.list;
      if(after.length){ if(i!==S.cur) go(i); if(c.li>=0) setLayer(c.li); toggleAlt(true); const el=after[0].el; const it=itemFor(el); if(it&&it!==el) S.scope=el.parentElement; setSel([el]); focusAlt(); return true;}}
    return false;};
  for(let k=0;k<=n;k++){const i=(S.cur+k)%n; if(tryOn(i)) return; }
};
function focusAlt(){requestAnimationFrame(()=>{const t=$('#aText'); if(t&&!$('#pAlt').hidden){t.focus(); t.scrollIntoView({block:'nearest'});}});}
