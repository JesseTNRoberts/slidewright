<p align="center"><img src="brand/slidewright-logo-light.svg" alt="Slidewright" height="96"></p>

Slidewright is a visual editor for reveal.js HTML slide decks. Open a deck, change it on the slide itself, and save it back as the same kind of file.

**Use it:** https://jessetnroberts.github.io/slidewright/

## What it does

- Drag, resize and rotate anything on a slide, with snapping to the slide and to other items
- Scale an item with its text and padding together (Alt-drag a corner)
- Type directly into text; double-click a card or group to work inside it
- Paste or drop images onto a slide
- Show alt text on every picture, flag the ones that have none, and edit or mark them decorative
- Undo and redo for everything, including slide changes
- Group, align, layer, duplicate; edit fill, border and font
- Add, duplicate, reorder and delete slides; speaker notes; find and replace
- Build steps: edit each click step of a slide and copy a change to the other steps
- Present from the current slide

Saving keeps the deck's own scripts and styles untouched, so the file still presents and exports to PDF as before. In Chrome and Edge, Save writes straight back to the file you opened. Other browsers download a copy.

## Files

- `index.html` is the whole app, with no build step and no dependencies.
- `brand/` holds the logo as SVG and PNG, in light and dark versions.
- `.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`.

## License

The code is under the [MIT License](LICENSE): use it, change it, and share it, keeping the copyright notice.

## Name and logo

The Slidewright name and the wheel logo belong to Jesse Roberts and aren't covered by the MIT License. You're welcome to use them to refer to Slidewright, for example to link to it, write about it, or say your deck was made with it. If you publish your own modified version, please give it a different name and logo so people can tell it apart from the official Slidewright.
