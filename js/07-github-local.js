/* Slidewright: github local. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= 10. GitHub, history, compare ======================= */
const GH='https://api.github.com';
const ghTok=()=>{try{return localStorage.getItem('slidewright.ghToken')||S.ghTokenMem||'';}catch(_){return S.ghTokenMem||'';}};
async function gh(path,opts){
  opts=opts||{}; const tok=ghTok(); const h={'Accept':opts.accept||'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}; if(tok) h.Authorization='Bearer '+tok; if(opts.body) h['Content-Type']='application/json';
  let r; try{r=await fetch(path.startsWith('http')?path:GH+path,{method:opts.method||'GET',headers:h,body:opts.body?JSON.stringify(opts.body):undefined,cache:'no-store'});}
  catch(e){throw new Error('This copy of Slidewright can’t reach GitHub. Use it from https://www.jessetnroberts.com/slidewright/ instead.');}
  if(r.status===401){ if(tok) forgetToken(); throw Object.assign(new Error('Your GitHub sign-in has expired or was revoked. Sign in again.'),{status:401}); }
  if(!r.ok){let msg=''; try{msg=(await r.json()).message;}catch(_){} throw Object.assign(new Error(`GitHub said: ${msg||r.statusText} (${r.status})`),{status:r.status});}
  return opts.raw?r.text():r.json();
}
function utf8b64(str){const b=new TextEncoder().encode(str); let s=''; for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(s);}
async function tokenPrompt(){
  if(ghTok()) return true;
  const inp=el('input',{type:'password',autocomplete:'off',placeholder:'github_pat_…'}); const keep=el('input',{type:'checkbox',checked:''});
  const w=el('div',{class:'stack'},el('p',{style:'margin:0'},'Slidewright talks to GitHub with a personal access token. Create a fine-grained token at ',el('a',{href:'https://github.com/settings/personal-access-tokens/new',target:'_blank',rel:'noopener',text:'github.com/settings/personal-access-tokens/new'}),' with access to the repositories that hold your decks and the permission “Contents: Read and write”.'),
    el('label',{class:'fld'},'Token',inp),el('label',{class:'chk'},keep,el('span',{text:'Remember on this device (stored in this browser only)'})));
  const v=await modal('Connect to GitHub',w,[['Cancel',null],['Connect','ok','primary']]); if(v!=='ok'||!inp.value.trim()) return false;
  S.ghTokenMem=inp.value.trim(); if(keep.checked){try{localStorage.setItem('slidewright.ghToken',S.ghTokenMem);}catch(_){}}
  try{const me=await gh('/user'); S.ghUser=me.login; toast('Connected to GitHub as '+me.login+'.'); return true;}catch(e){forgetToken(); toast(e.message,'warn'); return false;}
}
function forgetToken(){S.ghTokenMem=''; try{localStorage.removeItem('slidewright.ghToken');}catch(_){} }
async function ghPicker(mode){
  if(!(await ensureToken())) return null;
  let repos; try{repos=await gh('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member');}catch(e){toast(e.message,'warn'); return null;}
  const repoSel=el('select',{},...repos.map(r=>new Option(r.full_name,r.full_name))); const branchSel=el('select'); const filter=el('input',{type:'text',placeholder:'Filter files'}); const files=el('div',{class:'gh-files'});
  const pathInp=el('input',{type:'text',value:S.gh?S.gh.path:S.name}); let resolve; const res=new Promise(r=>resolve=r); let tree=[];
  if(S.gh){repoSel.value=S.gh.owner+'/'+S.gh.repo;}
  const loadBranches=async()=>{const r=repos.find(x=>x.full_name===repoSel.value); branchSel.replaceChildren(); try{const bs=await gh(`/repos/${r.full_name}/branches?per_page=100`); bs.forEach(b=>branchSel.add(new Option(b.name,b.name))); branchSel.value=(S.gh&&S.gh.owner+'/'+S.gh.repo===r.full_name)?S.gh.branch:r.default_branch;}catch(e){branchSel.add(new Option(r.default_branch,r.default_branch));} await loadTree();};
  const loadTree=async()=>{files.replaceChildren(el('p',{class:'hint',text:'Loading files…'})); try{const t=await gh(`/repos/${repoSel.value}/git/trees/${encodeURIComponent(branchSel.value)}?recursive=1`); tree=t.tree.filter(x=>x.type==='blob'&&/\.html?$/i.test(x.path)&&!/node_modules\//.test(x.path)); drawFiles();}catch(e){tree=[]; files.replaceChildren(el('p',{class:'hint',text:e.status===409?'This repository is empty.':e.message}));}};
  const drawFiles=()=>{files.replaceChildren(); const q=filter.value.toLowerCase(); const list=tree.filter(x=>x.path.toLowerCase().includes(q)); if(!list.length){files.appendChild(el('p',{class:'hint',text:'No HTML files here.'})); return;}
    list.slice(0,300).forEach(x=>files.appendChild(el('button',{class:'gh-file',type:'button',onclick:()=>{ if(mode==='open') resolve({repo:repoSel.value,branch:branchSel.value,path:x.path,sha:x.sha}); else pathInp.value=x.path; }},el('span',{text:x.path}),el('span',{class:'hint',text:x.size>1e6?(x.size/1e6).toFixed(1)+' MB':Math.round(x.size/1e3)+' KB'}))));};
  repoSel.onchange=loadBranches; branchSel.onchange=loadTree; filter.oninput=drawFiles;
  const msg=el('textarea',{rows:'2'}); msg.value=`Update ${S.name} with Slidewright`;
  const body=el('div',{class:'stack'},el('div',{class:'grid2'},el('label',{class:'fld'},'Repository',repoSel),el('label',{class:'fld'},'Branch',branchSel)),
    mode==='open'?el('div',{class:'stack'},filter,files):el('div',{class:'stack'},el('label',{class:'fld'},'Save as (path in the repository)',pathInp),el('div',{class:'hint',text:'Existing decks (click to overwrite):'}),files,el('label',{class:'fld'},'Commit message',msg)),
    el('p',{class:'hint'},'Signed in'+(S.ghUser?' as '+S.ghUser:'')+'. ',el('button',{class:'linkbtn',type:'button',text:'Sign out',onclick:()=>{resolve(null); signOutGitHub();}})));
  const bg=el('div',{class:'modal-bg'}); const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},el('h2',{text:mode==='open'?'Open from GitHub':'Save to GitHub'}),body,
    el('div',{class:'actions'},el('button',{class:'btn',text:'Cancel',onclick:()=>resolve(null)}),mode==='open'?null:el('button',{class:'btn primary',text:'Commit',onclick:()=>resolve({repo:repoSel.value,branch:branchSel.value,path:pathInp.value.trim().replace(/^\/+/,''),message:msg.value.trim()})})));
  bg.appendChild(m); document.body.appendChild(bg); const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); resolve(null);}}; document.addEventListener('keydown',kd,true);
  loadBranches(); const out=await res; bg.remove(); document.removeEventListener('keydown',kd,true); return out;
}
async function ghBlobText(repo,sha){return gh(`/repos/${repo}/git/blobs/${sha}`,{accept:'application/vnd.github.raw+json',raw:true});}
async function openFromGitHub(){ if(!(await confirmDiscard())) return; const pick=await ghPicker('open'); if(!pick) return;
  const prog=progressCard('Opening from GitHub'); prog.set(0.3,pick.path); try{const text=await ghBlobText(pick.repo,pick.sha); prog.set(0.8);
    const name=pick.path.split('/').pop(); if(loadHTML(text,name,null)){const [owner,repo]=pick.repo.split('/'); S.gh={owner,repo,branch:pick.branch,path:pick.path,sha:pick.sha}; updateFileName(); toast(`Opened ${pick.repo}: ${pick.path}. Save commits back to ${pick.branch}.`);}
  }catch(e){toast(e.message,'warn');} finally{prog.close();} }
