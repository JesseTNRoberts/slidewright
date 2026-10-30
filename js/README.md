# How the app's code is laid out

`index.html` holds the page's markup; `app.css` its styles; the scripts in this folder its behaviour. They are plain scripts (no build step, no bundler) that `index.html` loads in numbered order. Each starts with `'use strict'`, and their top-level `function`, `const` and `let` names share one scope, so a function in one file can call one in another.

One rule follows from that: code that runs **while a file loads** (not inside a function or event handler) can only use names from the same file or an earlier one. Inside functions anything goes, because by the time they run every file has loaded. The tests fail on a load-time error, so a break here shows up immediately.

| File | What's in it |
|---|---|
| `01-core.js` | Shared helpers, opening a deck, scoped deck CSS, undo, slide display, thumbnails, zoom, selection overlay, pointer handling |
| `02-editing.js` | Typing in text, editing commands, slide list, alt text |
| `03-inspector.js` | The right-hand panels, dialogs, toasts, menus, keyboard shortcuts |
| `04-files.js` | Open and save on this computer, Present, new and sample decks |
| `05-builds.js` | Linked build steps, click preview, accessibility check, equations, text styles, layouts |
| `06-export-present.js` | PDF and handout export, presenter view and displays, slide sorter |
| `07-github-local.js` | GitHub open, commit, history and compare, sign-in, folders and recent files |
| `08-ink.js` | Pen, marker and laser added to presented decks |
| `09-gdrive.js` | Google Drive |
| `10-media.js` | Tables, video and audio, pictures, click effects and transitions |
| `11-import-code.js` | Templates, PowerPoint import, code blocks |
| `12-boot.js` | Start-up, Present with Slidewright, the test hook `window.__deckEditor` |

`tools/build_offline.py` inlines all of this (and the libraries) into one file for the offline copy.
