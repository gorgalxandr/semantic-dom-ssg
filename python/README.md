# semantic-dom-ssg

[![PyPI version](https://badge.fury.io/py/semantic-dom-ssg.svg)](https://badge.fury.io/py/semantic-dom-ssg)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Machine-readable web semantics for AI agents.**

O(1) element lookup, deterministic navigation, and token-efficient serialization optimized for LLM consumption.

## Features

- **O(1) Lookup**: Hash-indexed nodes via dict for constant-time element access
- **Semantic State Graph**: Explicit FSM for UI states and transitions
- **Agent Summary**: ~100 tokens vs ~800 for JSON (87% reduction)
- **Security Hardened**: Byte-accurate size limits, URL validation, single-line sanitised labels, no form values in output
- **Typed**: Ships `py.typed`; passes `mypy --strict`

## Installation

```bash
pip install semantic-dom-ssg
```

Requires Python 3.10+, `beautifulsoup4>=4.13` and `lxml>=5.0`.

## Quick Start

```python
from semantic_dom_ssg import SemanticDOM, Config

html = """
<html>
<head><title>My Page</title></head>
<body>
    <nav><a href="/">Home</a></nav>
    <main><button>Submit</button></main>
</body>
</html>
"""

# Parse HTML (str, or UTF-8 bytes)
sdom = SemanticDOM.parse(html)

# O(1) lookup; nodes are indexed in document order
for node_id, node in sdom.index.items():
    print(f"{node_id}: {node.role.value} - {node.label}")
# sdom_nav_1: navigation - Home
# sdom_a_2: link - Home
# sdom_main_3: main - Submit
# sdom_button_4: button - Submit

# Token-efficient summary (~100 tokens)
print(sdom.to_agent_summary())

# One-line summary (~20 tokens)
print(sdom.to_one_liner())
```

## CLI Tool

```bash
# Parse HTML to JSON (use "-" to read stdin)
semantic-dom parse input.html --format json

# Token-efficient summary
semantic-dom parse input.html --format summary

# Other formats: oneline (~20 tokens), nav, audio
semantic-dom parse input.html --format oneline

# Validate for agent compatibility
semantic-dom validate input.html --level aa --ci

# Compare token usage
semantic-dom tokens input.html

semantic-dom --version
python -m semantic_dom_ssg parse - < input.html
```

Input must be UTF-8 (a BOM is accepted) and at most 10 MB; the read is bounded, so larger
input is rejected without being loaded.

| Exit code | Meaning |
|-----------|---------|
| 0 | Success (including `validate` without `--ci`) |
| 1 | `validate --ci`: required level not met |
| 2 | Usage error, unreadable file, input too large, or input is not UTF-8 |

Errors go to stderr; stdout only ever carries the requested output.

## Output Formats

### JSON (Full)
```json
{
  "title": "My Page",
  "lang": null,
  "landmarks": ["sdom_nav_1", "sdom_main_3"],
  "interactables": ["sdom_a_2", "sdom_button_4"],
  "headings": [],
  "nodes": {
    "sdom_a_2": {
      "id": "sdom_a_2", "label": "Home", "role": "link", "selector": "a", "depth": 1,
      "intent": "navigate", "accessibleName": "Home", "href": "/", "parent": "sdom_nav_1"
    }
  },
  "stateGraph": { "states": [...], "transitions": [...], "initialState": "initial" }
}
```

### Agent Summary (~100 tokens)
```
PAGE: My Page
LANDMARKS: nav(nav), main(main)
ACTIONS: [nav]Home, [sub]Submit
STATE: initial -> Home
STATS: 2L 2A 0H
```

`ACTIONS` lists the first 10 interactables and `STATE` the first 5 link targets; when there
are more, the line ends with `+N more`.

### One-liner (~20 tokens)
```
My Page | 2L 2A | nav,main | lnk:Home,btn:Submit
```

## Node IDs

- An element with an HTML `id` gets `<prefix>_<id>` (unsafe characters become `_`).
- Other elements get `<prefix>_<tag>_<n>`, where `n` counts id-less semantic elements in
  document order.
- IDs are unique and deterministic. If an HTML `id` is repeated, or equals a generated ID,
  the later node gets a numeric suffix (`sdom_menu`, `sdom_menu_2`, ...) - no node is ever
  dropped or overwritten. Repeated source ids are listed in `sdom.duplicate_ids`.

Each element is indexed once. An explicit ARIA `role` takes precedence over the tag name.
`node.parent`, `node.children` and `node.depth` describe the tree of semantic nodes.

## Security

All page content is treated as untrusted:

- **Input size**: 10 MB default, measured in **bytes** (`InputTooLargeError`). The CLI
  enforces it with a bounded read of files and stdin.
- **URL validation**: only `https`, `http` and `file` links are emitted. `javascript:`,
  `data:`, `vbscript:` and `blob:` are always blocked, including obfuscated spellings
  (mixed case, leading whitespace/control characters, embedded tabs/newlines). A link with a
  rejected target stays in the index without `href`, with intent `action`, and never becomes
  a state.
- **URL sanitising**: credentials (`https://user:pass@host`) are stripped, the scheme is
  lower-cased, whitespace/control characters are percent-encoded, and URLs longer than 2048
  characters are rejected. Protocol-relative URLs (`//host`, `/\host`) are kept as links but
  are not treated as internal states.
- **Labels and names**: whitespace runs (including newlines and Unicode line separators)
  collapse to one space; control characters, unpaired surrogates and bidi overrides are
  removed; labels are capped at 50 characters and accessible names at 200. A label cannot add
  a line such as `CERT: full (100/100)` to the line-oriented summaries. The text itself is
  still page-controlled data: do not treat it as instructions.
- **No form values**: the `value` of inputs (passwords included), `<textarea>` content and
  `<option>` text are never read. Only button-like inputs (`submit`, `button`, `reset`)
  expose their caption. `type="hidden"` inputs are not indexed.
- **Parser**: lxml's HTML parser only - no script execution, no DTD/entity expansion, no
  network or file access. Traversal is iterative and linear-time, so deeply nested markup
  cannot cause `RecursionError`.

```python
from semantic_dom_ssg import validate_url, InvalidUrlProtocolError

assert validate_url("https://example.com") == "https://example.com"
assert validate_url("https://user:pw@example.com/a") == "https://example.com/a"
assert validate_url("/relative/path") == "/relative/path"

try:
    validate_url("java\tscript:alert(1)")
except InvalidUrlProtocolError as e:
    print(f"Blocked: {e.protocol}")  # Blocked: javascript
```

`validate_url(url, *, max_length=2048, allowed_protocols=None)` raises
`InvalidUrlProtocolError`, `UrlTooLongError` or `InvalidUrlError` (all subclasses of
`SecurityError`). `sanitize_text(text, max_length=None)` is the single-line sanitiser used for
labels.

## Agent Certification

Validate HTML documents for AI agent compatibility:

```python
from semantic_dom_ssg import SemanticDOM, AgentCertification

sdom = SemanticDOM.parse(html)
cert = AgentCertification.certify(sdom)

print(f"{cert.level.badge} Level: {cert.level.name_str} (Score: {cert.score})")
print(f"Passed: {cert.stats.passed_checks}/{cert.stats.total_checks} checks")
```

### Certification Levels

| Level | Badge | Requirements |
|-------|-------|--------------|
| AAA   | 🥇    | Score 90+ (full compliance) |
| AA    | 🥈    | Score 70-89 (deterministic FSM) |
| A     | 🥉    | Score 50-69 (basic compliance) |
| None  | ❌    | Score < 50 |

Accessibility checks count a control as named only if it has a real accessible name
(`aria-label`, `<label>`, `title`, `alt`, `placeholder`, button caption or text content);
fallback labels such as `button.icon` or an input's `name` do not count. Button and form-label
checks pass when the page has no buttons or inputs. "Unique element IDs" fails when the source
repeats an `id`.

## API Reference

### SemanticDOM

```python
class SemanticDOM:
    # Attributes
    index: dict[str, SemanticNode]  # O(1) lookup, document order
    landmarks: list[str]            # Landmark IDs
    interactables: list[str]        # Interactive element IDs
    headings: list[str]             # Heading IDs
    state_graph: StateGraph         # UI state machine
    title: str | None               # Document title
    lang: str | None                # Document language
    duplicate_ids: list[str]        # HTML ids repeated in the source

    # Methods
    @classmethod
    def parse(cls, html: str | bytes, config: Config | None = None) -> "SemanticDOM"
    def get(self, node_id: str) -> SemanticNode | None
    def get_landmarks(self) -> list[SemanticNode]
    def get_interactables(self) -> list[SemanticNode]
    def get_headings(self) -> list[SemanticNode]
    def to_json(self, indent: int | None = 2, *, ensure_ascii: bool = True) -> str
    def to_dict(self) -> dict[str, Any]
    def to_agent_summary(self) -> str
    def to_one_liner(self) -> str
```

### Config

```python
@dataclass
class Config:
    max_input_size: int = 10 * 1024 * 1024  # bytes
    id_prefix: str = "sdom"  # letters, digits, "_" or "-"
    max_depth: int = 50  # max nesting of semantic nodes
    exclude_tags: list[str] = ["script", "style", "noscript", "template"]  # subtrees skipped
    include_state_graph: bool = True
    validate: bool = True  # reserved
    max_label_length: int = 50
    max_accessible_name_length: int = 200  # also caps the title
    max_url_length: int = 2048
```

Invalid values raise `ValueError`.

## Changes in 0.3.0

Behaviour changes to be aware of when upgrading from 0.2.0:

- Nodes are indexed once, in document order; generated IDs (`sdom_<tag>_<n>`) are numbered in
  document order instead of selector order. IDs derived from an HTML `id` are unchanged.
- `parent`, `children` and `depth` are populated; `max_depth` and `exclude_tags` are enforced.
- `<input>` without `type` (and other text-like types) is indexed; ARIA roles such as
  `role="button"` are recognised.
- Labels are whitespace-normalised and capped (including `aria-label`); `accessibleName` is
  capped at 200 characters and is `None` when only a fallback label exists.
- Links to `javascript:`/`data:` etc. get intent `action`; relative links (`page.html`,
  `?q=1`) now create states, protocol-relative links no longer do.
- `STATE:` in the agent summary lists link targets only (no longer repeats `Initial`).
- Certification: unnamed controls now fail accessibility checks; pages without buttons/inputs
  no longer fail the button/form checks; duplicate ids fail `STRUCT-004`.
- Button intent keywords match whole words (`News` is no longer `create`).
- CLI: running without a command is a usage error (exit 2); input errors exit 2 (was 1).
- Requires `beautifulsoup4>=4.13`.

## Development

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check . && .venv/bin/ruff format --check .
.venv/bin/mypy --strict semantic_dom_ssg
.venv/bin/pytest -q
```

## Standards

Implements [ISO/IEC-SDOM-SSG-DRAFT-2024](https://github.com/gorgalxandr/semantic-dom-ssg) specification for:

- Semantic element classification
- State graph construction
- Agent-ready certification
- Token-efficient serialization

## Related

- [semantic-dom-ssg (npm)](https://www.npmjs.com/package/semantic-dom-ssg) - TypeScript implementation
- [semantic-dom-ssg (crates.io)](https://crates.io/crates/semantic-dom-ssg) - Rust implementation

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

George Alexander <info@gorgalxandr.com>
