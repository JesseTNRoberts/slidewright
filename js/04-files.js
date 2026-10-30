/* Slidewright: files. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= files ======================= */
const canFS=()=>{try{return 'showOpenFilePicker' in window&&window.top===window;}catch(_){return false;}};
async function confirmDiscard(){if(!S.dirty) return true; const v=await modal('Open another deck?','Your changes to '+S.name+' haven’t been saved. They stay in this browser’s recovery copy, but the open deck will be replaced.',[['Cancel',null],['Save first','save'],['Open anyway','ok','primary']]); if(v==='save'){await save(false); return true;} return v==='ok';}
async function openFile(){if(!(await confirmDiscard())) return;
  if(canFS()){try{const [h]=await window.showOpenFilePicker({types:[{description:'Slide deck (HTML or PowerPoint)',accept:{'text/html':['.html','.htm'],'application/vnd.openxmlformats-officedocument.presentationml.presentation':['.pptx']}}]}); const f=await h.getFile(); if(isPptx(f)){ importPptx(f); return; } openText(await f.text(),f.name,h); addRecent(h,f.name,false); return;}catch(e){if(e&&e.name==='AbortError') return;}}
  $('#fileDeck').value=''; $('#fileDeck').click();}
$('#fileDeck').onchange=async e=>{const f=e.target.files&&e.target.files[0]; if(!f) return; if(isPptx(f)) importPptx(f); else openText(await f.text(),f.name,null);};
function openText(text,name,handle){toast('Opening '+name+'…'); setTimeout(()=>{if(loadHTML(text,name,handle)) toast(`Opened ${name}: ${S.slides.length} slide${S.slides.length>1?'s':''}.`);},30);}
function savedClone(s,doc){ doc=doc||document; const c=doc.importNode(s,true); undefang(c);
  c.querySelectorAll('.sw-math[data-sw-delim]').forEach(m=>{const d=m.getAttribute('data-sw-delim')==='display'; m.replaceWith(doc.createTextNode((d?'\\[':'\\(')+m.getAttribute('data-latex')+(d?'\\]':'\\)')));});
  c.querySelectorAll('[contenteditable],.de-shown,.de-cur').forEach(m=>{if(m.classList.contains('sw-math')||m.getAttribute('contenteditable')) m.removeAttribute('contenteditable'); m.classList.remove('de-shown','de-cur'); if(!m.getAttribute('class')) m.removeAttribute('class');});
  return c; }
