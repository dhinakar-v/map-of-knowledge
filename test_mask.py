"""Tests for the masking gate: python -m pytest static-sites/test_mask.py

Run from the repo root (the script wires sys.path to .claude for the shared vault model). Covers the two
properties the public build depends on: masking is deterministic, and no real token survives in masked output.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
VAULT = HERE.parent
sys.path.insert(0, str(VAULT / ".claude"))
sys.path.insert(0, str(HERE))

import vault_model                       # noqa: E402
vault_model.CODE_DIRS = vault_model.CODE_DIRS | {"static-sites"}
from vault_views import Vault            # noqa: E402
from mask import Masker, FIXED           # noqa: E402


@pytest.fixture(scope="module")
def masker():
    return Masker(Vault())


def test_fixed_names_are_replaced(masker):
    assert "J2W" not in masker.mask_text("J2W builds the platform")
    assert masker.mask_text("J2W") == FIXED["J2W"]
    assert "GE Healthcare" not in masker.mask_text("We work with GE Healthcare")
    # "GE Healthcare" must win over "GE" (longest match first)
    assert masker.mask_text("GE Healthcare") == FIXED["GE Healthcare"]


def test_deterministic(masker):
    a = masker.mask_text("Jane Doe leads the Axone work for GE Healthcare")
    b = masker.mask_text("Jane Doe leads the Axone work for GE Healthcare")
    assert a == b
    # A fresh masker over the same vault produces the same map.
    other = Masker(Vault())
    assert other.mask_text("Jane Doe leads the Axone work for GE Healthcare") == a


def test_person_name_parts_masked(masker):
    """A person's title maps to one fake name; each name part is masked on its own inside prose too."""
    people = [n for n, note in masker.vault.notes.items()
              if note["fm"].get("type") in ("person", "stakeholder")]
    assert people, "the reference vault has people"
    for nid in people[:5]:
        title = str(masker.vault.notes[nid]["fm"]["title"])
        masked = masker.mask_text(title)
        assert masked != title
        for part in title.replace(",", " ").split():
            if len(part) > 2:
                masker.verify_clean(masked)  # no original part survives


def test_ids_are_masked_and_consistent(masker):
    for real, fake in masker.id_map.items():
        assert fake == masker.mask_id(real)
    # Distinct real ids get distinct fake ids (no accidental merge of two notes).
    assert len(set(masker.id_map.values())) == len(masker.id_map)


def test_verify_clean_raises_on_leak(masker):
    with pytest.raises(AssertionError):
        masker.verify_clean("this mentions GE Healthcare directly")


def test_export_produces_clean_json_and_tree_integrity(tmp_path):
    """End-to-end: run the exporter, then assert (a) it reports a clean gate, and (b) every id a tree
    references has a matching notes/<id>.json file."""
    result = subprocess.run([sys.executable, str(HERE / "export_static.py")],
                            capture_output=True, text=True, cwd=str(VAULT))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "no real token leaked" in result.stdout

    data = HERE / "public" / "data"
    for tree_file in data.rglob("tree.json"):
        tree = json.loads(tree_file.read_text(encoding="utf-8"))
        notes_dir = tree_file.parent / "notes"
        for nid in tree["nodes"]:
            assert (notes_dir / f"{nid}.json").is_file(), f"missing note file for {nid} in {tree_file}"
        # parent/children/neighbours only point at nodes present in the same tree
        for nid, n in tree["nodes"].items():
            if n.get("parent"):
                assert n["parent"] in tree["nodes"], f"{nid} parent {n['parent']} not in tree"
            for c in n.get("children", []):
                assert c in tree["nodes"], f"{nid} child {c} not in tree"
