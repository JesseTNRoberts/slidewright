/* Slidewright: media. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= tables ======================= */
const TBL_LINE='#C9CDD4';
const cellCSS=head=>`border: 1px solid ${TBL_LINE}; padding: 8px 12px; text-align: left; vertical-align: top`+(head?`; background: ${tint(S.accent,0.88)}; font-weight: 600`:'');
function makeTable(rows,cols,header){
  const t=document.createElement('table'); t.style.cssText='position: absolute; width: 760px; border-collapse: collapse; font-size: 20px; line-height: 28px; background: #FFFFFF';
  const cap=document.createElement('caption'); cap.textContent='Table'; cap.className='sw-sr'; cap.style.cssText='position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'; t.appendChild(cap);
  if(header){ const th=t.createTHead(), tr=th.insertRow(); for(let c=0;c<cols;c++){ const x=document.createElement('th'); x.scope='col'; x.style.cssText=cellCSS(true); x.textContent='Heading '+(c+1); tr.appendChild(x);} }
  const tb=t.createTBody(); for(let r=0;r<rows-(header?1:0);r++){ const tr=tb.insertRow(); for(let c=0;c<cols;c++){ const x=tr.insertCell(); x.style.cssText=cellCSS(false); x.innerHTML='<br>'; } }
  return t; }
function insertTable(rows,cols){ endEdit(); const t=makeTable(rows,cols,true); const c=viewCenter(); placeIn(t,insertTarget(),c.x,c.y,760,(rows)*45); commit('Add table'); setSel([t]); startEdit(t); const first=t.querySelector('td,th'); if(first) caretIn(first); }
function caretIn(cell){ const r=document.createRange(); r.selectNodeContents(cell); if(!cell.textContent.trim()) r.collapse(false); /* text is selected so typing replaces it */ const s=getSelection(); s.removeAllRanges(); s.addRange(r); savedRange=r.cloneRange(); }
function tableOf(){ const el=S.editing&&S.editing.tagName==='TABLE'?S.editing:S.sel.length===1&&S.sel[0].tagName==='TABLE'?S.sel[0]:null; return el; }
function curCell(t){ if(!S.editing) return null; const s=getSelection(); let n=s.rangeCount?s.anchorNode:null; if(!n&&savedRange) n=savedRange.startContainer; if(!n) return null; const c=(n.nodeType===1?n:n.parentElement).closest('td,th'); return c&&t.contains(c)?c:null; }
function tableTab(back){ const t=S.editing; const cells=[...t.querySelectorAll('th,td')]; const c=curCell(t); let i=cells.indexOf(c);
  if(!back&&i===cells.length-1){ tableOp('rowBelow'); const cs=[...t.querySelectorAll('th,td')]; caretIn(cs[i+1]); return; }
  i=i<0?0:Math.max(0,Math.min(cells.length-1,i+(back?-1:1))); caretIn(cells[i]); }
function tableOp(op){ const t=tableOf(); if(!t) return; const c=curCell(t); const rows=[...t.rows]; const tr=c?c.parentElement:rows[rows.length-1]; const ci=c?c.cellIndex:(tr.cells.length-1);
  const blank=(like,tag)=>{ const x=document.createElement(tag||(like.tagName==='TH'&&like.scope==='row'?'th':like.tagName==='TH'&&like.closest('thead')?'td':like.tagName.toLowerCase())); x.style.cssText=like.style.cssText; if(x.tagName==='TH'&&like.scope) x.scope=like.scope; if(like.closest('thead')&&x.tagName==='TD'){ x.style.cssText=cellCSS(false); } x.innerHTML='<br>'; return x; };
  if(op==='rowAbove'||op==='rowBelow'){ let ref=tr; if(ref.closest('thead')&&op==='rowAbove') ref=t.tBodies[0]&&t.tBodies[0].rows[0]||ref;
    const src=ref.closest('thead')?(t.tBodies[0]&&t.tBodies[0].rows[0])||ref:ref; const nr=document.createElement('tr'); [...src.cells].forEach(x=>nr.appendChild(blank(x)));
    if(ref.closest('thead')){ (t.tBodies[0]||t.createTBody()).prepend(nr); } else if(op==='rowAbove') ref.before(nr); else ref.after(nr); }
  else if(op==='colLeft'||op==='colRight'){ rows.forEach(r=>{ const ref=r.cells[Math.min(ci,r.cells.length-1)]; if(!ref) return; const x=blank(ref,ref.tagName.toLowerCase()); if(ref.tagName==='TH'&&ref.closest('thead')) x.textContent='Heading'; if(op==='colLeft') ref.before(x); else ref.after(x); }); }
  else if(op==='delRow'){ if(t.rows.length<=1){ toast('A table needs at least one row. Delete the table instead.'); return; } tr.remove(); const th=t.tHead; if(th&&!th.rows.length) th.remove(); }
  else if(op==='delCol'){ if(rows[0].cells.length<=1){ toast('A table needs at least one column. Delete the table instead.'); return; } rows.forEach(r=>{ const x=r.cells[Math.min(ci,r.cells.length-1)]; if(x) x.remove(); }); }
  commit('Edit table'); drawOverlay(); syncInspector(); }
