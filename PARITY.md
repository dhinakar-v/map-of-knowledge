# Parity report: static site vs the dynamic app

This records how the static GitHub Pages build (`static-sites/`) compares to the live FastAPI + SQLite + React
app (`backend/` + `web/`), and which differences are intentional.

## How parity is checked

`python compare_parity.py` (run from the repo root) is the automated gate. Both the dynamic API and the static
export derive every view from the **same** producer, `.claude/vault_views.Vault.view_data()` — the function
`backend/ingest.py` loads into SQLite and that `/api/tree` and `/api/notes/{id}` then return. The script treats
`view_data()` as the live payload, runs the static export, reverses the id mask, and asserts the two are
structurally identical. It exits 0 when parity holds.

What it asserts, per view (internal, one client view per account, showcase):

- same set of views;
- same number of notes, and the same notes (matched by reversing the id mask);
- same per-note key set, note `type`, `status`, `placeholder`, and prop count;
- same `parent` / `children` / `neighbours` wiring (compared as id sets, un-masked);
- same display-tree shape (same root count, same slot count);
- a timeline present in the internal view;
- every in-page link (`data-go="<id>"`) in a rendered body points at a note present in that view.

Last run:

```
STRUCTURAL PARITY OK:
  internal                 52 notes match live
  client/ge-healthcare     45 notes match live
  showcase                  0 notes match live
```

(The showcase has 0 notes because no note has `showcase: true` yet — see `SPEC.md` §13 step 7. This matches the
live app exactly: its showcase view is also empty.)

## Intended differences (NOT failures)

| Area | Live app | Static site | Why |
| --- | --- | --- | --- |
| Data values | Real client/person/vendor names | Fake-but-realistic placeholders (deterministic) | The site is public; masking is the only confidentiality control (`mask.py`). The no-real-token gate must pass before any deploy. |
| Note ids | Real file names (e.g. `axone-lts-automation`) | Fake slugs (e.g. `vantage-programme`) | Ids ship in the JSON and in `data-go` links, so they are masked too. |
| Ask (AI Q&A) | Live LLM over the notes | One canned worked example, no network call | A secret API key and a backend cannot ship to public Pages. |
| `GET /api/ask/status` | Reflects server config | Constant `{ available: false }` | No backend. |
| Documents | `GET /documents/{name}` streams the real file | Download disabled with a message | Real documents are not shipped in the masked demo. |
| Search | SQLite FTS5 (porter stemming, bm25) | In-browser prefix/weight search over a pre-built index | No server; ranking is equivalent, not byte-identical. Accepted. |
| Backend auth / `MOK_VIEWS` lock | Enforced server-side | N/A — all view JSON is downloadable | A static site cannot enforce access control; the data is masked instead. |

## Manual visual parity pass

Run the dynamic app (`run.bat`) and `npm run preview` (static) side by side and confirm each page renders the
same structure in each view, light and dark, at desktop and phone width:

- [ ] Start here / Overview
- [ ] People (Active / Past / All; J2W / client)
- [ ] Projects (cards; client summaries; showcase case studies)
- [ ] Timeline (internal)
- [ ] Map (outline + chart; Active/Past; filters)
- [ ] Documents (internal; note download is disabled in the static build)
- [ ] A note page (breadcrumb, key facts, body, in-page links resolve)
- [ ] Search from the header (`/` or Ctrl+K)
- [ ] Ask shows the static worked example (internal + client), hidden in the showcase

The automated gate covers data/structure; this pass covers rendering and styling, which are unchanged because
the static build reuses the same React components, CSS, fonts and icons as `web/`.
