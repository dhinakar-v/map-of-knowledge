"""Deterministic masking for the public static build.

The GitHub Pages site ships every view as JSON that anyone can download, so it must contain NO real client,
person, vendor or document names. This module builds a stable map from each real token -> a fake-but-realistic
replacement, then rewrites every string the export emits (titles, props, body text/HTML, search index, meta).

Deterministic: the same input always maps to the same output, so links and cross-references stay consistent
(a person's name reads the same in a title, in an assignment and inside a sentence). Seeded only by the token
text, never by position, so re-running produces identical output.

The single public entry point is Masker(vault).  mask_text(s) rewrites one string; the export calls it on
every string it writes.  verify_clean(s) is the confidentiality gate: it raises if any real token survived.
"""
import hashlib
import re

# Real organisation names that appear across the vault. OUR_ORG (the vendor) and the account names are also
# pulled from the vault at runtime, but these constants catch the common short forms and product words that
# the showcase checker also bans.
VENDOR_REAL = "J2W"
VENDOR_FAKE = "Northwind"

# Fixed replacements for well-known real strings. Everything else is generated from pools below.
FIXED = {
    "J2W": VENDOR_FAKE,
    "GE Healthcare": "Acme Health",
    "GE": "Acme",
    "GEHC": "AcmeH",
    "Axone": "Vantage",
    "CSCS": "Meridian",
}

# Pools of fake-but-realistic values. A token is assigned a pool entry by a stable hash of the token, so the
# choice is deterministic and spread across the pool.
FIRST_NAMES = [
    "Jordan", "Riley", "Avery", "Morgan", "Casey", "Taylor", "Jamie", "Cameron", "Drew", "Quinn",
    "Reese", "Sawyer", "Emerson", "Finley", "Harper", "Kendall", "Logan", "Marlowe", "Parker", "Rowan",
    "Sage", "Tatum", "Blake", "Dakota", "Elliot", "Frankie", "Greer", "Hayden", "Indigo", "Jules",
    "Kai", "Lane", "Micah", "Noel", "Oakley", "Perry", "Remy", "Shay", "Toby", "Val",
]
LAST_NAMES = [
    "Carter", "Bennett", "Fletcher", "Harmon", "Walsh", "Doyle", "Pierce", "Mercer", "Vaughn", "Ellis",
    "Nolan", "Sutton", "Barlow", "Chandler", "Dalton", "Everett", "Garrison", "Holt", "Ingram", "Jennings",
    "Kirkland", "Langley", "Marsh", "Norton", "Osborne", "Prescott", "Radley", "Sterling", "Thorne", "Underwood",
    "Vance", "Winters", "Ashby", "Brennan", "Calloway", "Draper", "Finch", "Granger", "Hale", "Ivers",
]
COMPANY_WORDS = [
    "Acme Health", "Beacon Systems", "Cardinal Devices", "Delta Medical", "Evergreen Imaging",
    "Foundry Labs", "Granite Health", "Harbor Technologies", "Ironwood Medical", "Juniper Systems",
]
PROJECT_WORDS = [
    "Atlas", "Beacon", "Comet", "Delta", "Everest", "Falcon", "Granite", "Horizon", "Ion", "Juno",
    "Keystone", "Lumen", "Meridian", "Nova", "Orbit", "Pulse", "Quartz", "Relay", "Summit", "Tide",
]
DEPT_WORDS = [
    "Platform Engineering", "Clinical Systems", "Imaging Technology", "Quality Systems", "Release Engineering",
    "Verification Services", "Product Technology", "Delivery Services",
]
TEAM_WORDS = [
    "Rangers", "Pioneers", "Navigators", "Trailblazers", "Voyagers", "Wardens", "Sentinels", "Pilots",
]
JOB_TITLES = [
    "Engineering Manager", "Program Manager", "Product Owner", "Delivery Lead", "Principal Engineer",
    "QA Lead", "Platform Architect", "Release Manager", "Scrum Master", "Director of Engineering",
]


def _pick(pool, token, salt=""):
    """A stable pool entry for a token: a hash of (salt, lowercased token) indexes the pool."""
    h = hashlib.sha256((salt + "|" + token.lower()).encode("utf-8")).hexdigest()
    return pool[int(h[:8], 16) % len(pool)]


def _bounded(token):
    """Escaped token with a word boundary on each alnum edge, so e.g. 'GE' matches the word GE but not the
    'ge' inside 'Manager'. A non-alnum edge (rare) gets no boundary there."""
    esc = re.escape(token)
    left = r"\b" if token[:1].isalnum() else ""
    right = r"\b" if token[-1:].isalnum() else ""
    return f"{left}{esc}{right}"


def _fake_person(token):
    """A realistic 'First Last' for a person token, deterministic and collision-light (two pools hashed apart)."""
    first = _pick(FIRST_NAMES, token, "first")
    last = _pick(LAST_NAMES, token, "last")
    return f"{first} {last}"


