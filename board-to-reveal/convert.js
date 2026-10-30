#!/usr/bin/env node
// convert.js — one command from a downloaded art board to a reveal.js deck.
//
//   node convert.js <board> [out.html] [--check] [--copyright="Name"] [--year=YYYY] [--no-copyright] [--no-pdf] [--no-present] [--source=owner/repo@branch:path] [--board=<board artifact URL>]
//
// <board> may be:
//   * a folder holding canvas.json and the *.dc.html slides (or a project/ folder inside it)
//   * a .zip of such a folder
// out.html defaults to <deck title>.html next to the input.
// --check also opens the deck in headless Chromium (offline), runs the accessibility and
// layout checks, and writes screenshots plus shots/index.html (a contact sheet).
// The copyright and PDF options are passed to build.js (see extras.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const check = args.includes('--check');
const pos = args.filter(a => !a.startsWith('--'));
const buildFlags = args.filter(a => a.startsWith('--') && a !== '--check');
if (!pos[0]) {
  console.error('usage: node convert.js <board folder | board.zip> [out.html] [--check]');
  process.exit(2);
}
const input = path.resolve(pos[0]);
if (!fs.existsSync(input)) { console.error('not found: ' + input); process.exit(2); }

function findProject(dir) {
  // the folder that holds canvas.json, searching a few levels down
  const queue = [[dir, 0]];
  while (queue.length) {
    const [d, depth] = queue.shift();
    if (fs.existsSync(path.join(d, 'canvas.json'))) return d;
    if (depth >= 4) continue;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') queue.push([path.join(d, e.name), depth + 1]);
    }
  }
  return null;
}

let projDir;
if (fs.statSync(input).isDirectory()) {
  projDir = findProject(input);
} else if (/\.zip$/i.test(input)) {
  const AdmZip = require('adm-zip');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
  new AdmZip(input).extractAllTo(tmp, true);
  projDir = findProject(tmp);
} else {
  console.error('This input type is not supported yet: ' + path.basename(input) +
    '\nGive a folder or .zip that contains canvas.json and the .dc.html slides.' +
    '\nIf your download is a different kind of file, send it to Claude so the converter can be taught to read it.');
  process.exit(2);
}
if (!projDir) { console.error('No canvas.json found in ' + input); process.exit(2); }

const title = (JSON.parse(fs.readFileSync(path.join(projDir, 'canvas.json'), 'utf8')).title || 'deck')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const out = path.resolve(pos[1] || path.join(path.dirname(input), title + '.html'));
fs.mkdirSync(path.dirname(out), { recursive: true });

execFileSync(process.execPath, [path.join(__dirname, 'build.js'), projDir, out, ...buildFlags], { stdio: 'inherit' });

if (check) {
  const shots = path.join(path.dirname(out), 'shots');
  fs.rmSync(shots, { recursive: true, force: true });
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify.js'), out, shots], { stdio: 'inherit' });
  } catch (e) {
    console.error('\nCheck could not run. First time? Run:  npx playwright install chromium');
    process.exit(1);
  }
  const imgs = fs.readdirSync(shots).filter(f => f.endsWith('.png')).sort();
  fs.writeFileSync(path.join(shots, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>Contact sheet</title><style>body{margin:16px;font:13px sans-serif;background:#eee}' +
    'div{display:inline-block;margin:6px;text-align:center}img{width:320px;display:block;border:1px solid #ccc}</style>' +
    imgs.map(f => '<div><img src="' + f + '" alt="Screenshot ' + f + '">' + f.replace('.png', '').replace('_', ' · step ') + '</div>').join(''));
  console.log('contact sheet: ' + path.join(shots, 'index.html'));
}
console.log('\ndeck: ' + out);
