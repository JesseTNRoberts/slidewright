# PowerPoint to Slidewright

`pptx2reveal.js` turns a PowerPoint `.pptx` into a self-contained reveal.js deck in the structure Slidewright edits ([`../docs/DECK-FORMAT.md`](../docs/DECK-FORMAT.md)). Slidewright uses it when you open a .pptx (Open → PowerPoint file, or drop the file on the window). It also runs on its own:

```
node pptx/convert.cjs talk.pptx [out.html] [--pdf-button] [--copyright="Name"] [--no-present] [--source=owner/repo@branch:path]
```

Node 18 or newer, nothing to install: the zip and XML readers are in `../vendor/`. The deck gets the Present with Slidewright button unless you pass `--no-present`; `--pdf-button` and `--copyright` add the student extras from `board-to-reveal`.

## What converts

- Text: theme and run fonts, sizes, colours, bold, italic, underline, strike, superscript, highlight, alignment, spacing, bullets (including Wingdings bullets) and numbering, links. Titles become real headings (h1 on the first slide, h2 after).
- Shapes: rectangles, rounded rectangles, ellipses and about 30 preset shapes, custom shapes (freeforms), solid and gradient fills, outlines, dashes, lines and connectors with arrowheads, rotation and flips, groups.
- Pictures (with crop and alt text, decorative pictures stay silent), video and audio stored in the file, YouTube links.
- Tables with merged cells and table styles; header rows become th scope="col".
- Bar, column, line and pie charts (as accessible SVG with the data in the description); SmartArt (its saved drawing).
- Master and layout artwork, colour-map overrides, slide backgrounds (colour, gradient, picture).
- Speaker notes, hidden slides, slide transitions, click animations (entrance with fly-in direction, exit, emphasis, by paragraph).

## Not converted (the converter says so)

EMF/WMF and TIFF pictures, embedded fonts (close matches are used), 3D and WordArt effects, motion paths, other chart types, OLE objects without a preview picture, linked (not embedded) media. Old binary `.ppt` files must be saved as `.pptx` first.

## Tests

`tests/fixtures/make_pptx.py` builds `tests/fixtures/sample.pptx` (one slide per feature); `tests/run.cjs` opens it in Slidewright and runs the command line. During development the converter was also checked against the ~80 real-world decks in Apache POI's test data, compared slide by slide with LibreOffice's rendering.
