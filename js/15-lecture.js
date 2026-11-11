/* Slidewright: lecture recording. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= lecture recording =======================
   Record in presenter view keeps the microphone audio and a timed log of what happened on the slides:
   slide and click changes, blank screen, pen and marker strokes, and the laser pointer. Nothing is filmed.
   The video is drawn from the deck afterwards (js/16-lecture-editor.js), so the audio can be trimmed and
   annotations cropped or removed before export.

   Everything stays in this browser (IndexedDB) until you export. The audio is written every few seconds,
   so a crash or a closed window loses only the last moment.

   Log entries, times in seconds from the start of the recording:
     ['s', t, h, f, blank]   slide h at click f (-1 = before the first click); blank 1 while the screen is blacked out
     ['i', t, key, strokes]  the strokes on slide key ("h.v") changed; strokes is the whole list for that slide
     ['l', t, x, y]          laser pointer at x, y in slide pixels
   Levels: one byte per 50 ms of audio, for drawing the waveform without decoding it. */
const LEC_DB='slidewright-lectures', LEC_STEP=0.05;
let lecDBp=null;
const idbP=q=>new Promise((ok,bad)=>{ q.onsuccess=()=>ok(q.result); q.onerror=()=>bad(q.error); });
function lecDB(){ return lecDBp||(lecDBp=new Promise((ok,bad)=>{ const q=indexedDB.open(LEC_DB,1);
  q.onupgradeneeded=()=>{ const d=q.result; d.createObjectStore('recs',{keyPath:'id'}); d.createObjectStore('chunks',{keyPath:['id','n']}); d.createObjectStore('audio',{keyPath:'id'}); };
  q.onsuccess=()=>ok(q.result); q.onerror=()=>{ lecDBp=null; bad(q.error); }; })); }
async function lecStore(name,mode){ return (await lecDB()).transaction(name,mode||'readonly').objectStore(name); }
const lecPut=async(name,v)=>idbP((await lecStore(name,'readwrite')).put(v));
const lecGet=async(name,k)=>idbP((await lecStore(name)).get(k));
const lecAll=async()=>(await idbP((await lecStore('recs')).getAll())).sort((a,b)=>b.started-a.started);
async function lecDelete(id){ const d=await lecDB(); const t=d.transaction(['recs','chunks','audio'],'readwrite');
  t.objectStore('recs').delete(id); t.objectStore('audio').delete(id); t.objectStore('chunks').delete(IDBKeyRange.bound([id,0],[id,Infinity]));
  await new Promise((ok,bad)=>{ t.oncomplete=ok; t.onerror=t.onabort=()=>bad(t.error); }); }
/* The recorded audio as one file. MediaRecorder's own file has no index, so it is copied once into a
   proper WebM or MP4 that players can seek in (the sound itself is not re-encoded). */
async function lecAudio(rec){
  const have=await lecGet('audio',rec.id); if(have&&have.blob) return have.blob;
  const parts=await idbP((await lecStore('chunks')).getAll(IDBKeyRange.bound([rec.id,0],[rec.id,Infinity])));
  if(!parts.length) throw new Error('This recording has no audio.');
  const raw=new Blob(parts.sort((a,b)=>a.n-b.n).map(p=>p.blob),{type:(rec.mime||'audio/webm').split(';')[0]});
  let blob=raw; try{ blob=await remuxAudio(raw); }catch(e){ console.warn('Slidewright: kept the audio as recorded',e); }
  if(rec.status!=='recording') await lecPut('audio',{id:rec.id,blob}).catch(()=>{});
  return blob;
}
async function remuxAudio(raw){ const MB=await loadMediabunny();
  const input=new MB.Input({source:new MB.BlobSource(raw),formats:MB.ALL_FORMATS}); const tr=await input.getPrimaryAudioTrack(); if(!tr) throw new Error('no audio track');
  const codec=await tr.getCodec(); const mp4=codec==='aac';
  const out=new MB.Output({format:mp4?new MB.Mp4OutputFormat({fastStart:'in-memory'}):new MB.WebMOutputFormat(),target:new MB.BufferTarget()});
  const src=new MB.EncodedAudioPacketSource(codec); out.addAudioTrack(src); await out.start();
  const cfg=await tr.getDecoderConfig(); let first=true; const sink=new MB.EncodedPacketSink(tr);
  for await(const p of sink.packets()){ await src.add(p,first?{decoderConfig:cfg}:undefined); first=false; }
  src.close(); await out.finalize(); input.dispose&&input.dispose();
  return new Blob([out.target.buffer],{type:mp4?'audio/mp4':'audio/webm'}); }

/* Mediabunny (MPL-2.0, vendor/) makes the video files. It is an ES module, loaded the first time it's needed;
   the offline copy carries it inline in a <script type="text/plain" id="lib-mediabunny">. */
