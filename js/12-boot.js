/* Slidewright: boot. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= boot ======================= */
S.sample=true; loadHTML(sampleDeck(),'sample-deck.html',null); S.sample=false;
if(location.hash!=='#present') checkRecovery();
/* ======================= "Present with Slidewright" (a deck's own button sends itself here) ======================= */
function parseSource(html){ const m=html.slice(0,200000).match(/<meta[^>]+name=["']slidewright-source["'][^>]*>/i); if(!m) return null; const c=(m[0].match(/content=["']([^"']*)["']/i)||[])[1]||'';
  const g=c.match(/^github:([\w.-]+)\/([\w.-]+)@([^:]+):(.+)$/); return g?{owner:g[1],repo:g[2],branch:g[3],path:g[4]}:null; }
async function gitBlobSha(text){ try{ const b=new TextEncoder().encode(text); const head=new TextEncoder().encode('blob '+b.length+'\0'); const all=new Uint8Array(head.length+b.length); all.set(head); all.set(b,head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',all))].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(_){ return null; } }

/* A deck opened from a web page (its own Present button) with no slidewright-source: find its file in the
   GitHub Pages sites the signed-in user can reach. Only a file identical to the deck that was sent counts. */
const normURL=x=>String(x||'').replace(/^https?:\/\/(www\.)?/i,'').replace(/[?#].*$/,'');
async function findOnGitHub(url,sha){
  const target=normURL(url), u=new URL(url), segs=u.pathname.split('/').filter(Boolean);
  const under=base=>{ const b=base.replace(/\/?$/,'/'); return target.startsWith(b)||target===base.replace(/\/$/,''); };
  async function tryRepo(o,r,info){ const base=normURL(info.html_url||''); if(!base||!under(base)) return null;
    let rel=target.slice(base.replace(/\/?$/,'/').length); if(!rel||rel.endsWith('/')) rel+='index.html'; try{ rel=decodeURIComponent(rel); }catch(_){}
    let branch=info.branch, dir=(info.dir||'/').replace(/^\/|\/$/g,'');
    if(!branch){ try{ branch=(await gh(`/repos/${o}/${r}`)).default_branch; }catch(_){ return null; } }
    for(const p of [...new Set([(dir?dir+'/':'')+rel,rel])]){ let s=null; try{ s=await ghFileSha(o+'/'+r,p,branch); }catch(_){}
      if(s&&s===sha) return {owner:o,repo:r,branch,path:p,sha:s,base}; }
    return null; }
  let cache={}; try{ cache=JSON.parse(localStorage.getItem('slidewright.pagesMap')||'{}'); }catch(_){}
  const remember=(base,o,r,branch,dir)=>{ cache[base]={o,r,branch,dir}; try{ localStorage.setItem('slidewright.pagesMap',JSON.stringify(cache)); }catch(_){} };
  for(const base of Object.keys(cache).sort((a,b)=>b.length-a.length)) if(under(base)){ const c=cache[base]; const hit=await tryRepo(c.o,c.r,{html_url:'https://'+base,branch:c.branch,dir:c.dir}); if(hit) return hit; }
  const cands=new Map(), add=(o,r)=>{ if(o&&r) cands.set((o+'/'+r).toLowerCase(),[o,r]); };
  let me=null; try{ me=(await gh('/user')).login; }catch(_){}
  const io=u.hostname.match(/^([\w-]+)\.github\.io$/i);
  [io&&io[1],me].filter(Boolean).forEach(o=>{ if(segs.length>1) add(o,segs[0]); add(o,o+'.github.io'); });
  try{ for(let p=1;p<=5;p++){ const l=await gh(`/user/repos?per_page=100&page=${p}&sort=pushed`); l.filter(x=>x.has_pages).forEach(x=>add(x.owner.login,x.name)); if(l.length<100) break; } }catch(_){}
  const sites=(await Promise.all([...cands.values()].map(async([o,r])=>{ try{ const pg=await gh(`/repos/${o}/${r}/pages`); return {o,r,pg}; }catch(_){ return null; } }))).filter(Boolean)
    .filter(x=>x.pg.html_url&&under(normURL(x.pg.html_url))).sort((a,b)=>normURL(b.pg.html_url).length-normURL(a.pg.html_url).length);
  for(const x of sites){ const src=x.pg.source||{}; const hit=await tryRepo(x.o,x.r,{html_url:x.pg.html_url,branch:src.branch,dir:src.path}); if(hit){ remember(hit.base,x.o,x.r,src.branch||hit.branch,src.path||'/'); return hit; } }
  return null;
}
async function resolveWebDeck(quiet){
  const w=S.web; if(!w) return false; const hit=await findOnGitHub(w.url,w.sha).catch(()=>null); if(S.web!==w) return false;
  if(!hit){ if(!quiet) S.web=null; return false; }
  S.web=null; S.gh={owner:hit.owner,repo:hit.repo,branch:hit.branch,path:hit.path,sha:hit.sha,fromDeck:true}; updateFileName();
  if(quiet) toast(`Found this deck in ${hit.owner}/${hit.repo}. Save commits your changes there.`); return true; }
async function saveWebDeck(){
  const w=S.web; const where=normURL(w.url);
  if(!ghTok()){ const v=await modal('Save this deck',`This deck came from ${where}. If it’s in a GitHub repository you can edit, sign in with GitHub and Slidewright will find its file and save your changes there. Otherwise, keep your own copy.`,[['Cancel',null],['Download a copy','dl'],...(gdriveConfigured()?[['Save to Google Drive','drive']]:[]),['Sign in with GitHub','ok','primary']]);
    if(v==='dl') return saveLocal(true); if(v==='drive') return saveToDrive(true); if(v!=='ok') return; if(!(await ensureToken())) return; }
  const prog=progressCard('Finding this deck on GitHub'); prog.set(0.4,where); let ok=false; try{ ok=await resolveWebDeck(false); }finally{ prog.close(); }
  if(ok) return commitToGitHub();
  const v=await modal('Couldn’t find this deck on GitHub',`Slidewright looked for an identical copy of ${where} in the GitHub Pages sites your account can reach and didn’t find one. It may live in a repository you can’t edit, or have changed since this copy was published. Choose where to save instead.`,[['Cancel',null],['Download a copy','dl'],...(gdriveConfigured()?[['Save to Google Drive','drive']]:[]),['Save to my GitHub…','gh','primary']]);
  if(v==='dl') return saveLocal(true); if(v==='drive') return saveToDrive(true); if(v==='gh') return saveToGitHub(); }
async function receiveDeck(d,origin){
  const name=String(d.name||'lecture.html').replace(/[\\/:*?"<>|]+/g,'').slice(0,120)||'lecture.html';
  if(!loadHTML(String(d.html),name,null)) return;
  const src=parseSource(String(d.html)); if(src){ S.gh=Object.assign(src,{sha:d.exact?await gitBlobSha(String(d.html)):null,fromDeck:true}); updateFileName(); }
  else if(d.exact&&/^https:\/\//i.test(String(d.url||''))){ const sha=await gitBlobSha(String(d.html)); if(sha){ S.web={url:String(d.url),sha}; if(ghTok()) resolveWebDeck(true); } }
  const vis=S.slides.map((s,i)=>i).filter(i=>S.slides[i].getAttribute('data-visibility')!=='hidden'); const at=vis[Math.max(0,Math.min(vis.length-1,+(d.slide||0)))]; if(at>0) go(at);
  const from=/^https?:/.test(origin)?origin.replace(/^https?:\/\//,''):'a file on this computer';
  const v=await modal('Present '+(S.doc&&S.doc.title||name),el('div',{class:'stack'},el('p',{text:'Presenter view shows your notes, the next slide and a timer on this screen, and opens the slides in a second window for the projector. Drag that window to the projector and press F there for full screen.'}),
    el('p',{class:'hint',text:`Sent from ${from}. Starts at slide ${(vis.indexOf(S.cur)+1)||1}.${src?` You can edit it here too; saving goes back to ${src.owner}/${src.repo} if you can edit that repository.`:S.web?' You can edit it here too. If it’s in a GitHub repository you can edit, Save finds it and commits there.':' You can edit it here too and save your own copy.'}`})),
    [['Just edit','edit'],['Full screen here','full'],['Presenter view','pv','primary']]);
  if(v==='pv') presenterView(); else if(v==='full') present();
}
if(location.hash==='#present'&&window.opener){
  let got=false; const ready=()=>{ if(got) return; try{ window.opener.postMessage({type:'slidewright-ready'},'*'); }catch(_){} };
  window.addEventListener('message',e=>{ const d=e.data; if(got||e.source!==window.opener||!d||d.type!=='slidewright-deck'||typeof d.html!=='string') return; got=true;
    history.replaceState(null,'',location.pathname+location.search); receiveDeck(d,e.origin||'null'); });
  ready(); const iv=setInterval(()=>{ if(got){clearInterval(iv); return;} ready(); },400); setTimeout(()=>clearInterval(iv),20000);
}

window.__deckEditor={importPptx,newFromTemplate,collectLayouts,layoutSection,stdLayouts,setSlides,buildCode,makeTable,slideTitle,cropImage,compressImages,imgOriginal,ytId,buildEmbed,syncMediaPane,insertTable,tableOp,findOnGitHub,receiveDeck,parseSource,gitBlobSha,gdrive:{openFromDrive,saveToDrive,driveHistory,signOutGoogle,state:()=>S.gdrive},PV,startPreview,stopPreview,pvStep,runAudit,editMath,pickLayout,layoutSection,openSorter,compareDecks,exportPDF,exportHandout,slideCanvas,detectStyles,moveClick,refreshStepSnap,makeMath,loadKatex,S,loadHTML,serialize,undo,redo,commit,go,setSel,topItems,altTargetsCurrent,updateAltStatus,insertText,startEdit,endEdit,scaleContent,setLayer};
