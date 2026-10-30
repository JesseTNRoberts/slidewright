"""Build a single-file offline copy of Slidewright.

Inlines the bundled KaTeX, jsPDF, JSZip and the PowerPoint converter so equations, PDF export and .pptx import work with no
network and no vendor/ folder next to the file. Decks made with "New blank deck"
in the offline copy load reveal.js from jsDelivr, since the file can't read vendor/.

Usage: python3 tools/build_offline.py index.html slidewright-offline.html
"""
import pathlib, sys

src, out = (pathlib.Path(p) for p in sys.argv[1:3])
root = src.resolve().parent
html = src.read_text(encoding="utf-8")
libs = ["vendor/katex-0.16.9/katex.min.js", "vendor/jspdf-2.5.1/jspdf.umd.min.js", "vendor/jszip-3.10.1/jszip.min.js", "pptx/pptx2reveal.js"]
inline = ""
for rel in libs:
    code = (root / rel).read_text(encoding="utf-8").replace("</script", "<\\/script")
    inline += f"<script>/* {rel} (MIT) */\n{code}\n</script>\n"
# the app's own stylesheet and scripts, inlined in place
import re
def inline_css(m):
    return "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "\n</style>"
html = re.sub(r'<link rel="stylesheet" href="(app\.css)">', inline_css, html)
def inline_js(m):
    code = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return f"<script>/* {m.group(1)} */\n{code}\n</script>"
html = re.sub(r'<script src="(js/[\w.-]+\.js)"></script>', inline_js, html)
i = html.rfind("</body>")
if i < 0:
    sys.exit("no </body> in " + str(src))
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html[:i] + inline + html[i:], encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