async function ghFileSha(repo,path,branch){try{const m=await gh(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`); return m.sha;}catch(e){if(e.status===404) return null; throw e;}}
async function ghPut(repo,branch,path,html,message,sha){return gh(`/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',body:Object.assign({message,content:utf8b64(html),branch},sha?{sha}:{})});}
async function commitToGitHub(){
  if(!S.gh) return saveToGitHub();
  if(S.gh.fromDeck&&!ghTok()){ const v=await modal('Save this deck',`This deck lives in ${S.gh.owner}/${S.gh.repo} on GitHub. If you can edit that repository, sign in with GitHub and Save commits your changes there. Otherwise, keep your own copy.`,[['Cancel',null],['Download a copy','dl'],...(gdriveConfigured()?[['Save to Google Drive','drive']]:[]),['Sign in with GitHub','ok','primary']]);
    if(v==='dl') return saveLocal(true); if(v==='drive') return saveToDrive(true); if(v!=='ok') return; }
  if(!(await ensureToken())) return;
  const msg=el('textarea',{rows:'3'}); msg.value=`Update ${S.gh.path.split('/').pop()} with Slidewright`;
  const v=await modal('Commit to GitHub',el('div',{class:'stack'},el('p',{class:'hint',text:`${S.gh.owner}/${S.gh.repo} · ${S.gh.branch} · ${S.gh.path}`}),el('label',{class:'fld'},'What changed?',msg)),[['Cancel',null],['Download instead','dl'],['Commit','ok','primary']]);
  if(v==='dl') return saveLocal(true); if(v!=='ok') return;
  endEdit(); commit(); const html=serialize(); const repo=S.gh.owner+'/'+S.gh.repo; const prog=progressCard('Committing to GitHub'); prog.set(0.4,'Uploading '+(html.length/1e6).toFixed(1)+' MB');
  try{ if(!S.gh.sha) S.gh.sha=await ghFileSha(repo,S.gh.path,S.gh.branch); const r=await ghPut(repo,S.gh.branch,S.gh.path,html,msg.value.trim()||'Update deck',S.gh.sha); S.gh.sha=r.content.sha; S.gh.fromDeck=false; markSaved(`Committed to ${repo} (${r.commit.sha.slice(0,7)}).`); }
  catch(e){ if(e.status===409||e.status===422){ prog.close(); const c=await modal('The file changed on GitHub','Someone (or another tab) committed to this file after you opened it. Overwriting replaces their version with yours; it stays in the file’s history.',[['Cancel',null],['Download mine instead','dl'],['Overwrite','ok','primary']]);
      if(c==='dl') return saveLocal(true); if(c==='ok'){try{const sha=await ghFileSha(repo,S.gh.path,S.gh.branch); const r=await ghPut(repo,S.gh.branch,S.gh.path,html,msg.value.trim()||'Update deck',sha); S.gh.sha=r.content.sha; markSaved(`Committed to ${repo} (${r.commit.sha.slice(0,7)}).`);}catch(e2){toast(e2.message,'warn');}} return; }
    if(e.status===401){ prog.close(); const c=await modal('Sign in to GitHub again','GitHub no longer accepts this browser’s sign-in (it expired or was revoked), so Slidewright forgot it. Sign in again and Slidewright will commit your changes.',[['Cancel',null],['Download a copy','dl'],['Sign in with GitHub','ok','primary']]);
      if(c==='dl') return saveLocal(true); if(c==='ok'&&(await ensureToken())) return commitToGitHub(); return; }
    if(e.status===403||e.status===404){ prog.close(); const c=await modal('You can’t save to this repository',`Your GitHub account can’t write to ${repo}, so your changes can’t go back to the original. Keep your own copy instead.`,[['Cancel',null],['Download a copy','dl'],...(gdriveConfigured()?[['Save to Google Drive','drive']]:[]),['Save to my GitHub…','gh','primary']]);
      if(c==='dl') return saveLocal(true); if(c==='drive') return saveToDrive(true); if(c==='gh'){ S.gh=null; updateFileName(); return saveToGitHub(); } return; }
    toast(e.message,'warn'); } finally{prog.close();}
}
async function saveToGitHub(){ const pick=await ghPicker('save'); if(!pick||!pick.path) return; endEdit(); commit(); const html=serialize(); const prog=progressCard('Committing to GitHub'); prog.set(0.4,'Uploading');
  try{const sha=await ghFileSha(pick.repo,pick.path,pick.branch); const r=await ghPut(pick.repo,pick.branch,pick.path,html,pick.message||'Add deck',sha); const [owner,repo]=pick.repo.split('/'); S.gh={owner,repo,branch:pick.branch,path:pick.path,sha:r.content.sha}; S.name=pick.path.split('/').pop(); markSaved(`Committed to ${pick.repo} (${r.commit.sha.slice(0,7)}).`);}
  catch(e){toast(e.message,'warn');} finally{prog.close();} }
const rel=d=>{const s=(Date.now()-new Date(d))/1000; if(s<3600) return Math.max(1,Math.round(s/60))+' min ago'; if(s<86400) return Math.round(s/3600)+' h ago'; if(s<86400*45) return Math.round(s/86400)+' days ago'; return new Date(d).toLocaleDateString();};
async function showHistory(){
  if(!S.gh){toast('History works for decks opened from GitHub. Use “Open from GitHub…” first.');return;} if(!(await ensureToken())) return;
  const repo=S.gh.owner+'/'+S.gh.repo; let commits; try{commits=await gh(`/repos/${repo}/commits?path=${encodeURIComponent(S.gh.path)}&sha=${encodeURIComponent(S.gh.branch)}&per_page=40`);}catch(e){toast(e.message,'warn');return;}
  const list=el('div',{class:'hist'}); let resolve; const done=new Promise(r=>resolve=r);
  commits.forEach(c=>{const msg=c.commit.message.split('\n')[0]; list.appendChild(el('div',{class:'hist-row'},el('div',{class:'hm'},el('b',{text:msg}),el('span',{class:'hint',text:`${c.commit.author.name} · ${rel(c.commit.author.date)} · ${c.sha.slice(0,7)}`})),
    el('button',{class:'btn',text:'Compare',onclick:()=>resolve({c,act:'cmp'})}),el('button',{class:'btn',text:'Open',onclick:()=>resolve({c,act:'open'})})));});
  const bg=el('div',{class:'modal-bg'}); const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},el('h2',{text:'History of '+S.gh.path.split('/').pop()}),el('p',{class:'hint',text:'Compare shows what’s different between that version and the deck as it is now. Open loads that version; saving it commits it as the newest version.'}),list,el('div',{class:'actions'},el('button',{class:'btn',text:'Close',onclick:()=>resolve(null)})));
  bg.appendChild(m); document.body.appendChild(bg); const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); resolve(null);}}; document.addEventListener('keydown',kd,true);
  const pick=await done; bg.remove(); document.removeEventListener('keydown',kd,true); if(!pick) return;
  const prog=progressCard('Fetching that version'); let text; try{const meta=await gh(`/repos/${repo}/contents/${S.gh.path.split('/').map(encodeURIComponent).join('/')}?ref=${pick.c.sha}`); text=await ghBlobText(repo,meta.sha);}catch(e){prog.close(); toast(e.message,'warn'); return;} prog.close();
  const when=new Date(pick.c.commit.author.date).toLocaleDateString();
  if(pick.act==='cmp') compareDecks(text,`version from ${when} (${pick.c.sha.slice(0,7)})`);
  else { if(!(await confirmDiscard())) return; const keep=Object.assign({},S.gh); const latestSha=S.gh.sha; if(loadHTML(text,S.gh.path.split('/').pop(),null)){S.gh=Object.assign(keep,{sha:latestSha}); S.dirty=true; updateFileName(); toast(`Opened the ${when} version. Save to make it the newest version on GitHub.`);} }
}
function normText(s){return (s||'').replace(/\s+/g,' ').trim();}
function lcsPairs(a,b,eq){const n=a.length,m=b.length; const dp=Array.from({length:n+1},()=>new Uint16Array(m+1)); for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]=eq(a[i],b[j])?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[]; let i=0,j=0; while(i<n&&j<m){ if(eq(a[i],b[j])){out.push([i,j]); i++; j++;} else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++; } return out;}
function wordDiff(a,b){const A=a.split(' '),B=b.split(' '); if(A.length*B.length>4e6) return null; const pairs=lcsPairs(A,B,(x,y)=>x===y); const out=el('div',{class:'wdiff'}); let i=0,j=0;
  const segs=[]; const add=(k,w)=>{if(!w.length) return; const l=segs[segs.length-1]; if(l&&l.k===k) l.w.push(...w); else segs.push({k,w:w.slice()});};
  for(const [pi,pj] of pairs){ add('del',A.slice(i,pi)); add('ins',B.slice(j,pj)); add('same',[A[pi]]); i=pi+1; j=pj+1; } add('del',A.slice(i)); add('ins',B.slice(j));
  segs.forEach((g,n)=>{ if(g.k!=='same'){out.append(el(g.k,{text:g.w.join(' ')+' '})); return;} let w=g.w; if(w.length>12){const first=n===0, last=n===segs.length-1; w=first?['…',...w.slice(-5)]:last?[...w.slice(0,5),'…']:[...w.slice(0,5),'…',...w.slice(-5)];} out.append(document.createTextNode(w.join(' ')+' ')); });
  return out;}
