// extras.js — student extras added to every exported deck:
//   * a "Download slides as PDF" button on the title slide. The PDF is made in the browser
//     (no print dialog): one 1280x720 page per slide, each slide as it looks after its last click.
//   * a small copyright line on every slide.
//   * Ctrl/Cmd+P prints one slide-sized page per slide, last click step only (reveal's own
//     letter-paper print stylesheet is removed).
// Both the button and the copyright line find a free spot on their slide when the deck loads,
// so they never sit on top of slide content.
//
// Used by build.js (new exports) and add-extras.js (decks exported before 1.5).
const fs = require('fs');
const path = require('path');

const DEFAULT_HOLDER = 'Dr. Jesse Roberts';

const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noClose = s => s.replace(/<\/script/gi, '<\\/script');

// Rules that lay every slide out at full size in its final click state (Ctrl/Cmd+P).
const PRINT_CSS = `
@media print{
@page{size:1280px 720px;margin:0}
html,body,.reveal-viewport{width:1280px!important;height:auto!important;overflow:visible!important;margin:0!important;padding:0!important;background:#FBFBFA!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.reveal{position:static!important;width:1280px!important;height:auto!important;overflow:visible!important}
.reveal .slides{position:static!important;inset:auto!important;transform:none!important;zoom:1!important;width:1280px!important;height:auto!important;margin:0!important;overflow:visible!important;perspective:none!important}
.reveal .slides>section{display:block!important;position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;width:1280px!important;height:720px!important;overflow:hidden!important;transition:none!important;break-after:page;page-break-after:always;break-inside:avoid}
.reveal .slides>section:last-child{break-after:auto;page-break-after:auto}
.reveal .slides section .fragment{opacity:1!important;visibility:visible!important;transition:none!important}
.reveal [data-pos]{transition:none!important}
.reveal .controls,.reveal .progress,.reveal .backgrounds,.reveal .slide-number,.reveal .speaker-notes,.reveal .aria-status,.pdf-get{display:none!important}
}`;

const CSS = `
/* ---- Download-as-PDF button (title slide only) ---- */
.reveal .slides section > div.pdf-get{position:absolute;left:auto;top:auto;right:64px;bottom:64px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;z-index:5}
.reveal button.pdf-btn{display:inline-flex;align-items:center;gap:12px;padding:12px 20px 12px 16px;border:1.5px solid #16181D;border-radius:6px;background:#FBFBFA;color:#16181D;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:500;line-height:1;transition:background-color .15s,border-color .15s,color .15s,box-shadow .15s}
.reveal button.pdf-btn svg{width:22px;height:22px;flex:none}
@media (pointer:coarse){.reveal button.pdf-btn{font-size:30px;gap:18px;padding:22px 34px 22px 28px;border-width:2.5px;border-radius:10px}.reveal button.pdf-btn svg{width:38px;height:38px}.reveal .pdf-note{font-size:20px;line-height:24px}}
.reveal button.pdf-btn .page{fill:#FBFBFA;stroke:currentColor;transition:fill .15s}
.reveal button.pdf-btn:hover{background:#DCE5FA;border-color:#2557D6;color:#1B3F9E;box-shadow:0 2px 0 #2557D6}
.reveal button.pdf-btn:hover .page{fill:#FFFFFF}
.reveal button.pdf-btn:focus-visible{outline:3px solid #2557D6;outline-offset:3px}
.reveal .pdf-note{font-family:'IBM Plex Mono',monospace;font-size:13px;line-height:16px;color:#5A5F6B}
.reveal .slides section:not(.present) > div.pdf-get{visibility:hidden}
:fullscreen .pdf-get,html.print-pdf .pdf-get{display:none!important}
/* ---- Copyright line (every slide) ---- */
.reveal .slides section > div.slide-copy{position:absolute;left:64px;top:694px;font-family:'IBM Plex Mono',monospace;font-size:11px;line-height:14px;letter-spacing:.02em;color:#5A5F6B;white-space:nowrap;pointer-events:none;z-index:4}
/* ---- Progress card while the PDF is made ---- */
#pdf-progress{position:fixed;z-index:1000;right:24px;bottom:24px;display:flex;font-family:'IBM Plex Sans',sans-serif;color:#16181D}
#pdf-progress[hidden]{display:none}
#pdf-progress .card{display:flex;flex-direction:column;gap:12px;width:300px;padding:20px 24px;background:#FFFFFF;border:1px solid #DADDE2;border-radius:10px;box-shadow:0 12px 32px rgba(22,24,29,.10)}
#pdf-progress .ttl{font-size:18px;font-weight:600}
#pdf-progress .track{height:6px;border-radius:3px;background:#DADDE2;overflow:hidden}
#pdf-progress .track i{display:block;height:100%;width:0;background:#2557D6;transition:width .2s}
#pdf-progress .count{font-family:'IBM Plex Mono',monospace;font-size:13px;color:#5A5F6B}
#pdf-progress.error .count{color:#8A3A0A}
${PRINT_CSS}
`;

