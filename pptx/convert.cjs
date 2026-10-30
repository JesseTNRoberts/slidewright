#!/usr/bin/env node
// Convert a PowerPoint file to a Slidewright (reveal.js) deck.
//
//   node pptx/convert.cjs talk.pptx [out.html] [--pdf-button] [--copyright="Name"] [--no-present] [--source=owner/repo@branch:path]
//
// Needs only Node 18+: the zip and XML readers come from vendor/. The deck is self-contained (pictures,
// video and reveal.js inside). Prints what couldn't be converted.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const JSZip = require(path.join(ROOT, 'vendor/jszip-3.10.1/jszip.min.js'));
const { DOMParser } = require(path.join(ROOT, 'vendor/xmldom-0.8.10/index.js'));
const { convert } = require('./pptx2reveal.js');
const args = process.argv.slice(2), pos = args.filter(a => !a.startsWith('--')), get = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
if (!pos[0]) { console.error('usage: node pptx/convert.cjs <file.pptx> [out.html] [--pdf-button] [--copyright="Name"] [--no-present] [--source=owner/repo@branch:path]'); process.exit(2); }
(async () => {
  const input = path.resolve(pos[0]); if (/\.ppt$/i.test(input)) { console.error('Old .ppt files must be saved as .pptx first (File → Save As → PowerPoint Presentation).'); process.exit(1); }
  const out = path.resolve(pos[1] || input.replace(/\.pptx?$/i, '') + '.html');
  const V = p => fs.readFileSync(path.join(ROOT, 'vendor/reveal.js-5.1.0', p), 'utf8');
  const { html, report } = await convert(fs.readFileSync(input), { JSZip, DOMParser, revealCss: V('reveal.css'), revealJs: V('reveal.js'), name: path.basename(input),
    onProgress: (i, n) => process.stdout.write(`\rslide ${i} of ${n}`) });
  process.stdout.write('\n'); let deck = html;
  const present = !args.includes('--no-present'), pdf = args.includes('--pdf-button'), holder = get('copyright');
  if (present || pdf || holder) { const extras = require(path.join(ROOT, 'board-to-reveal/extras.js'));
    const opt = Object.assign(extras.options([]), { pdf, copyright: !!holder, holder: holder || extras.DEFAULT_HOLDER, present, source: get('source') || '' });
    deck = (pdf || holder ? extras.apply(deck, opt) : extras.applyPresent(deck, opt)).html; }
  fs.writeFileSync(out, deck);
  console.log(`${report.slides} slides, ${report.width} × ${report.height}, ${(deck.length / 1e6).toFixed(1)} MB -> ${out}`);
  if (report.warnings.length) console.log('Not converted exactly:\n  - ' + report.warnings.join('\n  - '));
})().catch(e => { console.error('Could not convert: ' + e.message); process.exit(1); });