function compareDecks(otherHTML,label){
  const od=new DOMParser().parseFromString(otherHTML,'text/html'); let os=$$('.reveal .slides > section',od); if(!os.length) os=$$('section',od).filter(s=>!(s.parentElement&&s.parentElement.closest('section')));
  if(!os.length){toast('That file has no slides to compare.','warn');return;}
  os=os.map(s=>document.importNode(s,true)); const ns=S.slides;
  const key=s=>(s.getAttribute('data-title')||normText(s.textContent).slice(0,60));
  const pairs=lcsPairs(os,ns,(a,b)=>key(a)===key(b)); const mo2=new Map(pairs.map(([i,j])=>[j,i])); const matchedOld=new Set(pairs.map(p=>p[0]));
  const asSaved=s=>ns.includes(s)?savedClone(s):s; const strip=s=>asSaved(s).outerHTML.replace(/\s+/g,' ');
  const rows=[]; let ch=0,ad=0,rm=0,same=0; let oi=0;
  ns.forEach((s,j)=>{ if(mo2.has(j)){const i=mo2.get(j); for(;oi<i;oi++) if(!matchedOld.has(oi)){rows.push({kind:'removed',old:os[oi],oi,after:j-1}); rm++;} oi=i+1;
      if(strip(os[i])===strip(s)){rows.push({kind:'same',old:os[i],cur:s,j}); same++;} else {rows.push({kind:'changed',old:os[i],cur:s,j}); ch++;}}
    else {rows.push({kind:'added',cur:s,j}); ad++;} });
  for(;oi<os.length;oi++) if(!matchedOld.has(oi)){rows.push({kind:'removed',old:os[oi],oi,after:ns.length-1}); rm++;}
  const bg=el('div',{class:'modal-bg'}); const showSame=el('input',{type:'checkbox'}); const list=el('div',{class:'cmp-list'});
  const close=()=>{bg.remove(); document.removeEventListener('keydown',kd,true);}; const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); close();}}; document.addEventListener('keydown',kd,true);
  const draw=()=>{list.replaceChildren(); rows.forEach(r=>{ if(r.kind==='same'&&!showSame.checked) return; const s=r.cur||r.old; const idx=r.cur?r.j:r.oi;
    const head=el('div',{class:'cmp-h'},el('span',{class:'chip '+r.kind,text:{same:'Same',changed:'Changed',added:'New',removed:'Removed'}[r.kind]}),el('b',{text:`${r.cur?'Slide '+(r.j+1):'Was slide '+(r.oi+1)} · ${slideTitle(s,idx)}`}),el('span',{class:'spacer'}));
    if(r.cur) head.appendChild(el('button',{class:'btn',text:'Go to slide',onclick:()=>{close(); go(S.slides.indexOf(r.cur));}}));
    if(r.kind==='removed') head.appendChild(el('button',{class:'btn primary',text:'Restore here',onclick:()=>{const at=Math.min(S.slides.length,Math.max(0,r.after+1)); const sec=r.old.cloneNode(true); slidesOp('Restore slide',()=>{S.slides.splice(at,0,sec); S.cur=at;}); r.kind='same'; r.cur=sec; r.j=at; draw(); toast('Restored the slide.');}}));
    const body=el('div',{class:'cmp-b'});
    if(r.old&&r.kind!=='same') body.appendChild(el('div',{class:'cmp-t'},el('span',{class:'hint',text:'Before'}),el('span',{class:'tf'},makeThumbHost(r.old,{width:260}))));
    if(r.cur) body.appendChild(el('div',{class:'cmp-t'},el('span',{class:'hint',text:r.kind==='same'?'':'Now'}),el('span',{class:'tf'},makeThumbHost(r.cur,{width:260}))));
    if(r.kind==='changed'){const a=normText(r.old.textContent), b=normText(savedClone(r.cur).textContent); if(a!==b){const d=wordDiff(a,b); body.appendChild(d||el('p',{class:'hint',text:'The words changed a lot.'}));} else body.appendChild(el('p',{class:'hint',text:'Same words; the layout, styling or pictures changed.'}));}
    list.appendChild(el('div',{class:'cmp-row '+r.kind},head,body)); }); };
  showSame.onchange=draw;
  const m=el('div',{class:'modal wide xl',role:'dialog','aria-modal':'true'},el('h2',{text:'Compare with '+label}),
    el('div',{class:'chips'},el('span',{class:'chip changed',text:ch+' changed'}),el('span',{class:'chip added',text:ad+' new'}),el('span',{class:'chip removed',text:rm+' removed'}),el('span',{class:'chip',text:same+' unchanged'}),el('label',{class:'chip plain'},showSame,' Show unchanged')),
    list,el('div',{class:'actions'},el('button',{class:'btn primary',text:'Close',onclick:close})));
  bg.appendChild(m); bg.addEventListener('pointerdown',e=>{if(e.target===bg) close();}); document.body.appendChild(bg); draw();
  if(!ch&&!ad&&!rm) toast('No differences found.');
}
async function compareWithFile(){ endEdit(); commit();
  if(canFS()&&window.showOpenFilePicker){try{const [h]=await window.showOpenFilePicker({types:[{description:'HTML slide deck',accept:{'text/html':['.html','.htm']}}]}); const f=await h.getFile(); compareDecks(await f.text(),f.name); return;}catch(e){if(e&&e.name==='AbortError') return;}}
  const inp=el('input',{type:'file',accept:'.html,.htm,text/html'}); inp.onchange=async()=>{const f=inp.files[0]; if(f) compareDecks(await f.text(),f.name);}; inp.click(); }
