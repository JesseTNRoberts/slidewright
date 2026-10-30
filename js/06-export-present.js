/* Slidewright: export present. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= 8. exports & presenter ======================= */
S.fontFaces=[];
function facesFor(text){const cps=new Set([32]); for(const ch of text) cps.add(ch.codePointAt(0)); const list=[...cps];
  return S.fontFaces.filter(f=>list.some(c=>f.ranges.some(r=>c>=r[0]&&c<=r[1]))).map(f=>f.css).join('\n');}
async function slideCanvas(sec,k,scale){
  const c=sec.cloneNode(true); c.querySelectorAll('[contenteditable]').forEach(n=>n.removeAttribute('contenteditable'));
  if(k!=null) clickStates(c).forEach((g,i)=>{if(i<k) g.forEach(f=>f.classList.add('de-shown')); if(i===k-1) g.forEach(f=>f.classList.add('de-cur'));});
  const css=(facesFor(c.textContent)+'\n'+S.thumbCSS+'\n'+OVR('.de-deck')+'\n'+(k!=null?stateCSS():'')).replace(/\]\]>/g,'');
  const xs=new XMLSerializer().serializeToString(c);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${S.W}" height="${S.H}"><foreignObject x="0" y="0" width="${S.W}" height="${S.H}"><div xmlns="http://www.w3.org/1999/xhtml" class="reveal de-deck" style="position:relative;width:${S.W}px;height:${S.H}px;overflow:hidden;background:#fff;--de-w:${S.W}px;--de-h:${S.H}px"><style><![CDATA[${css}]]></style><div class="slides">${xs}</div></div></foreignObject></svg>`;
  const img=new Image(); img.decoding='sync'; img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await new Promise((ok,bad)=>{img.onload=ok; img.onerror=()=>bad(new Error('This browser couldn’t draw the slide. Chrome or Edge work best for PDF export.'));});
  const cv=document.createElement('canvas'); cv.width=Math.round(S.W*scale); cv.height=Math.round(S.H*scale); const g=cv.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,cv.width,cv.height); g.drawImage(img,0,0,cv.width,cv.height);
  return cv;
}
const loadJsPDF=()=>loadScript(['vendor/jspdf-2.5.1/jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'],()=>window.jspdf&&window.jspdf.jsPDF);
async function exportPDF(){
  endEdit(); commit(); const r1b=el('input',{type:'radio',name:'pdfmode',value:'last',checked:''}), r2b=el('input',{type:'radio',name:'pdfmode',value:'each'});
  const w=el('div',{class:'stack'},el('label',{class:'chk'},r1b,el('span',{text:'One page per slide, each at its last click'})),el('label',{class:'chk'},r2b,el('span',{text:'One page per click, so every build step is shown'})));
  const v=await modal('Export PDF',w,[['Cancel',null],['Export','ok','primary']]); if(v!=='ok') return; const each=r2b.checked;
  let JsPDF; try{JsPDF=await loadJsPDF();}catch(e){toast('Couldn’t load the PDF library from cdnjs. Check your connection.','warn'); return;}
  const pages=[]; S.slides.forEach(s=>{ if(each){const n=clickStates(s).length; for(let k=0;k<=n;k++) pages.push([s,k]);} else pages.push([s,null]); });
  const prog=progressCard('Making your PDF'); try{
    if(document.fonts) await document.fonts.ready;
    const pdf=new JsPDF({orientation:'landscape',unit:'px',format:[S.W,S.H],hotfixes:['px_scaling'],compress:true});
    for(let i=0;i<pages.length;i++){ if(prog.cancelled) return; prog.set(i/pages.length,`Page ${i+1} of ${pages.length}`); await tick();
      const cv=await slideCanvas(pages[i][0],pages[i][1],2); if(i) pdf.addPage([S.W,S.H],'landscape'); pdf.addImage(cv.toDataURL('image/jpeg',0.9),'JPEG',0,0,S.W,S.H,undefined,'FAST'); }
    pdf.setProperties({title:S.doc.title||baseName()}); prog.set(1,'Saving…');
    await saveFile(baseName()+'.pdf',pdf.output('blob'),'PDF','.pdf','application/pdf');
  }catch(e){toast(e.message||'PDF export failed.','warn');} finally{prog.close();}
}
function notesText(sec){const n=sec.querySelector(':scope > aside.notes'); if(!n) return ''; return Array.from(n.querySelectorAll('p')).map(p=>p.textContent.trim()).filter(Boolean).join('\n\n')||n.textContent.trim();}
async function exportHandout(){
  endEdit(); commit(); let JsPDF; try{JsPDF=await loadJsPDF();}catch(e){toast('Couldn’t load the PDF library from cdnjs. Check your connection.','warn'); return;}
  const prog=progressCard('Making the handout'); try{
    if(document.fonts) await document.fonts.ready;
    const pdf=new JsPDF({unit:'pt',format:'letter'}); const PW=612,PH=792,M=40, per=3, rowH=(PH-2*M-30)/per, imgW=300, imgH=imgW*S.H/S.W, gap=18, txtX=M+imgW+gap, txtW=PW-M-txtX;
    const title=S.doc.title||baseName(); let page=0;
    for(let i=0;i<S.slides.length;i++){ if(prog.cancelled) return; prog.set(i/S.slides.length,`Slide ${i+1} of ${S.slides.length}`); await tick();
      const slot=i%per; if(slot===0){ if(i) pdf.addPage(); page++; pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor(40); pdf.text(title,M,M-12); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(`Page ${page}`,PW-M,PH-M+20,{align:'right'}); }
      const y=M+slot*rowH; const cv=await slideCanvas(S.slides[i],null,1);
      pdf.addImage(cv.toDataURL('image/jpeg',0.85),'JPEG',M,y,imgW,imgH,undefined,'FAST'); pdf.setDrawColor(200); pdf.rect(M,y,imgW,imgH);
      pdf.setTextColor(30); pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); const head=pdf.splitTextToSize(`${i+1}. ${slideTitle(S.slides[i],i)}`,txtW); pdf.text(head,txtX,y+10);
      let ty=y+10+head.length*13; const nt=notesText(S.slides[i]); pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); pdf.setTextColor(60);
      if(nt){ const lines=pdf.splitTextToSize(nt,txtW); const maxL=Math.floor((y+rowH-24-ty)/12); pdf.text(lines.slice(0,maxL),txtX,ty+4); if(lines.length>maxL) pdf.text('…',txtX,ty+4+maxL*12); }
      else { pdf.setDrawColor(215); for(let ly=ty+18; ly<y+imgH+2; ly+=20) pdf.line(txtX,ly,txtX+txtW,ly); } }
    pdf.setProperties({title:title+' handout'}); prog.set(1,'Saving…');
    await saveFile(baseName()+'-handout.pdf',pdf.output('blob'),'PDF','.pdf','application/pdf');
  }catch(e){toast(e.message||'Handout export failed.','warn');} finally{prog.close();}
}
/* ---- displays: put the audience on the external display and presenter view on the built-in one ---- */
const hasScreens=()=>'getScreenDetails' in window;
async function screenPerm(){ for(const name of ['window-management','window-placement']){ try{ return (await navigator.permissions.query({name})).state; }catch(_){} } return 'denied'; }
async function screenDetails(ask){ if(!hasScreens()) return null; const st=await screenPerm(); if(st==='denied'||(st!=='granted'&&!ask)) return null;
  try{ return await Promise.race([window.getScreenDetails(),new Promise((_,bad)=>setTimeout(()=>bad(new Error('timeout')),60000))]); }catch(_){ return null; } }
