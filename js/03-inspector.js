/* Slidewright: inspector. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= inspector ======================= */
function toHex(c){if(!c) return null; if(c[0]==='#'){return c.length===4?'#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:c.slice(0,7);} const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); if(p.length>3&&p[3]===0) return null; return '#'+p.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');}
function describe(el){const tag=el.tagName.toLowerCase();
  if(el.classList.contains('slide-copy')) return ['line','Copyright line']; if(el.classList.contains('pdf-get')) return ['button','PDF download button'];
  if(el.classList.contains('sw-math')||(el.children.length===1&&el.firstElementChild.classList.contains('sw-math'))) return ['equation',(el.classList.contains('sw-math')?el:el.firstElementChild).getAttribute('data-latex')||'Equation'];
  if(tag==='pre') return ['code',(el.getAttribute('aria-label')||'Code')+': '+(codeSource(el).split('\n')[0]||'')];
  if(tag==='video'||tag==='audio') return [tag,el.getAttribute('title')||el.getAttribute('aria-label')||(tag==='video'?'Video':'Audio')];
  if(el.classList.contains('sw-embed')) return ['video',(el.querySelector('iframe')||{}).title||'Embedded video'];
  if(tag==='table'){ const cap=el.querySelector('caption'); return ['table',(cap&&cap.textContent.trim())||`${el.rows.length} × ${(el.rows[0]&&el.rows[0].cells.length)||0} table`]; }
  if(tag==='img') return ['image',el.getAttribute('alt')||'Image']; if(tag==='svg') return ['graphic',el.getAttribute('aria-label')||'Graphic'];
  if(el.getAttribute('role')==='img') return ['picture',el.getAttribute('aria-label')||'Picture'];
  let src=el; if(el.querySelector&&el.querySelector('.sw-math')){src=el.cloneNode(true); src.querySelectorAll('.sw-math').forEach(m=>m.replaceWith(' (equation) '));}
  const t=(src.textContent||'').replace(/\s+/g,' ').trim(); const kind=hasBlockKids(el)?'group':(t?'text':'shape'); return [kind,t||(kind==='group'?'Group':'Shape')];}
function crumbs(){const c=$('#crumbs'); c.replaceChildren(); const add=(label,fn,cur)=>{if(c.childNodes.length){const s=document.createElement('span'); s.className='chev'; s.textContent='›'; c.appendChild(s);} const b=document.createElement('button'); b.textContent=label; if(cur) b.setAttribute('aria-current','true'); b.onclick=fn; c.appendChild(b);};
  add('Slide '+(S.cur+1),()=>{endEdit(); S.scope=null; setSel([]);},!S.sel.length);
  const chain=[]; if(S.scope&&S.scope.isConnected){let e=S.scope; const top=new Set(topLevel()); while(e&&!top.has(e)){chain.unshift(e); e=e.parentElement;} if(e) chain.unshift(e);}
  chain.forEach(e=>{const d=describe(e); add(trunc(d[1],22),()=>{endEdit(); const p=e.parentElement; S.scope=topLevel().includes(e)?null:p; setSel([e]);});});
  if(S.sel.length===1){const d=describe(S.sel[0]); add(trunc(d[1],26),()=>{},true);} else if(S.sel.length>1) add(S.sel.length+' items',()=>{},true);}
const trunc=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
function fillFonts(){const sel=$('#tFont'); sel.replaceChildren(); const fams=S.fonts.concat(['system-ui','Georgia','ui-monospace']).filter((f,i,a)=>a.indexOf(f)===i);
  fams.forEach(f=>{const o=new Option(f==='system-ui'?'System sans':f==='ui-monospace'?'System mono':f, f); o.style.fontFamily=f; sel.add(o);});}
function syncGeom(){const el=S.sel[0]; if(!el||!el.isConnected) return; const multi=S.sel.length>1; const r=multi?union(S.sel.map(slideRect)):slideRect(el); const cs=getComputedStyle(el);
  setV('#gX',r0(r.x)); setV('#gY',r0(r.y)); setV('#gW',r0(r.w)); setV('#gH',r0(r.h)); setV('#gR',multi?'':r0(parseFloat(cs.rotate)||0)); setV('#gO',multi?'':Math.round(parseFloat(cs.opacity)*100));
  ['#gW','#gH','#gR','#gO'].forEach(s=>$(s).disabled=multi);}
function setV(s,v){const e=$(s); if(document.activeElement!==e) e.value=v;}
function setColor(id,val){const hex=toHex(val); setV('#'+id,hex||'#ffffff'); setV('#'+id+'Txt',hex||(val&&/rgba?\(.*,\s*0\)/.test(val)?'none':(val||'')));}
function syncInspector(){
  crumbs(); const sel=S.sel.filter(e=>e.isConnected); const one=sel.length===1?sel[0]:null; const none=!sel.length;
  $('#pSlide').hidden=!none; $('#pGeom').hidden=none; $('#pArr').hidden=none;
  const isSvg=one&&one.tagName.toLowerCase()==='svg', isImg=one&&one.tagName==='IMG';
  $('#pText').hidden=!(one&&!isSvg&&!isImg)&&!(sel.length>1); $('#pFill').hidden=!(one&&!isImg&&!isSvg)&&!(sel.length>1);
  $('#pImage').hidden=!isImg; if(isImg) syncImagePane(one);
  const isMedia=one&&isMediaEl(one); $('#pMedia').hidden=!isMedia; if(isMedia){ $('#pText').hidden=true; $('#pFill').hidden=true; }
  $('#pAlt').hidden=!one||(one&&one.tagName==='TABLE')||!!isMedia; $('#pBuild').hidden=!one; $('#pTable').hidden=!(one&&one.tagName==='TABLE');
  $('#alignLbl').textContent=sel.length>1?'Align to each other':'Align to slide'; $('#distRow').hidden=sel.length<3;
  if(none){syncSlidePane(); return;}
  syncGeom(); const el=sel[0]; const cs=getComputedStyle(el);
  const fam=(cs.fontFamily.split(',')[0]||'').replace(/["']/g,'').trim(); const fsel=$('#tFont'); if(![...fsel.options].some(o=>o.value===fam)&&fam){const o=new Option(fam,fam); fsel.add(o);} setV('#tFont',fam);
  setV('#tSize',r1(parseFloat(cs.fontSize))); setV('#tLH',/px$/.test(cs.lineHeight)?r1(parseFloat(cs.lineHeight)):'');
  const w=Math.round(parseInt(cs.fontWeight)/100)*100; setV('#tWeight',String(Math.min(700,Math.max(300,w))));
  $('#tB').setAttribute('aria-pressed',parseInt(cs.fontWeight)>=600); $('#tI').setAttribute('aria-pressed',cs.fontStyle==='italic'); $('#tU').setAttribute('aria-pressed',/underline/.test(cs.textDecorationLine));
  $$('[data-ta]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ta===cs.textAlign||(b.dataset.ta==='left'&&cs.textAlign==='start')));
  setColor('tColor',cs.color); setColor('fBg',cs.backgroundColor); setColor('fBC',cs.borderTopColor);
  setV('#fBW',r1(parseFloat(cs.borderTopWidth)||0)); setV('#fBS',['solid','dashed','dotted'].includes(cs.borderTopStyle)?cs.borderTopStyle:'none'); setV('#fR',r0(parseFloat(cs.borderTopLeftRadius)||0));
  const sh=el.style.boxShadow||''; setV('#fSh',[...$('#fSh').options].some(o=>o.value===sh)?sh:'');
  $('#textHint').textContent=S.editing?'Typing. Select words to style just those. Esc finishes.':'Double-click the text (or press Enter) to type. Select words while typing to bold or colour just those.';
  if(one&&isMedia) syncMediaPane(one);
  if(one) syncAltPane(one), syncBuildPane(one); if(one&&one.tagName==='TABLE') syncTablePane(one);
}
function syncSlidePane(){
  const sec=curSec(); if(!sec) return; renderClicks(); setV('#sTitle',sec.getAttribute('data-title')||''); setV('#sTrans',sec.getAttribute('data-transition')||''); setV('#sTransSpeed',sec.getAttribute('data-transition-speed')||''); const root=rootOf(sec); setColor('sBg',getComputedStyle(root).backgroundColor);
  const n=sec.querySelector(':scope > aside.notes'); setV('#sNotes',n?n.innerText.trim():''); setV('#dTitle',S.doc?S.doc.title:'');
  const ul=$('#sItems'); ul.replaceChildren();
  topLevel().forEach(it=>{const [k,t]=describe(it); const li=document.createElement('li'); const b=document.createElement('button'); b.type='button';
    b.innerHTML='<span class="ty"></span><span class="tx"></span>'; b.querySelector('.ty').textContent=k; b.querySelector('.tx').textContent=t;
    const a=altInfo(it)||(altWalk(it,null,[]).find(x=>x.kind==='missing')?{kind:'missing'}:null); if(a&&a.kind==='missing'){const f=document.createElement('span'); f.className='fl miss'; f.textContent='no alt'; b.appendChild(f);}
    if(isGhost(it)){const f=document.createElement('span'); f.className='fl'; f.textContent='hidden'; f.title='Invisible until it animates in'; b.appendChild(f);}
    b.onclick=()=>{S.scope=null; setSel([it]);}; b.onmouseenter=()=>{S.hover=it; drawOverlaySoon();}; b.onmouseleave=()=>{S.hover=null; drawOverlaySoon();};
    li.appendChild(b); ul.appendChild(li);});
}
function altCountUpdate(){const t=$('#aText').value.trim(); const c=$('#altCount'); if(!t||$('#aText').disabled){c.textContent=''; c.className='hint'; return;} const bad=PLACEHOLDER_ALT.test(t)||FILENAME_ALT.test(t);
  c.textContent=bad?'This reads like a placeholder or file name. Describe what the picture shows.':t.length>120?`${t.length} characters. Panorama scores alt text over 120 characters as a major problem. Keep the key point here; the checker can move the rest into a long description.`:`${t.length} of 120 characters.`; c.className='hint'+(bad||t.length>120?' warn':'');}
function syncAltPane(el){
  const info=altInfo(el); const tag=el.tagName.toLowerCase(); const graphic=tag==='img'||tag==='svg'||el.getAttribute('role')==='img';
  $('#altLbl').textContent=graphic?'Describe what this shows':'Accessible label (read instead of the content)';
  setV('#aText',info&&info.kind==='ok'?info.text:''); $('#aDeco').checked=!!(info&&info.kind==='deco');
  $('#aText').disabled=!!(info&&info.kind==='deco');
  const inner=!graphic&&!info?altWalk(el,null,[]):[]; const miss=inner.filter(a=>a.kind==='missing').length;
  const h=$('#altHint'); h.className='hint';
  if(info&&info.kind==='missing'){h.textContent='Screen readers can’t describe this yet. Write what a student needs to know from it, or mark it decorative.'; h.className='hint warn';}
  else if(miss){h.textContent=`${miss} picture${miss>1?'s':''} inside this item ${miss>1?'have':'has'} no alt text. Double-click into it to reach ${miss>1?'them':'it'}.`; h.className='hint warn';}
  else if(!graphic) h.textContent='Usually leave this empty for text. Use it for boxes that are really pictures.';
  else h.textContent='Saved as '+(tag==='img'?'the image’s alt attribute.':'an aria-label with role="img".');
  altCountUpdate();
}
function syncBuildPane(el){
  $('#bFrag').checked=el.classList.contains('fragment'); $('#bOrderWrap').hidden=!el.classList.contains('fragment'); setV('#bOrder',el.getAttribute('data-fragment-index')||'');
  syncFx(el); const sec=curSec(), L=layersOf(sec); const show=L.length>1&&!el.classList.contains('step-layer'); $('#bSync').hidden=!show; $('#syncHint').hidden=!show;
  if(show) $('#syncHint').textContent='Finds this item in the other build steps (as it was before your edits) and replaces it with this version.';
}
function setAlt(el,text){const tag=el.tagName.toLowerCase();
  if(tag==='img'){el.setAttribute('alt',text); el.removeAttribute('aria-hidden');}
  else if(text){el.setAttribute('aria-label',text); if(!el.getAttribute('role')&&!/^(button|a|input)$/.test(tag)) el.setAttribute('role','img'); el.removeAttribute('aria-hidden');}
  else {el.removeAttribute('aria-label');}}
function setDeco(el,on){const tag=el.tagName.toLowerCase();
  if(on){ if(tag==='img'){el.setAttribute('alt','');} else {el.setAttribute('aria-hidden','true'); el.removeAttribute('aria-label'); if(el.getAttribute('role')==='img') el.removeAttribute('role');} }
  else { if(tag==='img'){el.removeAttribute('alt');} else el.removeAttribute('aria-hidden'); }}

/* inspector bindings */
const selEls=()=>S.sel.filter(e=>e.isConnected);
function styleAll(prop,val){selEls().forEach(el=>{if(val===''||val==null) el.style.removeProperty(prop); else el.style.setProperty(prop,val);}); drawOverlaySoon();}
function bindNum(id,fn){const e=$(id); e.addEventListener('change',()=>{if(e.value==='') return; fn(+e.value); commit('Edit property'); drawOverlay(); syncInspector();}); e.addEventListener('keydown',ev=>{if(ev.key==='Enter') e.blur(); if(ev.key==='Escape'){syncInspector(); e.blur();}});}
bindNum('#gX',v=>{const els=selEls(); const u=union(els.map(slideRect)); els.forEach(el=>{const s=posStart(el); applyPos(s,s.left+(v-u.x),s.top);});});
bindNum('#gY',v=>{const els=selEls(); const u=union(els.map(slideRect)); els.forEach(el=>{const s=posStart(el); applyPos(s,s.left,s.top+(v-u.y));});});
bindNum('#gW',v=>{const el=selEls()[0]; const r=slideRect(el); const cw=parseFloat(getComputedStyle(el).width)||r.w; el.style.width=r1(Math.max(1,cw+(v-r.w)))+'px';});
bindNum('#gH',v=>{const el=selEls()[0]; const r=slideRect(el); const ch=parseFloat(getComputedStyle(el).height)||r.h; el.style.height=r1(Math.max(1,ch+(v-r.h)))+'px';});
bindNum('#gR',v=>{const el=selEls()[0]; el.style.rotate=v?v+'deg':'';});
bindNum('#gO',v=>{const el=selEls()[0]; v=Math.max(0,Math.min(100,v)); el.style.opacity=v>=100?'':String(v/100);});
bindNum('#tSize',v=>{if(S.editing&&restoreRange()){wrapSel('font-size',v+'px');return;} styleAll('font-size',v+'px');});
bindNum('#tLH',v=>styleAll('line-height',v+'px'));
bindNum('#fBW',v=>{selEls().forEach(el=>{el.style.borderWidth=v+'px'; if(v>0&&getComputedStyle(el).borderTopStyle==='none'){el.style.borderStyle='solid'; if(!el.style.borderColor) el.style.borderColor=S.accent;} if(!el.style.boxSizing) el.style.boxSizing='border-box';});});
bindNum('#fR',v=>styleAll('border-radius',v+'px'));
bindNum('#bOrder',v=>{selEls().forEach(el=>el.setAttribute('data-fragment-index',String(Math.max(0,Math.round(v)))));});
$('#tFont').onchange=e=>{const f=e.target.value; const gen=/mono/i.test(f)?'monospace':/serif|georgia/i.test(f)&&!/sans/i.test(f)?'serif':'sans-serif'; styleAll('font-family',f.includes(' ')?`'${f}', ${gen}`:`${f}, ${gen}`); commit('Font'); syncInspector();};
$('#tWeight').onchange=e=>{styleAll('font-weight',e.target.value); commit('Weight'); syncInspector();};
$('#fBS').onchange=e=>{selEls().forEach(el=>{el.style.borderStyle=e.target.value; if(e.target.value!=='none'&&!(parseFloat(getComputedStyle(el).borderTopWidth)>0)) el.style.borderWidth='2px';}); commit('Border'); syncInspector();};
$('#fSh').onchange=e=>{styleAll('box-shadow',e.target.value); commit('Shadow');};
$('#fNone').onclick=()=>{styleAll('background','transparent'); commit('Fill'); syncInspector();};
function wrapSel(prop,val){try{document.execCommand('styleWithCSS',false,true);}catch(_){}
  if(prop==='color'){document.execCommand('foreColor',false,val); return;}
  const s=getSelection(); if(!s.rangeCount) return; const r=s.getRangeAt(0); const sp=document.createElement('span'); sp.style.setProperty(prop,val); try{sp.appendChild(r.extractContents()); r.insertNode(sp); s.removeAllRanges(); const nr=document.createRange(); nr.selectNodeContents(sp); s.addRange(nr);}catch(_){}}
function bindColor(id,apply,label){const c=$('#'+id), t=$('#'+id+'Txt');
  c.addEventListener('input',()=>{apply(c.value,true); t.value=c.value;}); c.addEventListener('change',()=>{commit(label); syncInspector();});
  t.addEventListener('change',()=>{let v=t.value.trim(); if(/^[0-9a-f]{6}$/i.test(v)) v='#'+v; if(v==='none') v='transparent'; apply(v,false); commit(label); syncInspector();});
  t.addEventListener('keydown',ev=>{if(ev.key==='Enter') t.blur();});}
bindColor('tColor',(v,live)=>{if(S.editing&&savedRange&&!savedRange.collapsed){restoreRange(); document.execCommand('foreColor',false,v);} else styleAll('color',v);},'Text colour');
bindColor('fBg',v=>styleAll('background',v),'Fill');
bindColor('fBC',v=>{selEls().forEach(el=>{el.style.borderColor=v; if(getComputedStyle(el).borderTopStyle==='none'){el.style.borderStyle='solid'; el.style.borderWidth='2px'; if(!el.style.boxSizing) el.style.boxSizing='border-box';}});},'Border colour');
bindColor('sBg',v=>{rootOf(curSec()).style.background=v;},'Slide background');
function fmtToggle(cmd,prop,on,off){return ()=>{if(S.editing&&restoreRange()){document.execCommand(cmd); commit('Format'); syncInspector(); return;}
  const el=selEls()[0]; if(!el) return; const cs=getComputedStyle(el); const isOn=prop==='font-weight'?parseInt(cs.fontWeight)>=600:prop==='font-style'?cs.fontStyle==='italic':/underline/.test(cs.textDecorationLine);
  styleAll(prop,isOn?off:on); commit('Format'); syncInspector();};}
['#tB','#tI','#tU','[data-ta]','[data-z]','[data-align]','[data-scale]','[data-tscale]'].forEach(s=>$$(s).forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault())));
$('#tB').onclick=fmtToggle('bold','font-weight','600','400'); $('#tI').onclick=fmtToggle('italic','font-style','italic','normal'); $('#tU').onclick=fmtToggle('underline','text-decoration','underline','none');
$$('[data-ta]').forEach(b=>b.onclick=()=>{styleAll('text-align',b.dataset.ta); commit('Align text'); syncInspector();});
$$('[data-z]').forEach(b=>b.onclick=()=>zOrder(b.dataset.z));
$$('[data-align]').forEach(b=>b.onclick=()=>alignSel(b.dataset.align));
$$('[data-dist]').forEach(b=>b.onclick=()=>distribute(b.dataset.dist));
$$('[data-scale]').forEach(b=>b.onclick=()=>{endEdit(); selEls().forEach(el=>scaleContent(el,+b.dataset.scale)); commit('Scale'); drawOverlay(); syncInspector();});
$$('[data-tscale]').forEach(b=>b.onclick=()=>{endEdit(); selEls().forEach(el=>scaleContent(el,+b.dataset.tscale,PX_TEXT)); commit('Text size'); drawOverlay(); syncInspector();});
$('#aGroup').onclick=groupSel; $('#aUngroup').onclick=ungroupSel; $('#aDup').onclick=duplicateSel; $('#aDel').onclick=deleteSel; $('#aHTML').onclick=editHTML;
$('#aText').addEventListener('input',()=>{altCountUpdate(); const el=selEls()[0]; if(el){setAlt(el,$('#aText').value.trim()); if(S.showAlt) drawOverlaySoon();}});
$('#aText').addEventListener('change',()=>{commit('Alt text'); syncInspector(); updateAltStatusSoon();});
$('#aDeco').onchange=e=>{const el=selEls()[0]; if(!el) return; setDeco(el,e.target.checked); commit(e.target.checked?'Mark decorative':'Unmark decorative'); syncInspector(); drawOverlay(); updateAltStatusSoon();};
$('#bFrag').onchange=e=>{selEls().forEach(el=>el.classList.toggle('fragment',e.target.checked)); commit(e.target.checked?'Appear on click':'Always visible'); syncInspector();};
$('#bSync').onclick=()=>{
  const el=selEls()[0]; if(!el) return; const orig=origHTML.get(el); const sec=curSec(); const me=baseOf(sec);
  if(!orig||orig===el.outerHTML){toast('Nothing to copy yet. Edit this item first, then copy it to the other steps.');return;}
  const t=document.createElement('template'); t.innerHTML=orig; const o=t.content.firstElementChild; const oStyle=o?o.getAttribute('style'):null; let n=0;
  for(const L of layersOf(sec)){ if(L===me) continue; for(const c of L.getElementsByTagName(el.tagName)){ if(c.getAttribute('style')===oStyle&&c.outerHTML===orig){c.replaceWith(el.cloneNode(true)); n++; break;} } }
  if(n){commit('Copy to other steps'); origHTML.set(el,el.outerHTML); toast(`Updated ${n} other build step${n>1?'s':''}.`);} else toast('No matching copy of this item in the other steps.','warn');
};
$('#sTitle').addEventListener('change',e=>{curSec().setAttribute('data-title',e.target.value); commit('Slide title'); const b=$$('#slideList .thumb')[S.cur]; if(b){b.querySelector('.tt').textContent=e.target.value; b.setAttribute('aria-label',`Slide ${S.cur+1}: ${e.target.value}`);}});
$('#sNotes').addEventListener('change',e=>{const sec=curSec(); let n=sec.querySelector(':scope > aside.notes'); const v=e.target.value.trim();
  if(!v){if(n) n.remove();} else {if(!n){n=document.createElement('aside'); n.className='notes'; sec.appendChild(n);} n.replaceChildren(); v.split(/\n{2,}/).forEach(p=>{const pe=document.createElement('p'); pe.textContent=p; n.appendChild(pe);});}
  commit('Speaker notes');});
$('#dTitle').addEventListener('change',e=>{if(!S.doc) return; S.doc.title=e.target.value; S.dirty=true; updateFileName(); scheduleAutosave(); toast('Deck title updated.');});

/* ======================= modals, toasts ======================= */
function toast(msg,kind,action){const t=document.createElement('div'); t.className='toast'+(kind==='warn'?' warn':''); const sp=document.createElement('span'); sp.textContent=msg; t.appendChild(sp);
  if(action){const b=document.createElement('button'); b.textContent=action.label; b.onclick=()=>{action.fn(); t.remove();}; t.appendChild(b);}
  $('#toasts').appendChild(t); setTimeout(()=>t.remove(),action?9000:3800);}
function modal(title,body,buttons,opts){return new Promise(res=>{const bg=document.createElement('div'); bg.className='modal-bg'; const m=document.createElement('div'); m.className='modal'+(opts&&opts.wide?' wide':''); m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
  const h=document.createElement('h2'); h.textContent=title; m.appendChild(h); if(typeof body==='string'){const p=document.createElement('p'); p.style.margin='0'; p.textContent=body; m.appendChild(p);} else m.appendChild(body);
  const act=document.createElement('div'); act.className='actions'; const close=v=>{bg.remove(); document.removeEventListener('keydown',kd,true); res(v);};
  buttons.forEach(([lbl,val,cls])=>{const b=document.createElement('button'); b.className='btn'+(cls?' '+cls:''); b.textContent=lbl; b.onclick=()=>close(val); act.appendChild(b);});
  m.appendChild(act); bg.appendChild(m); bg.addEventListener('pointerdown',e=>{if(e.target===bg) close(null);});
  const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); close(null);}}; document.addEventListener('keydown',kd,true);
  document.body.appendChild(bg); const f=m.querySelector('textarea,input')||act.lastChild; f&&f.focus();});}
