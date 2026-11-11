/* Slidewright: lecture editor. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= lecture editor and video export =======================
   A recording (js/15-lecture.js) is audio plus a log. This file turns the log into tracks you can edit:
   cut stretches out of the recording (everything in that time goes: sound, slides and ink), and crop or
   remove individual pen and marker strokes. Edits never touch the recording itself; they are a list of
   cuts and stroke changes, kept with the recording, and applied when the video is drawn.

   Times on the timeline are recording times. Cut stretches stay visible (greyed) so they can be restored. */
const LEC_FADE=0.25, LEC_DRAW=0.4, LEC_LASER=1.5;

/* The recording as tracks: slide states, strokes (each with when it appeared and went away), laser points. */
function lecModel(rec){
  const dur=Math.max(0.1,rec.dur||0), ss=[], lz=[], strokes=[], live={};
  for(const e of rec.ev||[]){
    if(e[0]==='s') ss.push(e); else if(e[0]==='l') lz.push(e);
    else if(e[0]==='i'){ const [,t,k,list]=e; const old=live[k]||[], now=[], sig=(list||[]).map(x=>JSON.stringify([x.tool,x.color,x.pts])); let i=0;
      while(i<old.length&&i<sig.length&&old[i].sig===sig[i]){ now.push(old[i]); i++; }
      for(let a=i;a<old.length;a++) old[a].e0=t;
      for(let b=i;b<sig.length;b++){ const x=list[b]; if(!x||!Array.isArray(x.pts)||!x.pts.length) continue; const s={id:strokes.length,key:String(k),s0:t,e0:dur,tool:x.tool==='hl'?'hl':'pen',color:typeof x.color==='string'?x.color:'#E0407A',pts:x.pts.filter(p=>Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1])),sig:sig[b]}; strokes.push(s); now.push(s); }
      live[k]=now; } }
  if(!ss.length||ss[0][1]>0) ss.unshift(['s',0,ss.length?ss[0][2]:0,ss.length?ss[0][3]:-1,0]);
  return {dur,ss,lz,strokes};
}
const lecFind=(arr,t)=>{ let lo=0, hi=arr.length-1, r=-1; while(lo<=hi){ const m=(lo+hi)>>1; if(arr[m][1]<=t){ r=m; lo=m+1; } else hi=m-1; } return r; };
const lecK=f=>f==null||f<0?0:f+1;
/* Cuts merged and sorted, the stretches that remain, and conversions between recording and video time. */
function lecTime(M,E){
  const cuts=(E.cuts||[]).map(c=>[Math.max(0,Math.min(c[0],c[1])),Math.min(M.dur,Math.max(c[0],c[1]))]).filter(c=>c[1]-c[0]>0.01).sort((a,b)=>a[0]-b[0]);
  const merged=[]; for(const c of cuts){ const l=merged[merged.length-1]; if(l&&c[0]<=l[1]) l[1]=Math.max(l[1],c[1]); else merged.push(c.slice()); }
  const keep=[]; let a=0; for(const c of merged){ if(c[0]>a) keep.push([a,c[0]]); a=Math.max(a,c[1]); } if(a<M.dur) keep.push([a,M.dur]);
  const len=keep.reduce((n,k)=>n+k[1]-k[0],0);
  const toProg=t=>{ let p=0; for(const k of keep){ if(t<k[0]) return p; if(t<k[1]) return p+t-k[0]; p+=k[1]-k[0]; } return p; };
  const toSrc=p=>{ for(const k of keep){ const d=k[1]-k[0]; if(p<d) return k[0]+p; p-=d; } return keep.length?keep[keep.length-1][1]:0; };
  const cutAt=t=>merged.find(c=>t>=c[0]&&t<c[1])||null;
  return {cuts:merged,keep,len,toProg,toSrc,cutAt};
}
const lecSpan=(s,E)=>{ const o=(E.ink||{})[s.id]; if(o&&o.del) return null; return {s:o&&o.s!=null?o.s:s.s0,e:o&&o.e!=null?o.e:s.e0}; };
function lecPath(g,pts,n){ n=Math.max(1,Math.min(n,pts.length)); g.beginPath(); g.moveTo(pts[0][0],pts[0][1]); if(n===1){ g.lineTo(pts[0][0]+0.01,pts[0][1]); return; }
  for(let i=1;i<n;i++){ const p=pts[i-1], q=pts[i]; g.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2); } }
