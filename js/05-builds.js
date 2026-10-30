/* Slidewright: builds. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= 1. linked build steps ======================= */
S.linkSteps=true;
function refreshStepSnap(){
  S.stepSnap=null; const sec=curSec(); if(!sec) return; const L=layersOf(sec); if(L.length<2) return;
  const me=baseOf(sec), root=contentRoot(me); const items=kidsOf(root).map(e=>[e,e.outerHTML]);
  S.stepSnap={sec,layer:me,root,items,map:new Map(items)};
}
function propagateSteps(recs){
  const snap=S.stepSnap; if(!S.linkSteps||!snap||snap.sec!==curSec()||baseOf(snap.sec)!==snap.layer) return 0;
  const root=snap.root, me=snap.layer; let touched=false; const changed=new Set();
  for(const r of recs){let n=r.target.nodeType===1?r.target:r.target.parentElement; if(!n||!(n===root||root.contains(n))) continue; touched=true; if(n===root) continue; while(n.parentElement&&n.parentElement!==root) n=n.parentElement; if(n.parentElement===root) changed.add(n);}
  if(!touched) return 0;
  const cur=kidsOf(root);
  const modified=[...changed].filter(e=>snap.map.has(e)&&snap.map.get(e)!==e.outerHTML);
  const removed=snap.items.filter(([e])=>e.parentElement!==root);
  const added=cur.filter(e=>!snap.map.has(e));
  if(!modified.length&&!removed.length&&!added.length) return 0;
  const L=layersOf(snap.sec), my=L.indexOf(me); let steps=0;
  L.forEach((Lr,li)=>{ if(Lr===me) return; const r2=contentRoot(Lr); const kids=kidsOf(r2); let htmls=null; const used=new Set(); let n=0;
    const find=h=>{ if(!htmls) htmls=kids.map(k=>k.outerHTML); for(let i=0;i<kids.length;i++) if(!used.has(i)&&htmls[i]===h){used.add(i); return kids[i];} return null; };
    for(const e of modified){const m=find(snap.map.get(e)); if(m){m.replaceWith(e.cloneNode(true)); n++;}}
    for(const [,h] of removed){const m=find(h); if(m){m.remove(); n++;}}
    if(li>my) for(const e of added){const idx=cur.indexOf(e); const ref=kidsOf(r2)[idx]||null; r2.insertBefore(e.cloneNode(true),ref); n++;}
    if(n) steps++; });
  return steps;
}
let linkT=null; function flashLink(n){const t=$('#linkNote'); t.textContent=`Also changed in ${n} other step${n>1?'s':''}`; clearTimeout(linkT); linkT=setTimeout(()=>t.textContent='',2600);}
$('#linkChk').onchange=e=>{S.linkSteps=e.target.checked; refreshStepSnap(); toast(S.linkSteps?'Build steps linked: matching items change together.':'Build steps unlinked: edits change only the step you’re on.');};

/* ======================= 2. build preview & click order ======================= */
const PV={on:false,k:0,groups:[]};
function pvBar(){let b=$('#pvBar'); if(!b){b=el('div',{id:'pvBar',class:'pvbar',role:'toolbar','aria-label':'Click preview'},
  el('button',{class:'btn',title:'Previous click (←)',onclick:()=>pvStep(-1),text:'◀'}),
  el('span',{class:'pvl',id:'pvLabel'}),
  el('button',{class:'btn',title:'Next click (→ or Space)',onclick:()=>pvStep(1),text:'▶'}),
  el('button',{class:'btn',onclick:()=>pvEnterSlide(false),text:'Replay slide'}),
  el('button',{class:'btn primary',onclick:stopPreview,text:'Done'})); stageScroll.appendChild(b);} return b;}
function pvClear(sec){ if(sec) sec.querySelectorAll('.de-shown,.de-cur').forEach(f=>f.classList.remove('de-shown','de-cur')); }
function restartAnims(t){ try{ getComputedStyle(t).opacity; (t.getAnimations?t.getAnimations({subtree:true}):[]).forEach(a=>{try{a.cancel(); a.play();}catch(_){}}); }catch(_){} }
function pvApply(restartWhole){
  const sec=curSec(); const shown=new Set(); PV.groups.forEach((g,i)=>{if(i<PV.k) g.forEach(f=>shown.add(f));});
  const curG=new Set(PV.groups[PV.k-1]||[]); sec.querySelectorAll('.fragment').forEach(f=>{const on=shown.has(f); if(f.classList.contains('de-shown')!==on) f.classList.toggle('de-shown',on); const c=curG.has(f); if(f.classList.contains('de-cur')!==c) f.classList.toggle('de-cur',c);});
  if(restartWhole) restartAnims(sec); else (PV.groups[PV.k-1]||[]).forEach(restartAnims);
  discardRecs();
  $('#pvLabel').textContent=PV.groups.length?(PV.k?`Click ${PV.k} of ${PV.groups.length}`:`Start · ${PV.groups.length} click${PV.groups.length>1?'s':''}`):'No clicks on this slide';
  $('#pvLabel').textContent+=`  ·  Slide ${S.cur+1}/${S.slides.length}`;
}
function pvEnterSlide(atEnd){ PV.groups=clickStates(curSec()); PV.k=atEnd?PV.groups.length:0; pvApply(true); }
function startPreview(){ if(PV.on||!S.slides.length) return; endEdit(); commit(); PV.on=true; S.sel=[]; S.scope=null; S.hover=null;
  layerStyle.textContent=''; deck.classList.add('de-play'); pvBar().hidden=false; $('#bPreview').setAttribute('aria-pressed','true'); pvEnterSlide(false); drawOverlay(); syncInspector(); stageScroll.focus({preventScroll:true}); }
function stopPreview(){ if(!PV.on) return; pvClear(curSec()); PV.on=false; deck.classList.remove('de-play'); discardRecs(); applyLayerStyle(); pvBar().hidden=true; $('#bPreview').setAttribute('aria-pressed','false'); drawOverlay(); syncInspector(); }
function pvStep(d){
  if(d>0){ if(PV.k<PV.groups.length){PV.k++; pvApply(false);} else if(S.cur<S.slides.length-1){pvClear(curSec()); discardRecs(); go(S.cur+1); layerStyle.textContent=''; pvEnterSlide(false);} }
  else { if(PV.k>0){PV.k--; pvApply(false);} else if(S.cur>0){pvClear(curSec()); discardRecs(); go(S.cur-1); layerStyle.textContent=''; pvEnterSlide(true);} }
}
$('#bPreview').onclick=()=>PV.on?stopPreview():startPreview();
function renderClicks(){
  const host=$('#sClicks'); if(!host) return; host.replaceChildren(); const sec=curSec(); if(!sec) return;
  const base=baseOf(sec); const groups=clickStates(base,f=>!f.classList.contains('step-layer'));
  const L=layersOf(sec);
  if(!groups.length){ host.appendChild(el('p',{class:'hint',text:L.length?`This slide builds through ${L.length} steps (pick one below the slide). Nothing else appears on click.`:'Nothing on this slide appears on click. Select an item and tick “Appears on click”.'})); return; }
  groups.forEach((g,gi)=>{ host.appendChild(el('div',{class:'clk-h',text:'Click '+(gi+1)}));
    g.forEach(f=>{ const [k,t]=describe(f);
      const row=el('div',{class:'clk-row'},
        el('button',{class:'clk-name',title:'Select',onclick:()=>{S.scope=topLevel().includes(f)?null:f.parentElement; setSel([f]);}},el('span',{class:'ty',text:k}),el('span',{class:'tx',text:t})),
        el('button',{class:'ib',title:'Appear one click earlier','aria-label':'Earlier',onclick:()=>moveClick(f,-1),text:'↑'}),
        el('button',{class:'ib',title:'Appear one click later','aria-label':'Later',onclick:()=>moveClick(f,1),text:'↓'}));
      host.appendChild(row); }); });
}
function moveClick(f,d){
  const base=baseOf(curSec()); let groups=clickStates(base,x=>!x.classList.contains('step-layer')).map(g=>g.slice());
  const gi=groups.findIndex(g=>g.includes(f)); if(gi<0) return; groups[gi]=groups[gi].filter(x=>x!==f);
  const alone=!groups[gi].length;
  if(d<0){ if(gi>0) groups[gi-1].push(f); else if(!alone) groups.unshift([f]); else groups[gi].push(f); }
  else { if(gi<groups.length-1) groups[gi+1].push(f); else if(!alone) groups.push([f]); else groups[gi].push(f); }
  groups=groups.filter(g=>g.length); groups.forEach((g,i)=>g.forEach(x=>x.setAttribute('data-fragment-index',String(i))));
  commit('Click order'); renderClicks();
}

/* ======================= 4. accessibility check ======================= */
function lum(c){const v=c.map(x=>{x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}); return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];}
function prgb(s){const m=s&&s.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return {c:p.slice(0,3),a:p.length>3?p[3]:1};}
const ratio=(a,b)=>{const A=lum(a),B=lum(b); return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05);};
const toHexC=c=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
function fixColor(fg,bg,need){let best=null; for(const toward of [[0,0,0],[255,255,255]]){ for(let t=0.02;t<=1.0001;t+=0.02){const c=fg.map((v,i)=>v+(toward[i]-v)*t); if(ratio(c,bg)>=need+0.05){ if(!best||t<best.t) best={t,c}; break;}} } if(best) return toHexC(best.c); return ratio([0,0,0],bg)>ratio([255,255,255],bg)?'#000000':'#FFFFFF';}
let lastAudit=null, auditMin=12;
const SEV_ORDER=['severe','major','minor','advice'];
const SEV_LABEL={severe:'Severe',major:'Major',minor:'Minor',advice:'Not scored'};
const PLACEHOLDER_ALT=/^(image|img|picture|pic|photo|graphic|figure|fig|chart|diagram|icon|logo|spacer|screenshot|screen shot|untitled|alt|alt text|placeholder|description)(\s*\d+)?\.?$/i;
const FILENAME_ALT=/^\S+\.(png|jpe?g|gif|svg|webp|bmp|tiff?|heic)$|^(img|dsc|image|screenshot|screen shot)[\s_-]?\d+(\.\w+)?$/i;
const VAGUE_LINK=/^(click here|here|link|more|read more|learn more|this|this link|go|details)$/i;
const DEPRECATED=['font','center','big','strike','tt','marquee','blink','basefont','acronym','applet','dir'];
function renameTag(e,tag){const n=e.ownerDocument.createElement(tag); for(const a of Array.from(e.attributes)) n.setAttribute(a.name,a.value); while(e.firstChild) n.appendChild(e.firstChild); e.replaceWith(n); return n;}
function headingSafe(n){const st=n.style; if(!st.marginTop&&!st.marginBottom&&!st.marginLeft&&!st.marginRight&&!st.margin) st.margin='0';
  const d={'font-size':'inherit','font-weight':'inherit','font-family':'inherit','line-height':'inherit','letter-spacing':'inherit','text-transform':'none','text-shadow':'none'}; for(const k in d) if(!st.getPropertyValue(k)) st.setProperty(k,d[k]);}
