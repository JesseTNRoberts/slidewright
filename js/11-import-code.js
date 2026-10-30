/* Slidewright: import code. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= templates ======================= */
async function newFromTemplate(){
  let list; try{ const r=await fetch('templates/index.json',{cache:'no-cache'}); if(!r.ok) throw 0; list=await r.json(); }catch(_){ toast('Templates are available on the Slidewright site (www.jessetnroberts.com/slidewright).','warn'); return; }
  if(!(await confirmDiscard())) return;
  let pick=list[0]; if(list.length>1){ const sel=el('select',{},...list.map((t,i)=>new Option(t.name,String(i)))); const d=el('p',{class:'hint',text:list[0].description}); sel.onchange=()=>{ d.textContent=list[+sel.value].description; };
    const v=await modal('New from a template',el('div',{class:'stack'},sel,d),[['Cancel',null],['Use it','ok','primary']]); if(v!=='ok') return; pick=list[+sel.value]; }
  const prog=progressCard('Opening the template'); prog.set(0.4,pick.name); let text; try{ const r=await fetch('templates/'+pick.file,{cache:'no-cache'}); if(!r.ok) throw new Error(r.status); text=await r.text(); }catch(e){ prog.close(); toast('Couldn’t load that template. Check your connection.','warn'); return; } prog.close();
  if(loadHTML(text,'new-lecture.html',null)){ S.dirty=true; updateFileName(); toast('New deck from the '+pick.name+' template. Replace the placeholders, delete the slides you don’t need, and Save to choose where it goes.'); }
}


/* ======================= PowerPoint import ======================= */
const isPptx=f=>!!f&&(/\.pptx$/i.test(f.name||'')||f.type==='application/vnd.openxmlformats-officedocument.presentationml.presentation'||/\.ppt$/i.test(f.name||''));
async function importPptx(file){
  if(/\.ppt$/i.test(file.name)){ modal('Old PowerPoint format','Slidewright reads .pptx files. Open this .ppt in PowerPoint, Keynote or LibreOffice and save it as .pptx (PowerPoint Presentation), then open that.',[['OK',null,'primary']]); return; }
  const prog=progressCard('Converting '+file.name); prog.set(0.05,'Loading the converter');
  try{
    await loadScript(['vendor/jszip-3.10.1/jszip.min.js','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'],()=>window.JSZip);
    await loadScript(['pptx/pptx2reveal.js','https://www.jessetnroberts.com/slidewright/pptx/pptx2reveal.js'],()=>window.PptxToReveal);
    const assets=await revealAssets(); prog.set(0.1,'Reading slides');
    const {html,report}=await PptxToReveal.convert(await file.arrayBuffer(),{JSZip:window.JSZip,DOMParser,revealCss:assets&&assets.css,revealJs:assets&&assets.js,name:file.name,onProgress:(i,n)=>prog.set(0.1+0.85*i/n,`Slide ${i} of ${n}`)});
    prog.close(); const name=file.name.replace(/\.pptx$/i,'.html');
    if(!loadHTML(html,name,null)) return; S.dirty=true; updateFileName();
    const list=report.warnings.length?el('ul',{},...report.warnings.map(w=>el('li',{text:w}))):null;
    modal('PowerPoint opened',el('div',{class:'stack'},el('p',{text:`${report.slides} slide${report.slides===1?'':'s'} converted${report.mediaMB>1?`, with ${report.mediaMB} MB of pictures and media inside`:''}. Fonts PowerPoint has but this browser doesn’t are replaced by close matches.`}),
      list?el('p',{class:'hint',text:'Not converted exactly:'}):null,list,el('p',{class:'hint',text:'Save keeps it as a Slidewright deck (.html); your PowerPoint file isn’t changed. Run Check to find pictures that need alt text.'})),[['OK',null,'primary']]);
  }catch(e){ prog.close(); toast('Couldn’t open '+file.name+': '+(/central directory|zip/i.test(String(e&&e.message))?'the file looks damaged or isn’t a PowerPoint file.':(e&&e.message||e)),'warn'); }
}

