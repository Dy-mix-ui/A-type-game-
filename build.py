#!/usr/bin/env python3
"""
build.py — index.html / style.css / *.js を1枚のHTMLにまとめる

GitHub Pages ではファイルを分けたまま公開できるので、普段は不要です。
1ファイルだけ誰かに渡したいときや、サーバーなしで開きたいときに使います。

    python3 build.py            -> standalone.html を出力
"""
import re
import pathlib

HERE = pathlib.Path(__file__).parent
OUT = HERE / "standalone.html"

html = (HERE / "index.html").read_text(encoding="utf-8")

# CSS を差し込む
css = (HERE / "style.css").read_text(encoding="utf-8")
html = html.replace(
    '<link rel="stylesheet" href="style.css">',
    "<style>\n" + css + "\n</style>",
)

# ローカルの JS を差し込む（CDN の three.js はそのまま残す）
def inline_script(match):
    src = match.group(1)
    if src.startswith("http"):
        return match.group(0)
    code = (HERE / src).read_text(encoding="utf-8")
    return "<script>\n" + code + "\n</script>"

html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

OUT.write_text(html, encoding="utf-8")
print(f"{OUT.name} を出力しました（{len(html):,} 文字）")