function toHeading(e,level){ if(/^H[1-6]$/.test(e.tagName)&&e.tagName==='H'+level) return e; const n=renameTag(e,'h'+level); n.removeAttribute('role'); n.removeAttribute('aria-level'); headingSafe(n); return n; }
function findTitle(base,sec){const want=normText(sec.getAttribute('data-title')||''); let best=null,bfs=0;
  for(const e of base.querySelectorAll('*')){ if(e.ownerSVGElement||e.closest('svg,aside,.slide-copy,.pdf-get,.sw-math')) continue; if(hasBlockKids(e)) continue; const t=normText(e.textContent); if(!t) continue; if(want&&t===want) return e;
    const fs=parseFloat(e.style.fontSize)||0; if(fs>bfs){bfs=fs; best=e;} }
  return bfs>=24?best:null;}
const scopesOf=sec=>{const L=layersOf(sec); return L.length?L:[sec];};
function samePathAll(sec,el){ const L=layersOf(sec); const p=pathOf(el,sec); if(!p) return [el]; if(!L.length) return [el];
  const li=Array.from(sec.children).indexOf(el.closest('.step-layer')); if(li<0) return [el]; return L.map(l=>atPath(sec,[Array.from(sec.children).indexOf(l),...p.slice(1)])).filter(x=>x&&x.tagName===el.tagName); }
