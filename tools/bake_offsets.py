"""Bake recovered alignment offsets into proj1/index.html.

Replaces @@...@@ tokens with formatted offsets from the analysis repo's
offsets.json. Display convention: (x, y) with x = column shift (right
positive), y = row shift (down positive); stored pairs are [row, col].
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "..", "proj1", "index.html")
OFFSETS = "/home/andrew/berkeley/cs180/project1/offsets.json"

data = json.load(open(OFFSETS))


def fmt(pair):
    y, x = pair
    return f"({'+' if x >= 0 else ''}{x}, {'+' if y >= 0 else ''}{y})"


def off(name, metric):
    m = data[name][metric]
    return f"G {fmt(m['g'])} · R {fmt(m['r'])}"


def both(name):
    return f"L2 · {off(name, 'euclidean')}<br>NCC · {off(name, 'ncc')}"


s = open(PAGE).read()

import re

s = re.sub(r"@@OFF\(([\w]+),([\w]+)\)@@", lambda m: off(m.group(1), m.group(2)), s)
s = re.sub(r"@@BOTH\(([\w]+)\)@@", lambda m: both(m.group(1)), s)
s = re.sub(r"@@R\(([\w]+),([\w]+)\)@@", lambda m: fmt(data[m.group(1)][m.group(2)]["r"]), s)
s = re.sub(r"@@REFR\(([\w]+)\)@@", lambda m: fmt(data[m.group(1)]["ref"]["r"]), s)

# appendix table
order = ["cathedral", "monastery", "tobolsk"]
order += sorted(n for n, v in data.items() if v["kind"] == "pyramid" and not v["mine"])
order += sorted(n for n, v in data.items() if v["mine"])
rows = []
for n in order:
    v = data[n]
    cls = ' class="flag"' if n == "emir" else ""
    label = n.replace("_", " ")
    rows.append(
        f'                <tr{cls}><td>{label}</td><td>{v["kind"]}</td>'
        f'<td>{fmt(v["euclidean"]["g"])}</td><td>{fmt(v["euclidean"]["r"])}</td>'
        f'<td>{fmt(v["ncc"]["g"])}</td><td>{fmt(v["ncc"]["r"])}</td></tr>'
    )
s = s.replace("@@ROWS@@", "\n".join(rows))

# inline data for the live ticker
compact = {
    n: {m: {"g": v[m]["g"], "r": v[m]["r"]} for m in ("euclidean", "ncc") if m in v}
    for n, v in data.items()
}
s = s.replace("@@JSON@@", "window.OFFSETS = " + json.dumps(compact) + ";")

if "@@" in s:
    print("WARNING: unreplaced tokens remain:")
    for line in s.splitlines():
        if "@@" in line:
            print("  ", line.strip()[:100])
    sys.exit(1)

open(PAGE, "w").write(s)
print("baked offsets into", PAGE)