async function editHTML(){const el=selEls()[0]; if(!el) return; endEdit(); const html=el.outerHTML;
  if(html.length>800000){toast('This item is too large to edit as HTML here.','warn');return;}
  const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;gap:8px'; const ta=document.createElement('textarea'); ta.className='code'; ta.value=html; ta.spellcheck=false; ta.setAttribute('aria-label','HTML for the selected item');
  const p=document.createElement('p'); p.className='hint'; p.textContent='Changes replace the selected item. Undo brings it back.'; wrap.append(ta,p);
  const v=await modal('Edit HTML',wrap,[['Cancel',null],['Apply','ok','primary']]); if(v!=='ok'||ta.value===html) return;
  const t=document.createElement('template'); t.innerHTML=ta.value.trim(); const nodes=Array.from(t.content.childNodes); if(!nodes.length){toast('That HTML was empty, so nothing changed.','warn');return;}
  el.replaceWith(...nodes); commit('Edit HTML'); setSel(nodes.filter(n=>n.nodeType===1));}
async function findReplace(){endEdit(); const w=document.createElement('div'); w.style.cssText='display:flex;flex-direction:column;gap:10px';
  w.innerHTML='<label class="fld">Find<input type="text" id="frF"></label><label class="fld">Replace with<input type="text" id="frR"></label><label class="chk"><input type="checkbox" id="frC"><span>Match case</span></label><p class="hint" id="frN">Searches the words on every slide and build step.</p>';
  const count=()=>{const f=w.querySelector('#frF').value; if(!f){w.querySelector('#frN').textContent='Searches the words on every slide and build step.';return;} let n=0; textNodes().forEach(t=>{n+=countIn(t.data,f,w.querySelector('#frC').checked);}); w.querySelector('#frN').textContent=n+' match'+(n===1?'':'es')+' in the deck';};
  w.addEventListener('input',count);
  const v=await modal('Find and replace',w,[['Cancel',null],['Replace all','ok','primary']]); if(v!=='ok') return;
  const f=w.querySelector('#frF').value, r=w.querySelector('#frR').value, cs=w.querySelector('#frC').checked; if(!f) return; let n=0;
  const re=new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),cs?'g':'gi');
  textNodes().forEach(t=>{const nv=t.data.replace(re,()=>{n++; return r;}); if(nv!==t.data) t.data=nv;});
  for(const s of S.slides){const dt=s.getAttribute('data-title'); if(dt&&re.test(dt)){re.lastIndex=0; s.setAttribute('data-title',dt.replace(re,r));} re.lastIndex=0;}
  if(n){commit('Replace text'); renderSlideList(); showSlide(); toast(`Replaced ${n} match${n===1?'':'es'}.`);} else toast('No matches found.');}