async function compareWithSaved(){ endEdit(); commit();
  if(S.handle&&S.handle.getFile){try{const f=await S.handle.getFile(); compareDecks(await f.text(),'the saved file');}catch(e){toast('Couldn’t read the saved file.','warn');} return;}
  if(S.gh){try{const sha=await ghFileSha(S.gh.owner+'/'+S.gh.repo,S.gh.path,S.gh.branch); compareDecks(await ghBlobText(S.gh.owner+'/'+S.gh.repo,sha),'the latest version on GitHub');}catch(e){toast(e.message,'warn');} return;}
  compareWithFile(); }

/* ======================= GitHub sign-in (OAuth via relay) ======================= */
const AUTH_RELAY=((document.querySelector('meta[name="slidewright-auth-relay"]')||{}).content||'').trim().replace(/\/+$/,'');
const canSignIn=()=>!!AUTH_RELAY&&(location.protocol==='https:'||/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
function randNonce(){const a=new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function signInWithGitHub(){ return new Promise(resolve=>{
  const nonce=randNonce(); const ret=new URL('auth.html',location.href).href;
  let w=null; try{w=window.open(`${AUTH_RELAY}/login?return=${encodeURIComponent(ret)}&nonce=${nonce}`,'slidewright-signin','popup,width=720,height=780');}catch(_){}
  if(!w){toast('The sign-in window was blocked. Allow pop-ups for this site, then try again.','warn'); resolve(false); return;}
  let done=false, bc=null; const card=progressCard('Signing in to GitHub'); card.set(0.5,'Approve Slidewright in the window that opened.');
  const cleanup=()=>{clearInterval(iv); clearTimeout(to); card.close(); try{bc&&bc.close();}catch(_){} window.removeEventListener('message',onMsg); window.removeEventListener('storage',onSt);};
  const finish=d=>{ if(done||!d||d.nonce!==nonce) return; done=true; cleanup();
    if(d.error||!d.token){toast('GitHub sign-in didn’t work: '+(d.error||'no token'),'warn'); resolve(false); return;}
    S.ghTokenMem=d.token; try{localStorage.setItem('slidewright.ghToken',d.token);}catch(_){}
    gh('/user').then(me=>{S.ghUser=me.login; toast('Signed in to GitHub as '+me.login+'.'); resolve(true);}).catch(e=>{forgetToken(); toast(e.message,'warn'); resolve(false);}); };
  try{bc=new BroadcastChannel('slidewright-auth'); bc.onmessage=e=>finish(e.data);}catch(_){}
  const onMsg=e=>{if(e.origin===location.origin&&e.data&&e.data.source==='slidewright-auth') finish(e.data);};
  const onSt=e=>{if(e.key==='slidewright.authResult'&&e.newValue){try{finish(JSON.parse(e.newValue));}catch(_){}}};
  window.addEventListener('message',onMsg); window.addEventListener('storage',onSt);
  const iv=setInterval(()=>{ if(card.cancelled&&!done){done=true; cleanup(); resolve(false);} },250);
  const to=setTimeout(()=>{ if(!done){done=true; cleanup(); toast('GitHub sign-in timed out. Try again.','warn'); resolve(false);} },5*60000);
});}
async function signOutGitHub(){forgetToken(); S.ghUser=null; toast('Signed out of GitHub in this browser. To remove Slidewright’s access completely, revoke it at github.com/settings/applications.');}

/* ======================= local folders & recent files ======================= */
const canDir=()=>{try{return 'showDirectoryPicker' in window&&window.top===window;}catch(_){return false;}};
async function addRecent(handle,path,dirHasGit){ if(!handle) return; try{ let list=(await idb('get','recents'))||[]; const keep=[];
    for(const r of list){ try{ if(r.handle&&await r.handle.isSameEntry(handle)) continue; }catch(_){} keep.push(r); }
    keep.unshift({name:handle.name,path:path||handle.name,handle,git:!!dirHasGit,time:Date.now()}); await idb('put','recents',keep.slice(0,10)); }catch(_){} }
async function openHandle(h,path,git){
  try{ if(h.queryPermission&&(await h.queryPermission({mode:'readwrite'}))!=='granted'){ const p=await h.requestPermission({mode:'readwrite'}); if(p!=='granted'&&(await h.queryPermission({mode:'read'}))!=='granted'){toast('Slidewright needs permission to open that file.','warn'); return;} } }catch(_){}
  let f; try{f=await h.getFile();}catch(e){toast('That file couldn’t be opened. It may have been moved or deleted.','warn'); return;}
  const text=await f.text(); toast('Opening '+f.name+'…');
  setTimeout(()=>{ if(loadHTML(text,f.name,h)){ S.localPath=path||f.name; S.localGit=!!git; updateFileName(); addRecent(h,path,git); toast(`Opened ${path||f.name}: ${S.slides.length} slides.`);} },30);
}
async function walkDecks(dir,prefix,depth,out){ if(depth>5||out.length>500) return; for await (const [name,h] of dir.entries()){ if(name.startsWith('.')||name==='node_modules') continue;
    if(h.kind==='directory') await walkDecks(h,prefix+name+'/',depth+1,out); else if(/\.html?$/i.test(name)) out.push({path:prefix+name,handle:h}); } }
async function openFolder(){
  if(!canDir()){toast('Opening a folder needs Chrome or Edge, using Slidewright from its own tab.','warn'); return;}
  if(!(await confirmDiscard())) return;
  let dir; try{dir=await window.showDirectoryPicker({id:'slidewright-decks',mode:'readwrite'});}catch(e){return;}
  let git=false; try{await dir.getDirectoryHandle('.git'); git=true;}catch(_){}
  const prog=progressCard('Looking for decks'); const decks=[]; try{await walkDecks(dir,'',0,decks);}finally{prog.close();}
  if(!decks.length){toast('No .html files in that folder.','warn'); return;}
  decks.sort((a,b)=>a.path.localeCompare(b.path));
  const filter=el('input',{type:'text',placeholder:'Filter'}); const list=el('div',{class:'gh-files'}); let resolve; const done=new Promise(r=>resolve=r);
  const draw=()=>{list.replaceChildren(); const q=filter.value.toLowerCase(); decks.filter(d=>d.path.toLowerCase().includes(q)).slice(0,400).forEach(d=>list.appendChild(el('button',{class:'gh-file',type:'button',onclick:()=>resolve(d)},el('span',{text:d.path}))));};
  filter.oninput=draw; draw();
  const bg=el('div',{class:'modal-bg'}); const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},el('h2',{text:`Decks in ${dir.name}`}),
    el('p',{class:'hint',text:git?'This folder is a git repository. Save writes the file here; commit it with GitHub Desktop or git as usual.':'Save writes straight back to the file you pick.'}),filter,list,el('div',{class:'actions'},el('button',{class:'btn',text:'Cancel',onclick:()=>resolve(null)})));
  bg.appendChild(m); document.body.appendChild(bg); const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); resolve(null);}}; document.addEventListener('keydown',kd,true); filter.focus();
  const pick=await done; bg.remove(); document.removeEventListener('keydown',kd,true); if(!pick) return;
  openHandle(pick.handle,dir.name+'/'+pick.path,git);
}
async function recentItems(){ const list=(await idb('get','recents'))||[]; return list.filter(r=>r.handle).slice(0,8); }
async function openRecentMenu(anchor){
  if(!canFS()){toast('Recent files need Chrome or Edge, using Slidewright from its own tab.','warn'); return;}
  const list=await recentItems(); if(!list.length){toast('No recent decks yet. Open one from a file or folder first.'); return;}
  menu(anchor,list.map(r=>[r.path.length>48?'…'+r.path.slice(-47):r.path,async()=>{ if(!(await confirmDiscard())) return; openHandle(r.handle,r.path,r.git); }]).concat([['Clear this list',async()=>{await idb('delete','recents'); toast('Cleared recent decks.');}]]));
}

async function ensureToken(){
  if(ghTok()) return true;
  if(canSignIn()){
    const body=el('div',{class:'stack'},el('p',{style:'margin:0',text:'Slidewright opens GitHub in a small window. Approve it once and this browser stays signed in until you sign out.'}),el('p',{class:'hint',text:'It can then open, commit to and show the history of decks in your repositories.'}));
    const v=await modal('Connect to GitHub',body,[['Cancel',null],['Use a token instead','token'],['Sign in with GitHub','signin','primary']]);
    if(v==='signin') return signInWithGitHub(); if(v!=='token') return false; }
  return tokenPrompt();
}
