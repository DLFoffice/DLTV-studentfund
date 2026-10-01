#!/usr/bin/env python3
"""สร้าง manual.html จาก manual.md
ใช้: python3 tools/build-manual.py   (ต้องมี pip install markdown)
แก้เนื้อหาที่ manual.md แล้วรันสคริปต์นี้ใหม่ทุกครั้ง"""
import html, re, pathlib, datetime
import markdown
from markdown.extensions.toc import TocExtension

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'manual.md').read_text(encoding='utf-8')
title_line, body_md = src.split('\n', 1)
title = title_line.lstrip('# ').strip()

counter = {'n': 0}
def slug(value, sep):
    m = re.match(r'(\d+(?:\.\d+)?)', value.strip())
    if m: return 'm-' + m.group(1).replace('.', '-')
    counter['n'] += 1
    return f'm-x{counter["n"]}'

md = markdown.Markdown(extensions=['tables', 'sane_lists', TocExtension(slugify=slug, toc_depth='2-3')])
body = md.convert(body_md)
toc = md.toc_tokens

# ห่อแต่ละหัวข้อใหญ่ (h2) เป็น <section> เพื่อใช้ค้นหา/ไฮไลต์
parts = re.split(r'(?=<h2 id=)', body)
sections = []
for p in parts:
    if not p.strip(): continue
    m = re.match(r'<h2 id="([^"]+)"', p)
    sid = m.group(1) if m else 'intro'
    role = 'all'
    num = re.match(r'm-(\d+)', sid)
    if num:
        n = int(num.group(1))
        role = 'admin' if 3 <= n <= 9 else 'user' if n == 10 else 'all'
    sections.append(f'<section class="mn-sec" data-role="{role}" data-sec="{sid}">{p}</section>')
body = '\n'.join(sections)
body = body.replace('<table>', '<div class="mn-tw"><table>').replace('</table>', '</table></div>')

def toc_html(tokens):
    out = []
    for t in tokens:
        num = re.match(r'm-(\d+)$', t['id'])
        role = ''
        if num:
            n = int(num.group(1)); role = 'admin' if 3 <= n <= 9 else 'user' if n == 10 else 'all'
        kids = ''.join(f'<li><a href="#{c["id"]}">{html.escape(c["name"])}</a></li>' for c in t['children'])
        out.append(f'<li class="lv2" data-role="{role}"><a href="#{t["id"]}">{html.escape(t["name"])}</a>'
                   + (f'<ul>{kids}</ul>' if kids else '') + '</li>')
    return '<ul>' + ''.join(out) + '</ul>'

stamp = datetime.date.today().isoformat()
tpl = (ROOT / 'tools' / 'manual-template.html').read_text(encoding='utf-8')
out = (tpl.replace('{{TITLE}}', html.escape(title)).replace('{{TOC}}', toc_html(toc))
          .replace('{{BODY}}', body).replace('{{STAMP}}', stamp))
(ROOT / 'manual.html').write_text(out, encoding='utf-8')
print('✓ manual.html', len(out), 'bytes')