function countIn(s,f,cs){if(!cs){s=s.toLowerCase(); f=f.toLowerCase();} let n=0,i=0; while((i=s.indexOf(f,i))>=0){n++; i+=f.length;} return n;}
function textNodes(){const out=[]; for(const s of S.slides){const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}); let n; while((n=w.nextNode())) if(n.data.trim()) out.push(n);} return out;}
function shortcuts(){const t=document.createElement('table'); const rows=[['Click / Shift-click','Select / add to selection'],['Drag on empty space','Select everything inside the box'],['Double-click','Type in text, open a group, or replace an image'],['Enter / Esc','Start typing / step back out'],['Arrows (Shift)','Nudge 1 px (10 px)'],['Alt + drag corner','Scale text and everything in the item'],['Shift + drag','Keep straight / keep proportions'],['Alt while dragging','Turn snapping off for that drag'],['Ctrl/Cmd + B, I, U','Bold, italic, underline (selected words while typing, or whole text boxes)'],['Ctrl/Cmd + Shift + X','Strikethrough'],['Ctrl/Cmd + Shift + > / <','Bigger / smaller text'],['Ctrl/Cmd + Shift + L, E, R','Align left, centre, right'],['Ctrl/Cmd + Shift + 7 / 8','Numbered / bulleted list (while typing)'],['Ctrl/Cmd + \\','Clear formatting (while typing)'],['Ctrl/Cmd + C, X, V','Copy, cut, paste (images too)'],['Ctrl/Cmd + D','Duplicate'],['Ctrl/Cmd + G / Shift+G','Group / ungroup'],['Ctrl/Cmd + ] / [','Forward / backward (Shift: front / back)'],['Ctrl/Cmd + Z / Shift+Z','Undo / redo'],['Ctrl/Cmd + F','Find and replace'],['Ctrl/Cmd + S / O','Save / open'],['A','Show or hide alt text'],['Page Up / Down','Previous / next slide'],['Ctrl/Cmd + scroll','Zoom'],['P','Preview clicks and animations (arrows step, Esc stops)'],['While presenting: D, M, R','Pen, marker, laser pointer (E clears, C changes colour, B blanks the screen)'],['Esc','Stop the style painter']];
  rows.forEach(([k,v])=>{const tr=t.insertRow(); tr.insertCell().innerHTML='<kbd></kbd>'; tr.cells[0].firstChild.textContent=k; tr.insertCell().textContent=v;}); modal('Keyboard shortcuts',t,[['Close',null]]);}