const BUTTON = `<div class="pdf-get">
<button class="pdf-btn" type="button">
<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="page" d="M6 2.75h8l4 4V21.25H6z"/><path d="M14 2.75v4h4" stroke="currentColor"/><path d="M12 10v7m-3-3 3 3 3-3" stroke="currentColor"/></svg>
Download slides as PDF</button>
<span class="pdf-note">All slides, one per page</span>
</div>`;

// Screen readers hear the notice once (title slide), not on every slide.
const copyright = (n, holder, year) =>
  '<div class="slide-copy"' + (n === 1 ? '' : ' aria-hidden="true"') + '>&copy; ' + esc(year) + ' ' + esc(holder) + '</div>';

const RUNTIME = String.raw`
(function(){
/* Reveal's own print stylesheet (Ctrl/Cmd+P without ?print-pdf) puts slides on letter paper; remove it. */
[].forEach.call(document.styleSheets, function(sh){ var r; try{ r=sh.cssRules; }catch(e){ return; }
  for(var i=r.length-1;i>=0;i--){ if(r[i].media && /print/.test(r[i].media.mediaText) && r[i].cssText.indexOf('not(.print-pdf)')>-1) sh.deleteRule(i); } });

/* Top-level slides, also when reveal wraps them (scroll view) */
function slideList(){ return [].filter.call(document.querySelectorAll('.reveal .slides section'), function(s){ return !s.parentElement.closest('section'); }); }
/* Moving elements at their last-step positions, as after the final click. */
function finalSteps(scope){
  var secs = scope ? [scope] : slideList();
  secs.forEach(function(sec){
    var k=0; sec.querySelectorAll('.fragment[data-fragment-index]').forEach(function(f){ k=Math.max(k, +f.dataset.fragmentIndex+1); });
    sec.querySelectorAll('[data-pos]').forEach(function(m){
      var pos=JSON.parse(m.dataset.pos), best=null, bs=-1;
      Object.keys(pos).forEach(function(s){ s=+s; if(s<=k && s>bs){ bs=s; best=pos[s]; } });
      if(best===null) return;
      var p=best.split(','); m.style.left=p[0]+'px'; m.style.top=p[1]+'px'; if(p.length>3){ m.style.width=p[2]+'px'; m.style.height=p[3]+'px'; }
    });
  });
}
window.addEventListener('beforeprint', function(){ finalSteps(); });
window.addEventListener('afterprint', function(){ if(window.syncSteps) window.syncSteps(); });

/* ---------- placement: put the button and copyright line where no slide content is ---------- */
function obstacles(sec){
  var sr=sec.getBoundingClientRect(), k=sr.width/1280||1, out=[];
  function add(r){ if(r.width<1||r.height<1) return;
    var o={l:(r.left-sr.left)/k, t:(r.top-sr.top)/k, r:(r.right-sr.left)/k, b:(r.bottom-sr.top)/k};
    if(o.r-o.l>1200 && o.b-o.t>640) return; // the slide's own background
    out.push(o); }
  sec.querySelectorAll('*').forEach(function(e){
    if(e.closest('.pdf-get,.slide-copy,defs,marker,clipPath,mask,symbol,pattern')) return;
    var tag=e.tagName.toLowerCase();
    [].forEach.call(e.childNodes, function(n){ if(n.nodeType===3 && n.textContent.trim()){ var rg=document.createRange(); rg.selectNodeContents(n); [].forEach.call(rg.getClientRects(), add); } });
    if(e instanceof SVGElement){ if(tag!=='svg' && tag!=='g' && e.getBoundingClientRect) add(e.getBoundingClientRect()); return; }
    if(tag==='img'||tag==='canvas'||tag==='video'||tag==='iframe'){ add(e.getBoundingClientRect()); return; }
    var cs=getComputedStyle(e);
    if(cs.backgroundColor!=='rgba(0, 0, 0, 0)' || cs.backgroundImage!=='none' || parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) || parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth)) add(e.getBoundingClientRect());
  });
  return out;
}
function isFree(x,y,w,h,obs,m){ return obs.every(function(o){ return x+w+m<=o.l || x-m>=o.r || y+h+m<=o.t || y-m>=o.b; }); }
function place(el,x,y){ el.style.left=x+'px'; el.style.top=y+'px'; el.style.right='auto'; el.style.bottom='auto'; }
function placeExtras(){
  slideList().forEach(function(sec){
    var btn=sec.querySelector(':scope > .pdf-get'), cp=sec.querySelector(':scope > .slide-copy');
    if(!btn && !cp) return;
    var saved=sec.style.display; sec.style.display='block';
    var obs=obstacles(sec);
    if(btn){
      var w=btn.offsetWidth, h=btn.offsetHeight, spot=null;
      [1280-64-w, 64, 1280-24-w, 24].some(function(x){ for(var y=720-40-h; y>=40; y-=8){ if(isFree(x,y,w,h,obs,20)){ spot=[x,y]; return true; } } return false; });
      btn.dataset.placed=spot?'ok':'fallback'; spot=spot||[1280-64-w, 720-40-h];
      place(btn, spot[0], spot[1]); obs.push({l:spot[0], t:spot[1], r:spot[0]+w, b:spot[1]+h});
    }
    if(cp){
      var w2=cp.offsetWidth, h2=cp.offsetHeight, pick=null;
      [[64,720-12-h2],[1280-64-w2,720-12-h2],[24,720-8-h2],[1280-24-w2,720-8-h2],[1280-64-w2,12],[64,12]].some(function(p){
        if(isFree(p[0],p[1],w2,h2,obs,6)){ pick=p; return true; } return false; });
      cp.dataset.placed=pick?'ok':'fallback'; pick=pick||[64,720-12-h2];
      place(cp, pick[0], pick[1]);
    }
    sec.style.display=saved;
  });
  document.documentElement.dataset.extrasPlaced='1';
}

/* ---------- PDF download ---------- */
var pdfCSS=null;
function collectCSS(){
  var faces=[], rest=[];
  [].forEach.call(document.styleSheets, function(sh){ var r; try{ r=sh.cssRules; }catch(e){ return; }
    [].forEach.call(r, function(rule){
      if(rule.type===5){ // @font-face, kept per slide by the characters it uses
        var ranges=(rule.style.getPropertyValue('unicode-range')||'U+0-10FFFF').split(',').map(function(x){
          var m=x.trim().replace(/^U\+/i,'').split('-'); var lo=parseInt(m[0].replace(/\?/g,'0'),16), hi=m[1]?parseInt(m[1],16):parseInt(m[0].replace(/\?/g,'F'),16); return [lo,hi]; });
        faces.push({css:rule.cssText, ranges:ranges});
      } else if(!(rule.media && /print/.test(rule.media.mediaText))) rest.push(rule.cssText);
    });
  });
  rest.push(
    '.reveal{position:relative;width:1280px;height:720px;overflow:hidden;background:#FBFBFA}',
    '.reveal .slides{position:static!important;inset:auto!important;transform:none!important;zoom:1!important;width:1280px!important;height:720px!important;margin:0!important;pointer-events:auto}',
    '.reveal .slides>section{display:block!important;position:relative!important;inset:auto!important;transform:none!important;opacity:1!important;visibility:visible!important;width:1280px!important;height:720px!important;overflow:hidden!important}',
    '.reveal .slides section .fragment{opacity:1!important;visibility:visible!important}',
    '.reveal *{transition:none!important;animation:none!important}',
    '.pdf-get{display:none!important}');
  return {faces:faces, rest:rest.join('\n')};
}
function facesFor(text){
  var cps={32:1}; for(var ch of text){ cps[ch.codePointAt(0)]=1; }
  var list=Object.keys(cps).map(Number);
  return pdfCSS.faces.filter(function(f){ return list.some(function(c){ return f.ranges.some(function(r){ return c>=r[0] && c<=r[1]; }); }); })
    .map(function(f){ return f.css; }).join('\n');
}
var pdfCanvas=null;
var isSafari=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
async function slideToCanvas(sec){
  var clone=sec.cloneNode(true);
  clone.querySelectorAll('.pdf-get').forEach(function(n){ n.remove(); });
  clone.className='present'; clone.removeAttribute('style'); clone.removeAttribute('hidden'); clone.removeAttribute('aria-hidden');
  finalSteps(clone);
  var wrap=document.createElement('div'); wrap.className='reveal';
  var style=document.createElement('style'); style.textContent=facesFor(sec.textContent)+'\n'+pdfCSS.rest; wrap.appendChild(style);
  var slides=document.createElement('div'); slides.className='slides'; slides.appendChild(clone); wrap.appendChild(slides);
  var xhtml=new XMLSerializer().serializeToString(wrap);
  if(xhtml.slice(0, xhtml.indexOf('>')).indexOf('xmlns=')<0) xhtml=xhtml.replace(/^<div /,'<div xmlns="http://www.w3.org/1999/xhtml" ');
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><foreignObject x="0" y="0" width="1280" height="720">'+xhtml+'</foreignObject></svg>';
  var img=new Image(); img.decoding='sync';
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); // a data URL keeps the canvas exportable
  await new Promise(function(ok,bad){ img.onload=ok; img.onerror=function(){ bad(new Error('slide image failed to load')); }; });
  var c=pdfCanvas||(pdfCanvas=document.createElement('canvas')); c.width=2560; c.height=1440;
  var g=c.getContext('2d'); g.fillStyle='#FBFBFA'; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height);
  if(isSafari){ await new Promise(function(r){ setTimeout(r,120); }); g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); }
  return c;
}
function progressCard(){
  var ov=document.getElementById('pdf-progress');
  if(!ov){ ov=document.createElement('div'); ov.id='pdf-progress'; ov.setAttribute('role','status'); ov.setAttribute('aria-live','polite'); ov.hidden=true;
    ov.innerHTML='<div class="card"><div class="ttl">Making your PDF</div><div class="track"><i></i></div><div class="count"></div></div>';
    document.body.appendChild(ov); }
  return ov;
}
async function downloadDeck(){
  if(downloadDeck.busy) return; downloadDeck.busy=true;
  var ov=progressCard(), bar=ov.querySelector('.track i'), lab=ov.querySelector('.count');
  var secs=slideList();
  ov.classList.remove('error'); lab.textContent='Preparing…'; bar.style.width='0'; ov.hidden=false;
  try{
    if(document.fonts) await document.fonts.ready;
    pdfCSS=pdfCSS||collectCSS();
    var pdf=new jspdf.jsPDF({orientation:'landscape', unit:'px', format:[1280,720], hotfixes:['px_scaling'], compress:true});
    for(var i=0;i<secs.length;i++){
      lab.textContent='Slide '+(i+1)+' of '+secs.length; bar.style.width=(100*i/secs.length)+'%';
      await new Promise(function(r){ setTimeout(r,0); });
      var c=await slideToCanvas(secs[i]);
      if(i) pdf.addPage([1280,720], 'landscape');
      pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 1280, 720, undefined, 'FAST');
    }
    bar.style.width='100%'; lab.textContent='Saving…';
    pdf.setProperties({title: document.title});
    var name=(document.title||'slides').replace(/[‒-―]/g,'-').normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,' ').trim()||'slides';
    pdf.save(name+'.pdf');
    await new Promise(function(r){ setTimeout(r,600); });
  }catch(e){
    console.error(e); ov.classList.add('error');
    lab.textContent='Couldn’t make the PDF on this device. Try again, or use a computer.';
    await new Promise(function(r){ setTimeout(r,4000); });
  }finally{ if(pdfCanvas){ pdfCanvas.width=0; pdfCanvas.height=0; pdfCanvas=null; } ov.hidden=true; downloadDeck.busy=false; }
}
window.downloadDeck=downloadDeck;
document.querySelectorAll('.pdf-btn').forEach(function(b){ b.addEventListener('click', downloadDeck); });

function start(){ (document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){ requestAnimationFrame(placeExtras); }); }
if(window.Reveal && Reveal.isReady && Reveal.isReady()) start(); else Reveal.on('ready', start);
})();
`;

