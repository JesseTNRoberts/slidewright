/* Slidewright: gdrive. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= Google Drive (open, save, history) ======================= */
const gmeta=n=>((document.querySelector(`meta[name="${n}"]`)||{}).content||'').trim();
const GCFG={clientId:gmeta('slidewright-google-client-id'),apiKey:gmeta('slidewright-google-api-key'),appId:gmeta('slidewright-google-app-id')};
const GSCOPE='https://www.googleapis.com/auth/drive.file';
const gdriveConfigured=()=>!!(GCFG.clientId&&GCFG.apiKey);
const gdriveUsable=()=>gdriveConfigured()&&(location.protocol==='https:'||/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
let gTok=null, gTokExp=0, gTokenClient=null, gLibs=null;
function gLoad(){ if(!gLibs) gLibs=(async()=>{
  await loadScript('https://accounts.google.com/gsi/client',()=>window.google&&google.accounts&&google.accounts.oauth2);
  await loadScript('https://apis.google.com/js/api.js',()=>window.gapi&&gapi.load);
  await new Promise((ok,bad)=>gapi.load('picker',{callback:ok,onerror:()=>bad(new Error('Google Picker failed to load')),timeout:15000,ontimeout:()=>bad(new Error('Google Picker timed out'))}));
})().catch(e=>{gLibs=null; throw e;}); return gLibs; }
function gExplain(){ if(!gdriveConfigured()){ modal('Google Drive isn’t set up yet','Google Drive needs a one-time setup in Google Cloud: an OAuth client ID, an API key and the project number. The steps are in docs/GOOGLE-DRIVE.md in the Slidewright repository.',[['OK',null,'primary']]); return false; }
  if(!gdriveUsable()){ toast('Google Drive works from www.jessetnroberts.com/slidewright, not from this copy.','warn'); return false; } return true; }
function gToken(){ return new Promise((ok,bad)=>{
  if(gTok&&Date.now()<gTokExp-60000) return ok(gTok);
  if(!gTokenClient) gTokenClient=google.accounts.oauth2.initTokenClient({client_id:GCFG.clientId,scope:GSCOPE,callback:()=>{}});
  gTokenClient.callback=r=>{ if(r&&r.error){bad(new Error(r.error_description||r.error)); return;} gTok=r.access_token; gTokExp=Date.now()+(+r.expires_in||3600)*1000; ok(gTok); };
  gTokenClient.error_callback=e=>bad(new Error(e&&e.type==='popup_closed'?'Google sign-in was closed.':e&&e.type==='popup_failed_to_open'?'The Google sign-in window was blocked. Allow pop-ups for this site.':(e&&(e.message||e.type))||'Google sign-in failed.'));
  gTokenClient.requestAccessToken({prompt:gTok?'':''});
});}
async function gReady(){ if(!gExplain()) return false; try{ await gLoad(); await gToken(); return true; }catch(e){ toast(e.message,'warn'); return false; } }
async function gfetch(url,opts){ opts=opts||{}; const h=Object.assign({Authorization:'Bearer '+gTok},opts.headers||{});
  let r; try{ r=await fetch(url,Object.assign({},opts,{headers:h})); }catch(e){ throw new Error('Couldn’t reach Google Drive. Check your connection.'); }
  if(r.status===401){ gTok=null; throw Object.assign(new Error('Your Google sign-in expired. Try again.'),{status:401}); }
  if(!r.ok){ let m=''; try{ m=(await r.json()).error.message; }catch(_){} throw Object.assign(new Error('Google Drive said: '+(m||r.statusText)+' ('+r.status+')'),{status:r.status}); }
  return r; }
const GD='https://www.googleapis.com/drive/v3/files', GU='https://www.googleapis.com/upload/drive/v3/files';
const GFIELDS='id,name,version,modifiedTime,parents,webViewLink';
function gPick(mode){ return new Promise(res=>{ const P=google.picker; let view;
  if(mode==='open'){ view=new P.DocsView(P.ViewId.DOCS).setMimeTypes('text/html').setIncludeFolders(true).setMode(P.DocsViewMode.LIST); }
  else { view=new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder').setMode(P.DocsViewMode.LIST); }
  const b=new P.PickerBuilder().addView(view).setOAuthToken(gTok).setDeveloperKey(GCFG.apiKey).setTitle(mode==='open'?'Open a deck from Google Drive':'Choose the folder to save into')
    .setCallback(d=>{ if(d.action===P.Action.PICKED) res(d.docs&&d.docs[0]); else if(d.action===P.Action.CANCEL) res(null); });
  if(GCFG.appId) b.setAppId(GCFG.appId);
  if(mode==='open') b.addView(new P.DocsUploadView().setIncludeFolders(true));
  b.build().setVisible(true); }); }
async function openFromDrive(){
  if(!(await confirmDiscard())) return; if(!(await gReady())) return;
  const doc=await gPick('open'); if(!doc) return;
  const prog=progressCard('Opening from Google Drive'); prog.set(0.3,doc.name||'');
  try{ const meta=await (await gfetch(`${GD}/${doc.id}?fields=${GFIELDS}&supportsAllDrives=true`)).json(); prog.set(0.5);
    const text=await (await gfetch(`${GD}/${doc.id}?alt=media&supportsAllDrives=true`)).text(); prog.set(0.9);
    if(loadHTML(text,meta.name,null)){ S.gdrive={id:meta.id,name:meta.name,version:meta.version,parents:meta.parents||[],link:meta.webViewLink}; updateFileName(); toast(`Opened ${meta.name} from Google Drive. Save writes back to it.`); }
  }catch(e){ toast(e.message,'warn'); } finally{ prog.close(); } }
async function gUpload(html,{id,name,parent}){
  const q='uploadType=resumable&supportsAllDrives=true&fields='+GFIELDS; const meta=id?{}:{name,mimeType:'text/html',parents:parent?[parent]:undefined};
  const blob=new Blob([html],{type:'text/html'});
  const r=await gfetch(id?`${GU}/${id}?${q}`:`${GU}?${q}`,{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'text/html','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(meta)});
  const loc=r.headers.get('Location');
  if(loc){ const r2=await fetch(loc,{method:'PUT',headers:{'Content-Type':'text/html'},body:blob}); if(!r2.ok) throw new Error('Google Drive upload failed ('+r2.status+').'); return r2.json(); }
  if(blob.size>5e6) throw new Error('Google Drive didn’t start the upload. Try again.');
  const bnd='sw'+Math.random().toString(36).slice(2); const body=new Blob([`--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bnd}\r\nContent-Type: text/html\r\n\r\n`,blob,`\r\n--${bnd}--`]);
  return (await gfetch(id?`${GU}/${id}?uploadType=multipart&supportsAllDrives=true&fields=${GFIELDS}`:`${GU}?uploadType=multipart&supportsAllDrives=true&fields=${GFIELDS}`,{method:id?'PATCH':'POST',headers:{'Content-Type':'multipart/related; boundary='+bnd},body})).json(); }
async function saveToDrive(asNew){
  if(!(await gReady())) return; endEdit(); commit();
  let target=S.gdrive&&!asNew?S.gdrive:null, parent=null, name=S.name.replace(/\.htm$/i,'.html');
  if(!target){ const folder=await gPick('save'); if(!folder) return; parent=folder.id; if(asNew&&S.gdrive) name=name.replace(/\.html$/i,' copy.html'); }
  const html=serialize(); const prog=progressCard('Saving to Google Drive'); prog.set(0.3,(html.length/1e6).toFixed(1)+' MB');
  try{
    if(target){ const cur=await (await gfetch(`${GD}/${target.id}?fields=${GFIELDS}&supportsAllDrives=true`)).json();
      if(target.version&&cur.version&&String(cur.version)!==String(target.version)){ prog.close(); const c=await modal('The file changed in Google Drive',`${cur.name} was changed in Drive after you opened it. Overwriting replaces that version with yours; Drive keeps the old one in its version history.`,[['Cancel',null],['Save as a new file','new'],['Overwrite','ok','primary']]);
        if(c==='new') return saveToDrive(true); if(c!=='ok') return; } }
    const res=await gUpload(html,target?{id:target.id}:{name,parent});
    S.gdrive={id:res.id,name:res.name,version:res.version,parents:res.parents||(parent?[parent]:[]),link:res.webViewLink}; S.name=res.name;
    markSaved(`Saved ${res.name} to Google Drive.`);
  }catch(e){ toast(e.message,'warn'); } finally{ prog.close(); } }
async function driveHistory(){
  if(!S.gdrive){ toast('Open a deck from Google Drive first.'); return; } if(!(await gReady())) return;
  let revs; try{ revs=(await (await gfetch(`${GD}/${S.gdrive.id}/revisions?fields=revisions(id,modifiedTime,lastModifyingUser/displayName,size)&pageSize=100`)).json()).revisions||[]; }catch(e){ toast(e.message,'warn'); return; }
  revs.reverse(); const list=el('div',{class:'hist'}); let resolve; const done=new Promise(r=>resolve=r);
  revs.forEach((rv,i)=>list.appendChild(el('div',{class:'hist-row'},el('div',{class:'hm'},el('b',{text:i===0?'Latest saved version':new Date(rv.modifiedTime).toLocaleString()}),el('span',{class:'hint',text:`${(rv.lastModifyingUser&&rv.lastModifyingUser.displayName)||'Someone'} · ${rel(rv.modifiedTime)}${rv.size?' · '+(rv.size/1e6).toFixed(1)+' MB':''}`})),
    el('button',{class:'btn',text:'Compare',onclick:()=>resolve({rv,act:'cmp'})}),el('button',{class:'btn',text:'Open',onclick:()=>resolve({rv,act:'open'})}))));
  if(!revs.length) list.appendChild(el('p',{class:'hint',style:'padding:12px',text:'Drive has no earlier versions of this file yet.'}));
  const bg=el('div',{class:'modal-bg'}); const m=el('div',{class:'modal wide',role:'dialog','aria-modal':'true'},el('h2',{text:'Versions of '+S.gdrive.name}),el('p',{class:'hint',text:'Google Drive keeps earlier versions of uploaded files for 30 days (up to 100 versions). Compare shows what’s different from the deck as it is now.'}),list,el('div',{class:'actions'},el('button',{class:'btn',text:'Close',onclick:()=>resolve(null)})));
  bg.appendChild(m); document.body.appendChild(bg); const kd=e=>{if(e.key==='Escape'){e.stopPropagation(); resolve(null);}}; document.addEventListener('keydown',kd,true);
  const pick=await done; bg.remove(); document.removeEventListener('keydown',kd,true); if(!pick) return;
  let text; const prog=progressCard('Fetching that version'); try{ text=await (await gfetch(`${GD}/${S.gdrive.id}/revisions/${pick.rv.id}?alt=media`)).text(); }catch(e){ prog.close(); toast(e.message,'warn'); return; } prog.close();
  const when=new Date(pick.rv.modifiedTime).toLocaleString();
  if(pick.act==='cmp') compareDecks(text,'the version from '+when);
  else { if(!(await confirmDiscard())) return; const keep=Object.assign({},S.gdrive); if(loadHTML(text,keep.name,null)){ S.gdrive=keep; S.dirty=true; updateFileName(); toast(`Opened the version from ${when}. Save to make it the current version in Drive.`);} } }
function signOutGoogle(){ try{ if(gTok&&window.google) google.accounts.oauth2.revoke(gTok,()=>{}); }catch(_){} gTok=null; gTokExp=0; toast('Signed out of Google Drive in Slidewright.'); }
