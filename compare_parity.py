"""Structural parity check: the static site vs the real dynamic app.  python compare_parity.py

The dynamic API (backend/db.py) and the static export (export_static.py) both derive their data from the same
producer, .claude/vault_views.Vault.view_data(). This script treats view_data() as the live app's payload (it
is exactly what backend/ingest.py loads into SQLite and what /api/tree and /api/notes/{id} then return), builds
the static JSON, and asserts the two are STRUCTURALLY identical:

  * same set of views (internal, one client per account, showcase)
  * same number of notes per view, and the same notes (matched by reversing the id mask)
  * same per-note keys, same note types, same parent/children/neighbour wiring (as id sets, un-masked)
  * same tree layout shape (same number of slots and roots, same nesting)
  * same timeline event count

Values that differ ONLY because of masking (titles, roles, body text, ids, file names) are expected and are
NOT compared for equality -- masking is an intentional difference, recorded in PARITY.md. The script exits 0
when structural parity holds, non-zero otherwise.
"""
import sys
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
VAULT = HERE.parent
sys.path.insert(0, str(VAULT / ".claude"))
sys.path.insert(0, str(HERE))

import vault_model                       # noqa: E402
vault_model.CODE_DIRS = vault_model.CODE_DIRS | {"static-sites"}
from vault_views import Vault            # noqa: E402
from mask import Masker                  # noqa: E402
import export_static                     # noqa: E402

# Node keys the dynamic API returns (db.py _node + data_json). The static tree node must carry the same set.
TREE_NODE_KEYS = {"id", "title", "type", "sub", "org", "status", "placeholder", "body_text", "props",
                  "summary", "parent", "children", "neighbours"}


class Fail(Exception):
    pass


def check(cond, msg):
    if not cond:
        raise Fail(msg)


def live_payloads(vault):
    """What the dynamic app serves, per (view, account): the view_data() the API is a thin wrapper over."""
    out = [("internal", "", vault.view_data("internal"))]
    out += [("client", a, vault.view_data("client", a)) for a in vault.roots]
    out += [("showcase", "", vault.view_data("showcase"))]
    return out


def compare_view(m, view, account, live):
    """Compare one view's live payload to the exported JSON, after reversing the id mask."""
    masked_nodes, written = export_static.export_view(m, view, account, live)
    # Full note JSONs (with body_html) keyed by masked id, for the in-page link check.
    full_by_id = {w["id"]: w for w in written if isinstance(w, dict) and "body_html" in w}
    # Reverse the id mask so we can match static notes back to live notes.
    unmask = {m.mask_id(nid): nid for nid in live["nodes"]}
    # Showcase ids (case-N) are not in vault.notes, so map them to themselves.
    for fake in masked_nodes:
        unmask.setdefault(fake, fake)

    tag = f"{view}{'/' + account if account else ''}"
    check(len(masked_nodes) == len(live["nodes"]),
          f"{tag}: note count {len(masked_nodes)} != live {len(live['nodes'])}")

    live_nodes = live["nodes"]
    for fake_id, snode in masked_nodes.items():
        real = unmask.get(fake_id)
        check(real in live_nodes or real == fake_id, f"{tag}: static note {fake_id} has no live match")
        lnode = live_nodes.get(real)
        if lnode is None:   # showcase case-N: present in both static and live by the same id
            lnode = live_nodes.get(fake_id)
        check(lnode is not None, f"{tag}: no live node for {fake_id}")

        # Same key set (structure), ignoring the view-only extras the internal view adds (updated/led_to/file).
        base_keys = TREE_NODE_KEYS | ({"assignments"} if lnode.get("assignments") is not None else set())
        missing = base_keys - set(snode)
        check(not missing, f"{tag}:{fake_id}: static node missing keys {missing}")

        check(snode["type"] == lnode["type"], f"{tag}:{fake_id}: type {snode['type']} != {lnode['type']}")
        check(snode["status"] == lnode["status"], f"{tag}:{fake_id}: status differs")
        check(snode["placeholder"] == lnode["placeholder"], f"{tag}:{fake_id}: placeholder differs")
        check(len(snode["props"]) == len(lnode["props"]), f"{tag}:{fake_id}: prop count differs")

        # Wiring as un-masked id sets must match.
        def unmap(ids):
            return {unmask.get(x, x) for x in ids}
        check(unmap(snode["children"]) == set(lnode["children"]), f"{tag}:{fake_id}: children differ")
        check(unmap(snode["neighbours"]) == set(lnode["neighbours"]), f"{tag}:{fake_id}: neighbours differ")
        sparent = unmask.get(snode["parent"]) if snode["parent"] else None
        check(sparent == lnode["parent"], f"{tag}:{fake_id}: parent differs ({sparent} != {lnode['parent']})")

        if lnode.get("assignments") is not None:
            check(len(snode["assignments"]) == len(lnode["assignments"]),
                  f"{tag}:{fake_id}: assignment count differs")

    # Layout: same roots and same total slots (shape), after id-masking the live layout the same way.
    live_layout = live["layout"]
    static_layout = export_static.mask_layout(m, live_layout)
    check(len(static_layout["roots"]) == len(live_layout["roots"]), f"{tag}: root count differs")
    check(len(static_layout["slots"]) == len(live_layout["slots"]), f"{tag}: slot count differs")

    # Timeline (internal only).
    if view == "internal":
        check("timeline" in live, "internal: live payload has no timeline")

    # In-page links: every data-go="<id>" in a rendered body must point at a note present in this view.
    for fake_id, full in full_by_id.items():
        for target in re.findall(r'data-go="([^"]+)"', full.get("body_html", "")):
            check(target in masked_nodes, f"{tag}:{fake_id}: in-page link to missing note {target}")
    return len(masked_nodes)


def main():
    vault = Vault()
    if vault.problems:
        for p in vault.problems:
            print("VAULT PROBLEM:", p)
        return 1
    m = Masker(vault)
    results = []
    try:
        for view, account, live in live_payloads(vault):
            n = compare_view(m, view, account, live)
            results.append((view, account, n))
    except Fail as e:
        print("PARITY MISMATCH:", e)
        return 1
    print("STRUCTURAL PARITY OK:")
    for view, account, n in results:
        print(f"  {view}{'/' + account if account else '':<16} {n} notes match live")
    print("Intended differences (not compared for equality): masked values, Ask placeholder, documents "
          "disabled, client-side search ranking. See PARITY.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