/* ======================= code slides ======================= */
const CODE_THEMES={
  dark:{bg:'#16181D',fg:'#E8EAF0',kw:'#9DB6F2',str:'#F7CDB0',num:'#F2B25A',com:'#959BA8',fn:'#7FD9A6',dec:'#C9A2F2',ln:'#7E8595',hl:'rgba(137,163,255,0.20)',bar:'#89A3FF'},
  light:{bg:'#F4F5F7',fg:'#16181D',kw:'#1B3F9E',str:'#8A3A0A',num:'#8A4F00',com:'#5F6672',fn:'#16613C',dec:'#6B2FA3',ln:'#6B7180',hl:'rgba(37,87,214,0.13)',bar:'#2557D6'}};
const CODE_LANGS={
  python:{name:'Python',kw:'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self',bi:'print len range enumerate zip map filter sum min max abs int float str list dict set tuple bool type isinstance super open sorted reversed any all',com:/#.*/,str:/[rbfuRBFU]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/,dec:/@[A-Za-z_][\w.]*/},
  javascript:{name:'JavaScript',kw:'break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof undefined var void while with yield async await of from',bi:'console Math JSON Object Array Promise Number String',com:/\/\/.*|\/\*[\s\S]*?\*\//,str:/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/},
  bash:{name:'Shell',kw:'if then else elif fi for while do done case esac function in return export local',bi:'echo cd ls cat grep sed awk pip python git sudo mkdir rm cp mv source conda',com:/#.*/,str:/"(?:\\.|[^"\\])*"|'[^']*'/},
  json:{name:'JSON',kw:'true false null',com:null,str:/"(?:\\.|[^"\\\n])*"/},
  plain:{name:'Plain text'}};
const escH=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function highlightCode(src,lang,th){
  const L=CODE_LANGS[lang]||CODE_LANGS.plain; if(lang==='plain'||!L.kw) return escH(src);
  const kw=new Set(L.kw.split(' ')), bi=new Set((L.bi||'').split(' ').filter(Boolean)); const no='(?!)';
  const re=new RegExp(`(${L.com?L.com.source:no})|(${L.str?L.str.source:no})|(${L.dec?L.dec.source:no})|(\\b(?:0[xob][\\da-fA-F_]+|\\d[\\d_]*\\.?[\\d_]*(?:[eE][+-]?\\d+)?j?)\\b)|([A-Za-z_][\\w]*)`,'g');
  let out='', last=0, m; const span=(c,t)=>`<span style="color: ${c}">${escH(t)}</span>`;
  while((m=re.exec(src))){ if(m[0]===''){re.lastIndex++; continue;} out+=escH(src.slice(last,m.index)); const t=m[0];
    if(m[1]) out+=span(th.com,t)+'';
    else if(m[2]) out+=span(th.str,t); else if(m[3]) out+=span(th.dec,t); else if(m[4]) out+=span(th.num,t);
    else { const next=src.slice(re.lastIndex).match(/^\s*\(/); out+= kw.has(t)?`<span style="color: ${th.kw}; font-weight: 600">${escH(t)}</span>`: (next||bi.has(t))?span(th.fn,t):escH(t); }
    last=re.lastIndex; }
  return out+escH(src.slice(last));
}
function parseSteps(s,n){ return String(s||'').split(',').map(x=>x.trim()).filter(Boolean).map(g=>{const m=g.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/); if(!m) return null; let a=+m[1], b=m[2]?+m[2]:a; if(a>b)[a,b]=[b,a]; a=Math.max(1,a); b=Math.min(n,b); return a<=b?[a,b]:null;}).filter(Boolean); }
function codeSource(pre){ const c=pre.querySelector('code')||pre; const x=c.cloneNode(true); x.querySelectorAll('.sw-ln,.sw-codehl').forEach(n=>n.remove()); return x.textContent.replace(/\n$/,''); }
function monoFamily(){ const st=(S.styles||[]).find(o=>/mono/i.test(o.props['font-family']||'')); return st?st.props['font-family']:"'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace"; }
function buildCode(pre,o){
  const th=CODE_THEMES[o.theme]||CODE_THEMES.dark; const lines=o.src.split('\n').length; const fs=o.size, lh=Math.round(fs*1.55); const padT=Math.round(fs*1.1), padX=Math.round(fs*1.3); const lnW=o.ln?Math.round(fs*0.62*String(lines).length+fs*0.9):0;
  pre.classList.add('sw-code'); pre.setAttribute('data-lang',o.lang); pre.setAttribute('data-theme',o.theme); if(o.ln) pre.setAttribute('data-ln','1'); else pre.removeAttribute('data-ln');
  if(o.steps) pre.setAttribute('data-steps',o.steps); else pre.removeAttribute('data-steps'); pre.setAttribute('aria-label',(CODE_LANGS[o.lang]||CODE_LANGS.plain).name+' code');
  const st=pre.style; if(!st.position) st.position='absolute'; st.boxSizing='border-box'; st.margin='0'; st.padding=`${padT}px ${padX}px ${padT}px ${padX+lnW}px`; st.background=th.bg; st.color=th.fg; if(!st.borderRadius) st.borderRadius='10px';
  st.fontFamily=monoFamily(); st.fontSize=fs+'px'; st.lineHeight=lh+'px'; st.whiteSpace='pre'; st.overflow='hidden'; st.tabSize='4'; st.textAlign='left'; st.removeProperty('height');
  let html='';
  parseSteps(o.steps,lines).forEach(([a,b],i)=>{ html+=`<div class="sw-codehl fragment current-visible" data-fragment-index="${i}" aria-hidden="true" style="position: absolute; left: 0; right: 0; top: ${padT+(a-1)*lh}px; height: ${(b-a+1)*lh}px; background: ${th.hl}; box-shadow: inset 4px 0 0 ${th.bar}; pointer-events: none"></div>`; });
  if(o.ln) html+=`<div class="sw-ln" aria-hidden="true" style="position: absolute; left: 0; top: ${padT}px; width: ${lnW+Math.round(padX*0.4)}px; text-align: right; color: ${th.ln}; user-select: none; -webkit-user-select: none">${Array.from({length:lines},(_,i)=>i+1).join('\n')}</div>`;
  html+=`<code style="position: relative; display: block; font: inherit; background: none; padding: 0; color: inherit; white-space: inherit">${highlightCode(o.src,o.lang,th)}</code>`;
  pre.innerHTML=html; return pre;
}
async function editCode(target,opt){
  opt=opt||{}; endEdit();
  const cur=target?{src:codeSource(target),lang:target.getAttribute('data-lang')||'python',theme:target.getAttribute('data-theme')||(lum((prgb(getComputedStyle(target).backgroundColor)||{c:[22,24,29]}).c)>0.5?'light':'dark'),ln:target.hasAttribute('data-ln'),steps:target.getAttribute('data-steps')||'',size:Math.round(parseFloat(getComputedStyle(target).fontSize))||18}
    :{src:'import torch\nimport torch.nn as nn\n\nconv = nn.Conv2d(in_channels=3, out_channels=32, kernel_size=3)\nx = torch.randn(1, 3, 32, 32)   # one CIFAR-10 image\ny = conv(x)\nprint(y.shape)                  # torch.Size([1, 32, 30, 30])',lang:'python',theme:'dark',ln:true,steps:'',size:18};
  const ta=el('textarea',{class:'code',spellcheck:'false','aria-label':'Code'}); ta.value=cur.src; ta.style.minHeight='200px';
  ta.addEventListener('keydown',e=>{ if(e.key==='Tab'){ e.preventDefault(); const s=ta.selectionStart, en=ta.selectionEnd; if(e.shiftKey){ const ls=ta.value.lastIndexOf('\n',s-1)+1; if(ta.value.slice(ls,ls+4)==='    '){ ta.setRangeText('',ls,ls+4,'preserve'); } } else ta.setRangeText('    ',s,en,'end'); upd(); } });
  const lang=el('select',{'aria-label':'Language'},...Object.entries(CODE_LANGS).map(([k,v])=>{const o=el('option',{value:k,text:v.name}); if(k===cur.lang) o.selected=true; return o;}));
  const theme=el('select',{'aria-label':'Colours'},el('option',{value:'dark',text:'Dark'}),el('option',{value:'light',text:'Light'})); theme.value=cur.theme;
  const size=el('input',{type:'number',min:'10',max:'40',step:'1',value:String(cur.size),'aria-label':'Font size'}); const ln=el('input',{type:'checkbox'}); ln.checked=cur.ln;
  const steps=el('input',{type:'text',placeholder:'e.g. 1-2, 4, 6-7',value:cur.steps});
  const prevBox=el('div',{class:'code-prev'}); const stepNav=el('div',{class:'chips'}); let showStep=-1;
  const vals=()=>({src:ta.value.replace(/\t/g,'    ').replace(/\s+$/,''),lang:lang.value,theme:theme.value,ln:ln.checked,steps:steps.value.trim(),size:Math.max(10,Math.min(40,+size.value||18))});
  function upd(){ const v=vals(); const pre=document.createElement('pre'); buildCode(pre,v); pre.style.position='relative'; prevBox.replaceChildren(pre);
    const groups=parseSteps(v.steps,v.src.split('\n').length); pre.querySelectorAll('.sw-codehl').forEach((h,i)=>h.style.display=(i===showStep)?'block':'none');
    stepNav.replaceChildren(el('span',{class:'hint',text:groups.length?'Preview click:':'Lines to highlight, one group per click (optional).'}),...(groups.length?[-1,...groups.map((_,i)=>i)].map(i=>el('button',{type:'button',class:'btn','aria-pressed':String(i===showStep),text:i<0?'Before':`${i+1}: ${groups[i][0]}${groups[i][1]!==groups[i][0]?'–'+groups[i][1]:''}`,onclick:()=>{showStep=i; upd();}})):[])); }
  [ta,lang,theme,size,ln,steps].forEach(x=>x.addEventListener('input',upd)); [lang,theme,ln].forEach(x=>x.addEventListener('change',upd));
  const body=el('div',{class:'stack'},ta,el('div',{class:'grid4'},el('label',{class:'fld'},'Language',lang),el('label',{class:'fld'},'Colours',theme),el('label',{class:'fld'},'Size (px)',size),el('label',{class:'chk',style:'align-self:end;padding-bottom:6px'},ln,el('span',{text:'Line numbers'}))),
    el('label',{class:'fld'},'Highlight lines on each click',steps),stepNav,prevBox,el('p',{class:'hint',text:'Tab indents, Shift+Tab outdents. Highlighted groups appear one per click when presenting.'}));
  upd();
  const v=await modal(target?'Edit code':'Insert code',body,[['Cancel',null],[target?'Update':'Insert','ok','primary']],{wide:true}); if(v!=='ok') return;
  const o=vals(); if(!o.src.trim()) return;
  if(target){ buildCode(target,o); commit('Edit code'); drawOverlay(); syncInspector(); return; }
  const pre=document.createElement('pre'); pre.style.cssText='position: absolute; width: 760px'; buildCode(pre,o);
  const c=opt.slidePt?{x:opt.slidePt.x+380,y:opt.slidePt.y+120}:viewCenter(); placeIn(pre,insertTarget(),c.x,c.y,760,240); commit('Add code'); setSel([pre]);
}