class Masker:
    def __init__(self, vault):
        self.vault = vault
        self.map = {}          # real string -> fake string (titles, orgs, names)
        self.word_map = {}     # single word (name part, product word) -> fake word
        self.id_map = {}       # real note id (file name) -> fake slug (so shipped ids carry no real token)
        self._build_tokens()
        # One regex that finds any real token, longest first so "GE Healthcare" wins over "GE". Each token is
        # wrapped in word boundaries so a short acronym ("GE") never matches inside another word ("Manager"
        # must not become "ManaAcmer"). \b sits on the alnum edges of the token.
        tokens = sorted((t for t in {**self.map, **self.word_map} if t), key=len, reverse=True)
        self._re = re.compile("|".join(_bounded(t) for t in tokens), re.IGNORECASE) if tokens else None
        self._lookup = {k.lower(): v for k, v in {**self.map, **self.word_map}.items()}
        self._build_ids()      # needs mask_text, so after the regex is ready

    # ---------- build the token map from the vault ----------

    def _add(self, real, fake):
        real = (real or "").strip()
        if real and real not in self.map:
            self.map[real] = fake

    def _add_word(self, real, fake):
        real = (real or "").strip()
        if real and len(real) > 1 and real.lower() not in {w.lower() for w in self.word_map}:
            self.word_map[real] = fake

    def _build_tokens(self):
        v = self.vault
        for real, fake in FIXED.items():
            self._add(real, fake)
            self._add_word(real, fake)

        for nid, note in v.notes.items():
            fm = note["fm"]
            t = fm.get("type")
            title = str(fm.get("title") or nid)
            if t in ("person", "stakeholder"):
                fake = _fake_person(title)
                self._add(title, fake)
                # Also map each name part, so "Jane" or "Doe" alone inside prose is masked.
                parts = re.split(r"[\s,]+", title)
                fake_parts = fake.split(" ")
                for i, p in enumerate(parts):
                    if len(p) > 1:
                        self._add_word(p, fake_parts[min(i, len(fake_parts) - 1)])
            elif t == "account":
                self._add(title, _pick(COMPANY_WORDS, title, "acct"))
            elif t == "department":
                self._add(title, _pick(DEPT_WORDS, title, "dept"))
            elif t == "project":
                self._add(title, f"{_pick(PROJECT_WORDS, title, 'proj')} Programme")
            elif t == "team":
                org = str(fm.get("organisation") or "")
                vendor = VENDOR_FAKE if VENDOR_REAL.lower() in org.lower() else _pick(COMPANY_WORDS, org or title, "acct")
                self._add(title, f"{vendor} {_pick(TEAM_WORDS, title, 'team')}")
            elif t == "proposal":
                self._add(title, f"{_pick(PROJECT_WORDS, title, 'proj')} Proposal")
            elif t in ("document",):
                self._add(title, f"{_pick(PROJECT_WORDS, title, 'proj')} {str(fm.get('kind') or 'Document').title()}")
            # outcomes and lessons have generic titles; their bodies are masked by word/token replacement.

            # organisations named on any note
            org = str(fm.get("organisation") or "")
            if org:
                fake_org = VENDOR_FAKE if VENDOR_REAL.lower() == org.lower() else _pick(COMPANY_WORDS, org, "acct")
                self._add(org, fake_org)
                self._add_word(org, fake_org)

            # job titles are free client text -> replace with a realistic generic one
            job = str(fm.get("job-title") or "")
            if job and "TODO" not in job:
                self._add(job, _pick(JOB_TITLES, job, "job"))

            # file names -> a safe placeholder keeping the extension
            f = str(fm.get("file") or "")
            if f and f.lower().endswith((".pdf", ".docx", ".doc", ".md", ".xlsx", ".pptx")):
                ext = f[f.rfind("."):]
                self._add(f, f"{_pick(PROJECT_WORDS, f, 'proj').lower()}-document{ext}")

        # outcomes/lessons: generic titles, handled by text masking.

    def _build_ids(self):
        """A fake slug per note id, derived from the masked title so links read sensibly and carry no real
        token. Kept unique by suffixing a short hash on collision. Deterministic (showcase case-N ids keep
        their own form; they are generated by vault_views, not present in vault.notes)."""
        used = set()
        for nid, note in self.vault.notes.items():
            title = str(note["fm"].get("title") or nid)
            masked = self.mask_text(title)
            slug = re.sub(r"[^a-z0-9]+", "-", masked.lower()).strip("-") or "note"
            if slug in used:
                slug = f"{slug}-{hashlib.sha256(nid.encode()).hexdigest()[:6]}"
            used.add(slug)
            self.id_map[nid] = slug

    def mask_id(self, nid):
        """Masked id for a real note id. Unknown ids (e.g. showcase 'case-1', 'case-1-outcome-2') pass through
        unchanged -- they are generated clean by vault_views and contain no real token."""
        if nid is None:
            return None
        return self.id_map.get(nid, nid)

    # ---------- apply ----------

    def mask_text(self, s):
        if not isinstance(s, str) or not s or self._re is None:
            return s

        def sub(m):
            repl = self._lookup.get(m.group(0).lower(), m.group(0))
            # Preserve all-caps style for short acronyms (GE -> ACME style not needed; keep repl as defined).
            return repl
        return self._re.sub(sub, s)

    def mask_file(self, f):
        return self.mask_text(f) if f else f

    # ---------- confidentiality gate ----------

    def real_tokens(self):
        """Tokens that must never survive in shipped JSON: the longer real names (>2 chars) and the fixed words."""
        out = set()
        for real in list(self.map) + list(self.word_map) + list(FIXED):
            r = real.strip()
            if len(r) >= 3 and r.lower() not in {f.lower() for f in {**self.map, **self.word_map}.values()}:
                out.add(r)
        return out

    def verify_clean(self, s):
        """Raise if any real token (3+ chars) still appears in a masked string. The critical gate for Task 2."""
        if not isinstance(s, str) or not s:
            return
        low = s.lower()
        for tok in self.real_tokens():
            if re.search(r"\b" + re.escape(tok.lower()) + r"\b", low):
                raise AssertionError(f"real token {tok!r} leaked into masked output: {s[:120]!r}")
