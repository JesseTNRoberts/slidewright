# Bundled libraries

Slidewright loads these from this folder, so equations, PDF export and new decks keep working even if a CDN is down, blocked on a campus network, or gone. Each is the unmodified file from its npm package, under its own MIT license (included).

| Library | Version | Used for | From |
|---|---|---|---|
| KaTeX | 0.16.9 | Turning LaTeX into MathML for equations | `katex/dist/katex.min.js` |
| jsPDF | 2.5.1 | PDF and handout export | `jspdf/dist/jspdf.umd.min.js` |
| reveal.js | 5.1.0 | Built into decks made with “New blank deck” | `reveal.js/dist/reveal.js`, `reveal.css` |

If a file here can't be loaded, Slidewright falls back to the same version on cdnjs (KaTeX, jsPDF) or jsDelivr (reveal.js). To upgrade one, replace its folder and update the version in `index.html`.
