# How Slidewright keeps decks from touching your accounts

A deck is a web page, and web pages can contain scripts. Slidewright opens decks from anywhere (your folders, GitHub, Google Drive, a colleague's file, a deck's own Present button), so it treats every deck's code as untrusted.

**While you edit**, nothing in the deck runs. Slides are read with the browser's parser, which never runs `<script>`. Before a slide enters the page, inline event handlers (`onerror=`, `onload=`…), `srcdoc` frames, `javascript:` and HTML `data:` addresses, `<meta http-equiv>` and `<base href>` are parked in `data-sw-x-*` attributes. Saving puts them back exactly, so the deck still works when presented.

**When you present** (here, or with presenter view), the deck runs in a sandboxed frame without `allow-same-origin`. It gets a unique, empty origin: it can't read Slidewright's storage (where the GitHub sign-in lives), can't reach into the Slidewright page or its windows, and has no cookies. Slidewright and the deck talk only by `postMessage` (next/previous slide, pen strokes, the current slide), and nothing the deck sends is used as HTML: drawings are rebuilt from numbers and colours, and only YouTube and Vimeo player addresses are accepted for videos. Those players can't run inside the sandbox, so Slidewright lays them over the slide from its own page while that slide is showing.

**Tokens.** The GitHub token is kept in this browser only and sent only to GitHub. The Google Drive token is kept in memory only, for at most an hour. The sign-in relay keeps nothing (see `../auth-relay/worker.js`).

The tests in `tests/run.cjs` check both rules: a presented deck must not be able to read storage or the page, and handlers in an edited deck must not run but must survive saving.

To report a problem, open an issue on the repository or email the address in `../privacy.html`.