function uniqId(base,used){let i=2,id=base+'-'+i; while(used.has(id)) id=base+'-'+(++i); return id;}
function replaceRefs(scope,old,nw,skip){
  const esc=old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const reUrl=new RegExp(`url\\((['"]?)#${esc}\\1\\)`,'g'); const reSel=new RegExp(`#${esc}(?![\\w-])`,'g');
  const list=[scope,...scope.querySelectorAll('*')].filter(e=>!skip||!skip(e));
  for(const e of list){ for(const a of Array.from(e.attributes)){ let v=a.value; if(!v.includes(old)) continue; let nv=v;
      if(/^(aria-labelledby|aria-describedby|aria-controls|aria-owns|aria-flowto|aria-details|aria-errormessage|aria-activedescendant|headers|for|list)$/.test(a.name)) nv=v.split(/\s+/).map(t=>t===old?nw:t).join(' ');
      else { nv=nv.replace(reUrl,(m,q)=>`url(${q}#${nw}${q})`); if(nv==='#'+old) nv='#'+nw; }
      if(nv!==v) e.setAttribute(a.name,nv); }
    if(e.tagName.toLowerCase()==='style'&&e.textContent.includes('#'+old)) e.textContent=e.textContent.replace(reSel,'#'+nw); }
}
function dupIdScan(fix){
  const used=new Set(); let dups=0; const where=[];
  S.doc.querySelectorAll('[id]').forEach(e=>used.add(e.id));
  S.slides.forEach((sec,si)=>{ const L=layersOf(sec);
    const scopes=L.length?[...L,sec]:[sec];
    scopes.forEach(sc=>{ const skip=(sc===sec&&L.length)?(e=>!!e.closest('.step-layer')):null;
      const els=[sc,...sc.querySelectorAll('[id]')].filter(e=>e.id&&(!skip||!skip(e)));
      const local=new Set();
      els.forEach(e=>{ const id=e.id; if(used.has(id)||local.has(id)){ dups++; if(where.length<200) where.push({si,id}); if(fix){const nw=uniqId(id,new Set([...used,...local])); replaceRefs(sc,id,nw,skip); e.id=nw; local.add(nw);} else local.add(id);} else local.add(id); });
      local.forEach(i=>used.add(i)); }); });
  return {dups,where};
}
function estScore(c){ if(c.severe) return Math.round(30-30*c.severe/(c.severe+4)); if(c.major) return Math.round(70-40*c.major/(c.major+6)); return Math.round(100-30*c.minor/(c.minor+10)); }
function shortAlt(t){ t=t.trim(); const m=t.match(/^(.{15,118}?[.;:])(\s|$)/); if(m) return m[1]; if(t.length<=120) return t; return t.slice(0,117).replace(/[\s,;:]+\S*$/,'')+'…'; }
async function runAudit(){
  endEdit(); commit(); if(PV.on) stopPreview();
  const prog=progressCard('Checking accessibility'); const R={};
  const rule=(id,sev,title,why,fixAll,fixLabel,countAsOne)=>R[id]||(R[id]={id,sev,title,why,items:[],fixAll,fixLabel,countAsOne});
  const add=(id,it)=>R[id].items.push(it);
  const fitK=Math.min(1,(window.innerWidth-4)/S.W,(window.innerHeight-4)/S.H);
  const host=document.createElement('div'); host.style.cssText=`position:fixed;left:0;top:0;width:${S.W*fitK}px;height:${S.H*fitK}px;z-index:-1;overflow:hidden`; host.style.setProperty('--tk',String(fitK)); document.body.appendChild(host);
  const sr=host.attachShadow({mode:'open'});
  try{ if(!thumbSheet){thumbSheet=new CSSStyleSheet(); thumbSheet.replaceSync(thumbCSSText());} sr.adoptedStyleSheets=[thumbSheet]; }catch(e){const st=document.createElement('style'); st.textContent=thumbCSSText(); sr.appendChild(st);}
  const lst=document.createElement('style'); sr.appendChild(lst); const pe=document.createElement('style'); pe.textContent='.de-deck,.de-deck *{pointer-events:auto!important}'; sr.appendChild(pe);
  const wrap=document.createElement('div'); wrap.className='reveal de-deck'; wrap.style.setProperty('--de-w',S.W+'px'); wrap.style.setProperty('--de-h',S.H+'px'); const sl=document.createElement('div'); sl.className='slides'; wrap.appendChild(sl); sr.appendChild(wrap);
  const doc=S.doc;
  // ---------- whole-document rules ----------
  const vp=doc.querySelector('meta[name="viewport"]'); const vc=vp?vp.getAttribute('content')||'':'';
  const ms=vc.match(/maximum-scale\s*=\s*([\d.]+)/i);
  if(/user-scalable\s*=\s*(no|0)/i.test(vc)||(ms&&+ms[1]<2)){ rule('zoom','severe','Zooming is turned off','The page stops people from zooming in. Both Ally and Panorama treat this as one of the worst problems.',()=>{vp.setAttribute('content','width=device-width, initial-scale=1');},'Allow zoom',true); add('zoom',{msg:`The viewport setting is “${vc}”.`}); }
  else if(ms&&+ms[1]<5){ rule('zoom5','minor','Zoom is capped below 5×','Ally asks that pages allow zooming to at least 5×.',()=>{vp.setAttribute('content',vc.replace(/,?\s*maximum-scale\s*=\s*[\d.]+/i,''));},'Remove the cap',true); add('zoom5',{msg:`maximum-scale=${ms[1]}`}); }
  const lang=doc.documentElement.getAttribute('lang');
  if(!lang){ rule('lang','minor','The deck doesn’t say what language it’s in','Screen readers use this to pick a voice. Ally scores it as minor.',()=>doc.documentElement.setAttribute('lang','en'),'Set to English',true); add('lang',{msg:'<html> has no lang attribute.'}); }
  else if(!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)){ rule('lang','minor','The language code isn’t valid','',()=>doc.documentElement.setAttribute('lang','en'),'Set to English',true); add('lang',{msg:`lang="${lang}"`}); }
  if(!(doc.title||'').trim()){ rule('doctitle','minor','The deck has no title','Shown in the browser tab and announced by screen readers.',null,null,true); add('doctitle',{msg:'Set the deck title in the Slide panel.',show:()=>{setSel([]); $('#dTitle').focus();}}); }
  const reveal=S.host&&S.host.closest('.reveal'); const hasLandmark=doc.querySelector('main,[role="main"]');
  if(!hasLandmark&&reveal){ rule('landmark','minor','Slides aren’t inside a main landmark','Ally checks that content sits in a landmark region so screen readers can jump to it.',()=>reveal.setAttribute('role','main'),'Mark the slides as main content',true); add('landmark',{msg:'The slide container has no role="main".'}); }
  // headings (whole deck)
  const allH=[]; S.slides.forEach((sec,si)=>sec.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h=>allH.push({h,si,lv:+h.tagName[1]})));
  const ariaH=[]; S.slides.forEach((sec,si)=>sec.querySelectorAll('[role="heading"]').forEach(h=>{if(!/^H[1-6]$/.test(h.tagName)) ariaH.push({h,si});}));
  const fixHeadings=()=>{ let first=true; S.slides.forEach((sec,si)=>{ const has=sec.querySelector('h1,h2,h3,h4,h5,h6'); sec.querySelectorAll('[role="heading"]').forEach(h=>{if(!/^H[1-6]$/.test(h.tagName)) toHeading(h,+(h.getAttribute('aria-level')||2));});
      if(!sec.querySelector('h1,h2,h3,h4,h5,h6')) scopesOf(sec).forEach(sc=>{const t=findTitle(sc,sec); if(t) toHeading(t,first?1:2);});
      if(sec.querySelector('h1,h2,h3,h4,h5,h6')) first=false; });
    const firstH=S.slides.map(s=>s.querySelector('h1,h2,h3,h4,h5,h6')).find(Boolean); if(firstH&&firstH.tagName!=='H1'){const sec=secOf(firstH); samePathAll(sec,firstH).forEach(h=>toHeading(h,1));}
    commit('Slide titles as headings'); };
  if(!allH.length){ rule('noheadings','major','The deck has no headings','Ally (“Headings should be present”) and Panorama (“This page is missing a header”) both score this as major. The fix turns each slide title into a real heading tag without changing how it looks.',fixHeadings,'Make slide titles headings',true);
    S.slides.forEach((sec,si)=>{const t=findTitle(finalBase(sec),sec); add('noheadings',{si,msg:t?`Title “${trunc(normText(t.textContent),50)}” isn’t a heading.`:'No title found on this slide.',show:t?()=>showEl(si,t):null});}); }
  else {
    if(allH[0].lv!==1){ rule('h1','major','Headings don’t start at level 1','Ally scores “Heading structure does not start at one” as major.',()=>{const f=allH[0].h; samePathAll(secOf(f),f).forEach(h=>toHeading(h,1)); commit('First heading level 1');},'Make the first heading level 1',true); add('h1',{si:allH[0].si,msg:`The first heading is an h${allH[0].lv}.`,show:()=>showEl(allH[0].si,allH[0].h)}); }
    let prev=0; allH.forEach(o=>{ if(prev&&o.lv>prev+1){ rule('hskip','minor','Heading levels skip','Levels should go down one at a time (h1, then h2, then h3).'); add('hskip',{si:o.si,msg:`h${prev} is followed by h${o.lv}.`,show:()=>showEl(o.si,o.h),fix:'Make it h'+(prev+1),doFix:()=>{samePathAll(secOf(o.h),o.h).forEach(h=>toHeading(h,prev+1)); commit('Heading level');}}); } prev=o.lv; });
    allH.forEach(o=>{ const t=normText(o.h.textContent); if(!t&&!o.h.querySelector('img[alt]:not([alt=""])')){ rule('hempty','major','Empty heading','A heading with no words is announced as a blank heading.'); add('hempty',{si:o.si,msg:'This heading has no text.',show:()=>showEl(o.si,o.h)}); } else if(t.length>120){ rule('hlong','minor','Heading longer than 120 characters','Panorama flags very long headings.'); add('hlong',{si:o.si,msg:trunc(t,80),show:()=>showEl(o.si,o.h)}); } });
    const missing=S.slides.map((s,si)=>s.querySelector('h1,h2,h3,h4,h5,h6')?-1:si).filter(i=>i>=0);
    if(missing.length){ rule('slidehead','advice','Some slides have no heading','Not scored, but headings let screen-reader users jump between slides.',()=>{missing.forEach(si=>{const sec=S.slides[si]; scopesOf(sec).forEach(sc=>{const t=findTitle(sc,sec); if(t) toHeading(t,2);});}); commit('Slide titles as headings');},'Make their titles headings'); missing.forEach(si=>add('slidehead',{si,msg:`“${slideTitle(S.slides[si],si)}” has no heading.`,show:()=>go(si)})); }
  }
  if(ariaH.length){ rule('ariahead','minor','Headings made with ARIA roles','Some checkers only count real <h1>–<h6> tags, so these may not register.',()=>{ariaH.forEach(o=>{if(o.h.isConnected) toHeading(o.h,+(o.h.getAttribute('aria-level')||2));}); commit('Real heading tags');},'Use real heading tags'); ariaH.forEach(o=>add('ariahead',{si:o.si,msg:`“${trunc(normText(o.h.textContent),50)}”`,show:()=>showEl(o.si,o.h)})); }
  // duplicate ids
  const d=dupIdScan(false); if(d.dups){ rule('ids','major','Repeated IDs','Every id must be unique. Build-step copies and duplicated slides repeat them; Panorama scores this as major.',()=>{dupIdScan(true); commit('Unique IDs');},'Make every ID unique',false); const by={}; d.where.forEach(w=>{(by[w.si]=by[w.si]||[]).push(w.id);}); Object.keys(by).forEach(si=>add('ids',{si:+si,msg:`${by[si].length} repeated: ${[...new Set(by[si])].slice(0,4).join(', ')}${by[si].length>4?'…':''}`,count:by[si].length,show:()=>go(+si)})); }
  // words
  let words=0; S.slides.forEach(sec=>{ const b=finalBase(sec); words+=normText(b.textContent).split(' ').filter(Boolean).length; });
  if(words>3000){ rule('words','minor','More than 3,000 words','Panorama flags long documents. Nothing to fix unless you want to split the deck.',null,null,true); add('words',{msg:`About ${words.toLocaleString()} words across the slides.`}); }
  // ---------- per-slide rules ----------
  const seenAlt=new Set();
  try{
  for(let si=0;si<S.slides.length;si++){
    if(prog.cancelled) break; prog.set(si/S.slides.length,`Slide ${si+1} of ${S.slides.length}`); await tick();
    const sec=S.slides[si]; const L=layersOf(sec); const allE=e=>e&&secOf(e)===sec?samePathAll(sec,e):[];
    // structure rules on the real section (all layers; deduped across steps)
    const keyOf=e=>{const p=pathOf(e,sec)||[]; return si+':'+(L.length?p.slice(1):p).join('.')+':'+e.tagName;};
    for(const a of altWalk(sec,null,[])){ const k=keyOf(a.el); if(seenAlt.has(k)) continue; seenAlt.add(k); const e=a.el, tag=e.tagName.toLowerCase(), p=pathOf(e,sec);
      const role=e.getAttribute('role'); const scored=tag==='img'||role==='img'||tag==='object'||tag==='area'||(tag==='input');
      if(a.kind==='missing'){ if(scored){ rule('alt','major','Pictures without alt text','Ally and Panorama both score missing alternative text as major.'); add('alt',{si,msg:`${tag==='img'?'Image':'Picture'} has no description.`,show:()=>showEl(si,e,true),fix:'Mark decorative',doFix:()=>{allE(e).forEach(x=>setDeco(x,true)); commit('Mark decorative');}}); }
        else { rule('svgalt','advice','Graphics with no description','Plain SVG graphics without role="img" aren’t scored, but screen readers may read their labels as loose text. Describe them or mark them decorative.'); add('svgalt',{si,msg:'Graphic has no description.',show:()=>showEl(si,e,true),fix:'Mark decorative',doFix:()=>{allE(e).forEach(x=>setDeco(x,true)); commit('Mark decorative');}}); } continue; }
      if(a.kind==='ok'){ const t=a.text.trim();
        if(t.length>120){ rule('altlong','major','Alt text longer than 120 characters','Panorama scores this as major. The fix keeps a short alt text (first sentence) and moves the full description into a hidden long description that screen readers still read.',null,null); add('altlong',{si,msg:`${t.length} characters: “${trunc(t,70)}”`,show:()=>showEl(si,e,true),fix:'Shorten and keep the rest as a long description',doFix:()=>{allE(e).forEach(x=>splitLongAlt(x)); commit('Shorten alt text');}}); }
        if(PLACEHOLDER_ALT.test(t)||FILENAME_ALT.test(t)){ rule('altbad','major','Alt text is a placeholder or file name','Text like “image” or “chart.png” doesn’t describe anything; Panorama scores it as major.'); add('altbad',{si,msg:`“${t}”`,show:()=>showEl(si,e,true)}); } } }
    // tables
    sec.querySelectorAll('table').forEach(tb=>{ if(L.length&&tb.closest('.step-layer')!==L[L.length-1]) return; const p=pathOf(tb,sec);
      if(!tb.querySelector('td,th')){ rule('tblempty','major','Empty table',''); add('tblempty',{si,msg:'A table with no cells.',show:()=>showEl(si,tb)}); return; }
      if(!tb.querySelector('th')){ rule('tblhead','major','Tables without a header row','Ally and Panorama score this as major. The fix turns the first row into header cells.'); add('tblhead',{si,msg:'Table has no header cells.',show:()=>showEl(si,tb),fix:'Use the first row as headers',doFix:()=>{allE(tb).forEach(t=>{const r=t.querySelector('tr'); if(r) Array.from(r.children).forEach(c=>{if(c.tagName==='TD'){const n=renameTag(c,'th'); n.setAttribute('scope','col'); if(!n.style.fontWeight) n.style.fontWeight='inherit'; if(!n.style.textAlign) n.style.textAlign='inherit';}});}); commit('Table headers');}}); }
      else if(Array.from(tb.querySelectorAll('th')).some(th=>!th.getAttribute('scope'))){ rule('tblscope','major','Table headers without a scope','Panorama scores this as major.'); add('tblscope',{si,msg:'Header cells don’t say if they label a row or a column.',show:()=>showEl(si,tb),fix:'Add scope',doFix:()=>{allE(tb).forEach(t=>t.querySelectorAll('th').forEach(th=>{if(!th.getAttribute('scope')) th.setAttribute('scope',th.parentElement===t.querySelector('tr')?'col':'row');})); commit('Header scope');}}); }
      if(!tb.querySelector('caption')){ rule('tblcap','major','Tables without a caption','Panorama scores this as major. The fix adds a caption that only screen readers hear.'); add('tblcap',{si,msg:'Table has no caption.',show:()=>showEl(si,tb),fix:'Add a hidden caption',doFix:()=>{allE(tb).forEach(t=>{const c=t.ownerDocument.createElement('caption'); c.textContent=slideTitle(sec,si); c.setAttribute('style','position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'); t.insertBefore(c,t.firstChild);}); commit('Table caption');}}); } });
    // lists (severe)
    sec.querySelectorAll('li').forEach(li=>{ if(!li.parentElement||/^(UL|OL|MENU)$/.test(li.parentElement.tagName)) return; const p=pathOf(li,sec); rule('listli','severe','List items outside a list','Panorama scores this as severe.'); add('listli',{si,msg:`“${trunc(normText(li.textContent),50)}”`,show:()=>showEl(si,li),fix:'Wrap in a list',doFix:()=>{allE(li).forEach(x=>{if(!x.isConnected||/^(UL|OL|MENU)$/.test(x.parentElement.tagName)) return; const ul=x.ownerDocument.createElement('ul'); ul.setAttribute('style','margin: 0; padding: 0; list-style: none'); x.before(ul); let n=x; while(n&&n.tagName==='LI'){const nx=n.nextElementSibling; ul.appendChild(n); n=nx;}}); commit('Wrap list');}}); });
    sec.querySelectorAll('ul,ol').forEach(ul=>{ const bad=Array.from(ul.children).filter(c=>!/^(LI|SCRIPT|TEMPLATE)$/.test(c.tagName)); if(!bad.length) return; const p=pathOf(ul,sec); rule('listkids','severe','Lists that contain things other than list items','Panorama scores this as severe.'); add('listkids',{si,msg:`${bad.length} non-item child${bad.length>1?'ren':''} in a list.`,show:()=>showEl(si,ul),fix:'Wrap them in list items',doFix:()=>{allE(ul).forEach(u=>Array.from(u.children).forEach(c=>{if(!/^(LI|SCRIPT|TEMPLATE)$/.test(c.tagName)){const li=u.ownerDocument.createElement('li'); li.setAttribute('style','list-style: none'); c.before(li); li.appendChild(c);}})); commit('Fix list');}}); });
    // deprecated tags
    sec.querySelectorAll(DEPRECATED.join(',')).forEach(x=>{ const p=pathOf(x,sec); rule('deprecated','major','Old HTML tags','Tags like <font> and <center> are deprecated; Panorama scores them as major.'); add('deprecated',{si,msg:`<${x.tagName.toLowerCase()}>`,show:()=>showEl(si,x),fix:'Replace with modern markup',doFix:()=>{allE(x).forEach(o=>modernize(o)); commit('Modernize tags');}}); });
    // buttons, links, media, frames
    sec.querySelectorAll('button,[role="button"]').forEach(b=>{ if(!normText(b.textContent)&&!b.getAttribute('aria-label')&&!b.getAttribute('title')&&!b.querySelector('img[alt]:not([alt=""])')){ rule('btnname','major','Buttons without a name','Ally and Panorama score this as major.'); add('btnname',{si,msg:'A button has no text or label.',show:()=>showEl(si,b)}); } });
    let lastHref=null, lastLink=null; sec.querySelectorAll('a[href]').forEach(a=>{ const t=normText(a.textContent)||a.getAttribute('aria-label')||(a.querySelector('img[alt]')||{}).alt||'';
      if(!t){ rule('linkname','minor','Links without text','Screen readers announce just “link”.'); add('linkname',{si,msg:a.getAttribute('href'),show:()=>showEl(si,a)}); }
      else if(VAGUE_LINK.test(t)||/^https?:\/\//.test(t)){ rule('linkvague','minor','Links that don’t say where they go','“Click here” or a bare URL isn’t descriptive.'); add('linkvague',{si,msg:`“${trunc(t,60)}”`,show:()=>showEl(si,a)}); }
      if(lastLink&&lastHref===a.getAttribute('href')&&lastLink.nextElementSibling===a){ rule('linkdup','minor','Neighbouring links to the same place','Panorama flags adjacent links with the same URL.'); add('linkdup',{si,msg:a.getAttribute('href'),show:()=>showEl(si,a)}); }
      lastHref=a.getAttribute('href'); lastLink=a; });
    sec.querySelectorAll('video,audio').forEach(v=>{ if(!v.querySelector('track[kind="captions"],track[kind="subtitles"]')){ rule('captions','major','Video or audio without captions','Both checkers score this as major.'); add('captions',{si,msg:`<${v.tagName.toLowerCase()}> has no caption track.`,show:()=>showEl(si,v)}); } });
    sec.querySelectorAll('iframe,frame').forEach(f=>{ if(!(f.getAttribute('title')||'').trim()){ const p=pathOf(f,sec); rule('frametitle','major','Embedded frames without a title',''); add('frametitle',{si,msg:f.getAttribute('src')||'iframe',show:()=>showEl(si,f),fix:'Title it after the slide',doFix:()=>{allE(f).forEach(x=>x.setAttribute('title',slideTitle(sec,si))); commit('Frame title');}}); } });
    // ---------- visual rules (final click step) ----------
    const c=sec.cloneNode(true); sl.replaceChildren(c);
    lst.textContent=L.length?`.de-deck .slides>section>.step-layer{display:none!important}.de-deck .slides>section>.step-layer:nth-child(${Array.from(sec.children).indexOf(L[L.length-1])+1}){display:block!important}`:'';
    const fb=finalBase(c); const texts=[]; const w=document.createTreeWalker(fb,NodeFilter.SHOW_TEXT); let tn;
    while((tn=w.nextNode())){ if(!tn.data.trim()) continue; const pe2=tn.parentElement; if(!pe2||pe2.closest('svg,style,script,.slide-copy,.pdf-get,aside,.sw-math,math')) continue; texts.push(tn); }
    const seen=new Set(); const small=[], lowc=[];
    for(const t of texts){ const e=t.parentElement; if(seen.has(e)) continue; seen.add(e);
      const cs=getComputedStyle(e); if(cs.visibility==='hidden') continue; let ghost=false; for(let x=e;x&&x!==c;x=x.parentElement){const s2=getComputedStyle(x); if(s2.opacity==='0'||s2.display==='none'){ghost=true;break;}} if(ghost) continue;
      const rg=document.createRange(); rg.selectNodeContents(t); const rr=Array.from(rg.getClientRects()).find(r=>r.width>1&&r.height>1); if(!rr) continue;
      const fs=parseFloat(cs.fontSize), fw=parseInt(cs.fontWeight)||400, p=pathOf(e,c);
      const e0=atPath(sec,p); if(fs<auditMin) small.push({p,e0,fs,text:t.data.trim().slice(0,40)});
      const hits=sr.elementsFromPoint(rr.left+Math.min(rr.width/2,6),rr.top+rr.height/2); let i=hits.indexOf(e); if(i<0) i=hits.findIndex(h=>h.contains&&h.contains(e)); if(i<0) i=0;
      const layers=[]; let unknown=false;
      for(let j=i;j<hits.length;j++){const h=hits[j]; if(!wrap.contains(h)) break; const tg=h.tagName.toLowerCase(); if(j>i&&(tg==='img'||tg==='svg'||tg==='canvas'||tg==='video'||h.ownerSVGElement)){unknown=true;break;} const hs=getComputedStyle(h); if(hs.backgroundImage!=='none'){unknown=true;break;} const b=prgb(hs.backgroundColor); if(b&&b.a>0){layers.push(b); if(b.a>=1) break;}}
      if(unknown) continue; let bg=[255,255,255]; for(let k=layers.length-1;k>=0;k--){const {c:cc,a}=layers[k]; bg=bg.map((v,q)=>v*(1-a)+cc[q]*a);}
      const f=prgb(cs.color); if(!f) continue; const fg=f.c.map((v,q)=>v*f.a+bg[q]*(1-f.a)); const need=(fs>=24||(fs>=18.66&&fw>=700))?3:4.5; const r=ratio(fg,bg);
      if(r<need-0.01) lowc.push({p,e0,r,need,fg,bg,text:t.data.trim().slice(0,40)}); }
    lowc.forEach(o=>{ rule('contrast','major','Text with low colour contrast','Ally and Panorama score insufficient contrast (WCAG AA: 4.5:1, or 3:1 for large text) as major. The fix darkens (or lightens) the text just enough.'); add('contrast',{si,msg:`${o.r.toFixed(1)}:1, needs ${o.need}:1 · “${o.text}”`,show:()=>o.e0&&o.e0.isConnected?showEl(si,o.e0):showPath(si,o.p),fix:'Fix colour',doFix:()=>{const col=fixColor(o.fg,o.bg,o.need); allE(o.e0).forEach(t=>t.style.color=col); commit('Fix contrast');}}); });
    if(small.length){ rule('small','minor',`Text smaller than ${auditMin}px`,auditMin===12?'Panorama flags text under 9pt (12px) as minor.':'Below the size you chose; not scored by Panorama unless under 12px.');
      add('small',{si,count:small.length,msg:`${small.length} item${small.length>1?'s':''}, e.g. ${small.slice(0,3).map(s=>`“${s.text}” (${s.fs}px)`).join(', ')}`,show:()=>showPath(si,small[0].p),fix:`Enlarge to ${auditMin}px`,doFix:()=>{small.forEach(s=>allE(s.e0).forEach(t=>{const cur=parseFloat(t.style.fontSize)||s.fs; const k=auditMin/cur; t.style.fontSize=auditMin+'px'; const lh=parseFloat(t.style.lineHeight); if(lh&&/px/.test(t.style.lineHeight)) t.style.lineHeight=r1(lh*k)+'px';})); commit('Enlarge small text');}}); }
    // target size
    c.querySelectorAll('a[href],button').forEach(a=>{ if(a.closest('.pdf-get')) return; const par=a.parentElement; const inline=par&&Array.from(par.childNodes).some(n=>n.nodeType===3&&n.data.trim()); if(inline) return; const r=a.getBoundingClientRect(); if(!r.width) return; const W=r.width/fitK, H=r.height/fitK; if(W<24||H<24){ rule('target','major','Links or buttons smaller than 24 px','Panorama scores small click targets as major.'); add('target',{si,msg:`${Math.round(W)}×${Math.round(H)} px: “${trunc(normText(a.textContent)||a.getAttribute('aria-label')||'',40)}”`,show:()=>showPath(si,pathOf(a,c))}); } });
    // text that should be a list
    const bulletish=Array.from(fb.querySelectorAll('div,p,span')).filter(e=>!hasBlockKids(e)&&/^\s*(•|·|▪|◦|–|-\s|\*\s|\d+[.)]\s)/.test(e.textContent)&&!e.closest('ul,ol,svg'));
    const groups=new Map(); bulletish.forEach(e=>{const k=e.parentElement; groups.set(k,(groups.get(k)||0)+1);});
    for(const [par,n] of groups) if(n>=2){ rule('aslist','minor','Text that looks like a list','Panorama suggests using a real list when lines start with bullets or numbers.'); add('aslist',{si,msg:`${n} lines start with bullets or numbers.`,show:()=>showPath(si,pathOf(par,c))}); }
    // reading order (advice)
    const root=contentRoot(fb); const tops=kidsOf(root).filter(k=>k.textContent.trim()&&!k.classList.contains('slide-copy')&&k.getAttribute('aria-hidden')!=='true').map(k=>({k,r:k.getBoundingClientRect()})).filter(o=>o.r.width/fitK>=240&&o.r.height/fitK>=20);
    let inv=null; for(let a=0;a<tops.length&&!inv;a++) for(let b=a+1;b<tops.length;b++){const A=tops[a].r,B=tops[b].r; if(B.bottom<=A.top+1&&B.right>A.left&&B.left<A.right){inv=[tops[a].k,tops[b].k];break;}}
    if(inv){ rule('order','advice','Reading order differs from the layout','Not scored by these checkers for HTML, but screen readers read in this order.'); add('order',{si,msg:`“${trunc(normText(inv[0].textContent),30)}” is read before “${trunc(normText(inv[1].textContent),30)}”, which sits above it.`,show:()=>showPath(si,pathOf(inv[1],c))}); }
  }
  } finally { host.remove(); prog.close(); }
  lastAudit={rules:Object.values(R),time:Date.now(),filter:lastAudit&&lastAudit.filter||null}; showAudit();
}
function splitLongAlt(x){ const tag=x.tagName.toLowerCase(); const full=(tag==='img'?x.getAttribute('alt'):x.getAttribute('aria-label'))||''; if(full.length<=120) return;
  const short=shortAlt(full); const dsc=x.ownerDocument.createElement('span'); const id='sw-desc-'+Math.random().toString(36).slice(2,9); dsc.id=id; dsc.textContent=full;
  dsc.setAttribute('style','position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap');
  if(tag==='img') x.setAttribute('alt',short); else x.setAttribute('aria-label',short);
  const prev=(x.getAttribute('aria-describedby')||'').trim(); x.setAttribute('aria-describedby',(prev?prev+' ':'')+id); x.after(dsc); }