/* ======================= menus ======================= */
function menu(anchor,items){$$('.menu').forEach(m=>m.remove()); const m=document.createElement('div'); m.className='menu'; m.setAttribute('role','menu');
  items.forEach(([lbl,fn,key])=>{const b=document.createElement('button'); b.setAttribute('role','menuitem'); b.textContent=lbl; if(key){const k=document.createElement('kbd'); k.textContent=key; b.appendChild(k);} b.onclick=()=>{m.remove(); anchor.setAttribute('aria-expanded','false'); fn();}; m.appendChild(b);});
  const r=anchor.getBoundingClientRect(); m.style.left=Math.min(r.left,window.innerWidth-220)+'px'; m.style.top=(r.bottom+4)+'px'; m.style.position='fixed'; document.body.appendChild(m); anchor.setAttribute('aria-expanded','true'); m.firstChild.focus();
  setTimeout(()=>{const off=e=>{if(!m.contains(e.target)){m.remove(); anchor.setAttribute('aria-expanded','false'); document.removeEventListener('pointerdown',off,true);}}; document.addEventListener('pointerdown',off,true);},0);
  m.addEventListener('keydown',e=>{const bs=$$('button',m); const i=bs.indexOf(document.activeElement); if(e.key==='ArrowDown'){e.preventDefault(); bs[(i+1)%bs.length].focus();} if(e.key==='ArrowUp'){e.preventDefault(); bs[(i-1+bs.length)%bs.length].focus();} if(e.key==='Escape'){m.remove(); anchor.focus();}});}