$$('[data-tbl]').forEach(b=>{ b.addEventListener('mousedown',e=>e.preventDefault()); b.onclick=()=>{ if(S.editing) restoreRange(); tableOp(b.dataset.tbl); }; });
function syncTablePane(t){ $('#tblHead').checked=!!(t.tHead&&t.tHead.rows.length); $('#tblHeadCol').checked=[...(t.tBodies[0]?t.tBodies[0].rows:[])].every(r=>r.cells[0]&&r.cells[0].tagName==='TH'&&r.cells[0].scope==='row')&&!!(t.tBodies[0]&&t.tBodies[0].rows.length);
  $('#tblBand').checked=t.hasAttribute('data-banded'); $('#tblEven').checked=t.style.tableLayout==='fixed';
  const cap=t.querySelector('caption'); setV('#tblCap',cap?cap.textContent:''); $('#tblCapShow').checked=!!(cap&&!cap.classList.contains('sw-sr'));
  $('#tblWhere').textContent=S.editing===t?'Typing. Tab moves to the next cell; Tab in the last cell adds a row. Esc finishes.':'Double-click a cell to type. Tab moves to the next cell.'; }
function band(t){ const on=t.hasAttribute('data-banded'); [...(t.tBodies[0]?t.tBodies[0].rows:[])].forEach((r,i)=>[...r.cells].forEach(x=>{ if(x.tagName==='TH') return; x.style.background=on&&i%2===1?tint(S.accent,0.95):''; })); }
$('#tblHead').onchange=e=>{ const t=tableOf(); if(!t) return; if(e.target.checked){ const body=t.tBodies[0]; const first=body&&body.rows[0]; const th=t.createTHead(); const tr=th.insertRow(); const n=first?first.cells.length:1;
    for(let i=0;i<n;i++){ const x=document.createElement('th'); x.scope='col'; x.style.cssText=cellCSS(true); x.textContent='Heading '+(i+1); tr.appendChild(x); } }
  else if(t.tHead){ const body=t.tBodies[0]||t.createTBody(); const r=t.tHead.rows[0]; const nr=document.createElement('tr'); [...r.cells].forEach(x=>{ const d=document.createElement('td'); d.style.cssText=cellCSS(false); d.innerHTML=x.innerHTML; nr.appendChild(d); }); body.prepend(nr); t.tHead.remove(); }
  band(t); commit('Table header'); syncInspector(); drawOverlay(); };
$('#tblHeadCol').onchange=e=>{ const t=tableOf(); if(!t) return; [...(t.tBodies[0]?t.tBodies[0].rows:[])].forEach(r=>{ const x=r.cells[0]; if(!x) return; const y=document.createElement(e.target.checked?'th':'td'); y.innerHTML=x.innerHTML; y.style.cssText=cellCSS(e.target.checked); if(e.target.checked) y.scope='row'; x.replaceWith(y); }); band(t); commit('Table header column'); syncInspector(); };
$('#tblBand').onchange=e=>{ const t=tableOf(); if(!t) return; if(e.target.checked) t.setAttribute('data-banded',''); else t.removeAttribute('data-banded'); band(t); commit('Banded rows'); };
$('#tblEven').onchange=e=>{ const t=tableOf(); if(!t) return; t.style.tableLayout=e.target.checked?'fixed':''; commit('Column widths'); drawOverlay(); };
function tblCaption(t){ let c=t.querySelector('caption'); if(!c){ c=document.createElement('caption'); t.prepend(c); } return c; }
$('#tblCap').addEventListener('change',e=>{ const t=tableOf(); if(!t) return; tblCaption(t).textContent=e.target.value.trim()||'Table'; commit('Table caption'); });
$('#tblCapShow').onchange=e=>{ const t=tableOf(); if(!t) return; const c=tblCaption(t); if(e.target.checked){ c.classList.remove('sw-sr'); c.style.cssText='caption-side: top; text-align: left; font-weight: 600; padding: 0 0 6px'; } else { c.className='sw-sr'; c.style.cssText='position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'; } commit('Table caption'); drawOverlay(); };
function tablePicker(anchor){ $$('.tblpick').forEach(x=>x.remove()); const R=8,C=10; const box=el('div',{class:'menu tblpick',role:'dialog','aria-label':'Table size'}); const lab=el('div',{class:'hint',style:'padding:4px 6px',text:'Choose a size'}); const grid=el('div',{style:`display:grid;grid-template-columns:repeat(${C},18px);gap:3px;padding:6px`});
  let hr=3,hc=3; const paint=()=>{ [...grid.children].forEach((b,i)=>{ const r=Math.floor(i/C)+1, c=i%C+1; b.style.background=r<=hr&&c<=hc?'var(--acc, #2557D6)':'transparent'; }); lab.textContent=`${hr} × ${hc} (rows × columns, first row is the header)`; };
  for(let r=1;r<=R;r++) for(let c=1;c<=C;c++){ const b=el('button',{type:'button','aria-label':`${r} rows by ${c} columns`,style:'width:18px;height:18px;padding:0;border:1px solid #9AA0AC;border-radius:2px;cursor:pointer'}); b.onmouseenter=b.onfocus=()=>{hr=r;hc=c;paint();}; b.onclick=()=>{ box.remove(); off(); insertTable(r,c); }; grid.appendChild(b); }
  box.append(lab,grid); const rr=anchor.getBoundingClientRect(); box.style.cssText+=`;position:fixed;left:${Math.min(rr.left,window.innerWidth-260)}px;top:${rr.bottom+4}px;width:auto`; document.body.appendChild(box); paint(); grid.children[2*C+2].focus();
  const off=()=>document.removeEventListener('pointerdown',out,true); const out=e=>{ if(!box.contains(e.target)){ box.remove(); off(); } }; setTimeout(()=>document.addEventListener('pointerdown',out,true),0);
  box.addEventListener('keydown',e=>{ if(e.key==='Escape'){ box.remove(); off(); anchor.focus(); } }); }