function modernize(o){ const tag=o.tagName.toLowerCase(); let n;
  if(tag==='center'){ n=renameTag(o,'div'); n.style.textAlign='center'; return; }
  n=renameTag(o,'span');
  if(tag==='font'){ const c=n.getAttribute('color'), f=n.getAttribute('face'), s=n.getAttribute('size'); if(c) n.style.color=c; if(f) n.style.fontFamily=f; if(s){const map={1:'10px',2:'13px',3:'16px',4:'18px',5:'24px',6:'32px',7:'48px'}; n.style.fontSize=map[s.replace(/[+-]/,'')]||'';} ['color','face','size'].forEach(a=>n.removeAttribute(a)); }
  if(tag==='big') n.style.fontSize='larger'; if(tag==='strike') n.style.textDecoration='line-through'; if(tag==='tt') n.style.fontFamily='monospace'; }
function showEl(si,e,alt){ go(si); const sec=curSec(); const lay=e.closest&&e.closest('.step-layer'); const L=layersOf(sec); if(lay&&L.includes(lay)) setLayer(L.indexOf(lay));
  if(!e.isConnected) return; const it=itemFor(e)||e; if(it!==e) S.scope=e.parentElement; setSel([e]); if(alt){toggleAlt(true); focusAlt();} }
function showPath(si,p,alt){ go(si); const sec=curSec(); const L=layersOf(sec); if(L.length){ const li=L.indexOf(sec.children[p[0]]); if(li>=0) setLayer(li); }
  const e=atPath(sec,p); if(!e) return; let it=itemFor(e)||e; if(it!==e){S.scope=e.parentElement;} setSel([e]); if(alt){toggleAlt(true); focusAlt();} }
