<p align="center"><img src="brand/slidewright-logo-light.svg" alt="Slidewright" height="96"></p>

Slidewright is a visual editor for reveal.js HTML slide decks. Open a deck, change it on the slide itself, and save it back as the same kind of file.

**Use it:** https://www.jessetnroberts.com/slidewright/

## What it does

**Editing**
- Drag, resize and rotate anything on a slide, with snapping to the slide and to other items
- Scale an item with its text and padding together (Alt-drag a corner)
- Type directly into text; double-click a card or group to work inside it
- Paste or drop images onto a slide
- Equations: type `\( … \)`, `$…$` or `$$…$$` straight into text and it renders when you finish typing, or right-click → Insert equation to open a LaTeX editor at the cursor; decks that use `\( … \)` keep that form when saved
- Code blocks with syntax highlighting (Python, JavaScript, shell, JSON), line numbers, dark or light colours, and line ranges that light up one click at a time
- Text styles picked up from the deck (Title, Subtitle, Body…), your own saved styles, and a style painter
- Undo and redo for everything, including slide changes; group, align, layer, duplicate; find and replace

**Slides and builds**
- New slides from standard layouts styled to match the deck (title, section header, title and content, two columns, comparison, picture with caption, key number, statement) or from the deck's own slides
- Slide sorter: see every slide at once, multi-select, drag to reorder, duplicate, delete
- Linked build steps: an item that looks the same in every click step changes everywhere at once
- Preview clicks and animations in place, and reorder what appears on each click

**Accessibility**
- Show alt text on every picture, flag the ones without it, and edit or mark them decorative
- Accessibility check modelled on how YuJa Panorama and Anthology Ally score HTML: an estimated score, the rules they penalise (alt text, alt over 120 characters, headings, contrast, tables, lists, repeated IDs, zoom, small text…) grouped by severity, filters, and one-click fixes

**Sharing and history**
- Export a PDF (one page per slide or per click) and a student handout with speaker notes
- Presenter view with notes, next slide, a total and per-slide timer, driving an audience window
- Live presenting tools: pen, highlighter, laser pointer, undo and clear, and blank screen; strokes stay with their slide and mirror from presenter view to the audience window (keys D, M, R, E, C, B)
- Work in a local copy of a repo: open from a folder, reopen recent decks, and Save writes straight back (Chrome and Edge)
- Sign in with GitHub to open, commit and browse the history of decks in your repositories (needs the one-time relay setup in [`auth-relay/`](auth-relay/README.md); a personal access token also works)
- **Present with Slidewright** button on every deck made by `board-to-reveal`: anyone can present with notes, timer, pen and laser; the deck remembers its GitHub file so Save goes back there for people with write access, and offers everyone else a copy
- Open decks from Google Drive and save them back, with Drive's version history (needs the one-time Google Cloud setup in [`docs/GOOGLE-DRIVE.md`](docs/GOOGLE-DRIVE.md))
- Compare the deck with its saved version, an older commit or another file, slide by slide

Saving keeps the deck's own scripts and styles untouched, so the file still presents and exports to PDF as before. In Chrome and Edge, Save writes straight back to the file you opened. Other browsers download a copy. GitHub features work from the GitHub Pages site; your token is kept only in your browser.

## Files

- `index.html` is the whole app, with no build step and no dependencies.
- `brand/` holds the logo as SVG and PNG, in light and dark versions.
- `.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`.

## Making decks: board-to-reveal

[`board-to-reveal/`](board-to-reveal/README.md) is the converter that turns a lecture art board into the reveal.js decks Slidewright edits. The two live together so they stay in step: every push builds a test board with the converter and checks that Slidewright opens it, saves it, and that the saved deck still presents (`tests/builder.cjs`).

## Offline copy

[slidewright-offline.html](https://www.jessetnroberts.com/slidewright/slidewright-offline.html) is the whole app in one file with its libraries built in. Save it anywhere and open it in a browser; equations and PDF export work with no network.

## Development

- `index.html` is the source. There's no build step for the site.
- `vendor/` holds the bundled libraries (KaTeX, jsPDF, reveal.js); see [vendor/README.md](vendor/README.md).
- [docs/DECK-FORMAT.md](docs/DECK-FORMAT.md) lists the deck structure Slidewright relies on.
- Tests: `npm install --no-save playwright && npx playwright install chromium && node tests/run.cjs`. The converter test also needs `(cd board-to-reveal && npm install --omit=optional)`, then `node tests/builder.cjs`. They open `tests/sample-deck.html` in headless Chromium, exercise the main features, and fail if any library is fetched from a CDN.
- Every push runs the tests on GitHub first; the site only deploys if they pass. Screenshots of any failure are attached to the run.

## License

The code is under the [MIT License](LICENSE): use it, change it, and share it, keeping the copyright notice.

## Name and logo

The Slidewright name and the wheel logo belong to Jesse Roberts and aren't covered by the MIT License. You're welcome to use them to refer to Slidewright, for example to link to it, write about it, or say your deck was made with it. If you publish your own modified version, please give it a different name and logo so people can tell it apart from the official Slidewright.

## Privacy

Slidewright runs in your browser and keeps no copy of your decks. See the [privacy policy](https://www.jessetnroberts.com/slidewright/privacy.html) ([source](privacy.html)).