$('#bTable').onclick=e=>tablePicker(e.currentTarget);


/* ======================= video and audio ======================= */
const isMediaEl=el=>!!el&&(el.tagName==='VIDEO'||el.tagName==='AUDIO'||(el.classList&&el.classList.contains('sw-embed')));
function pickMediaFile(accept){ return new Promise(res=>{ const i=document.createElement('input'); i.type='file'; i.accept=accept; i.onchange=()=>res(i.files&&i.files[0]||null); i.click(); }); }
async function confirmBig(file){ const mb=file.size/1e6; if(mb<25) return true;
  return (await modal('This is a big file',`${file.name} is ${mb.toFixed(0)} MB. It goes inside the deck, so the deck becomes that much bigger: slower to open and to save${mb>90?', and too big to save to GitHub (100 MB limit)':''}. A link to the file, or a YouTube video, keeps the deck small.`,[['Cancel',null],['Add it anyway','ok','primary']]))==='ok'; }
function mediaSize(file,kind){ return new Promise(res=>{ if(kind==='audio') return res({w:420,h:54}); const v=document.createElement('video'); const u=URL.createObjectURL(file); v.preload='metadata'; v.muted=true;
  v.onloadedmetadata=()=>{ const w=v.videoWidth||16, h=v.videoHeight||9; URL.revokeObjectURL(u); const W=Math.min(800,S.W*0.62); res({w:Math.round(W),h:Math.round(W*h/w)}); }; v.onerror=()=>{ URL.revokeObjectURL(u); res({w:800,h:450}); }; v.src=u; }); }