let mbP=null;
function loadMediabunny(){ return mbP||(mbP=(async()=>{ const inl=document.getElementById('lib-mediabunny');
  if(inl) return import(URL.createObjectURL(new Blob([inl.textContent],{type:'text/javascript'})));
  return import(new URL('vendor/mediabunny-1.65.2/mediabunny.min.mjs',location.href).href); })().catch(e=>{ mbP=null; throw new Error('Couldn’t load the video library. Check your connection and try again.'); })); }

const lecFmt=s=>{ s=Math.max(0,Math.floor(s)); const h=Math.floor(s/3600), m=Math.floor(s/60)%60, x=String(s%60).padStart(2,'0'); return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`; };
const lecWhen=ms=>new Date(ms).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

/* The Record button in presenter view. getSt returns the audience window's state (or null while it starts). */
function lectureRecorder(getSt){
  let on=false, busy=false, mr=null, stream=null, ac=null, an=null, id=null, t0=0, ev=[], lv=[], seq=0, lastS='', lastDump=null, inkKeys={}, wake=null, meterT=null, saveT=null, info=null, pending=[];
  const meter=el('i',{class:'rec-meter','aria-hidden':'true'}), lbl=el('span',{text:'Record'});
  const btn=el('button',{class:'btn rec',type:'button',title:'Record your voice and what you do on the slides. Afterwards you can trim it and export a video.',onclick:()=>{ if(busy) return; on?stop():start(); }},el('i',{class:'rec-dot','aria-hidden':'true'}),lbl,meter);
  const T=()=>Math.round((performance.now()-t0))/1000;
  const save=()=>{ if(!info) return Promise.resolve(); info.dur=on?T():info.dur; info.beat=Date.now(); return lecPut('recs',info).catch(()=>{}); };
  const lockScreen=()=>{ if(on&&navigator.wakeLock&&!wake) navigator.wakeLock.request('screen').then(w=>{ wake=w; w.addEventListener('release',()=>{ wake=null; }); }).catch(()=>{}); };
  const onVis=()=>{ if(document.visibilityState==='visible') lockScreen(); };
  function state(st){ if(!on||!st) return; const t=T(), ix=st.ix||{};
    const s=`${ix.h}|${ix.f}|${st.paused?1:0}`; if(s!==lastS){ lastS=s; ev.push(['s',t,ix.h|0,ix.f==null?-1:ix.f,st.paused?1:0]); }
    if(st.dump!==lastDump){ lastDump=st.dump; let store={}; try{ store=JSON.parse(st.dump)||{}; }catch(_){}
      for(const k of new Set([...Object.keys(store),...Object.keys(inkKeys)])){ const list=Array.isArray(store[k])?store[k]:[]; const j=JSON.stringify(list);
        if(j!==(inkKeys[k]||'[]')){ inkKeys[k]=j; ev.push(['i',t,k,list]); } } } }
  function laser(x,y){ if(on) ev.push(['l',T(),Math.round(x*10)/10,Math.round(y*10)/10]); }
  async function start(){
    if(!window.MediaRecorder||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ toast('This browser can’t record audio. Chrome, Edge and Safari can.','warn'); return; }
    busy=true; try{
      try{ stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:true,autoGainControl:true}}); }
      catch(e){ toast('Slidewright couldn’t use the microphone. Allow it for this site, then press Record again.','warn'); return; }
      const mime=['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m))||'';
      try{ mr=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:96000}:{}); }catch(_){ mr=new MediaRecorder(stream); }
      id='lec-'+Date.now().toString(36); ev=[]; lv=[]; seq=0; lastS=''; lastDump=null; inkKeys={}; pending=[];
      info={id,deck:S.name,title:(S.doc&&S.doc.title)||baseName(),started:Date.now(),mime:mr.mimeType||mime,status:'recording',dur:0,ev,lv,slides:S.slides.length,W:S.W,H:S.H,edit:null};
      await save();
      mr.ondataavailable=e=>{ if(e.data&&e.data.size) pending.push(lecPut('chunks',{id,n:seq++,blob:e.data}).catch(()=>{ toast('Couldn’t save part of the recording. Is the disk full?','warn'); })); };
      t0=performance.now(); mr.start(4000); on=true; state(getSt());
      try{ ac=new AudioContext(); an=ac.createAnalyser(); an.fftSize=2048; ac.createMediaStreamSource(stream).connect(an); }catch(_){ an=null; }
      const buf=new Float32Array(2048);
      meterT=setInterval(()=>{ if(!an) return; an.getFloatTimeDomainData(buf); let pk=0; for(let i=0;i<buf.length;i++){ const a=Math.abs(buf[i]); if(a>pk) pk=a; }
        const v=Math.round(Math.min(1,Math.sqrt(pk))*255), i=Math.round(T()/LEC_STEP); for(let j=lv.length;j<i;j++) lv[j]=0; lv[i]=Math.max(lv[i]||0,v); meter.style.setProperty('--lv',(v/255).toFixed(2));
        lbl.textContent='Stop '+lecFmt(T()); },LEC_STEP*1000);
      saveT=setInterval(save,5000); lockScreen(); document.addEventListener('visibilitychange',onVis);
      btn.classList.add('on'); btn.setAttribute('aria-pressed','true'); btn.title='Stop recording'; toast('Recording. Everything you say and draw is kept in this browser.');
    } finally { busy=false; }
  }
  async function stop(){ if(!on) return null; busy=true; on=false; const t=T();
    try{ await new Promise(r=>{ mr.onstop=r; try{ mr.stop(); }catch(_){ r(); } }); await Promise.all(pending); }catch(_){}
    clearInterval(meterT); clearInterval(saveT); document.removeEventListener('visibilitychange',onVis);
    try{ stream.getTracks().forEach(x=>x.stop()); }catch(_){} try{ ac&&ac.close(); }catch(_){} try{ wake&&wake.release(); }catch(_){} wake=null;
    info.dur=t; info.status='done'; await save(); const done=info; info=null;
    btn.classList.remove('on'); btn.setAttribute('aria-pressed','false'); btn.title='Record your voice and what you do on the slides'; lbl.textContent='Record'; meter.style.removeProperty('--lv'); busy=false;
    toast(`Recorded ${lecFmt(t)}. Trim it and export the video when you’re ready.`,null,{label:'Edit and export',fn:()=>openLectureEditor(done.id)});
    return done; }
  return {button:btn,state,laser,stop,get recording(){ return on; }};
}

/* Recordings kept in this browser: open, download the sound, or delete. */
async function lectureRecordings(){
  let recs=[]; try{ recs=await lecAll(); }catch(_){ toast('This browser won’t let Slidewright store recordings.','warn'); return; }
  const list=el('div',{class:'lec-list'}); let closeM=()=>{};
  const draw=()=>{ list.replaceChildren(); if(!recs.length){ list.append(el('p',{class:'hint',text:'No recordings yet. In presenter view, press Record before you start talking.'})); return; }
    for(const r of recs){ const row=el('div',{class:'lec-row'},
        el('div',{class:'lec-meta'},el('b',{text:r.title||r.deck}),el('span',{class:'hint',text:`${lecWhen(r.started)} · ${lecFmt(r.dur||0)}${r.status==='interrupted'?' · interrupted':''}${r.deck!==S.name?' · '+r.deck:''}`})),
        el('button',{class:'btn primary',text:'Edit and export',onclick:()=>{ closeM(); openLectureEditor(r.id); }}),
        el('button',{class:'btn',text:'Sound only',title:'Save just the audio',onclick:async()=>{ try{ const b=await lecAudio(r); await saveFile(`${(r.title||'lecture').replace(/[\\/:*?"<>|]+/g,'')} ${new Date(r.started).toISOString().slice(0,10)}.${/mp4/.test(b.type)?'m4a':'webm'}`,b,'Audio',/mp4/.test(b.type)?'.m4a':'.webm',b.type||'audio/webm'); }catch(e){ toast(e.message,'warn'); } }}),
        el('button',{class:'btn danger',text:'Delete',onclick:async()=>{ const v=await modal('Delete this recording?',`${r.title||r.deck}, ${lecWhen(r.started)}. This can’t be undone.`,[['Cancel',null],['Delete','ok','danger']]); if(v!=='ok') return; await lecDelete(r.id); recs=recs.filter(x=>x!==r); draw(); }}));
      list.append(row); } };
  draw(); const wrap=el('div',{class:'stack'},el('p',{class:'hint',text:'Recordings stay in this browser until you delete them. Export a video to keep one anywhere else.'}),list);
  const p=modal('Lecture recordings',wrap,[['Close',null]],{wide:true}); const m=$$('.modal-bg').pop(); closeM=()=>{ const c=m&&m.querySelector('.actions .btn'); c&&c.click(); }; await p;
}
/* A recording whose window closed or crashed mid-lecture is kept, marked interrupted. */
async function checkLectureRecovery(){ let recs=[]; try{ recs=await lecAll(); }catch(_){ return; }
  const lost=recs.filter(r=>r.status==='recording'&&Date.now()-(r.beat||r.started)>30000); if(!lost.length) return;
  for(const r of lost){ r.status='interrupted'; await lecPut('recs',r).catch(()=>{}); }
  toast(lost.length>1?`${lost.length} lecture recordings were interrupted. They’re saved.`:`A lecture recording from ${lecWhen(lost[0].started)} was interrupted. It’s saved.`,null,{label:'Open',fn:lectureRecordings}); }