/* Draws the video frame at recording time t. bmp(h,k) gives the slide picture or null (not drawn yet). */
function lecDraw(g,W,H,M,E,t,bmp,sel){
  const i=Math.max(0,lecFind(M.ss,t)), e=M.ss[i]; g.save(); g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.globalCompositeOperation='source-over';
  const paint=st=>{ if(st[4]){ g.fillStyle='#000'; g.fillRect(0,0,W,H); return; } g.fillStyle='#fff'; g.fillRect(0,0,W,H); const b=bmp(st[2],lecK(st[3])); if(b) g.drawImage(b,0,0,W,H); };
  const since=t-e[1];
  if(i>0&&since<LEC_FADE){ paint(M.ss[i-1]); g.globalAlpha=Math.max(0,since/LEC_FADE); paint(e); g.globalAlpha=1; } else paint(e);
  if(!e[4]){ const sc=W/S.W; g.scale(sc,sc); const key=e[2]+'.0';
    const vis=M.strokes.filter(s=>s.key===key).map(s=>[s,lecSpan(s,E)]).filter(([,sp])=>sp&&sp.s<=t&&t<sp.e);
    for(const pass of ['hl','pen']) for(const [s,sp] of vis){ if(s.tool!==pass) continue; const n=Math.ceil(s.pts.length*Math.min(1,(t-sp.s)/LEC_DRAW+0.02));
      g.save(); if(pass==='hl'){ g.globalCompositeOperation='multiply'; g.globalAlpha=0.4; g.strokeStyle='#FFD400'; g.lineWidth=22; } else { g.strokeStyle=/^#[0-9a-f]{3,8}$/i.test(s.color)?s.color:'#E0407A'; g.lineWidth=4; }
      g.lineCap='round'; g.lineJoin='round'; lecPath(g,s.pts,n); g.stroke(); g.restore();
      if(sel===s.id){ const xs=s.pts.map(p=>p[0]), ys=s.pts.map(p=>p[1]), pad=pass==='hl'?16:10; g.save(); g.setLineDash([8,6]); g.lineWidth=2; g.strokeStyle='#2557D6';
        g.strokeRect(Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)-Math.min(...xs)+2*pad,Math.max(...ys)-Math.min(...ys)+2*pad); g.restore(); } }
    const li=lecFind(M.lz,t); if(li>=0&&t-M.lz[li][1]<LEC_LASER&&M.lz[li][1]>=e[1]-0.001){ const l=M.lz[li]; g.save(); g.shadowColor='rgba(255,45,45,.9)'; g.shadowBlur=12; g.fillStyle='#FF2D2D'; g.beginPath(); g.arc(l[2],l[3],9,0,Math.PI*2); g.fill(); g.restore(); } }
  g.restore();
}
/* The strokes under a point on slide key at time t, topmost first. */
function lecHit(M,E,t,x,y){ const i=Math.max(0,lecFind(M.ss,t)), e=M.ss[i]; if(e[4]) return null; const key=e[2]+'.0';
  const segD=(p,a,b)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], l=dx*dx+dy*dy; let u=l?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l:0; u=Math.max(0,Math.min(1,u)); return Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy); };
  const vis=M.strokes.filter(s=>s.key===key).filter(s=>{ const sp=lecSpan(s,E); return sp&&sp.s<=t&&t<sp.e; });
  for(let j=vis.length-1;j>=0;j--){ const s=vis[j], r=(s.tool==='hl'?11:2)+8; for(let k=0;k<s.pts.length;k++){ if(segD([x,y],s.pts[k],s.pts[Math.min(k+1,s.pts.length-1)])<=r) return s; } } return null; }

