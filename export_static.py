"""Build the static, masked JSON the GitHub Pages site serves:  python export_static.py

No backend ships to GitHub Pages, so this script pre-computes everything the old API returned. It reuses the
same view producer the dynamic app uses (.claude/vault_views.Vault.view_data), so the data is identical in
shape to /api/tree, /api/notes/{id} and /api/timeline. Every string is then run through mask.py, so the
published JSON contains NO real client, person, vendor or document names -- masking is the only confidentiality
control on a public static site, so a leaked real token aborts the build.

Output under public/data/ (copied verbatim into dist/data/ by `vite build`):

  public/data/meta.json                         # { accounts, colours, defaultAccount }
  public/data/<view>/<account>/tree.json        # the /api/tree payload (nodes without body_html)
  public/data/<view>/<account>/notes/<id>.json  # the /api/notes/{id} payload (one note, with body_html)
  public/data/<view>/<account>/search.json      # per-view search index (client-side search)
  public/data/internal//timeline.json           # the /api/timeline payload (internal only)

<account> is '' for internal and showcase (written as the literal folder name '_').
"""
import json
import re
import shutil
import sys
from pathlib import Path

# .claude holds vault_views / vault_model, shared with the dynamic backend (left untouched).
HERE = Path(__file__).resolve().parent
VAULT = HERE.parent
sys.path.insert(0, str(VAULT / ".claude"))
sys.path.insert(0, str(HERE))

import vault_model                     # noqa: E402
# This build project is a sibling of backend/ and web/ and holds its own .md files (README, node_modules).
# Tell the shared vault scanner to skip it, exactly as it already skips backend/ and web/. Done at runtime
# from here so the shared .claude/ tooling stays untouched.
vault_model.CODE_DIRS = vault_model.CODE_DIRS | {"static-sites"}

from vault_views import Vault          # noqa: E402
from mask import Masker                # noqa: E402

OUT = HERE / "public" / "data"
ACCOUNT_DIR = lambda a: a or "_"       # '' -> '_' so the folder name is never empty

# Same keys db.py keeps in data_json (everything the API returns besides the node columns).
DATA_KEYS = ["summary", "parent", "children", "neighbours", "assignments", "led_to", "file", "updated"]

# Simple English stopwords -> index words (kept in step with backend/db.py STOP_WORDS).
STOP_WORDS = set("""
a about after all also am an and any are as at be been before being but by can could did do does doing for from
get had has have how i if in into is it its just me more most my no not now of on or our out over please should
so some tell than that the their them then there these they this those to up us was we were what when where
which while who whom whose why will with would you your
""".split())


def mask_node(m, n):
    """A copy of one view node with every human-readable string masked AND every note id rewritten to its
    fake slug (ids ship in the JSON and in body_html data-go attributes, so they must carry no real token)."""
    out = dict(n)
    out["id"] = m.mask_id(n.get("id")) if n.get("id") else n.get("id")
    out["title"] = m.mask_text(n.get("title", ""))
    out["sub"] = m.mask_text(n.get("sub", ""))
    out["org"] = m.mask_text(n.get("org", ""))
    out["summary"] = m.mask_text(n.get("summary", ""))
    out["body_text"] = m.mask_text(n.get("body_text", ""))
    if "body_html" in n:
        out["body_html"] = mask_body_html(m, n.get("body_html", ""))
    out["props"] = [[k, m.mask_text(v)] for k, v in n.get("props", [])]
    out["parent"] = m.mask_id(n.get("parent"))
    out["children"] = [m.mask_id(c) for c in n.get("children", [])]
    out["neighbours"] = [m.mask_id(x) for x in n.get("neighbours", [])]
    if "led_to" in n:
        out["led_to"] = m.mask_id(n.get("led_to"))
    if n.get("assignments") is not None:
        out["assignments"] = [{**a,
                               "in": m.mask_id(a.get("in")),
                               "team": m.mask_id(a.get("team")),
                               "in_title": m.mask_text(a.get("in_title", "")),
                               "team_title": m.mask_text(a.get("team_title", "")),
                               "role": m.mask_text(a.get("role", ""))} for a in n["assignments"]]
    if "file" in n:
        out["file"] = m.mask_file(n.get("file", ""))
    return out


DATA_GO = re.compile(r'(data-go=")([^"]+)(")')


def mask_body_html(m, html_str):
    """Rewrite the note ids inside data-go="..." links FIRST (mapping each original id to its fake slug), then
    mask the visible text. Order matters: the fake slug carries no real token, so the later text pass leaves it
    alone; doing it the other way round would let the text pass corrupt the original id before it can be
    mapped (e.g. 'axone-...' -> 'Vantage-...'), breaking the in-page link."""
    rewritten = DATA_GO.sub(lambda mo: mo.group(1) + m.mask_id(mo.group(2)) + mo.group(3), html_str)
    return m.mask_text(rewritten)


def search_index(m, nodes):
    """One row per note for the browser search: id, title, type, sub, and the searchable text (title + sub +
    props + body). Nodes are already masked (ids too), so just lowercase the words for cheap matching."""
    rows = []
    for nid, n in nodes.items():
        props = " ".join(v for _, v in n.get("props", []))
        text = " ".join(x for x in (n.get("title", ""), n.get("sub", ""), props, n.get("body_text", "")) if x)
        words = [w for w in re.findall(r"\w+", text.lower()) if len(w) > 1 and w not in STOP_WORDS]
        rows.append({
            "id": nid, "title": n.get("title", ""), "type": n.get("type", ""), "sub": n.get("sub", ""),
            "body": n.get("body_text", ""), "words": words,
        })
    return rows


