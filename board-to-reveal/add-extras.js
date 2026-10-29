#!/usr/bin/env node
// add-extras.js — give a deck exported before 1.5 the "Download slides as PDF" button (title slide),
// the copyright line on every slide, and the slide-sized Ctrl/Cmd+P print layout.
//
//   node add-extras.js <deck.html> [out.html] [--copyright="Name"] [--year=2026] [--no-copyright] [--no-pdf] [--no-present] [--source=owner/repo@branch:path]
//
// out.html defaults to overwriting nothing: <deck>-extras.html next to the input.
// A deck that already has those extras gets only the "Present with Slidewright" button.
// New exports from convert.js already include all of this.
const fs = require('fs');
const path = require('path');
const extras = require('./extras');

const args = process.argv.slice(2);
const pos = args.filter(a => !a.startsWith('--'));
if (!pos[0]) { console.error('usage: node add-extras.js <deck.html> [out.html] [--copyright="Name"] [--year=YYYY] [--no-copyright] [--no-pdf] [--no-present] [--source=owner/repo@branch:path]'); process.exit(2); }
const input = path.resolve(pos[0]);
const out = path.resolve(pos[1] || input.replace(/\.html?$/i, '') + '-extras.html');
try {
  const r = extras.apply(fs.readFileSync(input, 'utf8'), extras.options(args));
  fs.writeFileSync(out, r.html);
  console.log(r.presentOnly ? 'added the Present with Slidewright button ->' : 'added extras to ' + r.slides + ' slides ->', out);
} catch (e) {
  console.error('Could not add extras to ' + path.basename(input) + ': ' + e.message);
  process.exit(1);
}