async function openLectureEditor(id){
  let rec=null; try{ rec=await lecGet('recs',id); }catch(_){} if(!rec){ toast('That recording is no longer in this browser.','warn'); return; }
  if(rec.deck!==S.name){ const v=await modal('Open the deck first',`This recording was made with ${rec.deck}, and the video is drawn from that deck. Open it, then choose Lecture recordings again.`,[['Use this deck anyway','go'],['OK',null,'primary']]); if(v!=='go') return; }
  if(!S.doc) return; endEdit(); commit(); if(PV.on) stopPreview(); $$('#lecEd').forEach(x=>x.remove());
  const M=lecModel(rec); let E=rec.edit&&typeof rec.edit==='object'?JSON.parse(JSON.stringify(rec.edit)):{cuts:[],ink:{}}; E.cuts=E.cuts||[]; E.ink=E.ink||{};
  let TM=lecTime(M,E), ph=0, sel=null /* {kind:'stroke',id} | {kind:'cut',c} */, range=null, pps=0, playing=false, raf=0, audio=null, url=null, ready=false, closed=false;
  const undo=[], redo=[]; let saveT=null;
  const persist=()=>{ clearTimeout(saveT); saveT=setTimeout(()=>{ rec.edit=E; lecPut('recs',rec).catch(()=>{}); },400); };
  const change=fn=>{ undo.push(JSON.stringify(E)); if(undo.length>200) undo.shift(); redo.length=0; fn(); TM=lecTime(M,E); layout(); persist(); refresh(); };
  const restore=(from,to)=>{ if(!from.length) return; to.push(JSON.stringify(E)); E=JSON.parse(from.pop()); TM=lecTime(M,E); if(sel&&sel.kind==='cut') sel=null; layout(); persist(); refresh(); };

  /* ---- layout ---- */
  const ov=el('div',{id:'lecEd',role:'dialog','aria-label':'Edit lecture recording'});
  const timeLbl=el('span',{class:'le-time','aria-live':'off'});
  const B=(text,title,fn,cls)=>el('button',{class:'btn'+(cls?' '+cls:''),type:'button',text,title,onclick:fn});
  const playB=B('▶ Play','Play or pause (Space)',()=>playing?pause():play(),'primary');
  const undoB=B('↶','Undo (Ctrl Z)',()=>restore(undo,redo)), redoB=B('↷','Redo (Ctrl ⇧ Z)',()=>restore(redo,undo));
  const cutB=B('✂ Cut','Cut the selected stretch out of the video (Delete)',()=>cutRange());
  const trimSB=B('⇤ Trim start','Cut everything before the playhead',()=>{ if(ph>0.05) change(()=>E.cuts.push([0,ph])); });
  const trimEB=B('Trim end ⇥','Cut everything after the playhead',()=>{ if(ph<M.dur-0.05) change(()=>E.cuts.push([ph,M.dur])); });
  const restB=B('Restore','Put the selected cut back',()=>restoreCut());
  const delB=B('Remove stroke','Remove the selected annotation (Delete)',()=>removeStroke(),'danger');
  const zIn=B('+','Zoom in',()=>zoom(1.6)), zOut=B('−','Zoom out',()=>zoom(1/1.6));
  const expB=B('Export video…','Make an MP4 of the edited lecture',()=>doExport(),'primary');
  const closeB=B('Close','Close the editor (your edits are kept)',()=>close());
  const hint=el('span',{class:'le-hint'});
  ov.append(el('div',{class:'le-top'},el('b',{text:'Lecture'}),el('span',{class:'le-sub',text:`${rec.title||rec.deck} · ${lecWhen(rec.started)}`}),el('span',{class:'spacer'}),expB,closeB),
    el('div',{class:'le-main'},el('div',{class:'le-stage'})),
    el('div',{class:'le-bar'},playB,timeLbl,el('span',{class:'le-sep'}),undoB,redoB,el('span',{class:'le-sep'}),trimSB,cutB,trimEB,restB,delB,el('span',{class:'spacer'}),hint,zOut,zIn));
  const stage=ov.querySelector('.le-stage'); const pv=el('canvas',{class:'le-pv','aria-label':'Preview of the video at the playhead. Click a drawing to select it.'}); stage.append(pv);
  const tlWrap=el('div',{class:'le-tl'}), tlInner=el('div',{class:'le-tl-in'}), tl=el('canvas',{class:'le-tl-c',tabindex:'0','aria-label':'Timeline. Drag on the sound to select a stretch; click a drawing to select it.'});
  tlWrap.append(tl,tlInner); ov.append(tlWrap); document.body.append(ov);

  /* ---- slide pictures ---- */
  const pics=new Map(), want=new Set();
  const bmp=(h,k)=>{ const key=h+':'+k; if(pics.has(key)) return pics.get(key); if(!want.has(key)&&S.slides[h]){ want.add(key); slideCanvas(S.slides[h],k,1).then(c=>{ pics.set(key,c); if(!closed) drawPv(); }).catch(()=>pics.set(key,null)); } return null; };

  /* ---- timeline geometry ---- */
  const ROW={ruler:[0,20],slides:[22,26],audio:[52,60],ink:[116,0]}; const LANE=9, LANES=8; let lanes=new Map(), nl=1, tlH=0;
  function layout(){ const sp=M.strokes.map(s=>[s,lecSpan(s,E)]).filter(x=>x[1]).sort((a,b)=>a[1].s-b[1].s); const ends=[]; lanes=new Map();
    for(const [s,x] of sp){ let l=ends.findIndex(v=>v<=x.s); if(l<0){ if(ends.length<LANES){ l=ends.length; ends.push(0); } else l=ends.indexOf(Math.min(...ends)); } ends[l]=x.e; lanes.set(s.id,l); }
    nl=Math.max(1,ends.length); ROW.ink[1]=nl*LANE+6; tlH=ROW.ink[0]+ROW.ink[1]+4; }
  const X=t=>t*pps-tlWrap.scrollLeft, Tx=x=>Math.max(0,Math.min(M.dur,(x+tlWrap.scrollLeft)/pps));
  function fit(){ pps=Math.max(0.02,(tlWrap.clientWidth-24)/M.dur); tlInner.style.width=Math.ceil(M.dur*pps+24)+'px'; }
  function zoom(f){ const c=ph; pps=Math.min(400,Math.max((tlWrap.clientWidth-24)/M.dur,pps*f)); tlInner.style.width=Math.ceil(M.dur*pps+24)+'px'; tlWrap.scrollLeft=Math.max(0,c*pps-tlWrap.clientWidth/2); drawTl(); }
  function sizeCanvas(c,w,h){ const d=window.devicePixelRatio||1; c.width=Math.round(w*d); c.height=Math.round(h*d); c.style.width=w+'px'; c.style.height=h+'px'; const g=c.getContext('2d'); g.setTransform(d,0,0,d,0,0); return g; }

  function drawTl(){ const w=tlWrap.clientWidth, g=sizeCanvas(tl,w,tlH); g.clearRect(0,0,w,tlH); const t0=Tx(0), t1=Tx(w);
    // ruler
    const steps=[1,2,5,10,15,30,60,120,300,600,900,1800,3600]; const st=steps.find(s=>s*pps>=72)||3600; g.fillStyle='#8B93A7'; g.font='11px system-ui,sans-serif'; g.strokeStyle='#3A404D'; g.lineWidth=1;
    for(let t=Math.floor(t0/st)*st;t<=t1;t+=st){ const x=Math.round(X(t))+0.5; g.beginPath(); g.moveTo(x,12); g.lineTo(x,20); g.stroke(); g.fillText(lecFmt(t),x+3,11); }
    // slides
    const [sy,sh]=ROW.slides; for(let i=0;i<M.ss.length;i++){ const e=M.ss[i], a=e[1], b=i+1<M.ss.length?M.ss[i+1][1]:M.dur; if(b<t0||a>t1) continue; const x0=X(a), x1=X(b);
      const newSlide=i===0||M.ss[i-1][2]!==e[2]||M.ss[i-1][4]!==e[4]; g.fillStyle=e[4]?'#000':(e[2]%2?'#3B4A6B':'#2F3B57'); g.fillRect(x0,sy,Math.max(1,x1-x0),sh);
      if(newSlide){ g.fillStyle='#89A3FF'; g.fillRect(x0,sy,1.5,sh); } else { g.fillStyle='rgba(137,163,255,.45)'; g.fillRect(x0,sy+sh-7,1,7); }
      if(newSlide&&!e[4]){ let end=i+1; while(end<M.ss.length&&M.ss[end][2]===e[2]&&!M.ss[end][4]) end++; const xe=X(end<M.ss.length?M.ss[end][1]:M.dur); if(xe-x0>16){ g.fillStyle='#E8EAF0'; g.fillText(String(e[2]+1),x0+4,sy+16); } } }
    // audio levels
    const [ay,ah]=ROW.audio, lv=rec.lv||[]; g.fillStyle='#1A1E26'; g.fillRect(0,ay,w,ah); g.fillStyle='#5FB98B'; const mid=ay+ah/2;
    for(let x=0;x<w;x++){ const a=Tx(x), b=Tx(x+1); let m=0; for(let j=Math.floor(a/LEC_STEP);j<=Math.floor(b/LEC_STEP)&&j<lv.length;j++) if(lv[j]>m) m=lv[j]; if(m){ const hh=Math.max(1,m/255*(ah/2-2)); g.fillRect(x,mid-hh,1,hh*2); } }
    // strokes
    const [iy]=ROW.ink; for(const s of M.strokes){ const sp=lecSpan(s,E); if(!sp||sp.e<t0||sp.s>t1) continue; const l=lanes.get(s.id)||0, y=iy+3+l*LANE, x0=X(sp.s), x1=Math.max(x0+3,X(sp.e));
      g.fillStyle=s.tool==='hl'?'#C9A800':(/^#[0-9a-f]{3,8}$/i.test(s.color)?s.color:'#E0407A'); g.globalAlpha=0.85; g.fillRect(x0,y,x1-x0,LANE-2); g.globalAlpha=1;
      if(sel&&sel.kind==='stroke'&&sel.id===s.id){ g.strokeStyle='#fff'; g.lineWidth=2; g.strokeRect(x0-1,y-1,x1-x0+2,LANE); g.fillStyle='#fff'; g.fillRect(x0-3,y-2,4,LANE+2); g.fillRect(x1-1,y-2,4,LANE+2); } }
    if(!M.strokes.length){ g.fillStyle='#5B6273'; g.fillText('No drawings in this recording',8,iy+12); }
    // row labels
    g.fillStyle='rgba(14,16,20,.8)'; [['Slides',sy+16],['Sound',ay+14],['Drawings',iy+12]].forEach(([t,y])=>{ const tw=g.measureText(t).width; g.fillRect(2,y-11,tw+8,15); }); g.fillStyle='#AEB4C2'; [['Slides',sy+16],['Sound',ay+14],['Drawings',iy+12]].forEach(([t,y])=>g.fillText(t,6,y));
    // cuts, selection, playhead
    for(const c of TM.cuts){ const x0=X(c[0]), x1=X(c[1]); if(x1<0||x0>w) continue; g.fillStyle='rgba(8,9,12,.72)'; g.fillRect(x0,20,x1-x0,tlH-20); g.strokeStyle='rgba(255,255,255,.12)'; g.lineWidth=1;
      g.save(); g.beginPath(); g.rect(x0,20,x1-x0,tlH-20); g.clip(); for(let x=x0-tlH;x<x1;x+=8){ g.beginPath(); g.moveTo(x,tlH); g.lineTo(x+tlH,20); g.stroke(); } g.restore();
      g.fillStyle=sel&&sel.kind==='cut'&&sel.c[0]===c[0]?'#FF8A8A':'#E05555'; g.fillRect(x0,20,Math.max(1,x1-x0),2); }
    if(range){ const a=Math.min(range[0],range[1]), b=Math.max(range[0],range[1]); g.fillStyle='rgba(137,163,255,.22)'; g.fillRect(X(a),20,X(b)-X(a),tlH-20); g.fillStyle='#89A3FF'; g.fillRect(X(a),20,1,tlH-20); g.fillRect(X(b)-1,20,1,tlH-20); }
    const px=Math.round(X(ph))+0.5; g.strokeStyle='#FFD400'; g.lineWidth=1.5; g.beginPath(); g.moveTo(px,0); g.lineTo(px,tlH); g.stroke(); g.fillStyle='#FFD400'; g.beginPath(); g.moveTo(px-5,0); g.lineTo(px+5,0); g.lineTo(px,7); g.fill(); }

  function drawPv(){ const r=stage.getBoundingClientRect(); const s=Math.min(r.width/S.W,r.height/S.H); const w=Math.max(40,Math.floor(S.W*s)), h=Math.max(24,Math.floor(S.H*s)); const g=sizeCanvas(pv,w,h);
    const d=window.devicePixelRatio||1; g.setTransform(1,0,0,1,0,0); lecDraw(g,pv.width,pv.height,M,E,ph,bmp,sel&&sel.kind==='stroke'?sel.id:null); g.setTransform(d,0,0,d,0,0);
    const c=TM.cutAt(ph); if(c){ g.fillStyle='rgba(0,0,0,.55)'; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.font='600 15px system-ui,sans-serif'; g.textAlign='center'; g.fillText('Cut: not in the video',w/2,h/2); } }
  function refresh(){ timeLbl.textContent=`${lecFmt(TM.toProg(ph))} / ${lecFmt(TM.len)}`; timeLbl.title=`Recording time ${lecFmt(ph)} of ${lecFmt(M.dur)}. The second number is the length of the video.`;
    undoB.disabled=!undo.length; redoB.disabled=!redo.length; cutB.disabled=!range||Math.abs(range[1]-range[0])<0.05; restB.disabled=!(sel&&sel.kind==='cut'); delB.disabled=!(sel&&sel.kind==='stroke');
    playB.disabled=!ready; playB.textContent=playing?'❚❚ Pause':'▶ Play';
    hint.textContent=!ready?'Preparing the sound…':range?`${lecFmt(Math.abs(range[1]-range[0]))} selected. Delete cuts it.`:sel&&sel.kind==='stroke'?'Drag the ends of the drawing on the timeline to change when it shows.':sel&&sel.kind==='cut'?'Grey stretches are cut and won’t be in the video.':'Drag across the sound to select a stretch. Click a drawing to select it.';
    drawTl(); drawPv(); }

  /* ---- editing ---- */
  function cutRange(){ if(!range) return; const a=Math.min(range[0],range[1]), b=Math.max(range[0],range[1]); if(b-a<0.05) return; range=null; change(()=>E.cuts.push([a,b])); }
  function restoreCut(){ if(!(sel&&sel.kind==='cut')) return; const [a,b]=sel.c; sel=null; change(()=>{ E.cuts=E.cuts.filter(c=>Math.max(c[0],c[1])<=a||Math.min(c[0],c[1])>=b); }); }
  function removeStroke(){ if(!(sel&&sel.kind==='stroke')) return; const id=sel.id; sel=null; change(()=>{ E.ink[id]={del:1}; }); }

  /* ---- playback ---- */
  const seek=t=>{ ph=Math.max(0,Math.min(M.dur,t)); if(audio&&ready) try{ audio.currentTime=ph; }catch(_){} refresh(); };
  function follow(){ const x=X(ph), w=tlWrap.clientWidth; if(x>w-40||x<0) tlWrap.scrollLeft=Math.max(0,ph*pps-60); }
  function play(){ if(!ready) return; const c=TM.cutAt(ph); if(c) ph=c[1]; if(ph>=M.dur-0.05) ph=TM.keep.length?TM.keep[0][0]:0; audio.currentTime=ph;
    audio.play().then(()=>{ playing=true; refresh(); loop(); }).catch(()=>toast('The browser wouldn’t play the sound.','warn')); }
  function pause(){ playing=false; cancelAnimationFrame(raf); if(audio) audio.pause(); refresh(); }
  function loop(){ if(!playing||closed) return; ph=audio.currentTime; const c=TM.cutAt(ph); if(c){ if(c[1]>=M.dur-0.01){ ph=M.dur; pause(); return; } audio.currentTime=ph=c[1]; }
    if(audio.ended||ph>=M.dur){ pause(); return; } follow(); timeLbl.textContent=`${lecFmt(TM.toProg(ph))} / ${lecFmt(TM.len)}`; drawTl(); drawPv(); raf=requestAnimationFrame(loop); }

  /* ---- pointer on the timeline ---- */
  let drag=null;
  const rowAt=y=>y<ROW.slides[0]?'ruler':y<ROW.audio[0]?'slides':y<ROW.ink[0]?'audio':'ink';
  const strokeAt=(x,y)=>{ const l=Math.floor((y-ROW.ink[0]-3)/LANE); for(const s of M.strokes){ if((lanes.get(s.id)||0)!==l) continue; const sp=lecSpan(s,E); if(!sp) continue; if(x>=X(sp.s)-4&&x<=Math.max(X(sp.s)+3,X(sp.e))+4) return s; } return null; };
  tl.addEventListener('pointerdown',e=>{ const r=tl.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top, t=Tx(x), row=rowAt(y); tl.focus(); tl.setPointerCapture(e.pointerId);
    if(row==='ink'){ const s=strokeAt(x,y); if(s){ const sp=lecSpan(s,E); const near=Math.abs(x-X(sp.s))<=6?'s':Math.abs(x-X(sp.e))<=6?'e':null; sel={kind:'stroke',id:s.id}; range=null;
        if(near) drag={kind:'edge',s,end:near,before:JSON.stringify(E),moved:false}; else { if(t<sp.s||t>=sp.e) seek(Math.min(sp.e-0.01,Math.max(sp.s,t))); } refresh(); return; } }
    if(row==='audio'||row==='ink'){ const c=TM.cutAt(t); if(c&&row==='audio'){ sel={kind:'cut',c}; range=null; refresh(); return; } drag={kind:'range',x0:x,t0:t}; sel=null; return; }
    drag={kind:'seek'}; sel=null; range=null; seek(t); });
  tl.addEventListener('pointermove',e=>{ const r=tl.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
    if(!drag){ let cur=''; if(rowAt(y)==='ink'){ const s=strokeAt(x,y); if(s){ const sp=lecSpan(s,E); cur=(Math.abs(x-X(sp.s))<=6||Math.abs(x-X(sp.e))<=6)?'ew-resize':'pointer'; } } else if(rowAt(y)==='audio') cur='text'; tl.style.cursor=cur; return; }
    const t=Tx(x); if(drag.kind==='seek'){ seek(t); return; }
    if(drag.kind==='range'){ if(Math.abs(x-drag.x0)>3){ range=[drag.t0,t]; refresh(); } return; }
    if(drag.kind==='edge'){ const s=drag.s, o=E.ink[s.id]||(E.ink[s.id]={}); const sp=lecSpan(s,E); if(drag.end==='s') o.s=Math.max(0,Math.min(t,sp.e-0.05)); else o.e=Math.min(M.dur,Math.max(t,sp.s+0.05)); drag.moved=true; ph=drag.end==='s'?o.s:Math.max(0,o.e-0.01); layout(); refresh(); } });
  tl.addEventListener('pointerup',e=>{ const d=drag; drag=null; if(!d) return;
    if(d.kind==='range'&&!range){ seek(d.t0); }
    if(d.kind==='edge'&&d.moved){ undo.push(d.before); redo.length=0; TM=lecTime(M,E); persist(); refresh(); } });
  tlWrap.addEventListener('scroll',()=>drawTl());
  tlWrap.addEventListener('wheel',e=>{ if(e.ctrlKey||e.metaKey){ e.preventDefault(); zoom(e.deltaY<0?1.25:0.8); } },{passive:false});
  pv.addEventListener('pointerdown',e=>{ const r=pv.getBoundingClientRect(); const s=lecHit(M,E,ph,(e.clientX-r.left)*S.W/r.width,(e.clientY-r.top)*S.H/r.height); sel=s?{kind:'stroke',id:s.id}:null; if(s) range=null; refresh(); });

  /* ---- keys ---- */
  const kd=e=>{ if($('.modal-bg')||isField(e.target)) return; const k=e.key, mod=e.metaKey||e.ctrlKey; let hit=true;
    if(k===' '){ playing?pause():play(); }
    else if(mod&&k.toLowerCase()==='z'){ e.shiftKey?restore(redo,undo):restore(undo,redo); }
    else if(mod&&k.toLowerCase()==='y'){ restore(redo,undo); }
    else if(k==='Delete'||k==='Backspace'){ if(sel&&sel.kind==='stroke') removeStroke(); else if(range) cutRange(); else if(sel&&sel.kind==='cut') restoreCut(); }
    else if(k==='ArrowLeft'||k==='ArrowRight'){ seek(ph+(k==='ArrowLeft'?-1:1)*(e.shiftKey?5:1)); follow(); }
    else if(k==='Home'){ seek(0); follow(); } else if(k==='End'){ seek(M.dur); follow(); }
    else if(k==='Escape'){ if(sel||range){ sel=null; range=null; refresh(); } else close(); }
    else if(!mod&&(k==='='||k==='+')) zoom(1.6); else if(!mod&&(k==='-'||k==='_')) zoom(1/1.6);
    else hit=false;
    if(hit){ e.preventDefault(); e.stopPropagation(); } };
  document.addEventListener('keydown',kd,true);
  const onResize=()=>{ const keep=pps*M.dur<=tlWrap.clientWidth; if(keep||!pps) fit(); refresh(); }; window.addEventListener('resize',onResize);

  function close(){ if(closed) return; closed=true; pause(); clearTimeout(saveT); rec.edit=E; lecPut('recs',rec).catch(()=>{}); document.removeEventListener('keydown',kd,true); window.removeEventListener('resize',onResize); ov.remove(); if(url) URL.revokeObjectURL(url); }

  async function doExport(){ pause(); if(TM.len<0.5){ toast('Everything is cut. Restore something first.','warn'); return; }
    const prog=progressCard('Making the lecture video'); try{
      const out=await renderLectureVideo(rec,M,E,prog); if(!out) return;
      prog.set(1,'Saving…'); const name=`${(rec.title||baseName()).replace(/[\\/:*?"<>|]+/g,'').trim()||'Lecture'} ${new Date(rec.started).toISOString().slice(0,10)}.${out.ext}`;
      await saveFile(name,out.blob,'Video','.'+out.ext,out.mime);
    }catch(e){ console.error(e); toast(e.message||'The video couldn’t be made.','warn'); } finally{ prog.close(); } }

  layout(); fit(); refresh();
  try{ const blob=await lecAudio(rec); if(closed) return; url=URL.createObjectURL(blob); audio=new Audio(); audio.preload='auto'; audio.src=url;
    await new Promise(ok=>{ audio.addEventListener('loadedmetadata',ok,{once:true}); audio.addEventListener('error',ok,{once:true}); setTimeout(ok,8000); });
    ready=!audio.error; if(!ready) toast('This browser can’t play the recorded sound, but the video can still be exported.','warn'); audio.addEventListener('pause',()=>{ if(playing){ playing=false; refresh(); } });
  }catch(e){ toast(e.message||'Couldn’t read the recorded sound.','warn'); }
  if(!closed) refresh();
}

/* Draws the edited lecture into a video: H.264 + AAC in MP4 where the browser can encode them (Chrome, Edge, Safari),
   otherwise VP9 + Opus in WebM. Frames are drawn only when something changes, plus one a second. */
async function renderLectureVideo(rec,M,E,prog){
  const MB=await loadMediabunny(); const TM=lecTime(M,E);
  const sc=Math.min(1920/S.W,1080/S.H), W=Math.round(S.W*sc/2)*2, H=Math.round(S.H*sc/2)*2;
  let fmt='mp4', vc='avc'; if(!await MB.canEncodeVideo('avc',{width:W,height:H})){ fmt='webm'; vc=await MB.canEncodeVideo('vp9',{width:W,height:H})?'vp9':'vp8'; if(!await MB.canEncodeVideo(vc,{width:W,height:H})) throw new Error('This browser can’t make video files. Use a recent Chrome, Edge or Safari.'); }
  let ac=null; for(const c of fmt==='mp4'?['aac','opus']:['opus']) if(await MB.canEncodeAudio(c,{numberOfChannels:1,sampleRate:48000})){ ac=c; break; }
  if(!ac) throw new Error('This browser can’t encode the sound for a video file.');
  const audioBlob=await lecAudio(rec); const input=new MB.Input({source:new MB.BlobSource(audioBlob),formats:MB.ALL_FORMATS}); const at=await input.getPrimaryAudioTrack(); if(!at) throw new Error('This recording has no sound.');
  // slide pictures at video size
  const states=new Map(), need=e=>{ if(e&&!e[4]&&S.slides[e[2]]) states.set(e[2]+':'+lecK(e[3]),[e[2],lecK(e[3])]); };
  for(let i=0;i<M.ss.length;i++){ const a=M.ss[i][1], b=i+1<M.ss.length?M.ss[i+1][1]:M.dur; if(TM.keep.some(k=>k[0]<b&&k[1]>a)){ need(M.ss[i]); need(M.ss[i-1]); } }
  const pics=new Map(); let n=0; if(document.fonts) await document.fonts.ready;
  for(const [key,[h,k]] of states){ if(prog.cancelled) return null; prog.set(0.15*n/states.size,`Drawing slides (${++n} of ${states.size})`); await tick(); if(S.slides[h]) pics.set(key,await slideCanvas(S.slides[h],k,sc)); }
  const bmp=(h,k)=>pics.get(h+':'+k)||null;
  // when to draw a frame (recording times)
  const ts=new Set(); const add=t=>{ if(t>=0&&t<M.dur&&!TM.cutAt(t)) ts.add(Math.round(t*1000)); };
  for(const k of TM.keep){ for(let t=k[0];t<k[1];t+=1) add(t); add(k[0]); }
  for(const e of M.ss){ for(let j=0;j<=Math.ceil(LEC_FADE*30)+1;j++) add(e[1]+j/30); }
  for(const s of M.strokes){ const sp=lecSpan(s,E); if(!sp) continue; for(let j=0;j<=Math.ceil(LEC_DRAW*30)+1;j++) add(sp.s+j/30); add(sp.e); }
  for(const l of M.lz){ add(l[1]); add(l[1]+LEC_LASER); }
  const frames=[...ts].sort((a,b)=>a-b).map(x=>x/1000); const pt=[]; let last=-1; for(const t of frames){ const p=Math.round(TM.toProg(t)*1000)/1000; if(p>last+0.0005){ pt.push([t,p]); last=p; } }
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const g=cv.getContext('2d',{alpha:false});
  const out=new MB.Output({format:fmt==='mp4'?new MB.Mp4OutputFormat({fastStart:'in-memory'}):new MB.WebMOutputFormat(),target:new MB.BufferTarget()});
  const vs=new MB.CanvasSource(cv,{codec:vc,bitrate:MB.QUALITY_MEDIUM,keyFrameInterval:2}); out.addVideoTrack(vs,{frameRate:30});
  const as=new MB.AudioSampleSource({codec:ac,bitrate:128000}); out.addAudioTrack(as);
  await out.start();
  const it=new MB.AudioSampleSink(at).samples()[Symbol.asyncIterator](); let nx=await it.next();
  const pump=async upto=>{ while(!nx.done&&nx.value.timestamp<=upto){ const smp=nx.value, a0=smp.timestamp, d=smp.duration, sr=smp.sampleRate, nf=smp.numberOfFrames;
      for(const k of TM.keep){ const s0=Math.max(k[0],a0), s1=Math.min(k[1],a0+d); if(s1<=s0) continue; const f0=Math.max(0,Math.round((s0-a0)*sr)), f1=Math.min(nf,Math.round((s1-a0)*sr)); if(f1<=f0) continue;
        const part=f0===0&&f1===nf?smp.clone():smp.trim(f0,f1); part.setTimestamp(TM.toProg(s0)); await as.add(part); part.close(); }
      smp.close(); nx=await it.next(); } };
  try{
    for(let i=0;i<pt.length;i++){ if(prog.cancelled){ await out.cancel(); return null; } const [t,p]=pt[i], next=i+1<pt.length?pt[i+1][1]:TM.len;
      await pump(t+1); lecDraw(g,W,H,M,E,t,bmp,null); await vs.add(p,Math.max(0.001,next-p));
      if(i%20===0){ prog.set(0.15+0.85*p/Math.max(1,TM.len),`${lecFmt(p)} of ${lecFmt(TM.len)}`); await tick(); } }
    await pump(Infinity); vs.close(); as.close(); prog.set(1,'Finishing…'); await out.finalize();
  }finally{ try{ input.dispose&&input.dispose(); }catch(_){} }
  return {blob:new Blob([out.target.buffer],{type:fmt==='mp4'?'video/mp4':'video/webm'}),ext:fmt,mime:fmt==='mp4'?'video/mp4':'video/webm'};
}