async function insertMediaFile(kind){
  const file=await pickMediaFile(kind==='video'?'video/*':'audio/*'); if(!file) return; if(!(await confirmBig(file))) return; endEdit();
  const prog=progressCard('Adding '+kind); prog.set(0.3,file.name); let url; try{ url=await readAsDataURL(file); }finally{ prog.close(); }
  const sz=await mediaSize(file,kind); const m=document.createElement(kind); m.setAttribute('controls',''); m.setAttribute('preload','metadata'); if(kind==='video') m.setAttribute('playsinline','');
  m.setAttribute('title',file.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '));
  m.style.cssText=`position: absolute; width: ${sz.w}px; height: ${sz.h}px`+(kind==='video'?'; background: #000000; object-fit: contain':'');
  const src=document.createElement('source'); src.src=url; src.type=file.type||(kind==='video'?'video/mp4':'audio/mpeg'); m.appendChild(src);
  const c=viewCenter(); placeIn(m,insertTarget(),c.x,c.y,sz.w,sz.h); commit('Add '+kind); setSel([m]);
  toast(kind==='video'?'Video added. Add captions in the Media panel so everyone can follow it.':'Audio added. Add a transcript or captions in the Media panel.'); }
function ytId(u){ const m=String(u).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m?m[1]:null; }
function vimeoId(u){ const m=String(u).match(/vimeo\.com\/(?:video\/)?(\d+)/); return m?m[1]:null; }
function embedSrc(el){ const f=el.querySelector('iframe'); return f?f.getAttribute('data-src')||f.getAttribute('src')||'':''; }
function buildEmbed(kind,id,opt){ opt=opt||{}; if(kind==='youtube'){ const q=new URLSearchParams({rel:'0',cc_load_policy:'1',playsinline:'1'}); if(opt.start) q.set('start',String(opt.start)); if(opt.loop){ q.set('loop','1'); q.set('playlist',id);} if(opt.mute) q.set('mute','1'); if(opt.auto) q.set('autoplay','1'); return `https://www.youtube-nocookie.com/embed/${id}?${q}`; }
  const q=new URLSearchParams({texttrack:'en'}); if(opt.loop) q.set('loop','1'); if(opt.mute) q.set('muted','1'); if(opt.auto) q.set('autoplay','1'); return `https://player.vimeo.com/video/${id}?${q}`+(opt.start?`#t=${opt.start}s`:''); }
async function insertMediaLink(){
  const inp=el('input',{type:'url',placeholder:'https://www.youtube.com/watch?v=… or a link to an .mp4 or .mp3'}); const ttl=el('input',{type:'text',placeholder:'e.g. Gradient descent on a saddle point'});
  const body=el('div',{class:'stack'},el('label',{class:'fld'},'Link',inp),el('label',{class:'fld'},'Title (read by screen readers)',ttl),el('p',{class:'hint',text:'YouTube and Vimeo videos play inside the slide when you present (they need an internet connection). Links to video or audio files play like files you add, without making the deck bigger.'}));
  setTimeout(()=>inp.focus(),50); const v=await modal('Add video or audio from a link',body,[['Cancel',null],['Add','ok','primary']]); if(v!=='ok') return; const u=inp.value.trim(); if(!u) return; endEdit();
  const title=ttl.value.trim(); const c=viewCenter(); let item, w=800, h=450; const yt=ytId(u), vm=vimeoId(u);
  if(yt||vm){ item=document.createElement('div'); item.className='sw-embed'; item.style.cssText=`position: absolute; width: ${w}px; height: ${h}px; background: #000000`+(yt?` url(https://i.ytimg.com/vi/${yt}/hqdefault.jpg) center / cover no-repeat`:'');
    /* data-src: reveal.js loads the player only while its slide is showing, and unloads it (stopping playback) when you move on */
    const f=document.createElement('iframe'); f.setAttribute('data-src',buildEmbed(yt?'youtube':'vimeo',yt||vm)); f.title=title||(yt?'YouTube video':'Vimeo video'); f.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen'); f.setAttribute('allowfullscreen',''); f.style.cssText='width: 100%; height: 100%; border: 0; display: block';
    item.appendChild(f); }
  else { const audio=/\.(mp3|m4a|wav|ogg|oga|aac|flac)(\?|#|$)/i.test(u); item=document.createElement(audio?'audio':'video'); item.setAttribute('controls',''); item.setAttribute('preload','metadata'); if(!audio) item.setAttribute('playsinline','');
    if(audio){ w=420; h=54; } item.style.cssText=`position: absolute; width: ${w}px; height: ${h}px`+(audio?'':'; background: #000000; object-fit: contain'); item.src=u; if(title) item.setAttribute('title',title); }
  placeIn(item,insertTarget(),c.x,c.y,w,h); commit('Add media'); setSel([item]); }
$('#bMedia').onclick=e=>menu(e.currentTarget,[['Video from this computer…',()=>insertMediaFile('video')],['Audio from this computer…',()=>insertMediaFile('audio')],['YouTube, Vimeo or a link…',insertMediaLink]]);
function embedOpts(el){ const u=embedSrc(el); let q; try{ q=new URL(u).searchParams; }catch(_){ q=new URLSearchParams(); } const t=(u.match(/#t=(\d+)/)||[])[1];
  return {auto:q.get('autoplay')==='1',loop:q.get('loop')==='1',mute:q.get('mute')==='1'||q.get('muted')==='1',start:+(q.get('start')||t||0)}; }
function syncMediaPane(m){ const emb=m.classList.contains('sw-embed'), audio=m.tagName==='AUDIO';
  $('#mHead').textContent=emb?'Embedded video':audio?'Audio':'Video';
  $('#mPlay').hidden=emb; $('#mReplace').hidden=emb; $('#mPoster').hidden=emb||audio; $('#mCapWrap').hidden=emb; $('#mStartWrap').hidden=!emb; $('#mCtl').parentElement.hidden=emb;
  if(emb){ const o=embedOpts(m); $('#mAuto').checked=o.auto; $('#mLoop').checked=o.loop; $('#mMute').checked=o.mute; setV('#mStart',o.start||''); $('#mHint').textContent='Plays from YouTube or Vimeo when you present, so it needs an internet connection. Captions come from the video’s own captions.'; return; }
  $('#mAuto').checked=m.hasAttribute('data-autoplay'); $('#mLoop').checked=m.hasAttribute('loop'); $('#mMute').checked=m.hasAttribute('muted'); $('#mCtl').checked=m.hasAttribute('controls');
  const tr=m.querySelector('track[kind="captions"],track[kind="subtitles"]'); $('#mCapLbl').textContent=tr?'Captions: '+(tr.getAttribute('label')||'added'):'Captions: none yet'; $('#mCapDel').hidden=!tr;
  const src=m.querySelector('source'); const mb=((src?src.getAttribute('src'):m.getAttribute('src'))||'').length*0.75/1e6;
  $('#mHint').textContent=(mb>0.5?`Stored in the deck (${mb.toFixed(1)} MB). `:'')+'Double-click it on the slide to play or pause. Reveal pauses it when you leave the slide.'; }
const mediaSel=()=>{ const m=S.sel[0]; return m&&isMediaEl(m)?m:null; };
function setEmbed(m,patch){ const f=m.querySelector('iframe'); const u=embedSrc(m); const yt=ytId(u), vm=vimeoId(u); const o=Object.assign(embedOpts(m),patch); f.removeAttribute('src'); f.setAttribute('data-src',buildEmbed(yt?'youtube':'vimeo',yt||vm,o)); }
const flag=(m,attr,on)=>{ if(on) m.setAttribute(attr,''); else m.removeAttribute(attr); if(attr==='muted') m.muted=on; };
$('#mAuto').onchange=e=>{ const m=mediaSel(); if(!m) return; if(m.classList.contains('sw-embed')) setEmbed(m,{auto:e.target.checked}); else flag(m,'data-autoplay',e.target.checked); commit('Media setting'); };
$('#mLoop').onchange=e=>{ const m=mediaSel(); if(!m) return; if(m.classList.contains('sw-embed')) setEmbed(m,{loop:e.target.checked}); else flag(m,'loop',e.target.checked); commit('Media setting'); };
$('#mMute').onchange=e=>{ const m=mediaSel(); if(!m) return; if(m.classList.contains('sw-embed')) setEmbed(m,{mute:e.target.checked}); else flag(m,'muted',e.target.checked); commit('Media setting'); };
$('#mCtl').onchange=e=>{ const m=mediaSel(); if(!m) return; flag(m,'controls',e.target.checked); commit('Media setting'); };
$('#mStart').addEventListener('change',e=>{ const m=mediaSel(); if(!m||!m.classList.contains('sw-embed')) return; setEmbed(m,{start:Math.max(0,Math.round(+e.target.value||0))}); commit('Media start'); });
$('#mPlay').onclick=()=>{ const m=mediaSel(); if(!m||!m.play) return; m.paused?m.play().catch(()=>{}):m.pause(); };
$('#mReplace').onclick=async()=>{ const m=mediaSel(); if(!m) return; const kind=m.tagName.toLowerCase(); const file=await pickMediaFile(kind+'/*'); if(!file||!(await confirmBig(file))) return;
  const url=await readAsDataURL(file); m.removeAttribute('src'); let src=m.querySelector('source'); if(!src){ src=document.createElement('source'); m.prepend(src); } src.setAttribute('src',url); src.setAttribute('type',file.type||''); m.load&&m.load(); commit('Replace media'); syncInspector(); };
function srtToVtt(t){ return 'WEBVTT\n\n'+t.replace(/\r/g,'').replace(/^\d+\n(?=\d\d:)/gm,'').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g,'$1.$2').trim()+'\n'; }
$('#mCapAdd').onclick=async()=>{ const m=mediaSel(); if(!m) return; const f=await pickMediaFile('.vtt,.srt,text/vtt'); if(!f) return; let t=await f.text(); if(/\.srt$/i.test(f.name)||!/^WEBVTT/.test(t)) t=srtToVtt(t);
  m.querySelectorAll('track[kind="captions"],track[kind="subtitles"]').forEach(x=>x.remove()); const tr=document.createElement('track'); tr.setAttribute('kind','captions'); tr.setAttribute('srclang','en'); tr.setAttribute('label','English'); tr.setAttribute('default','');
  tr.setAttribute('src','data:text/vtt;base64,'+btoa(unescape(encodeURIComponent(t)))); m.appendChild(tr); commit('Add captions'); syncInspector(); toast('Captions added. They show by default when the video plays.'); };
$('#mCapDel').onclick=()=>{ const m=mediaSel(); if(!m) return; m.querySelectorAll('track[kind="captions"],track[kind="subtitles"]').forEach(x=>x.remove()); commit('Remove captions'); syncInspector(); };
$('#mPoster').onclick=()=>{ const m=mediaSel(); if(!m||m.tagName!=='VIDEO') return; if(!m.videoWidth){ toast('Play the video to the frame you want first.'); return; }
  const cv=document.createElement('canvas'); const k=Math.min(1,1280/m.videoWidth); cv.width=Math.round(m.videoWidth*k); cv.height=Math.round(m.videoHeight*k); try{ cv.getContext('2d').drawImage(m,0,0,cv.width,cv.height); m.setAttribute('poster',cv.toDataURL('image/jpeg',0.85)); commit('Video cover'); toast('Cover image set.'); }catch(_){ toast('That video doesn’t allow taking a frame from it.','warn'); } };


/* ======================= pictures: crop, size, compress ======================= */
const imgOriginal=new WeakMap();   /* the uncropped picture, kept for this session so a crop can be undone or redone */
function imgBytes(src){ return /^data:/.test(src||'')?Math.round((src.length-src.indexOf(',')-1)*0.75):0; }
const fmtMB=b=>b>=1e6?(b/1e6).toFixed(1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
function syncImagePane(im){ const b=imgBytes(im.getAttribute('src')); $('#iInfo').textContent=`${im.naturalWidth||'?'} × ${im.naturalHeight||'?'} pixels`+(b?`, ${fmtMB(b)} in the deck`:', linked')+'. Drag a corner to resize; Shift keeps the shape.'; $('#iReset').disabled=!im.naturalWidth; }
const selImg=()=>{ const i=S.sel[0]; return i&&i.tagName==='IMG'?i:null; };
$('#iReplace').onclick=()=>{ const i=selImg(); if(i) replaceImage(i); };
$('#iReset').onclick=()=>{ const i=selImg(); if(!i||!i.naturalWidth) return; const w=parseFloat(getComputedStyle(i).width)||i.naturalWidth; i.style.height=Math.round(w*i.naturalHeight/i.naturalWidth)+'px'; commit('Original shape'); drawOverlay(); syncInspector(); };
function placeRect(i,x,y,w,h){ const pr=i.parentElement===rootOf(curSec())?{x:0,y:0}:slideRect(i.parentElement); i.style.left=Math.round(x-pr.x)+'px'; i.style.top=Math.round(y-pr.y)+'px'; i.style.width=Math.round(w)+'px'; i.style.height=Math.round(h)+'px'; i.style.removeProperty('right'); i.style.removeProperty('bottom'); }
$('#iFit').onclick=()=>{ const i=selImg(); if(!i||!i.naturalWidth) return; const a=i.naturalWidth/i.naturalHeight; let w=S.W, h=w/a; if(h>S.H){ h=S.H; w=h*a; } placeRect(i,(S.W-w)/2,(S.H-h)/2,w,h); i.style.objectFit='contain'; commit('Fit the slide'); drawOverlay(); syncInspector(); };
$('#iFill').onclick=()=>{ const i=selImg(); if(!i) return; placeRect(i,0,0,S.W,S.H); i.style.objectFit='cover'; const p=i.parentElement; p.insertBefore(i,p.firstChild); commit('Fill the slide'); drawOverlay(); syncInspector(); toast('The picture now fills the slide behind everything else. Mark it decorative in Alt text if it’s only a backdrop.'); };
function loadImg(src){ return new Promise((ok,bad)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=()=>bad(new Error('That picture could not be read.')); im.src=src; }); }
$('#iCrop').onclick=()=>{ const i=selImg(); if(i) cropImage(i); };
async function cropImage(im){
  endEdit(); const orig=imgOriginal.get(im)||im.getAttribute('src'); let src; try{ src=await loadImg(orig); }catch(e){ toast(e.message,'warn'); return; }
  const NW=src.naturalWidth, NH=src.naturalHeight; if(!NW){ toast('That picture has no size to crop.','warn'); return; }
  const prev=im.dataset.swCrop?im.dataset.swCrop.split(',').map(Number):[0,0,1,1]; let [x0,y0,x1,y1]=imgOriginal.has(im)?prev:[0,0,1,1]; let ratio=0;
  const pic=el('img',{src:orig,alt:''}); const box=el('div',{class:'crop-box'}); ['nw','n','ne','e','se','s','sw','w'].forEach(k=>{ const h=el('i',{'data-h':k}); const L={n:'50%',s:'50%',e:'100%',w:'0',nw:'0',sw:'0',ne:'100%',se:'100%'}[k], T={e:'50%',w:'50%',n:'0',s:'100%',nw:'0',ne:'0',sw:'100%',se:'100%'}[k]; h.style.left=L; h.style.top=T; h.style.transform=`translate(${L==='0'?'0':L==='100%'?'-100%':'-50%'},${T==='0'?'0':T==='100%'?'-100%':'-50%'})`; h.style.cursor=k+'-resize'; box.appendChild(h); });
  const wrap=el('div',{class:'crop-wrap'},pic,box); const info=el('span',{class:'hint'});
  const draw=()=>{ box.style.left=x0*100+'%'; box.style.top=y0*100+'%'; box.style.width=(x1-x0)*100+'%'; box.style.height=(y1-y0)*100+'%'; info.textContent=`${Math.round((x1-x0)*NW)} × ${Math.round((y1-y0)*NH)} pixels kept`; };
  const fix=(k)=>{ const mw=8/NW, mh=8/NH; x0=Math.max(0,Math.min(x0,1-mw)); y0=Math.max(0,Math.min(y0,1-mh)); x1=Math.min(1,Math.max(x1,x0+mw)); y1=Math.min(1,Math.max(y1,y0+mh));
    if(ratio){ const want=ratio*NH/NW; let w=x1-x0, h=y1-y0; if(w/h>want){ w=h*want; if(/w/.test(k||'')) x0=x1-w; else x1=x0+w; } else { h=w/want; if(/n/.test(k||'')) y0=y1-h; else y1=y0+h; } if(x1>1){ x0-=x1-1; x1=1; } if(y1>1){ y0-=y1-1; y1=1; } x0=Math.max(0,x0); y0=Math.max(0,y0); } };
  box.addEventListener('pointerdown',e=>{ e.preventDefault(); box.setPointerCapture(e.pointerId); const k=e.target.dataset.h||'move'; const r=wrap.getBoundingClientRect(); const s0=[x0,y0,x1,y1], px=e.clientX, py=e.clientY;
    const mv=ev=>{ const dx=(ev.clientX-px)/r.width, dy=(ev.clientY-py)/r.height; [x0,y0,x1,y1]=s0;
      if(k==='move'){ const w=x1-x0, h=y1-y0; x0=Math.max(0,Math.min(1-w,x0+dx)); y0=Math.max(0,Math.min(1-h,y0+dy)); x1=x0+w; y1=y0+h; }
      else { if(/w/.test(k)) x0+=dx; if(/e/.test(k)) x1+=dx; if(/n/.test(k)) y0+=dy; if(/s/.test(k)) y1+=dy; fix(k); } draw(); };
    const up=()=>{ box.removeEventListener('pointermove',mv); box.removeEventListener('pointerup',up); }; box.addEventListener('pointermove',mv); box.addEventListener('pointerup',up); });
  const shapes=el('div',{class:'chips'},el('span',{class:'hint',text:'Shape:'}),...[['Free',0],['Original',NW/NH],['16:9',16/9],['4:3',4/3],['1:1',1]].map(([l,v])=>el('button',{type:'button',class:'btn',text:l,onclick:()=>{ ratio=v; fix('se'); draw(); }})));
  draw(); const body=el('div',{class:'stack'},shapes,wrap,info,el('p',{class:'hint',text:'Drag the box or its handles. The part outside the box is removed from the deck; until you close the deck, Crop again can bring it back.'}));
  const v=await modal('Crop picture',body,[['Cancel',null],...(imgOriginal.has(im)?[['Remove crop','reset']]:[]),['Crop','ok','primary']],{wide:true}); if(!v) return;
  if(v==='reset'){ x0=0; y0=0; x1=1; y1=1; }
  const keep=[x0,y0,x1,y1]; const was=im.dataset.swCrop?im.dataset.swCrop.split(',').map(Number):[0,0,1,1];
  const r=slideRect(im); const sx=r.w/((was[2]-was[0])*NW), sy=r.h/((was[3]-was[1])*NH);
  const cw=Math.max(1,Math.round((x1-x0)*NW)), ch=Math.max(1,Math.round((y1-y0)*NH)); const k=Math.min(1,2600/Math.max(cw,ch));
  let url=orig; if(v!=='reset'){ const cv=document.createElement('canvas'); cv.width=Math.round(cw*k); cv.height=Math.round(ch*k); cv.getContext('2d').drawImage(src,x0*NW,y0*NH,cw,ch,0,0,cv.width,cv.height);
    const png=/^data:image\/(png|gif|svg)/.test(orig); url=cv.toDataURL(png?'image/png':'image/jpeg',0.92); }
  if(!imgOriginal.has(im)) imgOriginal.set(im,orig);
  im.src=url; im.removeAttribute('srcset'); if(v==='reset'){ delete im.dataset.swCrop; imgOriginal.delete(im); } else im.dataset.swCrop=keep.map(n=>+n.toFixed(4)).join(',');
  placeRect(im,r.x+(x0-was[0])*NW*sx,r.y+(y0-was[1])*NH*sy,(x1-x0)*NW*sx,(y1-y0)*NH*sy); im.style.objectFit='fill';
  commit(v==='reset'?'Remove crop':'Crop picture'); drawOverlay(); syncInspector(); }
/* Compress: re-encode pictures stored in the deck at no more than twice the largest size they're shown at. */
async function compressImages(){
  endEdit(); commit(); const imgs=S.slides.flatMap(s=>[...s.querySelectorAll('img')]).filter(i=>/^data:image\/(png|jpe?g|webp|bmp)/i.test(i.getAttribute('src')||''));
  if(!imgs.length){ toast('There are no pictures stored in this deck to compress.'); return; }
  const shown=new Map(); imgs.forEach(i=>{ const src=i.getAttribute('src'); const w=parseFloat(i.style.width)||i.offsetWidth||0, h=parseFloat(i.style.height)||i.offsetHeight||0; const p=shown.get(src)||{w:0,h:0,els:[]}; p.w=Math.max(p.w,w); p.h=Math.max(p.h,h); p.els.push(i); shown.set(src,p); });
  const before=[...shown.keys()].reduce((a,s)=>a+imgBytes(s)*shown.get(s).els.length,0);
  const prog=progressCard('Compressing pictures'); let n=0, after=0, changed=0;
  for(const [src,p] of shown){ n++; prog.set(n/shown.size,`Picture ${n} of ${shown.size}`); await new Promise(r=>setTimeout(r,0)); let im; try{ im=await loadImg(src); }catch(_){ after+=imgBytes(src)*p.els.length; continue; }
    const tw=Math.max(1,Math.round((p.w||im.naturalWidth)*2)), th=Math.max(1,Math.round((p.h||im.naturalHeight)*2)); const k=Math.min(1,Math.max(tw/im.naturalWidth,th/im.naturalHeight));
    const cv=document.createElement('canvas'); cv.width=Math.max(1,Math.round(im.naturalWidth*k)); cv.height=Math.max(1,Math.round(im.naturalHeight*k)); const g=cv.getContext('2d'); g.drawImage(im,0,0,cv.width,cv.height);
    let alpha=false; if(/png|webp/i.test(src.slice(0,20))){ try{ const d=g.getImageData(0,0,cv.width,cv.height).data; for(let j=3;j<d.length;j+=4*7) if(d[j]<250){ alpha=true; break; } }catch(_){ alpha=true; } }
    const out=alpha?cv.toDataURL('image/png'):cv.toDataURL('image/jpeg',0.85);
    if(imgBytes(out)<imgBytes(src)*0.9){ p.els.forEach(i=>{ i.setAttribute('src',out); i.removeAttribute('srcset'); }); changed+=p.els.length; after+=imgBytes(out)*p.els.length; } else after+=imgBytes(src)*p.els.length; }
  prog.close(); if(!changed){ toast('The pictures are already as small as they can usefully be.'); return; }
  commit('Compress pictures'); drawOverlay(); syncInspector(); toast(`Compressed ${changed} picture${changed>1?'s':''}: ${fmtMB(before)} → ${fmtMB(after)}. Undo puts them back.`); }


/* ======================= build effects and slide transitions ======================= */
const FX=[['','Fade in'],['fade-up','Fly in from below'],['fade-down','Fly in from above'],['fade-left','Fly in from the right'],['fade-right','Fly in from the left'],
  ['current-visible','Show for this click only'],['fade-in-then-semi-out','Appear, then dim on the next click'],['fade-in-then-out','Appear, then leave on the next click'],
  ['grow','Grow (emphasis)'],['shrink','Shrink (emphasis)'],['highlight-red','Turn red (emphasis)'],['highlight-green','Turn green (emphasis)'],['highlight-blue','Turn blue (emphasis)'],['strike','Strike through (emphasis)'],
  ['semi-fade-out','Dim (exit)'],['fade-out','Fade out (exit)']];
const FX_CLASSES=FX.map(f=>f[0]).filter(Boolean);
$('#bFx').append(...FX.map(([v,l])=>new Option(l,v)));
const fxOf=el=>FX_CLASSES.find(c=>el.classList.contains(c))||'';
$('#bFx').onchange=e=>{ selEls().forEach(el=>{ FX_CLASSES.forEach(c=>el.classList.remove(c)); if(e.target.value) el.classList.add(e.target.value); }); commit('Click effect'); syncInspector(); };
$('#bSpeed').onchange=e=>{ selEls().forEach(el=>{ if(e.target.value) el.style.transitionDuration=e.target.value; else el.style.removeProperty('transition-duration'); }); commit('Click speed'); };
function syncFx(el){ const on=el.classList.contains('fragment')&&!el.classList.contains('step-layer'); $('#bFxWrap').hidden=!on; if(!on) return; setV('#bFx',fxOf(el)); setV('#bSpeed',el.style.transitionDuration||''); }
$('#sTrans').onchange=e=>{ const sec=curSec(); if(e.target.value) sec.setAttribute('data-transition',e.target.value); else sec.removeAttribute('data-transition'); commit('Slide transition'); };
$('#sTransSpeed').onchange=e=>{ const sec=curSec(); if(e.target.value) sec.setAttribute('data-transition-speed',e.target.value); else sec.removeAttribute('data-transition-speed'); commit('Transition speed'); };
/* How each effect looks before and after its click (preview, thumbnails, PDF per click). Built from reveal.js's own fragment styles. */
function fxStateCSS(P){ const H='{opacity:0!important;visibility:hidden!important}', V='{opacity:1!important;visibility:inherit!important}';
  const emph='grow,shrink,highlight-red,highlight-green,highlight-blue,strike,semi-fade-out,fade-out'.split(',');
  return [emph.map(c=>`${P} .fragment.${c}:not(.de-shown)`).join(',')+V,
    `${P} .fragment.fade-out.de-shown`+H, `${P} .fragment.fade-in-then-out.de-shown:not(.de-cur)`+H,
    `${P} .fragment.semi-fade-out.de-shown,${P} .fragment.fade-in-then-semi-out.de-shown:not(.de-cur){opacity:.5!important;visibility:inherit!important}`,
    `${P} .fragment.highlight-red.de-shown{color:#ff2c2d!important}`,`${P} .fragment.highlight-green.de-shown{color:#17ff2e!important}`,`${P} .fragment.highlight-blue.de-shown{color:#1b91ff!important}`,
    `${P} .fragment.strike.de-shown{text-decoration:line-through!important}`,`${P} .fragment.grow.de-shown{transform:scale(1.3)}`,`${P} .fragment.shrink.de-shown{transform:scale(.7)}`].join('\n'); }
const FX_PLAY=`@keyframes swfx-up{from{opacity:0;transform:translate(0,40px)}}@keyframes swfx-down{from{opacity:0;transform:translate(0,-40px)}}@keyframes swfx-left{from{opacity:0;transform:translate(40px,0)}}@keyframes swfx-right{from{opacity:0;transform:translate(-40px,0)}}@keyframes swfx-in{from{opacity:0}}
#deck.de-deck.de-play .slides section .fragment.de-cur{animation:swfx-in .35s ease both}
#deck.de-deck.de-play .slides section .fragment.fade-up.de-cur{animation-name:swfx-up}#deck.de-deck.de-play .slides section .fragment.fade-down.de-cur{animation-name:swfx-down}
#deck.de-deck.de-play .slides section .fragment.fade-left.de-cur{animation-name:swfx-left}#deck.de-deck.de-play .slides section .fragment.fade-right.de-cur{animation-name:swfx-right}
#deck.de-deck.de-play .slides section .fragment.step-layer.de-cur,#deck.de-deck.de-play .slides section .fragment:is(.grow,.shrink,.highlight-red,.highlight-green,.highlight-blue,.strike,.semi-fade-out,.fade-out).de-cur{animation:none}
#deck.de-deck.de-play .slides section .fragment:is(.grow,.shrink){transition:transform .35s ease}
`;
{ const st=document.createElement('style'); st.textContent=fxStateCSS('#deck.de-deck.de-play .slides section')+'\n'+FX_PLAY; document.head.appendChild(st); }
