"""Build snorkel-phrases/index.html from template.html, inlining Twemoji SVGs.

Usage: python3 tools/build.py <path-to-unpacked-@twemoji/svg-package>
Twemoji graphics (c) Twitter/X and contributors, CC-BY 4.0.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SVG_DIR = sys.argv[1]

PAGES = [
    ("Slipping In", "--p1", [
        ("The first cold kiss of the sea", "🥶🌊"),
        ("I floated like a leaf on glass", "🍃🌊"),
        ("Silence wrapped around me like a blanket", "🤫"),
        ("Weightless, like flying in slow motion", "🪶"),
        ("My mask fogged my little window", "🤿🌫️"),
        ("Salt stung my lips and eyes", "🧂😣"),
    ]),
    ("Light & Colour", "--p2", [
        ("Sunbeams danced like golden ribbons", "☀️🎀"),
        ("The water glowed a thousand blues", "💙🌊"),
        ("The coral was a painted garden", "🪸🎨"),
        ("Bubbles rose like silver pearls", "🫧"),
        ("It sparkled like a jewellery box", "✨💎"),
        ("The water turned murky and grey", "🌫️"),
    ]),
    ("Sea Creatures", "--p3", [
        ("A turtle glided by like a wise old sage", "🐢"),
        ("Fish swirled around me like confetti", "🐠🎉"),
        ("An octopus melted into the rocks", "🐙🪨"),
        ("A little crab danced sideways", "🦀"),
        ("A jellyfish pulsed like a ghost", "🪼👻"),
        ("A shadow below made my heart race", "🦈💓"),
    ]),
    ("Wonder & Joy", "--p4", [
        ("I felt completely free", "🕊️"),
        ("My worries floated away", "🎈"),
        ("Like dreaming with my eyes open", "😌💭"),
        ("I felt part of the sea", "🐬💙"),
        ("That was magical", "🪄✨"),
        ("I want to go again!", "🙋🤿"),
    ]),
    ("Rough Waters", "--p5", [
        ("Water crept into my mask", "🤿💧"),
        ("I swallowed a mouthful of sea", "😖💦"),
        ("The current tugged me like a stubborn hand", "🌀✋"),
        ("My legs grew tired and heavy", "🦵😩"),
        ("I got stung and it burned", "🪼🔥"),
        ("I was glad to reach the shore", "🏖️🙏"),
    ]),
]

def split_emoji(s):
    """Split a string of emoji into single emoji (keeps a trailing FE0F with its base)."""
    out = []
    for ch in s:
        if ch == "️" and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out

def svg_file(e):
    cps = [f"{ord(c):x}" for c in e]
    for name in ("-".join(c for c in cps if c != "fe0f"), "-".join(cps)):
        p = os.path.join(SVG_DIR, name + ".svg")
        if os.path.exists(p):
            return name, p
    raise SystemExit(f"No Twemoji SVG for {e!r} ({cps})")

symbols, pages = {}, []

def add_symbol(e):
    sid, path = svg_file(e)
    if sid not in symbols:
        svg = open(path, encoding="utf-8").read()
        vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
        body = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", svg, flags=re.S)
        symbols[sid] = f'<symbol id="e{sid}" viewBox="{vb}">{body}</symbol>'
    return "e" + sid

# pictures used by the page chrome (eye check square)
add_symbol("👀")
for name, color, items in PAGES:
    page = {"name": name, "color": color, "phrases": []}
    for text, emo in items:
        ids = []
        for e in split_emoji(emo):
            ids.append(add_symbol(e))
        page["phrases"].append({"text": text, "pics": ids})
    pages.append(page)

sprite = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + "".join(symbols.values()) + "</svg>"
tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
html = tpl.replace("<!--SPRITE-->", sprite).replace("/*PAGES*/[]", json.dumps(pages, ensure_ascii=False))
open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(html)
print(f"{sum(len(p['phrases']) for p in pages)} phrases, {len(symbols)} pictures")