$('#bShape').onclick=e=>menu(e.currentTarget,[['Rectangle',()=>insertShape('rect')],['Rounded box',()=>insertShape('round')],['Ellipse',()=>insertShape('ellipse')],['Label pill',()=>insertShape('label')],['Line',()=>insertShape('line')],['Arrow',()=>insertShape('arrow')]]);
$('#bMore').onclick=e=>{const anchor=e.currentTarget; if(gdriveUsable()) gLoad().catch(()=>{}); menu(anchor,[['New blank deck',newDeck],['Save a copy to this computer…',()=>saveLocal(true),'Ctrl ⇧ S'],['Save a copy to Google Drive…',()=>saveToDrive(true)],[S.gh?'Commit to GitHub…':'Save a copy to GitHub…',()=>S.gh?commitToGitHub():saveToGitHub()],...(S.gh?[['Version history…',showHistory]]:[]),...(S.gdrive?[['Google Drive versions…',driveHistory]]:[]),['Compare with saved version',compareWithSaved],['Compare with another deck…',compareWithFile],['Compress pictures',compressImages],['Export PDF…',exportPDF],['Export handout with notes…',exportHandout],['Check accessibility…',runAudit],['Find and replace…',findReplace,'Ctrl F'],...(ghTok()?[['Sign out of GitHub',signOutGitHub]]:[]),...(gTok?[['Sign out of Google Drive',signOutGoogle]]:[]),['Keyboard shortcuts',shortcuts,'?']]);};
$('#bText').onclick=()=>insertText();
$('#bImage').onclick=()=>pickImage(async fs=>{for(const f of fs) await insertImageFile(f);});
$('#bAlt').onclick=()=>toggleAlt();
$('#bUndo').onclick=undo; $('#bRedo').onclick=redo;
function openMenu(anchor){ if(gdriveUsable()) gLoad().catch(()=>{});
  menu(anchor,[['From this computer…',openFile,'Ctrl O'],['PowerPoint file (.pptx)…',openFile],...(window.showDirectoryPicker&&canFS()?[['From a folder…',openFolder],['Recent…',()=>openRecentMenu(anchor)]]:[]),['From Google Drive…',openFromDrive],['From GitHub…',openFromGitHub],['New from a template…',newFromTemplate],['New blank deck',newDeck]]); }