function jspdfScript() {
  const f = path.join(__dirname, '..', 'vendor/jspdf-2.5.1/jspdf.umd.min.js');   // Slidewright's copy
  return '<script>\n' + noClose(fs.readFileSync(f, 'utf8')) + '\n</script>';
}
const runtimeScript = () => '<script>\n' + RUNTIME + '\n</script>';

// Command-line options shared by convert.js / build.js / add-extras.js:
//   --copyright="Name"   holder shown on every slide (default: Dr. Jesse Roberts)
//   --year=2026          year shown (default: the current year)
//   --no-copyright       leave the copyright line out
//   --no-pdf             leave the download button out
function options(argv) {
  const get = k => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
  return {
    holder: get('copyright') || DEFAULT_HOLDER,
    year: get('year') || String(new Date().getFullYear()),
    copyright: !argv.includes('--no-copyright'),
    pdf: !argv.includes('--no-pdf')
  };
}

// Patch an already exported deck (its <section>s must be direct children of .slides).
function apply(html, opt) {
  if (/class="(pdf-get|slide-copy)"/.test(html)) throw new Error('this deck already has the PDF button or copyright line');
  const he = html.indexOf('</head>');
  const se = html.lastIndexOf('</style>', he);
  if (he < 0 || se < 0) throw new Error('no <style> in <head>');
  html = html.slice(0, se) + CSS + '\n' + html.slice(se);
  const start = html.indexOf('<div class="slides">');
  const end = html.lastIndexOf('</section>') + '</section>'.length;
  if (start < 0 || end < start) throw new Error('no reveal slides found');
  let n = 0;
  const body = html.slice(start, end).replace(/<\/section>/g, () => {
    n++;
    return (n === 1 && opt.pdf ? BUTTON + '\n' : '') + (opt.copyright ? copyright(n, opt.holder, opt.year) + '\n' : '') + '</section>';
  });
  html = html.slice(0, start) + body + html.slice(end);
  // reveal switches phones held upright (< 435px wide) to a scroll view; keep the normal slide view
  // (the deck's own call is the last one; reveal's library code contains the same text earlier)
  const init = html.lastIndexOf('Reveal.initialize({');
  if (init > -1 && html.slice(init, init + 400).indexOf('scrollActivationWidth') < 0)
    html = html.slice(0, init) + 'Reveal.initialize({scrollActivationWidth:null,' + html.slice(init + 'Reveal.initialize({'.length);
  const bodyEnd = html.lastIndexOf('</body>');
  html = html.slice(0, bodyEnd) + jspdfScript() + '\n' + runtimeScript() + '\n' + html.slice(bodyEnd);
  return { html, slides: n };
}

module.exports = { CSS, BUTTON, copyright, jspdfScript, runtimeScript, options, apply, DEFAULT_HOLDER };