function auditCounts(rules){const c={severe:0,major:0,minor:0,advice:0}; rules.forEach(r=>{const open=r.items.filter(i=>!i.fixed); if(!open.length||r.done) return; c[r.sev]+=r.countAsOne?1:open.reduce((n,i)=>n+(i.count||1),0);}); return c;}
function showAudit(){
  $$('.modal-bg.audit').forEach(m=>m.remove());
  const a=lastAudit; const rules=a.rules.filter(r=>r.items.length).sort((x,y)=>SEV_ORDER.indexOf(x.sev)-SEV_ORDER.indexOf(y.sev)||y.items.length-x.items.length);
  if(!a.filter) a.filter=new Set(rules.map(r=>r.id));
  const bg=el('div',{class:'modal-bg audit'}); const m=el('div',{class:'modal xl',role:'dialog','aria-modal':'true','aria-label':'Accessibility check'}); bg.appendChild(m);
  const close=()=>{bg.remove(); document.removeEventListener('keydown',kd,true);}; const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); close();}}; document.addEventListener('keydown',kd,true);
  bg.addEventListener('pointerdown',e=>{if(e.target===bg) close();});
  const c=auditCounts(rules); const score=estScore(c); const band=c.severe?'severe':c.major?'major':'minor';
  const scoreBox=el('div',{class:'score '+band},el('div',{class:'big',text:score+'%'}),el('div',{},el('b',{text:'Estimated score'}),el('p',{class:'hint',text:c.severe?'Severe problems hold the score under 30%. Fix those first.':c.major?`Major problems hold the score between 30% and 70%. Fixing all ${c.major} lifts it above 70%.`:c.minor?'Only minor problems left: the score sits between 70% and 100%.':'Nothing these checkers score was found.'}),
    el('p',{class:'hint',text:'Modelled on how YuJa Panorama and Anthology Ally score HTML (the worst severity sets the band, and more issues pull it lower). Your LMS may differ.'})));
  const minSel=el('select',{'aria-label':'Smallest text size'},...[[12,'12px (Panorama’s 9pt)'],[14,'14px'],[16,'16px'],[18,'18px']].map(([v,l])=>{const o=el('option',{value:v,text:l}); if(v===auditMin) o.selected=true; return o;}));
  minSel.onchange=()=>{auditMin=+minSel.value; close(); runAudit();};
  // filters
  const filt=el('div',{class:'filters',role:'group','aria-label':'Show these problems'});
  const sevBtns=el('div',{class:'chips'},el('span',{class:'hint',text:'Show:'}),
    el('button',{class:'btn',text:'All',onclick:()=>{a.filter=new Set(rules.map(r=>r.id)); showAudit();}}),
    ...SEV_ORDER.filter(s=>rules.some(r=>r.sev===s)).map(s=>el('button',{class:'btn',text:`${SEV_LABEL[s]} only`,onclick:()=>{a.filter=new Set(rules.filter(r=>r.sev===s).map(r=>r.id)); showAudit();}})));
  const ruleChips=el('div',{class:'chips'},...rules.map(r=>{const open=r.items.filter(i=>!i.fixed).length; const cb=el('input',{type:'checkbox'}); cb.checked=a.filter.has(r.id); cb.onchange=()=>{cb.checked?a.filter.add(r.id):a.filter.delete(r.id); showAudit();};
    return el('label',{class:'chip toggle '+r.sev+(cb.checked?' on':'')},cb,`${r.title} · ${open}`);}));
  filt.append(sevBtns,ruleChips);
  m.append(el('h2',{text:'Accessibility check'}),scoreBox,filt,el('label',{class:'chip plain'},'Flag text under ',minSel));
  const list=el('div',{class:'a11y-list'});
  rules.filter(r=>a.filter.has(r.id)).forEach(r=>{
    const open=r.items.filter(i=>!i.fixed);
    const head=el('div',{class:'a11y-rule'},el('span',{class:'chip '+r.sev,text:SEV_LABEL[r.sev]}),el('b',{text:r.title}),el('span',{class:'hint',text:` · ${open.length} ${r.countAsOne&&r.items.length>1?'slides':'found'}`}),el('span',{class:'spacer'}));
    const fixable=open.filter(i=>i.doFix);
    if(r.fixAll&&!r.done) head.appendChild(el('button',{class:'btn primary',text:r.fixLabel,onclick:()=>{r.fixAll(); r.done=true; r.items.forEach(i=>i.fixed=true); if(!/commit/.test(String(r.fixAll))){S.dirty=true; updateFileName(); scheduleAutosave();} updateAltStatusSoon(); showAudit(); toast('Fixed. Undo reverses it.');}}));
    else if(fixable.length>1) head.appendChild(el('button',{class:'btn primary',text:`${fixable[0].fix} on all ${fixable.length}`,onclick:()=>{fixable.forEach(i=>{i.doFix(); i.fixed=true;}); updateAltStatusSoon(); showAudit(); toast(`Fixed ${fixable.length}. Undo reverses them one at a time.`);}}));
    const sec=el('div',{class:'a11y-sec'},head); if(r.why) sec.appendChild(el('p',{class:'hint why',text:r.why}));
    const rowsHost=el('div'); const LIM=6; let shown=0;
    const addRow=it=>{ const row=el('div',{class:'a11y-row'+(it.fixed||r.done?' fixed':'')},el('span',{class:'where',text:it.si!=null?`Slide ${it.si+1}`:'Deck'}),el('span',{class:'msg',text:it.msg}));
      const acts=el('span',{class:'acts'}); if(it.show) acts.appendChild(el('button',{class:'btn',text:'Show',onclick:()=>{close(); it.show();}}));
      if(it.doFix&&!it.fixed&&!r.done) acts.appendChild(el('button',{class:'btn',text:it.fix,onclick:()=>{it.doFix(); it.fixed=true; showAudit(); updateAltStatusSoon();}}));
      if(it.fixed||r.done) acts.appendChild(el('span',{class:'done',text:'Fixed'}));
      row.appendChild(acts); rowsHost.appendChild(row); };
    r.items.slice(0,LIM).forEach(addRow); shown=Math.min(LIM,r.items.length);
    if(r.items.length>LIM){ const more=el('button',{class:'linkbtn more',type:'button',text:`Show ${r.items.length-LIM} more`,onclick:()=>{more.remove(); r.items.slice(LIM).forEach(addRow);}}); sec.append(rowsHost,more);} else sec.appendChild(rowsHost);
    list.appendChild(sec); });
  if(!list.childNodes.length) list.appendChild(el('p',{class:'hint',style:'padding:16px',text:rules.length?'No problems match the filter.':'No problems found.'}));
  m.appendChild(list);
  m.appendChild(el('div',{class:'actions'},el('button',{class:'btn',text:'Run again',onclick:()=>{close(); runAudit();}}),el('button',{class:'btn primary',text:'Close',onclick:close})));
  document.body.appendChild(bg);
}
$('#bCheck').onclick=()=>runAudit();


/* ======================= 5. equations ======================= */
const KATEX_SRC=['vendor/katex-0.16.9/katex.min.js','https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js'];
const loadKatex=()=>loadScript(KATEX_SRC,()=>window.katex);
function mathHTML(latex,display){try{return window.katex.renderToString(latex,{output:'mathml',displayMode:!!display,throwOnError:false,strict:false});}catch(e){return '';}}
function makeMath(latex,display,delim){const s=document.createElement('span'); s.className='sw-math'; s.setAttribute('data-latex',latex); if(display) s.setAttribute('data-display','true'); if(delim) s.setAttribute('data-sw-delim',display?'display':'inline'); s.innerHTML=mathHTML(latex,display); return s;}
S.deckKatex=false;
async function convertDelims(){
  S.deckKatex=Array.from(S.doc.querySelectorAll('script')).some(s=>/renderMathInElement|katex/i.test(s.textContent.slice(0,400000)));
  const nodes=[]; for(const s of S.slides){const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&n.parentElement.closest('script,style,.sw-math,svg')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}); let n; while((n=w.nextNode())) if(/\\\(|\\\[/.test(n.data)) nodes.push(n);}
  if(!nodes.length) return;
  try{await loadKatex();}catch(e){toast('Equations show as LaTeX source because the math library couldn’t load.','warn'); return;}
  const RE=/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g; let changed=0;
  for(const t of nodes){ if(!t.parentNode) continue; const frag=document.createDocumentFragment(); let last=0; t.data.replace(RE,(m,a,b,off)=>{frag.append(t.data.slice(last,off)); frag.append(makeMath(a!=null?a:b,b!=null,true)); last=off+m.length; return m;}); if(!last) continue; frag.append(t.data.slice(last)); t.replaceWith(frag); changed++; }
  discardRecs(); if(changed){ S.slides.forEach(s=>scheduleThumb(s)); drawOverlay(); refreshStepSnap(); }
}
const MATH_SNIPS=[['ŷ','\\hat{y}'],['p̂','\\hat{p}'],['Ŷ','\\hat{Y}'],['P̂','\\hat{P}'],['p̂ᵢ','\\hat{p}_i'],['W','\\mathbf{W}'],['X','\\mathbf{X}'],['∂L/∂P̂','\\frac{\\partial L}{\\partial \\hat{P}}'],['∂P̂/∂Ŷ','\\frac{\\partial \\hat{P}}{\\partial \\hat{Y}}'],['⊙','\\odot'],['×','\\times'],['10ⁿ','10^{n}'],['Σ','\\sum_{i}'],['a/b','\\frac{a}{b}'],['[ ]','\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'],['ᵀ','^{\\mathsf{T}}']];
function popover(anchor,title,body,buttons){return new Promise(res=>{
  $$('.pop').forEach(p=>p.remove());
  const m=el('div',{class:'modal pop',role:'dialog','aria-label':title}); m.append(el('h2',{text:title}),body);
  const act=el('div',{class:'actions'}); const close=v=>{m.remove(); document.removeEventListener('keydown',kd,true); document.removeEventListener('pointerdown',off,true); res(v);};
  buttons.forEach(([lbl,val,cls])=>act.appendChild(el('button',{class:'btn'+(cls?' '+cls:''),text:lbl,onclick:()=>close(val)})));
  m.appendChild(act); document.body.appendChild(m);
  const W=Math.min(460,window.innerWidth-24); m.style.width=W+'px'; const H=m.offsetHeight;
  let x=Math.min(Math.max(12,anchor.x-24),window.innerWidth-W-12), y=anchor.y+anchor.h+10; if(y+H>window.innerHeight-12) y=Math.max(12,anchor.y-H-10);
  m.style.left=x+'px'; m.style.top=y+'px';
  const kd=e=>{ if(e.key==='Escape'){e.preventDefault(); e.stopPropagation(); close(null);} else if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault(); e.stopPropagation(); close('ok');} };
  const off=e=>{ if(!m.contains(e.target)) close(null); };
  document.addEventListener('keydown',kd,true); setTimeout(()=>document.addEventListener('pointerdown',off,true),0);
  const f=m.querySelector('textarea,input'); f&&f.focus(); });}
