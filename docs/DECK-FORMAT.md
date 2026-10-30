# The deck structure Slidewright expects

Slidewright opens any reveal.js deck, but several features rely on the structure produced by the lecture-deck builder. If the builder's output changes, check it against this page; the tests in `tests/` use a sample deck (`tests/sample-deck.html`) built to the same rules.

## Required

| Expectation | Why | If it changes |
|---|---|---|
| Slides are `<section>` elements directly inside `.reveal .slides` | How Slidewright finds slides (it falls back to any top-level `<section>`) | Nothing opens |
| `Reveal.initialize({ width, height, … })` appears in a `<script>` | Sets the slide size (default 1280 × 720) | Wrong canvas size |
| Styles in `<style>` blocks in `<head>`, with slide rules under `.reveal` | Copied into the editor so slides look the same; other rules are scoped to the slide area | Slides render unstyled |

## Relied on by specific features

| Structure | Used by | If it changes |
|---|---|---|
| Each slide has one root `<div>` sized to the slide, holding absolutely positioned items | Selecting items, snapping, new-slide layouts, layout matching | Items inside are grouped differently; editing still works |
| Click steps as full copies: `<div class="step-layer">` for step 1, then `<div class="step-layer fragment">` for each later step, each with the same root `<div>` | Build-step picker, linked build steps, click preview, PDF per click | Linked steps stop matching items; each copy can still be edited |
| Other click reveals use reveal's `fragment` class, optionally `data-fragment-index` | Click preview, click-order list, per-click PDF | Fragments still show, order may differ |
| Slide title in `data-title` on the `<section>` | Slide list names, compare matching, finding the title to make a heading | Titles guessed from the largest text |
| Copyright line `<div class="slide-copy">` and PDF button `<div class="pdf-get">` as direct children of the `<section>` | Copied onto new slides; ignored by layout matching and the accessibility check | Treated as ordinary items |
| Math written as `\( … \)` and `\[ … \]` in text, rendered by KaTeX auto-render in the deck | Rendered as editable MathML while editing, saved back as the same LaTeX | Shows as LaTeX source |
| Code as `<pre>` (Slidewright's own blocks are `<pre class="sw-code">` with inline colours) | Code editor, syntax highlighting, line highlights per click | Edited as plain text |
| Speaker notes in `<aside class="notes">` inside the `<section>` | Notes field, presenter view, handout | Notes not shown |
| Alt text: `alt` on `<img>`; `role="img"` + `aria-label` on graphics; `aria-hidden="true"` for decoration | Alt-text view and accessibility check | Pictures reported as missing alt text |
| `<meta name="slidewright-source" content="github:owner/repo@branch:path">` in `<head>` | Save commits back to that file for anyone with write access | Save asks where to save |
| `<button class="sw-present">` and `<script id="sw-pristine">` right after the `.reveal` div, plus the Present runtime script at the end of `<body>` | The deck's Present with Slidewright button sends its own source to Slidewright (`#present`, then `postMessage`) | Button missing or sends nothing |

## Written by the converter, kept as-is

The converter that writes these decks lives in [`board-to-reveal/`](../board-to-reveal/README.md). These parts of its output have no editing features in Slidewright, but they must survive a save unchanged; `tests/builder.cjs` checks that they do.

| Structure | What it does in the deck |
|---|---|
| `<section data-visibility="hidden">` | A slide hidden on the board: kept in the file, dropped by reveal.js at load |
| `data-pos='{"0":"x,y",…}'` on items that glide between click steps | Positions per click step, applied by the deck's script |
| `<div class="fragment step-trigger" aria-hidden="true">` | An empty click that only moves `data-pos` items |
| `data-build-dot` and `data-track` on SVG circles | A marker that moves along a plot, one point per click |
| CSS `@keyframes` named `sN-…` in the deck's `<style>`, inline `animation:` on items | Animations that play on their click |
| `data-live="N"` on a `<section>`, `data-lv='[[attribute, template],…]'` on items, and a `<script>` that sets `window.__LIVE` | Time-driven animation: the slide's own component runs while the slide is shown and rewrites those attributes; the attribute values saved in the file are the resting state |

## Decks converted from PowerPoint

`pptx/pptx2reveal.js` writes the same structure: one root `<div>` per slide holding absolutely positioned items; text boxes are a single element whose paragraphs (`<p>`, `<ul>`, `<ol>`) are its text; titles are `<h1>`/`<h2>`; PowerPoint animations become `fragment` classes with `data-fragment-index`.

## What Slidewright adds when it saves

- Inline `style` changes on items you edit (colours are written as `rgb(…)`).
- Real `<h1>`/`<h2>` tags when the accessibility fixes turn slide titles into headings (styled to look identical).
- `<span class="sw-math" data-latex="…">` with MathML for equations in decks without KaTeX; in decks with KaTeX, equations stay as `\( … \)` text.
- `<pre class="sw-code">` for code blocks, with `.sw-codehl fragment current-visible` highlight bands.
- `<meta name="slidewright-source">` when the deck was opened from or committed to GitHub.
- `<script type="application/json" id="slidewright-styles">` in `<head>` if you save custom text styles.

Everything else, including the deck's scripts, fonts and reveal.js, is written back unchanged.