/* Save goes straight back when the deck is connected to a place it can write; otherwise it asks where. */
const saveConnected=()=>!!(S.gh||S.gdrive||S.web||(S.handle&&S.handle.createWritable));
function saveMenu(anchor){ if(gdriveUsable()) gLoad().catch(()=>{});
  menu(anchor,[['To this computer…',()=>saveLocal(false)],['To Google Drive…',()=>saveToDrive(true)],['To GitHub…',saveToGitHub]]); }
$('#bOpen').setAttribute('aria-haspopup','menu'); $('#bOpen').setAttribute('aria-expanded','false');
$('#bOpen').onclick=e=>openMenu(e.currentTarget); $('#bSave').onclick=e=>saveConnected()?save(false):saveMenu(e.currentTarget);
$('#bPresent').onclick=e=>menu(e.currentTarget,[['Present here, full screen',present],['Presenter view + audience window',presenterView]]); $('#bKeys').onclick=shortcuts;
$('#snapChk').onchange=e=>{S.snap=e.target.checked;};

/* ======================= keyboard ======================= */
/* Text formatting shortcuts, the same while typing and on selected text boxes (Google Slides' keys). */
function textShortcut(e){
  const mod=e.metaKey||e.ctrlKey; if(!mod||e.altKey) return false; const c=e.code, sh=e.shiftKey, ed=!!S.editing;
  if(!ed&&(!S.sel.length||isField(e.target)||(e.target.closest&&e.target.closest('.menu')))) return false;
  const click=q=>{const b=$(q); if(b){b.click(); return true;} return false;};
  const exec=cmd=>{ if(!ed) return false; restoreRange(); try{document.execCommand('styleWithCSS',false,true);}catch(_){} document.execCommand(cmd); commit('Format'); syncInspector(); return true; };
  let done=false;
  if(!sh&&c==='KeyB') done=click('#tB'); else if(!sh&&c==='KeyI') done=click('#tI'); else if(!sh&&c==='KeyU') done=click('#tU');
  else if(sh&&c==='KeyX'){ if(ed) done=exec('strikeThrough'); else { const el=selEls()[0]; const on=/line-through/.test(getComputedStyle(el).textDecorationLine); styleAll('text-decoration',on?'none':'line-through'); commit('Format'); syncInspector(); done=true; } }
  else if(sh&&c==='Period') done=click('[data-tscale="1.1"]'); else if(sh&&c==='Comma') done=click('[data-tscale="0.9"]');
  else if(sh&&c==='KeyL') done=click('[data-ta="left"]'); else if(sh&&c==='KeyE') done=click('[data-ta="center"]'); else if(sh&&c==='KeyR') done=click('[data-ta="right"]');
  else if(sh&&c==='Digit7') done=exec('insertOrderedList'); else if(sh&&c==='Digit8') done=exec('insertUnorderedList');
  else if(!sh&&c==='Backslash') done=exec('removeFormat');
  if(done){ e.preventDefault(); e.stopPropagation(); } return done;
}
document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey, k=e.key, kl=k.toLowerCase();
  if($('.modal-bg')||$('.pop')||$('#sorter')||$('#presenter')||e.target.closest&&e.target.closest('.de-svgedit')) return;
  if(PV.on){const k=e.key; if(e.metaKey||e.ctrlKey) return; if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(k)){e.preventDefault(); pvStep(1);} else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(k)){e.preventDefault(); pvStep(-1);} else if(k==='Escape'||k.toLowerCase()==='p'){e.preventDefault(); stopPreview();} return;}
  if(S.painter&&e.key==='Escape'){stopPainter(); return;}
  if(mod&&kl==='s'){e.preventDefault(); if(e.shiftKey||saveConnected()) save(e.shiftKey); else saveMenu($('#bSave')); return;}
  if(mod&&kl==='o'){e.preventDefault(); openFile(); return;}
  if(textShortcut(e)) return;
  if(S.editing&&S.editing.tagName==='TABLE'&&k==='Tab'){ e.preventDefault(); tableTab(e.shiftKey); return; }
  if(S.editing){ if(k==='Escape'){e.preventDefault(); const el=S.editing; endEdit(); setSel([el]);} else if(mod&&(kl==='z'||kl==='y')){} return; }
  if(isField(e.target)||(e.target.closest&&e.target.closest('.menu'))) return;
  if(mod&&kl==='z'){e.preventDefault(); e.shiftKey?redo():undo(); return;}
  if(mod&&kl==='y'){e.preventDefault(); redo(); return;}
  if(mod&&kl==='d'){e.preventDefault(); duplicateSel(); return;}
  if(mod&&kl==='g'){e.preventDefault(); e.shiftKey?ungroupSel():groupSel(); return;}
  if(mod&&kl==='a'){e.preventDefault(); setSel(topItems().filter(x=>!isGhost(x))); return;}
  if(mod&&kl==='f'){e.preventDefault(); findReplace(); return;}
  if(mod&&(k===']'||k==='}')){e.preventDefault(); zOrder(e.shiftKey?'front':'forward'); return;}
  if(mod&&(k==='['||k==='{')){e.preventDefault(); zOrder(e.shiftKey?'back':'backward'); return;}
  if(mod) return;
  if(k==='Delete'||k==='Backspace'){if(S.sel.length){e.preventDefault(); deleteSel();} return;}
  if(k==='Escape'){if(S.scope){const sc=S.scope; S.scope=topLevel().includes(sc)?null:sc.parentElement; setSel([sc]);} else setSel([]); return;}
  if(k==='Enter'&&S.sel.length===1){e.preventDefault(); const el=S.sel[0]; if(el.tagName==='PRE'){editCode(el); return;} if(hasBlockKids(el)){S.scope=el; setSel([kidsOf(el)[0]]);} else if(el.tagName==='IMG') replaceImage(el); else if(el.tagName.toLowerCase()!=='svg') startEdit(el); return;}
  if(k.startsWith('Arrow')){ if(S.sel.length){e.preventDefault(); const d=e.shiftKey?10:1; nudge(k==='ArrowLeft'?-d:k==='ArrowRight'?d:0,k==='ArrowUp'?-d:k==='ArrowDown'?d:0);} else if(e.target===document.body||e.target===stageScroll||e.target.closest('#slideList')){e.preventDefault(); go(S.cur+((k==='ArrowRight'||k==='ArrowDown')?1:-1));} return;}
  if(k==='PageDown'){e.preventDefault(); go(S.cur+1); return;} if(k==='PageUp'){e.preventDefault(); go(S.cur-1); return;}
  if(k==='Tab'&&(S.sel.length||e.target===stageScroll)){const it=topItems().filter(x=>!isGhost(x)); if(!it.length) return; e.preventDefault(); const i=it.indexOf(S.sel[0]); setSel([it[(i+(e.shiftKey?-1:1)+it.length)%it.length]]); return;}
  if(kl==='a'&&!e.altKey){toggleAlt(); return;}
  if(kl==='p'&&!e.altKey){startPreview(); return;}
  if(k==='?'){shortcuts(); return;}
});