async function editMath(target,opt){
  opt=opt||{};
  try{await loadKatex();}catch(e){toast('The equation editor loads KaTeX from cdnjs, and it couldn’t. Check your connection.','warn'); return;}
  let range=opt.range||(!target&&S.editing&&savedRange?savedRange.cloneRange():null);
  const inline=!!range&&!!S.editing;
  const ta=el('textarea',{class:'code',rows:'3',spellcheck:'false','aria-label':'LaTeX'}); ta.style.minHeight='72px';
  ta.value=target?target.getAttribute('data-latex')||'':(range&&!range.collapsed?range.toString().replace(/^\\\(|\\\)$|^\$+|\$+$/g,'').trim():'');
  ta.placeholder='\\hat{Y} = \\mathbf{X}\\mathbf{W}^{\\mathsf{T}}';
  const disp=el('input',{type:'checkbox'}); disp.checked=target?target.hasAttribute('data-display'):!inline;
  const prev=el('div',{class:'mathprev','aria-live':'polite'}); const upd=()=>{prev.innerHTML=ta.value.trim()?mathHTML(ta.value,disp.checked):'<span class="hint">Type LaTeX above. The preview updates as you type.</span>';};
  ta.addEventListener('input',upd); disp.addEventListener('change',upd);
  const snips=el('div',{class:'snips'},...MATH_SNIPS.map(([lbl,tex])=>el('button',{type:'button',class:'btn',title:tex,text:lbl,onclick:()=>{const s=ta.selectionStart,e2=ta.selectionEnd; ta.setRangeText(tex,s,e2,'end'); ta.focus(); upd();}})));
  const wrap=el('div',{class:'mathed'},ta,prev,snips,el('label',{class:'chk'},disp,el('span',{text:'Display style (bigger fractions and sums)'})),
    el('p',{class:'hint',text:'Ctrl/Cmd+Enter to finish. Course notation: ŷ logits, p̂ probabilities, p true labels, bold W and X, ⊙ elementwise. You can also type \\( … \\) or $…$ straight into any text.'}));
  upd();
  let anchor;
  if(target){const r=target.getBoundingClientRect(); anchor={x:r.left,y:r.top,h:r.height};}
  else if(opt.x!=null) anchor={x:opt.x,y:opt.y,h:4};
  else if(inline){const r=range.getBoundingClientRect(); anchor=r.width||r.height?{x:r.left,y:r.top,h:r.height||20}:(()=>{const q=S.editing.getBoundingClientRect(); return {x:q.left,y:q.top,h:q.height};})();}
  else {const r=$('#bMath').getBoundingClientRect(); anchor={x:r.left,y:r.top,h:r.height};}
  const v=await popover(anchor,target?'Edit equation':'Equation',wrap,[['Cancel',null],[target?'Update':'Insert','ok','primary']]);
  if(v!=='ok'||!ta.value.trim()){ if(inline&&S.editing){restoreCaret(range);} return; }
  const latex=ta.value.trim();
  if(target){ const n=makeMath(latex,disp.checked,target.hasAttribute('data-sw-delim')); if(target.getAttribute('contenteditable')) n.setAttribute('contenteditable','false'); target.replaceWith(n); if(!S.editing) commit('Edit equation'); drawOverlay(); syncInspector(); return; }
  const n=makeMath(latex,disp.checked,S.deckKatex);
  if(inline&&S.editing&&S.editing.contains(range.startContainer)){ restoreCaret(range); range.deleteContents(); range.insertNode(n); n.setAttribute('contenteditable','false');
    const sp=document.createTextNode('\u200B'); n.after(sp); const r2=document.createRange(); r2.setStart(sp,1); r2.collapse(true); restoreCaret(r2); return; }
  endEdit(); const d=document.createElement('div'); d.style.cssText='position: absolute; font-size: 32px; line-height: 1.3; white-space: nowrap'; d.appendChild(n);
  const c=opt.slidePt||viewCenter(); placeIn(d,insertTarget(),c.x+(opt.slidePt?120:0),c.y+(opt.slidePt?24:0),240,48); commit('Add equation'); setSel([d]);
}
function restoreCaret(r){ if(!S.editing) return; S.editing.focus({preventScroll:true}); const s=getSelection(); s.removeAllRanges(); s.addRange(r); savedRange=r.cloneRange(); }
$('#bMath').onclick=()=>editMath(null);
$('#bCode').onclick=()=>editCode(null);

/* ---------- typed LaTeX → rendered math ---------- */
const TEX_RE=/\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|(?<![\\$\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?![\w$])/g;
function texNodes(root){const out=[]; const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&n.parentElement.closest('script,style,.sw-math,svg,code,pre,textarea')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}); let n; while((n=w.nextNode())) if(/\\\(|\\\[|\$/.test(n.data)) out.push(n); return out;}
function renderTyped(root){ if(!window.katex) return 0; let count=0;
  for(const t of texNodes(root)){ if(!t.parentNode) continue; const s=t.data; let last=0; const frag=document.createDocumentFragment(); TEX_RE.lastIndex=0; let m;
    while((m=TEX_RE.exec(s))){ const inl=m[1]!=null?m[1]:m[4]; const dsp=m[2]!=null?m[2]:m[3]; const tex=inl!=null?inl:dsp;
      if(m[4]!=null&&!/[\\^_{}a-zA-Z]/.test(m[4])) continue;
      frag.append(s.slice(last,m.index)); frag.append(makeMath(m[1]!=null||m[2]!=null?tex:tex.trim(),dsp!=null,S.deckKatex)); last=m.index+m[0].length; count++; }
    if(!last) continue; frag.append(s.slice(last)); t.replaceWith(frag); }
  return count;}
function renderTypedSoon(el2){ if(!texNodes(el2).length) return; if(window.katex){ if(renderTyped(el2)){commit('Render equation'); drawOverlay();} return; }
  loadKatex().then(()=>{ if(!el2.isConnected||S.editing===el2) return; if(renderTyped(el2)){commit('Render equation'); drawOverlay(); scheduleThumb(secOf(el2));} }).catch(()=>toast('Couldn’t load the math library, so LaTeX stays as typed.','warn')); }

/* ---------- right-click menu ---------- */
function ctxMenu(x,y,items){ $$('.menu').forEach(m=>m.remove()); const m=el('div',{class:'menu',role:'menu'});
  items.filter(Boolean).forEach(it=>{ if(it==='-'){m.appendChild(el('div',{class:'msep',role:'separator'})); return;} const [lbl,fn,key,cls]=it;
    const b=el('button',{role:'menuitem',class:cls||'',onclick:()=>{m.remove(); fn();}},lbl); if(key) b.appendChild(el('kbd',{text:key})); m.appendChild(b); });
  m.style.position='fixed'; document.body.appendChild(m); const W=m.offsetWidth,H=m.offsetHeight; m.style.left=Math.min(x,window.innerWidth-W-8)+'px'; m.style.top=Math.min(y,window.innerHeight-H-8)+'px';
  const bs=$$('button',m); bs[0]&&bs[0].focus();
  m.addEventListener('keydown',e=>{const i=bs.indexOf(document.activeElement); if(e.key==='ArrowDown'){e.preventDefault(); bs[(i+1)%bs.length].focus();} if(e.key==='ArrowUp'){e.preventDefault(); bs[(i-1+bs.length)%bs.length].focus();} if(e.key==='Escape'){e.preventDefault(); m.remove();}});
  setTimeout(()=>{const off=e=>{if(!m.contains(e.target)){m.remove(); document.removeEventListener('pointerdown',off,true);}}; document.addEventListener('pointerdown',off,true);},0); }
function caretAt(x,y){ let r=null; if(document.caretRangeFromPoint) r=document.caretRangeFromPoint(x,y); else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y); if(p){r=document.createRange(); r.setStart(p.offsetNode,p.offset);}} if(r) r.collapse(true); return r; }
let preCtxSel=null;
stageScroll.addEventListener('pointerdown',e=>{ if(e.button!==2) return; preCtxSel=null; if(!S.editing) return; const sel=getSelection(); if(sel.rangeCount&&!sel.isCollapsed&&S.editing.contains(sel.anchorNode)) preCtxSel=sel.getRangeAt(0).cloneRange(); },true);
stageScroll.addEventListener('contextmenu',e=>{
  if(PV.on||e.target.closest('#pvBar,.de-svgedit')) return; e.preventDefault();
  const x=e.clientX,y=e.clientY; const b=stageBox.getBoundingClientRect(); const pt={x:(x-b.left)/S.scale,y:(y-b.top)/S.scale}; const inSlide=pt.x>=0&&pt.y>=0&&pt.x<=S.W&&pt.y<=S.H;
  const mod=navigator.platform&&/Mac/.test(navigator.platform)?'⌘':'Ctrl';
  // typing: equation goes where you clicked in the text
  if(S.editing&&S.editing.contains(e.target)){ const math=e.target.closest&&e.target.closest('.sw-math');
    const r=caretAt(x,y); if(r&&S.editing.contains(r.startContainer)){ if(preCtxSel&&preCtxSel.isPointInRange(r.startContainer,r.startOffset)) restoreCaret(preCtxSel); else restoreCaret(r); }
    const selTxt=savedRange&&!savedRange.collapsed?savedRange.toString():'';
    ctxMenu(x,y,[ math?['Edit equation',()=>editMath(math)]:null, [selTxt?'Turn selection into an equation':'Insert equation here',()=>editMath(null,{range:savedRange&&savedRange.cloneRange()})],'-',
      ['Bold',()=>{restoreRange(); document.execCommand('bold');},mod+' B'],['Italic',()=>{restoreRange(); document.execCommand('italic');},mod+' I'],'-',['Finish typing',()=>{const el2=S.editing; endEdit(); setSel([el2]);},'Esc']]); return; }
  if(S.editing) endEdit();
  const p=inSlide?pickAt(x,y):null; const it=p&&p.item; const math=p&&p.hit.closest&&(p.hit.closest('.sw-math')||(it.children.length===1&&it.firstElementChild.classList.contains('sw-math')?it.firstElementChild:null));
  if(it&&!S.sel.includes(it)) setSel([it]);
  const textish=it&&!hasBlockKids(it)&&!/^(svg|img)$/i.test(it.tagName)&&!math;
  ctxMenu(x,y,[
    math?['Edit equation',()=>editMath(math)]:null,
    textish?['Insert equation in this text here',()=>{startEdit(it,x,y); setTimeout(()=>editMath(null,{range:savedRange&&savedRange.cloneRange()}),0);}]:null,
    inSlide?['Insert equation here',()=>editMath(null,{x,y,slidePt:pt})]:null,
    inSlide?['Insert text here',()=>insertText(null,{x:pt.x+200,y:pt.y+16})]:null,
    inSlide&&!it?['Insert code here',()=>editCode(null,{slidePt:pt})]:null,
    it&&it.tagName==='PRE'?['Edit code',()=>editCode(it),'Enter']:null,
    inSlide&&!it?['Insert image here…',()=>pickImage(async fs=>{for(const f of fs) await insertImageFile(f,pt);})]:null,
    it?'-':null,
    textish&&it.tagName!=='PRE'?['Edit text',()=>startEdit(it,x,y),'Enter']:null,
    it&&hasBlockKids(it)?['Open group',()=>{S.scope=it; const inner=itemFor(p.hit); setSel([inner&&inner!==it?inner:kidsOf(it)[0]]);},'Enter']:null,
    it&&it.tagName==='IMG'?['Replace image…',()=>replaceImage(it)]:null,
    it?['Alt text…',()=>{setSel([it]); toggleAlt(true); focusAlt();}]:null,
    it?['Copy style to other items',()=>startPainter(false)]:null,
    it?['Duplicate',duplicateSel,mod+' D']:null,
    it?['Bring to front',()=>zOrder('front'),mod+' ⇧ ]']:null,
    it?['Send to back',()=>zOrder('back'),mod+' ⇧ [']:null,
    it?'-':null,
    it?['Delete',deleteSel,'Del','danger']:null,
    !it?'-':null,
    !it?['New slide…',pickLayout]:null,
    !it?['Preview clicks',startPreview,'P']:null,
  ]);
});