function serialize(){
  const doc=S.doc, host=S.host; const editing=S.editing; if(editing) editing.removeAttribute('contenteditable');
  host.replaceChildren(); S.slides.forEach(s=>{host.appendChild(doc.createTextNode('\n')); host.appendChild(savedClone(s,doc));}); host.appendChild(doc.createTextNode('\n'));
  if(editing) editing.setAttribute('contenteditable','true');
  if(S.gh&&doc.head){ let m=doc.head.querySelector('meta[name="slidewright-source"]'); if(!m){ m=doc.createElement('meta'); m.setAttribute('name','slidewright-source'); doc.head.insertBefore(m,doc.head.querySelector('title')||null); }
    m.setAttribute('content',`github:${S.gh.owner}/${S.gh.repo}@${S.gh.branch}:${S.gh.path}`); }
  /* highlight effects must beat an item's own inline colour */
  if(doc.head&&S.slides.some(x=>x.querySelector('.fragment[class*="highlight-"]'))&&!doc.getElementById('slidewright-fx')){ const st=doc.createElement('style'); st.id='slidewright-fx'; st.textContent='.reveal .slides section .fragment.highlight-red.visible{color:#ff2c2d!important}.reveal .slides section .fragment.highlight-green.visible{color:#17ff2e!important}.reveal .slides section .fragment.highlight-blue.visible{color:#1b91ff!important}'; doc.head.appendChild(st); }
  const dt=doc.doctype?'<!DOCTYPE '+doc.doctype.name+'>':'<!doctype html>';
  const html=dt+'\n'+doc.documentElement.outerHTML; host.replaceChildren(); return html;
}
let dlPromise=null; function downloadsCap(){if(!dlPromise) dlPromise=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(()=>null):Promise.resolve(null); return dlPromise;}
downloadsCap();
async function save(asCopy){ if(S.gh&&!asCopy) return commitToGitHub(); if(S.web&&!asCopy) return saveWebDeck(); if(S.gdrive&&!asCopy) return saveToDrive(false); return saveLocal(asCopy); }
async function saveLocal(asCopy){
  if(!S.doc) return; if(S.editing) endEdit(); commit(); const html=serialize();
  if(!asCopy&&S.handle&&S.handle.createWritable){try{const w=await S.handle.createWritable(); await w.write(html); await w.close(); markSaved(S.localGit?`Saved ${S.localPath||S.name}. Commit it with GitHub Desktop or git when you’re ready.`:'Saved '+S.name+'.'); return;}catch(e){if(e&&e.name==='AbortError') return;}}
  if(canFS()&&window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:S.name,types:[{description:'HTML slide deck',accept:{'text/html':['.html']}}]}); const w=await h.createWritable(); await w.write(html); await w.close(); if(!asCopy){S.handle=h; S.name=h.name;} markSaved('Saved '+h.name+'.'); return;}catch(e){if(e&&e.name==='AbortError') return;}}
  const dl=await Promise.race([downloadsCap(),new Promise(r=>setTimeout(()=>r(null),1500))]);
  if(dl){try{await dl.save({filename:S.name.replace(/\.htm$/i,'.html'),data:new Blob([html],{type:'text/html'})}); markSaved('Saved '+S.name+' to your downloads.');}catch(e){toast(e&&e.code==='declined'?'Save cancelled.':'This view can’t save files. Open the editor in its own tab and try again.','warn');} return;}
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download=S.name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},5000); markSaved('Downloaded '+S.name+'.');
}
function markSaved(msg){S.dirty=false; updateFileName(); toast(msg); idb('delete','draft');}
function updateFileName(){const f=$('#fileName'); f.textContent=S.gh?`${S.gh.repo}/${S.gh.path}`:S.gdrive?`Drive: ${S.gdrive.name}`:(S.localPath||S.name); f.title=(S.gh?`GitHub: ${S.gh.owner}/${S.gh.repo} · ${S.gh.branch} · ${S.gh.path}`:S.gdrive?`Google Drive: ${S.gdrive.name}`:S.name)+(S.dirty?' (unsaved changes)':''); f.classList.toggle('dirty',S.dirty);}
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault(); e.returnValue='';}});
/* recovery copy in IndexedDB */
let dbp=null; function idbOpen(){if(!dbp) dbp=new Promise(ok=>{try{const r=indexedDB.open('deck-editor',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>ok(r.result); r.onerror=()=>ok(null); r.onblocked=()=>ok(null);}catch(_){ok(null);}}); return dbp;}
async function idb(op,key,val){try{const db=await idbOpen(); if(!db) return null; return await new Promise(ok=>{const tx=db.transaction('kv',op==='get'?'readonly':'readwrite'); const st=tx.objectStore('kv'); const rq=op==='get'?st.get(key):op==='put'?st.put(val,key):st.delete(key); rq.onsuccess=()=>ok(rq.result); rq.onerror=()=>ok(null);});}catch(_){return null;}}
let asT=null; function scheduleAutosave(){clearTimeout(asT); asT=setTimeout(()=>{if(S.editing||!S.doc||S.sample&&!S.dirty){scheduleAutosave();return;} try{idb('put','draft',{html:serialize(),name:S.name,time:Date.now()});}catch(_){}},5000);}
async function checkRecovery(){const d=await idb('get','draft'); if(!d||!d.html) return; const mins=Math.max(1,Math.round((Date.now()-d.time)/60000));
  const when=mins<60?mins+' min ago':mins<1440?Math.round(mins/60)+' h ago':Math.round(mins/1440)+' days ago';
  const bn=document.createElement('div'); bn.id='banner'; bn.innerHTML='<span></span><button class="btn">Restore</button><button class="btn">Discard</button>'; bn.firstChild.textContent=`Unsaved edits to ${d.name} from ${when} are still here.`;
  const [rb,db]=bn.querySelectorAll('button'); rb.onclick=()=>{bn.remove(); if(loadHTML(d.html,d.name,null)){S.dirty=true; updateFileName(); toast('Restored your unsaved edits. Save to keep them.');} relayout();}; db.onclick=()=>{idb('delete','draft'); bn.remove(); relayout();};
  const app=$('#app'); app.style.gridTemplateRows='auto auto auto minmax(0,1fr) auto'; app.insertBefore(bn,$('#side')); bn.style.gridArea='auto'; bn.style.gridRow='3';}
function relayout(){$('#app').style.gridTemplateRows=''; applyZoom();}
/* drag files in */
let dragDepth=0; const dh=()=>$('#dropHint');
window.addEventListener('dragenter',e=>{if(dragIdx!=null||!e.dataTransfer||!Array.from(e.dataTransfer.types||[]).includes('Files')) return; dragDepth++; if(!dh()){const d=document.createElement('div'); d.id='dropHint'; d.textContent='Drop an image to add it, or an .html deck to open it'; stageScroll.appendChild(d);}});
window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0; dh()&&dh().remove();}});
window.addEventListener('dragover',e=>{if(dragIdx==null&&e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault();});
window.addEventListener('drop',async e=>{if(dragIdx!=null) return; dragDepth=0; dh()&&dh().remove(); const fs=Array.from((e.dataTransfer&&e.dataTransfer.files)||[]); if(!fs.length) return; e.preventDefault();
  const pp=fs.find(isPptx); if(pp){ if(await confirmDiscard()) importPptx(pp); return; }
  const deckF=fs.find(f=>/\.html?$/i.test(f.name)||f.type==='text/html'); if(deckF){if(await confirmDiscard()) openText(await deckF.text(),deckF.name,null); return;}
  const b=stageBox.getBoundingClientRect(); let at={x:(e.clientX-b.left)/S.scale,y:(e.clientY-b.top)/S.scale}; if(at.x<0||at.y<0||at.x>S.W||at.y>S.H) at=null;
  for(const f of fs.filter(f=>/^image\//.test(f.type))){await insertImageFile(f,at); if(at) at={x:at.x+24,y:at.y+24};}});

/* ======================= present ======================= */
function present(){
  if(!S.doc) return; endEdit(); const html=presentHTML({toolbar:true}); const wrap=document.createElement('div'); wrap.id='present';
  const fr=document.createElement('iframe'); fr.title='Presentation'; fr.setAttribute('allow','fullscreen; autoplay'); fr.setAttribute('sandbox',DECK_SANDBOX);
  const cl=document.createElement('button'); cl.className='tb close'; cl.style.cssText='background:#fff;color:#000'; cl.textContent='Close (Esc twice)';
  const B=deckBridge(fr,window);
  const close=()=>{B.close(); wrap.remove(); if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); document.removeEventListener('keydown',kd,true); window.removeEventListener('resize',ask); stageScroll.focus();};
  let lastEsc=0; const esc=()=>{const t=Date.now(); if(t-lastEsc<600) close(); lastEsc=t;}; const kd=e=>{if(e.key==='Escape') esc();};
  cl.onclick=close; wrap.append(fr,cl); document.body.appendChild(wrap); document.addEventListener('keydown',kd,true);
  const i=S.cur, li=layerIndex(curSec()); const t0=Date.now();
  B.on('ready',()=>{ B.R.slide(i,0,li>0?li-1:undefined); fr.focus(); B.send('focus'); });
  B.on('key',k=>{ if(k==='Escape') esc(); else if(k==='f'){ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else if(wrap.requestFullscreen) wrap.requestFullscreen().catch(()=>{}); } });
  B.on('embeds',items=>embedOverlays(document,wrap,fr,items)); const ask=()=>B.send('hello'); window.addEventListener('resize',ask);
  setTimeout(()=>{ if(!B.st.ready&&wrap.isConnected) toast('The deck’s own player didn’t start here. Save the file and open it in your browser to present it.','warn'); },10000+0*t0);
  fr.srcdoc=html; if(wrap.requestFullscreen) wrap.requestFullscreen().catch(()=>{});
}

/* ======================= new / sample decks ======================= */
const REVEAL_V='vendor/reveal.js-5.1.0/';
async function revealAssets(){ try{ const [css,js]=await Promise.all(['reveal.css','reveal.js'].map(f=>fetch(REVEAL_V+f).then(r=>{if(!r.ok) throw new Error(r.status); return r.text();}))); if(!/Reveal/.test(js)) return null; return {css,js}; }catch(_){ return null; } }
function deckShell(title,sections,assets){return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${assets?'<style>\n'+assets.css+'\n</style>':'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">'}
<style>
html,body{background:#FBFBFA}
.reveal{font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#16181D}
.reveal .slides{text-align:left}
.reveal .slides section{padding:0;width:1280px;height:720px;box-sizing:border-box;line-height:normal;font-size:16px}
.reveal .slides section > div{position:absolute;left:0;top:0}
</style>
</head>
<body>
<div class="reveal"><div class="slides">
${sections}
</div></div>
${assets?'<script>\n'+assets.js.replace(/<\/script/gi,'<\\/script')+'\n<\/script>':'<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script>'}
<script>Reveal.initialize({width:1280,height:720,margin:0.03,center:false,hash:true,controls:true,progress:true,transition:'fade'});<\/script>
</body>
</html>`;}
const ROOT='width: 1280px; height: 720px; position: relative; box-sizing: border-box; background: #FBFBFA; color: #16181D; overflow: hidden';
const TITLE='position: absolute; left: 64px; top: 48px; width: 1152px; font-size: 48px; line-height: 56px; font-weight: 600; letter-spacing: -0.01em';
const SUB='position: absolute; left: 64px; top: 112px; width: 1152px; font-size: 21px; line-height: 28px; color: #4E5360';
const CARD='box-sizing: border-box; padding: 22px; background: #FFFFFF; border: 1px solid #DADDE2; border-radius: 12px; display: flex; flex-direction: column; gap: 10px';
const NUM="font-family: ui-monospace, Menlo, monospace; font-size: 15px; line-height: 20px; color: #2557D6; font-weight: 500";
function sampleDeck(){
  const s1=`<section data-title="Try the editor here">
<div style="${ROOT}">
<div style="position: absolute; left: 64px; top: 120px; width: 1152px; font-size: 64px; line-height: 72px; font-weight: 600; letter-spacing: -0.01em">Try the editor here</div>
<div style="position: absolute; left: 64px; top: 208px; width: 1152px; font-size: 26px; line-height: 36px; color: #4E5360">This is a practice deck. Press <b>Open</b> to load one of your own reveal.js decks.</div>
<div style="position: absolute; left: 64px; top: 268px; width: 120px; height: 4px; background: #2557D6"></div>
<div style="position: absolute; left: 64px; top: 380px; width: 1152px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px">
<div style="${CARD}; height: 176px"><div style="${NUM}">CLICK</div><div style="font-size: 21px; line-height: 29px">Select anything, then drag it. Corner handles resize; the dot on top rotates.</div></div>
<div style="${CARD}; height: 176px"><div style="${NUM}">DOUBLE-CLICK</div><div style="font-size: 21px; line-height: 29px">Type into text. On a card like this one, the first double-click opens it.</div></div>
<div style="${CARD}; height: 176px"><div style="${NUM}">PASTE</div><div style="font-size: 21px; line-height: 29px">Copy a screenshot, then press Ctrl/Cmd+V here. You can also drop image files on the slide.</div></div>
</div>
</div>
</section>`;
  const bars=[['Augment',61],['Conv',88],['Both',94]].map(([l,v],i)=>`<rect x="${80+i*150}" y="${300-v*2.6}" width="96" height="${v*2.6}" rx="4" fill="${i===2?'#2557D6':'#9DB6F2'}"/><text x="${128+i*150}" y="${290-v*2.6}" text-anchor="middle" font-size="18" font-weight="600" fill="#16181D">${v}%</text><text x="${128+i*150}" y="330" text-anchor="middle" font-size="16" fill="#4E5360">${l}</text>`).join('');
  const s2=`<section data-title="Alt text, at a glance">
<div style="${ROOT}">
<div style="${TITLE}">Alt text, at a glance</div>
<div style="${SUB}">Press <b>A</b> (or the Alt text button) to see what screen readers will say</div>
<svg width="560" height="360" viewBox="0 0 560 360" role="img" aria-label="Bar chart of shifted-digit accuracy: augmentation 61%, convolution 88%, both 94%." style="position: absolute; left: 64px; top: 180px; width: 560px; height: 360px; background: #FFFFFF; border: 1px solid #DADDE2; border-radius: 12px">${bars}<line x1="60" y1="300" x2="520" y2="300" stroke="#8E94A0" stroke-width="1.5"/></svg>
<svg width="480" height="300" viewBox="0 0 480 300" style="position: absolute; left: 700px; top: 180px; width: 480px; height: 300px"><rect width="480" height="300" rx="12" fill="#FDF1E8"/><circle cx="160" cy="150" r="80" fill="#F7CDB0" stroke="#C2510F" stroke-width="3"/><circle cx="300" cy="150" r="80" fill="none" stroke="#16181D" stroke-width="3"/><text x="230" y="270" text-anchor="middle" font-size="16" fill="#8A3A0A">overlap = what both models get right</text></svg>
<div style="position: absolute; left: 700px; top: 500px; width: 480px; font-size: 16px; line-height: 23px; color: #4E5360">The chart has alt text. This diagram doesn’t yet: select it and describe it in the panel on the right.</div>
<div aria-hidden="true" style="position: absolute; left: 64px; top: 620px; width: 1152px; height: 1px; background: #DADDE2"></div>
<div style="position: absolute; left: 64px; top: 636px; width: 1152px; font-size: 22px; line-height: 30px">Thin rules and shapes like the line above are marked <b>decorative</b>.</div>
</div>
</section>`;
  const s3=`<section data-title="Your turn">
<div style="${ROOT}">
<div style="${TITLE}">Your turn</div>
<div style="${SUB}">Saving writes a normal reveal.js file you can present anywhere</div>
<div style="position: absolute; left: 64px; top: 200px; width: 540px; display: flex; flex-direction: column; gap: 14px; font-size: 22px; line-height: 32px">
<div>Alt-drag a corner to scale a whole card, text included.</div>
<div>Shift-click to pick several items, then align or group them.</div>
<div>Ctrl/Cmd+Z undoes anything, even deleted slides.</div>
</div>
<div style="position: absolute; left: 720px; top: 200px; width: 420px; height: 240px; box-sizing: border-box; padding: 28px 32px; border-radius: 16px; background: #16181D; color: #FBFBFA; display: flex; flex-direction: column; gap: 10px"><div style="font-family: ui-monospace, Menlo, monospace; font-size: 15px; line-height: 20px; color: #9DB6F2">NEXT STEP</div><div style="font-size: 34px; line-height: 42px; font-weight: 600">Open your own deck</div><div style="font-size: 18px; line-height: 26px; color: #C9CDD6">Use the Open button, or drop the .html file onto this window.</div></div>
</div>
<aside class="notes"><p>Speaker notes live here. Edit them in the Slide panel when nothing is selected.</p></aside>
</section>`;
  return deckShell('Slidewright practice deck',[s1,s2,s3].join('\n'));
}
async function newDeck(){if(!(await confirmDiscard())) return; const s=`<section data-title="Title slide">
<div style="${ROOT}">
<h1 style="position: absolute; left: 64px; top: 220px; width: 1152px; margin: 0; font-size: 64px; line-height: 72px; font-weight: 600; letter-spacing: -0.01em">Deck title</h1>
<div style="position: absolute; left: 64px; top: 308px; width: 1152px; font-size: 26px; line-height: 36px; color: #4E5360">Subtitle</div>
</div>
</section>`; const a=await revealAssets(); loadHTML(deckShell('Untitled deck',s,a),'untitled-deck.html',null); S.dirty=true; updateFileName(); if(!a) toast('New deck uses reveal.js from jsDelivr because the bundled copy wasn’t reachable here.');}

/* ======================= shared helpers for new features ======================= */
function contentRoot(b){const k=kidsOf(b).filter(c=>c.tagName==='DIV'&&!c.classList.contains('slide-copy')&&!c.classList.contains('pdf-get')&&!c.classList.contains('step-layer')); return k.length===1?k[0]:b;}
function finalBase(sec){const L=layersOf(sec); return L.length?L[L.length-1]:sec;}
function clickStates(scope,only){
  const frs=Array.from(scope.querySelectorAll('.fragment')).filter(f=>!only||only(f));
  const idx=new Map(), unordered=[];
  frs.forEach(f=>{const v=f.getAttribute('data-fragment-index'); if(v!=null&&v!==''&&!isNaN(+v)){const k=+v; if(!idx.has(k)) idx.set(k,[]); idx.get(k).push(f);} else unordered.push(f);});
  const groups=[...idx.keys()].sort((a,b)=>a-b).map(k=>idx.get(k)); unordered.forEach(f=>groups.push([f]));
  return groups;
}
function discardRecs(){mo.takeRecords(); pending=[];}
function pathOf(el,root){const p=[]; for(let e=el;e&&e!==root;e=e.parentElement){const par=e.parentElement; if(!par) return null; p.unshift(Array.prototype.indexOf.call(par.children,e));} return p;}
function atPath(root,p){let e=root; for(const i of p){ if(!e||!e.children[i]) return null; e=e.children[i]; } return e;}
const thumbRO=new ResizeObserver(ents=>{for(const e of ents){const w=e.contentRect.width; if(w>0) e.target.style.setProperty('--tk',String(w/S.W));}});
let STATE_CSS_=null; const stateCSS=()=>STATE_CSS_||(STATE_CSS_='.de-deck .slides section .fragment:not(.de-shown),.de-deck .slides section .fragment.current-visible:not(.de-cur){opacity:0!important;visibility:hidden!important}\n'+fxStateCSS('.de-deck .slides section'));
function makeThumbHost(sec,opts){
  opts=opts||{}; const host=document.createElement('div'); host.className='th-host'; host.setAttribute('aria-hidden','true');
  const sr=host.attachShadow({mode:'open'});
  try{ if(!thumbSheet){thumbSheet=new CSSStyleSheet(); thumbSheet.replaceSync(thumbCSSText());} sr.adoptedStyleSheets=[thumbSheet]; }
  catch(e){ const st=document.createElement('style'); st.textContent=thumbCSSText(); sr.appendChild(st); }
  const c=sec.cloneNode(true); c.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable')); c.removeAttribute('contenteditable');
  const st=document.createElement('style');
  if(opts.k!=null){ clickStates(c).forEach((g,i)=>{if(i<opts.k) g.forEach(f=>f.classList.add('de-shown')); if(i===opts.k-1) g.forEach(f=>f.classList.add('de-cur'));}); st.textContent=stateCSS(); }
  else { const L=layersOf(c); if(L.length){const k=Array.from(c.children).indexOf(L[L.length-1])+1; st.textContent=`.de-deck .slides>section>.step-layer{display:none!important}.de-deck .slides>section>.step-layer:nth-child(${k}){display:block!important}`;} }
  sr.appendChild(st);
  const wrap=document.createElement('div'); wrap.className='reveal de-deck'; wrap.style.setProperty('--de-w',S.W+'px'); wrap.style.setProperty('--de-h',S.H+'px');
  const sl=document.createElement('div'); sl.className='slides'; sl.appendChild(c); wrap.appendChild(sl); sr.appendChild(wrap);
  if(opts.width) host.style.setProperty('--tk',String(opts.width/S.W));
  thumbRO.observe(host);
  return host;
}
function progressCard(title){
  const el=document.createElement('div'); el.className='progress'; el.setAttribute('role','status'); el.setAttribute('aria-live','polite');
  el.innerHTML='<div class="pt"></div><div class="track"><i></i></div><div class="pl"></div><button class="btn">Cancel</button>';
  el.querySelector('.pt').textContent=title; document.body.appendChild(el); const st={cancelled:false};
  el.querySelector('button').onclick=()=>{st.cancelled=true;};
  st.set=(f,l)=>{el.querySelector('i').style.width=Math.round(f*100)+'%'; if(l!=null) el.querySelector('.pl').textContent=l;};
  st.close=()=>el.remove(); return st;
}
const tick=()=>new Promise(r=>setTimeout(r,0));
function loadScript(src,check){ if(check()) return Promise.resolve(check()); const srcs=Array.isArray(src)?src:[src];
  const one=u=>new Promise((ok,bad)=>{const sc=document.createElement('script'); sc.src=u; sc.onload=()=>check()?ok(check()):bad(new Error('Loaded but not available')); sc.onerror=()=>{sc.remove(); bad(new Error('Could not load '+u));}; document.head.appendChild(sc);});
  return srcs.reduce((pr,u)=>pr.catch(()=>check()?check():one(u)),Promise.reject()).catch(()=>{throw new Error('Could not load '+srcs[srcs.length-1]);}); }
async function saveFile(name,blob,desc,ext,mime){
  if(canFS()&&window.showSaveFilePicker){try{const h=await window.showSaveFilePicker({suggestedName:name,types:[{description:desc,accept:{[mime]:[ext]}}]}); const w=await h.createWritable(); await w.write(blob); await w.close(); toast('Saved '+h.name+'.'); return true;}catch(e){if(e&&e.name==='AbortError') return false;}}
  const dl=await Promise.race([downloadsCap(),new Promise(r=>setTimeout(()=>r(null),1500))]);
  if(dl){try{await dl.save({filename:name,data:blob}); toast('Saved '+name+' to your downloads.'); return true;}catch(e){toast(e&&e.code==='declined'?'Save cancelled.':'This view can’t save files.','warn'); return false;}}
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},5000); toast('Downloaded '+name+'.'); return true;
}
const baseName=()=>S.name.replace(/\.html?$/i,'');
function el(tag,attrs,...kids){const e=document.createElement(tag); if(attrs) for(const k in attrs){ if(k==='class') e.className=attrs[k]; else if(k==='text') e.textContent=attrs[k]; else if(k.startsWith('on')) e[k]=attrs[k]; else e.setAttribute(k,attrs[k]); } kids.flat().forEach(c=>{ if(c!=null) e.append(c); }); return e;}
