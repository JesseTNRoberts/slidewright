/* Slidewright: ink. Part of the app; the files in js/ load in order and share one scope (see js/README.md). */
'use strict';
/* ======================= live presenting tools (injected only into presented copies) ======================= */
function inkScript(cfg){ return '<script>('+function(cfg){
  function start(){
    var R=window.Reveal; if(!R||!R.isReady||!R.isReady()){ setTimeout(start,150); return; }
    var W=R.getConfig().width||1280, H=R.getConfig().height||720, NS='http://www.w3.org/2000/svg';
    var slides=document.querySelector('.reveal .slides'); if(!slides) return;
    var svg=document.createElementNS(NS,'svg'); svg.setAttribute('class','sw-ink'); svg.setAttribute('viewBox','0 0 '+W+' '+H); svg.setAttribute('aria-hidden','true');
    svg.style.cssText='position:absolute;left:0;top:0;width:'+W+'px;height:'+H+'px;z-index:60;pointer-events:none;overflow:visible;touch-action:none';
    var g=document.createElementNS(NS,'g'), hl=document.createElementNS(NS,'g'); hl.setAttribute('style','mix-blend-mode:multiply'); svg.appendChild(hl); svg.appendChild(g);
    var dot=document.createElementNS(NS,'circle'); dot.setAttribute('r','9'); dot.setAttribute('fill','#FF2D2D'); dot.setAttribute('style','filter:drop-shadow(0 0 6px rgba(255,45,45,.9));opacity:0;transition:opacity .25s'); svg.appendChild(dot);
    slides.appendChild(svg);
    var store={}, tool=null, color=cfg.colors[0], cur=null, subs=[], laserT=null;
    var key=function(){var i=R.getIndices(); return i.h+'.'+(i.v||0);};
    var list=function(){var k=key(); return store[k]||(store[k]=[]);};
    var dOf=function(pts){ if(pts.length===1) return 'M'+pts[0][0]+' '+pts[0][1]+'l0.01 0'; var d='M'+pts[0][0]+' '+pts[0][1]; for(var i=1;i<pts.length;i++){ var p=pts[i-1], q=pts[i]; d+=' Q'+p[0]+' '+p[1]+' '+((p[0]+q[0])/2).toFixed(1)+' '+((p[1]+q[1])/2).toFixed(1);} return d; };
    var pathEl=function(s){ var p=document.createElementNS(NS,'path'); p.setAttribute('d',dOf(s.pts)); p.setAttribute('fill','none'); p.setAttribute('stroke',s.color); p.setAttribute('stroke-width',s.tool==='hl'?22:4); p.setAttribute('stroke-linecap','round'); p.setAttribute('stroke-linejoin','round'); if(s.tool==='hl') p.setAttribute('stroke-opacity','0.4'); return p; };
    var markup=function(){ return list().map(function(s){ var p=pathEl(s); return p.outerHTML; }).join(''); };
    var notify=function(){ subs.forEach(function(f){ try{f();}catch(e){} }); };
    var redraw=function(){ g.textContent=''; hl.textContent=''; list().forEach(function(s){ (s.tool==='hl'?hl:g).appendChild(pathEl(s)); }); notify(); };
    var api={
      setTool:function(t){ tool=(tool===t?null:t); svg.style.pointerEvents=(tool==='pen'||tool==='hl')?'auto':'none'; svg.style.cursor=tool?'crosshair':''; if(tool!=='laser') dot.style.opacity=0; sync(); notify(); return tool; },
      getTool:function(){return tool;}, setColor:function(c){color=c; sync(); notify();}, getColor:function(){return color;},
      begin:function(x,y){ if(tool!=='pen'&&tool!=='hl') return; cur={tool:tool,color:tool==='hl'?cfg.hl:color,pts:[[+x.toFixed(1),+y.toFixed(1)]]}; cur.el=pathEl(cur); (tool==='hl'?hl:g).appendChild(cur.el); },
      move:function(x,y){ if(!cur) return; var l=cur.pts[cur.pts.length-1]; if(Math.hypot(l[0]-x,l[1]-y)<1.5) return; cur.pts.push([+x.toFixed(1),+y.toFixed(1)]); cur.el.setAttribute('d',dOf(cur.pts)); },
      end:function(){ if(!cur) return; list().push({tool:cur.tool,color:cur.color,pts:cur.pts}); cur=null; notify(); },
      laser:function(x,y){ dot.setAttribute('cx',x); dot.setAttribute('cy',y); dot.style.opacity=1; clearTimeout(laserT); laserT=setTimeout(function(){dot.style.opacity=0;},1500); },
      clear:function(){ store[key()]=[]; redraw(); }, undo:function(){ list().pop(); redraw(); },
      markup:markup, onchange:function(f){subs.push(f);}, size:[W,H],
      dump:function(){ return JSON.stringify(store); }, load:function(j){ try{ store=JSON.parse(j)||{}; }catch(e){} redraw(); }
    };
    window.SW_ink=api;
    var pt=function(e){ var r=svg.getBoundingClientRect(); return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]; };
    svg.addEventListener('pointerdown',function(e){ if(tool!=='pen'&&tool!=='hl') return; e.preventDefault(); e.stopPropagation(); svg.setPointerCapture(e.pointerId); var p=pt(e); api.begin(p[0],p[1]); });
    svg.addEventListener('pointermove',function(e){ if(!cur) return; var p=pt(e); api.move(p[0],p[1]); });
    ['pointerup','pointercancel'].forEach(function(t){ svg.addEventListener(t,function(){ api.end(); }); });
    ['touchstart','touchmove','click','mousedown'].forEach(function(t){ svg.addEventListener(t,function(e){ if(tool) e.stopPropagation(); },{passive:true}); });
    document.addEventListener('pointermove',function(e){ if(tool!=='laser') return; var p=pt(e); api.laser(p[0],p[1]); });
    R.on('slidechanged',redraw);
    window.addEventListener('keydown',function(e){ if(e.metaKey||e.ctrlKey||e.altKey) return; var k=e.key.toLowerCase(), hit=true;
      if(k==='d') api.setTool('pen'); else if(k==='m') api.setTool('hl'); else if(k==='r') api.setTool('laser'); else if(k==='e') api.clear();
      else if(k==='c'){ var i=cfg.colors.indexOf(color); api.setColor(cfg.colors[(i+1)%cfg.colors.length]); } else if(e.key==='Escape'&&tool) api.setTool(tool); else hit=false;
      if(hit){ e.preventDefault(); e.stopImmediatePropagation(); } },true);
    // on-screen toolbar
    var bar=null, btns={};
    function sync(){ if(!bar) return; for(var t in btns) btns[t].setAttribute('aria-pressed',String(tool===t)); bar.querySelectorAll('[data-c]').forEach(function(b){ b.setAttribute('aria-pressed',String(b.dataset.c===color)); }); }
    if(cfg.toolbar){
      bar=document.createElement('div'); bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Presenting tools');
      bar.style.cssText='position:fixed;left:12px;bottom:12px;z-index:100;display:flex;gap:4px;align-items:center;padding:6px;background:rgba(22,24,29,.88);border-radius:10px;font:13px system-ui,sans-serif;color:#fff;opacity:.18;transition:opacity .2s';
      bar.addEventListener('mouseenter',function(){bar.style.opacity=1;}); bar.addEventListener('mouseleave',function(){bar.style.opacity=tool?.75:.18;});
      var mk=function(label,title,fn,t){ var b=document.createElement('button'); b.type='button'; b.textContent=label; b.title=title; b.style.cssText='border:0;border-radius:6px;padding:6px 9px;background:transparent;color:#fff;cursor:pointer;font:inherit'; b.onclick=function(e){e.stopPropagation(); fn(); bar.style.opacity=tool?.75:1;}; if(t) btns[t]=b; bar.appendChild(b); return b; };
      mk('✎ Pen','Draw (D)',function(){api.setTool('pen');},'pen'); mk('▮ Marker','Highlight (M)',function(){api.setTool('hl');},'hl'); mk('● Laser','Laser pointer (R)',function(){api.setTool('laser');},'laser');
      cfg.colors.forEach(function(c){ var b=document.createElement('button'); b.type='button'; b.dataset.c=c; b.title='Pen colour (C cycles)'; b.style.cssText='width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:'+c+';cursor:pointer;margin:0 2px'; b.onclick=function(e){e.stopPropagation(); api.setColor(c);}; bar.appendChild(b); });
      mk('↶','Undo last stroke',function(){api.undo();}); mk('⌫ Clear','Clear this slide (E)',function(){api.clear();}); mk('■ Blank','Black screen (B)',function(){R.togglePause();});
      var st=document.createElement('style'); st.textContent='[role=toolbar] button[aria-pressed=true]{background:rgba(255,255,255,.22)!important;border-color:#fff!important}'; document.head.appendChild(st);
      document.body.appendChild(bar); sync();
    }
  }
  if(document.readyState==='complete') start(); else window.addEventListener('load',start);
}.toString()+')('+JSON.stringify(cfg)+');<\/script>'; }
const HIST_SHIM='<script>(function(){try{if(/^about:/.test(location.href)){["replaceState","pushState"].forEach(function(n){var f=history[n].bind(history);history[n]=function(){try{return f.apply(null,arguments);}catch(e){}};});}}catch(e){}})();<\/script>';
function presentHTML(opts){ let html=serialize(); const h=html.search(/<head[^>]*>/i); if(h>=0){const e=html.indexOf('>',h)+1; html=html.slice(0,e)+HIST_SHIM+html.slice(e);} const i=html.lastIndexOf('</body>'); const inj='<style>.sw-present{display:none!important}</style>'+inkScript({toolbar:!!opts.toolbar,colors:['#E0407A','#2557D6','#16181D','#1C7A4C'],hl:'#FFD400'}); return i<0?html+inj:html.slice(0,i)+inj+html.slice(i); }