function pickScreens(sd){ if(!sd||sd.screens.length<2) return null; const L=sd.screens;
  const pres=L.find(x=>x.isInternal)||sd.currentScreen||L.find(x=>x.isPrimary)||L[0]; const aud=L.find(x=>x!==pres&&!x.isInternal)||L.find(x=>x!==pres);
  return aud?{pres,aud}:null; }
const screenName=x=>(x.label||(x.isInternal?'Built-in display':'External display'))+` (${x.width}×${x.height})`;
async function presenterView(){
  if(!S.doc) return; endEdit(); commit(); if(PV.on) stopPreview();
  let sd=await screenDetails(true); let place=pickScreens(sd);
  const ov=el('div',{id:'presenter',role:'dialog','aria-label':'Presenter view'}); document.body.appendChild(ov);
  let aw=null, B=null, swapping=false, dup=false;
  /* The audience window is a plain page of ours holding the deck in a sealed (sandboxed) frame. */
  const openAudience=(scr,state)=>{ let feat='popup,width=1280,height=760';
    if(scr) feat=`popup,left=${scr.availLeft},top=${scr.availTop},width=${scr.availWidth},height=${scr.availHeight},fullscreen`;
    let w=null; try{ w=window.open('','slidewright-audience',feat); }catch(_){}
    if(!w) return null; const t=(S.doc&&S.doc.title||'Slides').replace(/[<&>]/g,'');
    w.document.open(); w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${t}</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#deck{position:fixed;inset:0;width:100%;height:100%;border:0;display:block}</style></head><body><iframe id="deck" title="Slides" allow="fullscreen; autoplay" sandbox="${DECK_SANDBOX}"></iframe></body></html>`); w.document.close();
    const fr=w.document.getElementById('deck'); if(B) B.close(); B=deckBridge(fr,w); aw=w;
    B.on('key',k=>{ if(k==='f'){ const d=w.document; if(d.fullscreenElement) d.exitFullscreen().catch(()=>{}); else d.documentElement.requestFullscreen().catch(()=>{}); } });
    B.on('embeds',items=>embedOverlays(w.document,w.document.body,fr,items)); w.addEventListener('resize',()=>B&&B.send('hello'));
    fr.srcdoc=presentHTML({toolbar:false}); attach(state); return w; };
  const fsPresenter=scr=>{ try{ if(scr&&ov.requestFullscreen) return ov.requestFullscreen({screen:scr}).catch(()=>{}); }catch(_){} return Promise.resolve(); };
  const cur=el('div',{class:'pv-cur'}), next=el('div',{class:'pv-next'}), notes=el('div',{class:'pv-notes'}), clock=el('span',{class:'pv-clock'}), timer=el('span',{class:'pv-timer',text:'0:00'}), pos=el('span',{class:'pv-pos'});
  let t0=Date.now(), paused=0, pauseAt=null; const fmt=ms=>{const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
  const pauseB=el('button',{class:'btn',text:'Pause',onclick:()=>{if(pauseAt){paused+=Date.now()-pauseAt; pauseAt=null; pauseB.textContent='Pause';} else {pauseAt=Date.now(); pauseB.textContent='Resume';}}});
  const R=()=>B&&B.st.ready?B.R:null;
  const ink=()=>B&&B.st.ready&&B.st.ink?B.I:null;
  const slideTimer=el('span',{class:'pv-clock',title:'Time on this slide'}); let slideIdx=-1, slideT0=Date.now();
  const inkLayer=el('div',{class:'pv-ink'}); const inkSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'); inkSvg.setAttribute('viewBox',`0 0 ${S.W} ${S.H}`); inkSvg.setAttribute('preserveAspectRatio','none'); inkLayer.appendChild(inkSvg);
  const pvDot=document.createElementNS('http://www.w3.org/2000/svg','circle'); pvDot.setAttribute('r',String(Math.round(S.W/110))); pvDot.setAttribute('fill','#FF2D2D'); pvDot.setAttribute('style','filter:drop-shadow(0 0 6px rgba(255,45,45,.9));opacity:0;transition:opacity .25s'); let dotT=null;
  const showDot=(x,y)=>{pvDot.setAttribute('cx',x); pvDot.setAttribute('cy',y); pvDot.style.opacity=1; clearTimeout(dotT); dotT=setTimeout(()=>pvDot.style.opacity=0,1500);};
  let live=null; const drawInk=()=>{ inkSvg.replaceChildren(...(B&&B.st.ready?inkPaths(B.st.dump,`${B.st.ix.h}.${B.st.ix.v||0}`,'http://www.w3.org/2000/svg'):[])); if(live) inkSvg.appendChild(live.el); inkSvg.appendChild(pvDot);};
  const toPt=e=>{const r=inkLayer.getBoundingClientRect(); return [(e.clientX-r.left)*S.W/r.width,(e.clientY-r.top)*S.H/r.height];};
  inkLayer.addEventListener('pointerdown',e=>{const I=ink(); if(!I) return; const t=I.getTool(); if(t!=='pen'&&t!=='hl') return; e.preventDefault(); inkLayer.setPointerCapture(e.pointerId); const [x,y]=toPt(e); I.begin(x,y);
    const pth=document.createElementNS('http://www.w3.org/2000/svg','path'); pth.setAttribute('fill','none'); pth.setAttribute('stroke',t==='hl'?'#FFD400':I.getColor()); pth.setAttribute('stroke-width',t==='hl'?22:4); pth.setAttribute('stroke-linecap','round'); if(t==='hl') pth.setAttribute('stroke-opacity','0.4'); live={el:pth,d:`M${x} ${y}`}; pth.setAttribute('d',live.d); inkSvg.appendChild(pth);});
  inkLayer.addEventListener('pointermove',e=>{const I=ink(); if(!I) return; const [x,y]=toPt(e); if(live){I.move(x,y); live.d+=` L${x.toFixed(1)} ${y.toFixed(1)}`; live.el.setAttribute('d',live.d);} else if(I.getTool()==='laser'){I.laser(x,y); showDot(x,y);}});
  inkLayer.addEventListener('pointerleave',()=>{pvDot.style.opacity=0;});
  const endInk=()=>{const I=ink(); if(live&&I){I.end(); live=null; drawInk();}}; inkLayer.addEventListener('pointerup',endInk); inkLayer.addEventListener('pointercancel',endInk);
  const toolBtns={}; const syncTools=()=>{const I=ink(); const t=I?I.getTool():null; for(const k in toolBtns) toolBtns[k].setAttribute('aria-pressed',String(t===k)); inkLayer.style.pointerEvents=t?'auto':'none'; inkLayer.style.cursor=t==='laser'?'none':t?'crosshair':''; if(t!=='laser') pvDot.style.opacity=0;};
  const setTool=t=>{const I=ink(); if(!I){toast('The audience window is still starting.'); return;} I.setTool(t); syncTools();};
  const tb=(label,title,t,fn)=>{const b=el('button',{class:'btn',text:label,title,onclick:fn||(()=>setTool(t))}); if(t) toolBtns[t]=b; return b;};
  const tools=el('span',{class:'pv-tools'},tb('✎ Pen','Draw on the slide (D)','pen'),tb('▮ Marker','Highlight (M)','hl'),tb('● Laser','Laser pointer (R)','laser'),
    tb('↶','Undo last stroke',null,()=>{const I=ink(); I&&I.undo();}),tb('⌫','Clear drawings on this slide (E)',null,()=>{const I=ink(); I&&I.clear();}),tb('■ Blank','Black out the screen (B)',null,()=>{const r=R(); r&&r.togglePause();}));
  const close=()=>{clearInterval(iv); if(B) B.close(); if(document.fullscreenElement===ov) document.exitFullscreen().catch(()=>{}); ov.remove(); document.removeEventListener('keydown',kd,true); if(sd) sd.removeEventListener&&sd.removeEventListener('screenschange',onScreens);};
  const onScreens=()=>{ place=pickScreens(sd); };
  if(sd&&sd.addEventListener) sd.addEventListener('screenschange',onScreens);
  const snapshot=()=>{ const r=R(), I=ink(); let ix=null; try{ ix=r&&r.getIndices(); }catch(_){} return {ix,ink:I?I.dump():null}; };
  const moveAudience=async scr=>{ const st=snapshot(); swapping=true; try{ aw&&aw.close(); }catch(_){} const w=openAudience(scr,st); swapping=false;
    if(!w){ aw=null; toast('The audience window was blocked. Allow pop-ups for this site, then choose Display again.','warn'); } };
  const displayMenu=anchor=>{ const items=[]; const scrs=sd?sd.screens:[];
    if(place){ items.push(['Swap displays',async()=>{ const p=place.aud, a=place.pres; place={pres:p,aud:a}; await fsPresenter(p); await moveAudience(a); }]); }
    scrs.filter(x=>!place||x!==place.aud).filter(x=>!place||x!==place.pres).forEach(x=>items.push(['Audience on '+screenName(x),async()=>{ await moveAudience(x); if(place) place.aud=x; }]));
    items.push([dup?'Extend: notes here, slides there':'Duplicate: show the audience view here too',()=>{ dup=!dup; ov.classList.toggle('pv-dup',dup); render(); }]);
    if(place) items.push([document.fullscreenElement===ov?'Leave full screen here':'Full screen here',()=>{ if(document.fullscreenElement===ov) document.exitFullscreen().catch(()=>{}); else fsPresenter(sd&&sd.currentScreen||place.pres); }]);
    if(!sd) items.push([hasScreens()?'Find my displays…':'Moving windows between displays',async()=>{ if(!hasScreens()){ modal('Moving windows between displays','This browser can’t place windows on another display. Drag the audience window to the projector and press F there for full screen. In Chrome or Edge, Slidewright does this for you.',[['OK',null,'primary']]); return; }
      const d=await screenDetails(true); if(!d){ toast('Slidewright wasn’t allowed to see your displays. You can allow “Window management” in the site settings.','warn'); return; } sd=d; place=pickScreens(d); if(d.addEventListener) d.addEventListener('screenschange',onScreens); toast(d.screens.length>1?'Found your displays. Choose Display again to swap or move the windows.':'Only one display is connected.'); }]);
    else if(sd.screens.length<2) items.push(['Only one display is connected',()=>{}]);
    menu(anchor,items); };
  ov.append(el('div',{class:'pv-top'},el('b',{text:'Presenter view'}),pos,tools,el('span',{class:'spacer'}),slideTimer,timer,pauseB,el('button',{class:'btn',text:'Reset',onclick:()=>{t0=Date.now(); paused=0; pauseAt=null; pauseB.textContent='Pause';}}),clock,
      el('button',{class:'btn',text:'◀',title:'Previous',onclick:()=>{const r=R(); r&&r.prev();}}),el('button',{class:'btn primary',text:'Next ▶',title:'Next (→ or Space)',onclick:()=>{const r=R(); r&&r.next();}}),
      el('button',{class:'btn',text:'🖥 Display',title:'Swap or duplicate displays','aria-haspopup':'menu',onclick:e=>displayMenu(e.currentTarget)}),
      el('button',{class:'btn',text:'End',onclick:()=>{close(); try{aw.close();}catch(_){}}})),
    el('div',{class:'pv-main'},el('div',{class:'pv-col'},el('div',{class:'pv-lbl',text:'Now'}),cur),el('div',{class:'pv-col side'},el('div',{class:'pv-lbl',id:'pvNextLbl',text:'Next'}),next,el('div',{class:'pv-lbl',text:'Notes'}),notes)));
  const render=()=>{const r=R(); if(!r) return; const ix=r.getIndices(); const i=ix.h; const sec=S.slides[i]; if(!sec) return; const n=clickStates(sec).length; const k=(ix.f==null||ix.f<0)?0:ix.f+1;
    if(i!==slideIdx){slideIdx=i; slideT0=Date.now();}
    cur.replaceChildren(makeThumbHost(sec,{k,width:cur.clientWidth||800}),inkLayer); drawInk(); pos.textContent=`Slide ${i+1} of ${S.slides.length}`+(n?` · click ${k} of ${n}`:'');
    if(k<n){next.replaceChildren(makeThumbHost(sec,{k:k+1,width:next.clientWidth||400})); $('#pvNextLbl').textContent='Next click';}
    else if(S.slides[i+1]){next.replaceChildren(makeThumbHost(S.slides[i+1],{k:0,width:next.clientWidth||400})); $('#pvNextLbl').textContent='Next slide';}
    else {next.replaceChildren(el('div',{class:'pv-end',text:'End of deck'})); $('#pvNextLbl').textContent='Next';}
    const nt=notesText(sec); notes.textContent=nt||'No notes for this slide.'; notes.classList.toggle('empty',!nt);};
  const iv=setInterval(()=>{ if(!swapping&&aw&&aw.closed){close(); toast('The audience window closed, so presenter view ended.'); return;} clock.textContent=new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); slideTimer.textContent='this slide '+fmt(Date.now()-slideT0); timer.textContent=fmt((pauseAt||Date.now())-t0-paused); },500);
  const kd=e=>{const r=R(); if(e.key==='Escape'){e.preventDefault(); const I=ink(); if(I&&I.getTool()){I.setTool(I.getTool()); syncTools(); return;} close(); return;} if(!r) return;
    if(!e.metaKey&&!e.ctrlKey&&!e.altKey){const k=e.key.toLowerCase(); const map={d:'pen',m:'hl',r:'laser'}; if(map[k]){e.preventDefault(); e.stopPropagation(); setTool(map[k]); return;} if(k==='e'){e.preventDefault(); const I=ink(); I&&I.clear(); return;} if(k==='b'||k==='.'){e.preventDefault(); r.togglePause(); return;} if(k==='c'){e.preventDefault(); const I=ink(); if(I){const cs=['#E0407A','#2557D6','#16181D','#1C7A4C']; I.setColor(cs[(cs.indexOf(I.getColor())+1)%cs.length]);} return;}} if(['ArrowRight','ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault(); e.stopPropagation(); r.next();} if(['ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault(); e.stopPropagation(); r.prev();}};
  document.addEventListener('keydown',kd,true);
  function attach(state){ const mine=B;
    mine.on('ready',()=>{ if(B!==mine) return; const r=mine.R; ['slidechanged','fragmentshown','fragmenthidden'].forEach(ev=>r.on(ev,render));
      if(state&&state.ix) r.slide(state.ix.h,state.ix.v,state.ix.f); else r.slide(S.cur); render();
      const I=mine.I; if(state&&state.ink) I.load(state.ink); I.onchange(()=>{drawInk(); syncTools();}); syncTools(); drawInk(); });
    setTimeout(()=>{ if(B===mine&&!mine.st.ready) cur.replaceChildren(el('div',{class:'pv-end',text:'The deck’s player didn’t start in the audience window.'})); },15000); }
  if(place) await fsPresenter(place.pres);
  if(!openAudience(place&&place.aud,null)){
    const v=await modal('Start presenting',place?`Slidewright will put the slides on ${screenName(place.aud)} and presenter view on ${screenName(place.pres)}.`:'Slidewright opens the slides in a second window for the projector.',[['Cancel',null],['Start','ok','primary']]);
    if(v==='ok'&&place) fsPresenter(place.pres);
    if(v!=='ok'||!openAudience(place&&place.aud,null)){ close(); if(v==='ok') toast('The audience window was blocked. Allow pop-ups for this site, or use Slidewright from its GitHub Pages address.','warn'); return; } }
  toast(place?`Slides are on ${screenName(place.aud)}. Use Display to swap or duplicate.`:sd&&sd.screens.length<2?'Only one display is connected. Connect the projector, then use Display.':'Drag the audience window to the projector and press F there for full screen. Display has more options.');
}

/* ======================= 9. slide sorter ======================= */
const sorterCache=new WeakMap();
function openSorter(){
  endEdit(); if(PV.on) stopPreview(); $$('#sorter').forEach(x=>x.remove());
  const sel=new Set([curSec()]); let anchor=S.cur; let dragSet=null;
  const ov=el('div',{id:'sorter',role:'dialog','aria-label':'All slides'}); const grid=el('div',{class:'sorter-grid',role:'listbox','aria-multiselectable':'true'});
  const count=el('span',{class:'hint'});
  const close=()=>{io2.disconnect(); ov.remove(); document.removeEventListener('keydown',kd,true);};
  const act=(label,fn)=>el('button',{class:'btn',text:label,onclick:()=>{fn(); draw();}});
  const selIdx=()=>S.slides.map((s,i)=>sel.has(s)?i:-1).filter(i=>i>=0);
  ov.append(el('div',{class:'sorter-top'},el('b',{text:'All slides'}),count,el('span',{class:'spacer'}),
    act('Duplicate',()=>{const idx=selIdx(); if(!idx.length) return; slidesOp('Duplicate slides',()=>{const copies=idx.map(i=>S.slides[i].cloneNode(true)); const at=idx[idx.length-1]+1; S.slides.splice(at,0,...copies); sel.clear(); copies.forEach(c=>sel.add(c)); S.cur=at;});}),
    act('Move to start',()=>moveSel(0)),act('Move to end',()=>moveSel(S.slides.length)),
    el('button',{class:'btn danger',text:'Delete',onclick:()=>{delSel(); draw();}}),
    el('button',{class:'btn primary',text:'Done',onclick:close})), grid);
  function moveSel(to){const idx=selIdx(); if(!idx.length) return; slidesOp('Move slides',()=>{const moving=idx.map(i=>S.slides[i]); let t=to; idx.forEach(i=>{if(i<to) t--;}); S.slides=S.slides.filter(s=>!sel.has(s)); S.slides.splice(Math.max(0,Math.min(t,S.slides.length)),0,...moving); S.cur=S.slides.indexOf(moving[0]);});}
  function delSel(){const idx=selIdx(); if(!idx.length||idx.length>=S.slides.length){toast('A deck needs at least one slide.');return;} slidesOp(idx.length>1?'Delete slides':'Delete slide',()=>{S.slides=S.slides.filter(s=>!sel.has(s)); S.cur=Math.min(idx[0],S.slides.length-1);}); sel.clear(); sel.add(curSec()); toast(`Deleted ${idx.length} slide${idx.length>1?'s':''}. Undo brings ${idx.length>1?'them':'it'} back.`);}
  const io2=new IntersectionObserver(ents=>{for(const e of ents){ if(!e.isIntersecting) continue; const i=+e.target.dataset.i; const s=S.slides[i]; const f=e.target.querySelector('.tf'); if(!s||f.querySelector('.th-host')) continue; let h=sorterCache.get(s); if(!h){h=makeThumbHost(s,{width:236}); sorterCache.set(s,h);} f.prepend(h);}},{root:grid,rootMargin:'400px'});
  function draw(){ io2.disconnect(); grid.replaceChildren(); count.textContent=`${S.slides.length} slides · ${sel.size} selected`;
    S.slides.forEach((s,i)=>{ const b=el('button',{class:'sorter-card'+(sel.has(s)?' on':'')+(i===S.cur?' cur':''),type:'button',role:'option','aria-selected':sel.has(s)?'true':'false',draggable:'true','data-i':i,'aria-label':`Slide ${i+1}: ${slideTitle(s,i)}`});
      b.append(el('span',{class:'tf'}),el('span',{class:'meta'},el('span',{class:'n',text:i+1}),el('span',{class:'tt',text:slideTitle(s,i)})));
      const miss=missingCount(s); if(miss) b.querySelector('.tf').appendChild(el('span',{class:'miss',text:miss+' alt'}));
      b.onclick=e=>{ if(e.shiftKey){const a=Math.min(anchor,i),z=Math.max(anchor,i); if(!(e.metaKey||e.ctrlKey)) sel.clear(); for(let j=a;j<=z;j++) sel.add(S.slides[j]);} else if(e.metaKey||e.ctrlKey){sel.has(s)?sel.delete(s):sel.add(s); anchor=i;} else {sel.clear(); sel.add(s); anchor=i;} draw(); const nb=grid.children[i]; nb&&nb.focus(); };
      b.ondblclick=()=>{close(); go(i);};
      b.ondragstart=e=>{ if(!sel.has(s)){sel.clear(); sel.add(s);} dragSet=new Set(sel); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/x-sorter','1');}catch(_){} };
      b.ondragover=e=>{if(!dragSet) return; e.preventDefault(); const r=b.getBoundingClientRect(); grid.querySelectorAll('.drop-l,.drop-r').forEach(x=>x.classList.remove('drop-l','drop-r')); b.classList.add(e.clientX>r.left+r.width/2?'drop-r':'drop-l');};
      b.ondrop=e=>{if(!dragSet) return; e.preventDefault(); e.stopPropagation(); const r=b.getBoundingClientRect(); const to=i+(e.clientX>r.left+r.width/2?1:0); sel.clear(); dragSet.forEach(x=>sel.add(x)); dragSet=null; moveSel(to); draw();};
      b.ondragend=()=>{dragSet=null; grid.querySelectorAll('.drop-l,.drop-r').forEach(x=>x.classList.remove('drop-l','drop-r'));};
      grid.appendChild(b); io2.observe(b); }); }
  const kd=e=>{ if($('.modal-bg')) return; if(e.key==='Escape'){e.preventDefault(); e.stopPropagation(); close();} else if((e.key==='Delete'||e.key==='Backspace')&&!isField(e.target)){e.preventDefault(); e.stopPropagation(); delSel(); draw();} else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault(); e.stopPropagation(); S.slides.forEach(s=>sel.add(s)); draw();} else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault(); e.stopPropagation(); e.shiftKey?redo():undo(); draw();} };
  document.addEventListener('keydown',kd,true);
  document.body.appendChild(ov); draw(); const c=grid.children[S.cur]; if(c){c.scrollIntoView({block:'center'}); c.focus();}
}
$('#sSort').onclick=openSorter;
