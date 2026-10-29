# board-to-reveal

Turns a lecture art board (Design canvas) into one self-contained reveal.js file that works offline. Slidewright opens and edits the result; [`../docs/DECK-FORMAT.md`](../docs/DECK-FORMAT.md) lists the structure the two share.

It lives in this repository because the two tools have to agree: the converter writes the format, Slidewright reads it, and `tests/builder.cjs` checks them together on every push. **A converter change that breaks Slidewright is fixed in the same change**, in Slidewright if need be.

## One-time setup

1. Install Node.js 18 or newer (https://nodejs.org).
2. In this folder run:

   ```
   npm install
   ```

3. Optional, for `--check`: `npx playwright install chromium`

reveal.js and jsPDF come from Slidewright's `../vendor/` folder, so the deck and the editor use the same copies.

## Convert a board

```
node convert.js <board> [out.html] [--check] [--copyright="Name"] [--year=YYYY] [--no-copyright] [--no-pdf]
```

- `<board>`: the downloaded board, either a `.zip` or an unzipped folder. It must contain `canvas.json` and the `.dc.html` slide files (a `project/` folder inside is fine).
- `out.html`: optional. By default the deck is written next to the input and named after the board's title.
- `--check`: also opens the deck offline in headless Chromium. It checks for errors, network requests, fonts, text overflowing a slide, accessibility (axe-core), click-step animations, the PDF button and copyright line, and downloads the PDF once. It writes screenshots, `shots/index.html` (a contact sheet) and `shots/deck.pdf`.
- `--copyright`, `--year`: the copyright line on every slide (default `© <this year> Dr. Jesse Roberts`). `--no-copyright` leaves it out; `--no-pdf` leaves out the download button.

Present with the arrow keys or Space. F is fullscreen, Esc is the overview, S is speaker view.

## What students get

- **Download slides as PDF** on the title slide: the PDF is made in their browser and downloads directly, one slide-sized page per slide, each slide as it looks after its last click.
- **Ctrl/Cmd+P** prints the same one-page-per-slide layout.
- A small copyright line on every slide.
- **A companion notebook** (`<deck-name>.ipynb`) with the code behind every computed number and graph on the slides. Every export delivers it next to the .html. The converter does not make it: it is built from the lecture's saved code and follows `lecture-notebooks/STYLE.md` in the Lecture Creation project.

The button and copyright line find a free spot on their slide when the deck loads. Add `?print-pdf` to the address to see every slide at once (useful for WAVE checks).

## Older decks

Decks exported before 1.5 can get the same button, copyright line and print layout without the board:

```
node add-extras.js old-deck.html [new-deck.html] [--copyright="Name"] [--year=YYYY]
node verify.js new-deck.html shots/
```

## What it converts (see COVERAGE.md)

The converter reads each slide's own script, so slides look the same as on the board. Click-through slides turn into reveal.js click steps, and the board's Next/Reset buttons are removed. When a new kind of slide is built on the board that this converter doesn't handle yet, the converter is updated at the same time: COVERAGE.md lists the new pattern, `test-board/` gets a slide that uses it, and `node tests/builder.cjs` must still pass.

## Files

- `convert.js`: entry point (input handling, build, optional check)
- `build.js`: the converter
- `extras.js`: the PDF button, copyright line and print layout added to every deck
- `add-extras.js`: adds those extras to a deck exported before 1.5
- `verify.js`: the checks used by `--check`
- `COVERAGE.md`: board patterns the converter supports, with a changelog
- `test-board/`: a small board with one slide per supported pattern, built and opened in Slidewright by `../tests/builder.cjs`