def display_order(view_dict):
    """Depth-first order of the layout, as ingest.py computes it, so the API returns notes in a stable order."""
    order, slots = {}, view_dict["layout"]["slots"]
    stack = list(reversed(view_dict["layout"]["roots"]))
    while stack:
        k = stack.pop()
        order.setdefault(slots[k]["id"], len(order))
        stack.extend(reversed(slots[k]["children"]))
    return order


def mask_layout(m, layout):
    """The display tree. Slot keys are composite paths of real ids, slot.id/children are real ids, slot.role
    is shown on the Map -- all rewritten so the shipped layout carries no real token. A composite key like
    's-acme/jane' maps to 's-<fakeacct>/<fakejane>' by rewriting each id segment."""
    def key(k):
        return "/".join(m.mask_id(seg) for seg in k.split("/"))
    slots = {}
    for k, slot in layout["slots"].items():
        s = dict(slot)
        s["id"] = m.mask_id(slot["id"])
        s["children"] = [key(c) for c in slot.get("children", [])]
        if "role" in s:
            s["role"] = m.mask_text(s.get("role", ""))
        slots[key(k)] = s
    return {"roots": [key(r) for r in layout["roots"]], "slots": slots}


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")


def export_view(m, view, account, data):
    """Write tree.json, notes/<id>.json and search.json for one view (+account). The on-disk account folder
    uses the MASKED account id, since the published folder name must carry no real token."""
    base = OUT / view / ACCOUNT_DIR(m.mask_id(account) if account else account)
    order = display_order(data)
    nodes = dict(sorted(data["nodes"].items(), key=lambda kv: order.get(kv[0], 1_000_000)))

    masked_nodes = {}
    written = []
    for nid, n in nodes.items():
        full = mask_node(m, {**n, "id": nid})        # note with body_html (the /api/notes/{id} payload)
        fake_id = m.mask_id(nid)
        write(base / "notes" / f"{fake_id}.json", full)
        written.append(full)
        tree_node = {k: v for k, v in full.items() if k != "body_html"}  # tree omits body_html
        masked_nodes[fake_id] = tree_node

    tree = {
        "view": data["view"],
        "account": m.mask_id(data.get("account")) if data.get("account") else data.get("account"),
        "title": m.mask_text(data.get("title", "Map")),
        "colours": data.get("colours", {}),
        "generated": data.get("generated", ""),
        "layout": mask_layout(m, data["layout"]),    # slot ids are file names; slot.role is displayed -> mask
        "nodes": masked_nodes,
    }
    write(base / "tree.json", tree)
    written.append(tree)
    index = search_index(m, masked_nodes)
    write(base / "search.json", index)
    written.append(index)

    if view == "internal" and "timeline" in data:
        tl = data["timeline"]
        masked_tl = {
            "events": [_mask_event(m, e) for e in tl["events"]],
            "undated": [_mask_event(m, e) for e in tl["undated"]],
        }
        write(base / "timeline.json", masked_tl)
        written.append(masked_tl)
    return masked_nodes, written


def _mask_event(m, e):
    out = dict(e)
    out["id"] = m.mask_id(e.get("id"))
    if "place" in out:
        out["place"] = m.mask_id(e.get("place"))
    for k in ("text", "person", "role"):
        if k in out:
            out[k] = m.mask_text(out[k])
    return out


def verify(m, *jsons):
    """Confidentiality gate: no real token survives in ANY shipped string (displayed text, ids, folder names
    -- everything, since the whole JSON is publicly downloadable). 'words' holds lowercased, already-masked
    search tokens and is skipped only to avoid double work."""
    def walk(obj, key=None):
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, k)
        elif isinstance(obj, list):
            for v in obj:
                walk(v, key)
        elif isinstance(obj, str) and key != "words":
            m.verify_clean(obj)
    for j in jsons:
        walk(j)


def main():
    vault = Vault()
    if vault.problems:
        for p in vault.problems:
            print("VAULT PROBLEM:", p)
        print("Fix the vault before exporting (run .venv/Scripts/python .claude/verify_vault.py).")
        return 1

    masker = Masker(vault)

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    payload = [("internal", "", vault.view_data("internal"))]
    payload += [("client", a, vault.view_data("client", a)) for a in vault.roots]
    payload += [("showcase", "", vault.view_data("showcase"))]

    counts = []
    for view, account, data in payload:
        masked_nodes, written = export_view(masker, view, account, data)
        verify(masker, *written)
        counts.append((view, account, len(masked_nodes)))

    meta = {
        "accounts": [masker.mask_id(a) for a in vault.roots],   # masked ids: used in #client:<account> links
        "colours": payload[0][2]["colours"],
        # single-account convenience, like backend/auth.py: a plain #client link resolves to this account
        "defaultAccount": masker.mask_id(vault.roots[0]) if len(vault.roots) == 1 else None,
    }
    write(OUT / "meta.json", meta)

    print("wrote " + OUT.as_posix() + ": " + ", ".join(
        f"{v}{'/' + a if a else ''} {c} notes" for v, a, c in counts))
    print("masking: no real token leaked (verified).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