/* ======================= 6. text styles & format painter ======================= */
const STYLE_PROPS=['font-family','font-size','line-height','font-weight','font-style','color','letter-spacing','text-transform'];
const isGreyCol=c=>{const p=prgb(c)||(/^#[0-9a-f]{6}$/i.test(c)?{c:[1,3,5].map(i=>parseInt(c.substr(i,2),16))}:null); if(!p) return false; const [r,g,b]=p.c; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); return mx-mn<40&&mx>50&&mx<190;};
function detectStyles(){
  const map=new Map();
  for(const s of S.slides){ const scope=finalBase(s); for(const e of scope.querySelectorAll('[style]')){ if(e.ownerSVGElement||e.closest('.sw-math,.slide-copy,.pdf-get,[aria-hidden="true"]')) continue;
    let has=false; for(const n of e.childNodes) if(n.nodeType===3&&n.data.trim()){has=true;break;} if(!has||!e.style.fontSize) continue;
    const key=STYLE_PROPS.map(p=>e.style.getPropertyValue(p)).join('|'); let o=map.get(key);
    if(!o){o={n:0,slides:new Set(),props:{},top:parseFloat(e.style.top),sample:e.textContent.trim().slice(0,32)}; STYLE_PROPS.forEach(p=>{const v=e.style.getPropertyValue(p); if(v) o.props[p]=v;}); if(!o.props.color){for(let x=e.parentElement;x&&x!==s;x=x.parentElement){if(x.style&&x.style.color){o.props.color=x.style.color; break;}}} map.set(key,o);} o.n++; o.slides.add(s); } }
  const list=[...map.values()].filter(o=>o.slides.size>=2||o.n>=4).sort((a,b)=>b.slides.size-a.slides.size||b.n-a.n).slice(0,10);
  const used={}; list.forEach(o=>{const fs=parseFloat(o.props['font-size']), fw=parseInt(o.props['font-weight']||'400'), fam=(o.props['font-family']||'').toLowerCase(), grey=isGreyCol(o.props.color||'');
    let n= fs>=56?'Display': fs>=36?'Title': /mono/.test(fam)?(fs<=13?'Small label':'Label'): (o.top<150&&grey&&fs>=18)?'Subtitle': fs<=14?'Caption': grey?(fs>=18?'Body muted':'Caption'): fw>=600?'Heading':'Body';
    used[n]=(used[n]||0)+1; o.name=used[n]>1?`${n} ${used[n]}`:n;});
  list.sort((a,b)=>parseFloat(b.props['font-size'])-parseFloat(a.props['font-size']));
  S.styles=list.concat(S.customStyles||[]);
  fillStyles();
}
function loadCustomStyles(){S.customStyles=[]; const sc=S.doc&&S.doc.getElementById('slidewright-styles'); if(sc){try{S.customStyles=JSON.parse(sc.textContent).map(o=>({name:o.name,props:o.props,custom:true}));}catch(_){}}}
function storeCustomStyles(){let sc=S.doc.getElementById('slidewright-styles'); if(!sc){sc=S.doc.createElement('script'); sc.type='application/json'; sc.id='slidewright-styles'; S.doc.head.appendChild(sc);} sc.textContent=JSON.stringify(S.customStyles.map(o=>({name:o.name,props:o.props}))); S.dirty=true; updateFileName(); scheduleAutosave();}
function styleLabel(o){const fs=parseFloat(o.props['font-size']); const fw=parseInt(o.props['font-weight']||'400'); return `${o.name} · ${r0(fs)}px${fw>=600?' bold':''}${o.custom?' ★':''}`;}
function fillStyles(){const s=$('#tStyle'); s.replaceChildren(new Option('Apply a text style…','')); (S.styles||[]).forEach((o,i)=>s.add(new Option(styleLabel(o),String(i))));}
$('#tStyle').onchange=e=>{const o=(S.styles||[])[+e.target.value]; e.target.value=''; if(!o) return; const els=S.editing?[S.editing]:selEls();
  els.forEach(x=>{STYLE_PROPS.forEach(p=>{const v=o.props[p]; if(v) x.style.setProperty(p,v); else if(p==='letter-spacing'||p==='text-transform'||p==='font-style') x.style.removeProperty(p);});});
  commit('Apply '+o.name); drawOverlay(); syncInspector(); toast(`Applied “${o.name}”.`);};
$('#tSaveStyle').onclick=async()=>{const x=selEls()[0]; if(!x) return; const cs=getComputedStyle(x); const inp=el('input',{type:'text',value:'My style'}); const w=el('label',{class:'fld'},'Style name',inp);
  const v=await modal('Save text style',w,[['Cancel',null],['Save','ok','primary']]); if(v!=='ok') return; const props={}; STYLE_PROPS.forEach(p=>{const val=x.style.getPropertyValue(p)||cs.getPropertyValue(p); if(val&&val!=='normal'&&val!=='none'&&val!=='0px'||p==='font-size'||p==='color') props[p]=val;});
  S.customStyles=(S.customStyles||[]).concat([{name:inp.value.trim()||'My style',props,custom:true}]); storeCustomStyles(); detectStyles(); toast('Saved the style in this deck.');};
const BOX_PROPS=['background-color','background-image','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','box-shadow','padding-top','padding-right','padding-bottom','padding-left','box-sizing'];
function startPainter(sticky){const x=selEls()[0]; if(!x) return; const cs=getComputedStyle(x); const text={}; STYLE_PROPS.concat(['text-align']).forEach(p=>text[p]=cs.getPropertyValue(p)); const box={}; BOX_PROPS.forEach(p=>{const v=x.style.getPropertyValue(p); if(v) box[p]=v;});
  S.painter={text,box,sticky,from:x}; stageScroll.classList.add('painting'); $('#tPaint').setAttribute('aria-pressed','true'); toast(sticky?'Click items to give them this style. Press Esc when done.':'Click an item to give it this style. Double-click the button to keep it on.');}
function stopPainter(){S.painter=null; stageScroll.classList.remove('painting'); $('#tPaint').setAttribute('aria-pressed','false');}
function paintOnto(t){const P=S.painter; if(!P||t===P.from) return; const hasText=t.textContent.trim().length>0; if(hasText) for(const p in P.text) t.style.setProperty(p,P.text[p]); for(const p in P.box) t.style.setProperty(p,P.box[p]); commit('Paste style'); setSel([t]);}
let paintClickT=null; $('#tPaint').onclick=()=>{ if(S.painter){stopPainter(); return;} clearTimeout(paintClickT); paintClickT=setTimeout(()=>startPainter(false),220); };
$('#tPaint').ondblclick=()=>{clearTimeout(paintClickT); startPainter(true);};

/* ======================= 7. layouts ======================= */
function layoutSig(sec){const root=contentRoot(finalBase(sec)); const items=kidsOf(root).filter(e=>!e.classList.contains('slide-copy')&&!e.classList.contains('pdf-get')&&e.style.opacity!=='0'&&!e.style.animation&&e.getAttribute('aria-hidden')!=='true');
  const parts=[]; for(const e of items){ const t=e.tagName.toLowerCase(); const L=parseFloat(e.style.left), T=parseFloat(e.style.top), Wd=parseFloat(e.style.width)||0, fs=parseFloat(e.style.fontSize)||0;
    if(e.style.position!=='absolute'||isNaN(L)||isNaN(T)){ parts.push('F'+(hasBlockKids(e)?'B':'T')); continue; }
    if(T<150&&fs>=18) {parts.push(fs>=36?'title':'sub'); continue;} if(T>=600){ if(e.textContent.trim()) parts.push('foot'); continue; }
    if(Wd<160&&!(t==='svg'||t==='img')) continue;
    const kind=(t==='svg'||t==='img'||e.getAttribute('role')==='img')?'G':(hasBlockKids(e)?'B':'T'); const cx=L+Wd/2;
    const zone=Wd>S.W*0.7?'full':cx<S.W*0.42?'left':cx>S.W*0.58?'right':'mid'; parts.push(kind+zone); }
  return [...new Set(parts)].sort().join('|');}
function collectLayouts(){const m=new Map(); S.slides.forEach((s,i)=>{const sig=layoutSig(s); if(!sig) return; let o=m.get(sig); if(!o){o={rep:s,n:0,i}; m.set(sig,o);} o.n++;}); return [...m.values()];}
function placeholderLabel(e,root){let fs=0; for(let x=e;x&&x!==root.parentElement;x=x.parentElement){if(x.style&&x.style.fontSize){fs=parseFloat(x.style.fontSize); break;}} const fam=(e.closest('[style*="font-family"]')||e).style.fontFamily||'';
  const txt=e.textContent.trim(); if(txt.length<=3) return txt; if(fs>=40) return 'Slide title'; if(/mono/i.test(fam)) return 'LABEL'; let top=e; while(top.parentElement&&top.parentElement!==root) top=top.parentElement; if(parseFloat(top.style.top)<150&&fs<36&&fs>=18) return 'Subtitle'; return fs>=24?'Key point':'Text';}
function layoutSection(rep){
  const sec=document.createElement('section'); sec.setAttribute('data-title','New slide'); const fb=finalBase(rep); const srcRoot=contentRoot(fb);
  const root=srcRoot===fb?null:srcRoot.cloneNode(true); const container=root||(()=>{const d=document.createElement('div'); Array.from(fb.children).forEach(c=>{if(!c.classList.contains('step-layer')&&!c.classList.contains('slide-copy')&&!isExtra(c)) d.appendChild(c.cloneNode(true));}); return d;})();
  container.querySelectorAll('*').forEach(x=>{ if(x.ownerSVGElement) return; if(x.style&&(x.style.opacity==='0')){x.remove(); return;} if(x.style&&x.style.animation) x.style.removeProperty('animation'); x.classList&&x.classList.remove('fragment'); x.removeAttribute&&x.removeAttribute('data-fragment-index'); });
  container.querySelectorAll('svg,img,canvas,video,[role="img"]').forEach(g=>{ if(!g.isConnected&&!container.contains(g)) return; if(g.parentElement&&g.parentElement.closest('svg,[role="img"]')&&container.contains(g.parentElement.closest('svg,[role="img"]'))) return;
    const ph=document.createElement('div'); const keep=['position','left','top','right','bottom','width','height','margin-top','margin-left','margin-right','margin-bottom','flex','align-self','grid-column','grid-row'];
    keep.forEach(p=>{const v=g.style.getPropertyValue(p); if(v) ph.style.setProperty(p,v);}); if(!ph.style.width&&g.getAttribute('width')) ph.style.width=parseFloat(g.getAttribute('width'))+'px'; if(!ph.style.height&&g.getAttribute('height')) ph.style.height=parseFloat(g.getAttribute('height'))+'px';
    Object.assign(ph.style,{boxSizing:'border-box',border:'2px dashed #B9BEC8',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',color:'#7A8292',fontSize:'18px'}); ph.textContent='Figure'; g.replaceWith(ph); });
  const done=new Set(); container.querySelectorAll('*').forEach(x=>{ if(x.ownerSVGElement||x.closest('svg')) return; for(const d of done) if(d.contains(x)) return; if(hasBlockKids(x)) return; if(!x.textContent.trim()||x.textContent.trim()==='Figure') return; x.textContent=placeholderLabel(x,container); done.add(x); });
  if(root) sec.appendChild(root); else { const r=document.createElement('div'); r.setAttribute('style',`width: ${S.W}px; height: ${S.H}px; position: relative`); Array.from(container.childNodes).forEach(n=>r.appendChild(n)); sec.appendChild(r); }
  const cp=rep.querySelector(':scope > .slide-copy'); if(cp) sec.appendChild(cp.cloneNode(true));
  return sec;
}
/* ======================= standard layouts styled from the deck ======================= */
function deckTheme(){
  const st=S.styles||[]; const by=re=>st.find(o=>re.test(o.name));
  const css=o=>o?Object.entries(o.props).map(([k,v])=>`${k}: ${v}`).join('; '):'';
  const T={title:by(/^Title/)||by(/^Display/), sub:by(/^Subtitle/), body:by(/^Body$/)||by(/^Body/), label:by(/Label/), cap:by(/^Caption/)};
  // slide root: copy the look of an existing slide's root, minus layout behaviour
  let root=`width: ${S.W}px; height: ${S.H}px; position: relative; box-sizing: border-box; background: #FBFBFA; color: #16181D; overflow: hidden`;
  for(const s of S.slides){ const r=contentRoot(finalBase(s)); if(r&&r.tagName==='DIV'&&r!==finalBase(s)&&r.getAttribute('style')){ const d=document.createElement('div'); d.setAttribute('style',r.getAttribute('style'));
      ['display','flex-direction','justify-content','align-items','gap','padding','padding-top','padding-right','padding-bottom','padding-left','grid-template-columns'].forEach(p=>d.style.removeProperty(p));
      d.style.position='relative'; d.style.width=S.W+'px'; d.style.height=S.H+'px'; d.style.overflow='hidden'; root=d.getAttribute('style'); break; } }
  // card look and hairline rule colour, most common in the deck
  const cards={}, rules={};
  for(const s of S.slides){ for(const e of finalBase(s).querySelectorAll('div[style]')){ const x=e.style;
      if(x.borderRadius&&x.borderTopWidth&&x.backgroundColor&&e.textContent.trim()){ const k=['background-color','border-top-width','border-top-style','border-top-color','border-top-left-radius'].map(p=>x.getPropertyValue(p)).join('|'); cards[k]=(cards[k]||0)+1; }
      if(parseFloat(x.height)===1&&parseFloat(x.width)>400&&x.backgroundColor) rules[x.backgroundColor]=(rules[x.backgroundColor]||0)+1; } }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0];
  const ck=top(cards); let card='box-sizing: border-box; background: #FFFFFF; border: 1px solid #DADDE2; border-radius: 12px';
  if(ck){const [bg,bw,bs,bc,br]=ck[0].split('|'); card=`box-sizing: border-box; background: ${bg}; border: ${bw} ${bs} ${bc}; border-radius: ${br}`;}
  const rk=top(rules); const rule=rk?rk[0]:'#DADDE2';
  const muted=(T.sub&&T.sub.props.color)||'#4E5360';
  const copy=(()=>{for(const s of S.slides){const c=s.querySelector(':scope > .slide-copy'); if(c) return c;} return null;})();
  return {root,card,rule,muted,accent:S.accent||'#2557D6',copy,
    title:css(T.title)||'font-size: 48px; line-height: 56px; font-weight: 600; letter-spacing: -0.01em',
    sub:css(T.sub)||`font-size: 21px; line-height: 28px; color: ${muted}`,
    body:css(T.body)||'font-size: 22px; line-height: 30px',
    label:css(T.label)||`font-family: 'IBM Plex Mono', monospace; font-size: 15px; line-height: 20px; font-weight: 500`,
    cap:css(T.cap)||`font-size: 16px; line-height: 23px; color: ${muted}`};
}
function stdLayouts(){
  const th=deckTheme(); const kx=S.W/1280, ky=S.H/720; const X=v=>Math.round(v*kx), Y=v=>Math.round(v*ky), M=X(64), CW=S.W-2*M;
  const mk=(tag,style,text)=>{const e=document.createElement(tag); e.setAttribute('style',style); if(text!=null) e.textContent=text; return e;};
  const at=(x,y,w,h)=>`position: absolute; left: ${x}px; top: ${y}px; width: ${w}px`+(h?`; height: ${h}px`:'');
  const heading=(lv,style,text)=>{const h=mk('h'+lv,style,text); headingSafe(h); return h;};
  const titleSize=s=>s.replace(/font-size:\s*[\d.]+px/,'font-size: '+s).replace(/;?\s*$/,'');
  const big=(px,lh)=>th.title.replace(/font-size:\s*[\d.]+px/,`font-size: ${px}px`).replace(/line-height:\s*[\d.]+px/,`line-height: ${lh}px`);
  const bullets=(x,y,w,items,style)=>{const ul=mk('ul',`${at(x,y,w)}; margin: 0; padding-left: 1.2em; ${style||th.body}`); items.forEach((t,i)=>{const li=mk('li',i<items.length-1?'margin-bottom: 14px':'',t); ul.appendChild(li);}); return ul;};
  const footer=root=>{root.appendChild(mk('div',`${at(M,Y(620),CW)}; height: 1px; background: ${th.rule}`)); root.appendChild(mk('div',`${at(M,Y(636),CW)}; ${th.body}`,'The one thing to remember from this slide.'));};
  const titleBlock=(root,sub)=>{root.appendChild(heading(2,`${at(M,Y(48),CW)}; ${th.title}`,'Slide title')); if(sub!==false) root.appendChild(mk('div',`${at(M,Y(112),CW)}; ${th.sub}`,sub||'One line on what this slide shows'));};
  const figure=(x,y,w,h)=>mk('div',`${at(x,y,w,h)}; box-sizing: border-box; border: 2px dashed #B9BEC8; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #7A8292; font-size: 18px`,'Figure: paste or drop an image here');
  const section=(name,build)=>{const sec=document.createElement('section'); sec.setAttribute('data-title',name); const root=mk('div',th.root); build(root); sec.appendChild(root); if(th.copy) sec.appendChild(th.copy.cloneNode(true)); return sec;};
  return [
    ['Title slide','Deck title and subtitle',()=>section('Title slide',r=>{ r.appendChild(heading(S.slides.some(s=>s.querySelector('h1'))?2:1,`${at(M,Y(220),CW)}; ${big(64,72)}`,'Deck title')); r.appendChild(mk('div',`${at(M,Y(308),CW)}; ${th.sub.replace(/font-size:\s*[\d.]+px/,'font-size: 26px').replace(/line-height:\s*[\d.]+px/,'line-height: 36px')}`,'Subtitle: what this lecture is about')); r.appendChild(mk('div',`${at(M,Y(376),120,4)}; background: ${th.accent}`)); })],
    ['Section header','Starts a new part of the talk',()=>section('Section',r=>{ r.appendChild(mk('div',`${at(M,Y(240),CW)}; ${th.label}; color: ${th.accent}; letter-spacing: 0.08em`,'PART 02')); r.appendChild(heading(2,`${at(M,Y(270),CW)}; ${big(56,64)}`,'Section title')); r.appendChild(mk('div',`${at(M,Y(350),X(900))}; ${th.sub}`,'What this part covers, in one line')); })],
    ['Title and content','Title, subtitle, bullets, takeaway',()=>section('New slide',r=>{ titleBlock(r); r.appendChild(bullets(M,Y(180),X(1000),['First point','Second point','Third point'])); footer(r); })],
    ['Two columns','Two lists side by side',()=>section('New slide',r=>{ titleBlock(r); const w=X(544);
      [[M,'Left heading'],[M+w+X(64),'Right heading']].forEach(([x,h])=>{ r.appendChild(mk('div',`${at(x,Y(180),w)}; ${th.body}; font-weight: 600`,h)); r.appendChild(bullets(x,Y(226),w,['First point','Second point','Third point'])); }); footer(r); })],
    ['Comparison','Two cards to contrast',()=>section('New slide',r=>{ titleBlock(r); const w=X(560);
      [[M,'OPTION A'],[M+w+X(32),'OPTION B']].forEach(([x,l])=>{ const c=mk('div',`${at(x,Y(190),w,Y(380))}; ${th.card}; padding: 28px 32px; display: flex; flex-direction: column; gap: 12px`); c.appendChild(mk('div',`${th.label}; color: ${th.accent}`,l)); c.appendChild(mk('div',`${big(30,38)}`,'Name it')); const ul=bullets(0,0,0,['Strength','Weakness','When to use it']); ul.setAttribute('style',`margin: 0; padding-left: 1.2em; ${th.body}`); c.appendChild(ul); r.appendChild(c); }); })],
    ['Picture with caption','Figure, caption and notes',()=>section('New slide',r=>{ titleBlock(r); r.appendChild(figure(M,Y(172),X(720),Y(405))); r.appendChild(mk('div',`${at(M,Y(588),X(720))}; ${th.cap}`,'Caption: what to notice in the figure.')); r.appendChild(bullets(M+X(752),Y(180),X(400),['What it shows','Why it matters'])); })],
    ['Key number','One big number and what it means',()=>section('New slide',r=>{ titleBlock(r,false); r.appendChild(mk('div',`${at(M,Y(200),CW)}; ${big(120,128)}; color: ${th.accent}`,'94%')); r.appendChild(mk('div',`${at(M,Y(352),X(820))}; ${th.body.replace(/font-size:\s*[\d.]+px/,'font-size: 28px').replace(/line-height:\s*[\d.]+px/,'line-height: 38px')}`,'What the number means, in one sentence.')); r.appendChild(mk('div',`${at(M,Y(460),X(820))}; ${th.cap}`,'Source or how it was measured')); })],
    ['Statement','A single sentence, centred',()=>section('New slide',r=>{ r.appendChild(heading(2,`${at(X(160),Y(250),X(960))}; ${big(44,54)}; font-weight: 500; text-align: center`,'One sentence worth remembering.')); r.appendChild(mk('div',`${at(X(160),Y(400),X(960))}; ${th.cap}; text-align: center`,'Attribution or context')); })],
    ['Title only','Title and subtitle, empty below',()=>section('New slide',r=>titleBlock(r))],
    ['Blank','Nothing on the slide',()=>section('New slide',()=>{})],
  ];
}

async function pickLayout(){
  endEdit(); const lays=collectLayouts().sort((a,b)=>b.n-a.n||a.i-b.i);
  const grid=el('div',{class:'lay-grid'}); let resolve; const done=new Promise(r=>resolve=r);
  const card=(title,sub,makeSec)=>{const b=el('button',{class:'lay-card',type:'button'}); const f=el('span',{class:'tf'}); b.append(f,el('span',{class:'lt',text:title}),el('span',{class:'ls',text:sub})); const sec=makeSec(); f.appendChild(makeThumbHost(sec,{width:200})); b.onclick=()=>resolve(sec); return b;};
  const std=el('div',{class:'lay-grid'}); for(const [n,d,mkSec] of stdLayouts()){ try{ std.appendChild(card(n,d,mkSec)); }catch(e){} }
  const addCards=list=>{for(const l of list){ try{ grid.appendChild(card(slideTitle(l.rep,l.i),l.n>1?`Layout used on ${l.n} slides`:`Like slide ${l.i+1}`,()=>layoutSection(l.rep))); }catch(e){} }};
  addCards(lays.slice(0,11));
  if(lays.length>11){const more=el('button',{class:'btn',type:'button',text:`Show all ${lays.length} layouts`,style:'grid-column:1/-1;justify-self:start',onclick:()=>{more.remove(); addCards(lays.slice(11));}}); grid.appendChild(more);}
  const wrap=el('div',{class:'stack lay-wrap'},el('h3',{class:'lay-h',text:'Standard layouts'}),el('p',{class:'hint',text:'Styled to match this deck: its fonts, title and body styles, accent colour and cards. Titles are real headings and bullets are real lists.'}),std,
    lays.length?el('h3',{class:'lay-h',text:'From this deck'}):null,lays.length?el('p',{class:'hint',text:'Copies of your own slides, most-used layout first. Text becomes placeholders and pictures become “Figure” boxes.'}):null,lays.length?grid:null);
  const bg=el('div',{class:'modal-bg'}); const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true','aria-label':'New slide'},el('h2',{text:'New slide'}),wrap,el('div',{class:'actions'},el('button',{class:'btn',text:'Cancel',onclick:()=>resolve(null)})));
  bg.appendChild(m); document.body.appendChild(bg); const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); resolve(null);}}; document.addEventListener('keydown',kd,true); bg.addEventListener('pointerdown',e=>{if(e.target===bg) resolve(null);});
  std.firstChild.focus(); const sec=await done; bg.remove(); document.removeEventListener('keydown',kd,true);
  if(sec) slidesOp('Add slide',()=>{S.slides.splice(S.cur+1,0,sec); S.cur++;});
}
