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
- **Security Hardened**: Input validation, URL sanitization, size limits

## Installation

```bash
pip install semantic-dom-ssg
```

## Quick Start

```python
from semantic_dom_ssg import SemanticDOM, Config

html = """
<html>
<body>
    <nav><a href="/">Home</a></nav>
    <main><button>Submit</button></main>
</body>
</html>
"""

# Parse HTML
sdom = SemanticDOM.parse(html)

# O(1) lookup
for node_id, node in sdom.index.items():
    print(f"{node_id}: {node.role.value} - {node.label}")

# Token-efficient summary (~100 tokens)
print(sdom.to_agent_summary())

# One-line summary (~20 tokens)
print(sdom.to_one_liner())
```

## CLI Tool

```bash
# Parse HTML to JSON
semantic-dom parse input.html --format json

# Token-efficient summary
semantic-dom parse input.html --format summary

# One-line summary (~20 tokens)
semantic-dom parse input.html --format oneline

# Validate for agent compatibility
semantic-dom validate input.html --level aa --ci

# Compare token usage
semantic-dom tokens input.html
```

## Output Formats

### JSON (Full)
```json
{
  "title": "My Page",
  "landmarks": ["sdom_nav_1", "sdom_main_2"],
  "interactables": ["sdom_a_1", "sdom_button_1"],
  "nodes": { ... }
}
```

### Agent Summary (~100 tokens)
```
PAGE: My Page
LANDMARKS: nav(nav), main(main)
ACTIONS: [nav]Home, [act]Submit
STATE: initial -> Home
STATS: 2L 2A 0H
```

### One-liner (~20 tokens)
```
My Page | 2L 2A | nav,main | lnk:Home,btn:Submit
```

## Security

This package implements security hardening per ISO/IEC-SDOM-SSG-DRAFT-2024:

- **Input Size Limits**: 10MB default maximum
- **URL Validation**: Only `https`, `http`, `file` protocols allowed
- **Protocol Blocking**: `javascript:`, `data:`, `vbscript:`, `blob:` blocked
- **No Script Execution**: HTML parsing only, no JS evaluation

```python
from semantic_dom_ssg import validate_url
from semantic_dom_ssg.security import InvalidUrlProtocolError

# Safe URLs
assert validate_url("https://example.com") == "https://example.com"
assert validate_url("/relative/path") == "/relative/path"

# Blocked URLs
try:
    validate_url("javascript:alert(1)")
except InvalidUrlProtocolError as e:
    print(f"Blocked: {e.protocol}")
```

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

## API Reference

### SemanticDOM

```python
class SemanticDOM:
    # Attributes
    index: dict[str, SemanticNode]  # O(1) lookup
    landmarks: list[str]            # Landmark IDs
    interactables: list[str]        # Interactive element IDs
    headings: list[str]             # Heading IDs
    state_graph: StateGraph         # UI state machine
    title: Optional[str]            # Document title
    lang: Optional[str]             # Document language

    # Methods
    @classmethod
    def parse(cls, html: str, config: Optional[Config] = None) -> "SemanticDOM"
    def get(self, node_id: str) -> Optional[SemanticNode]
    def get_landmarks(self) -> list[SemanticNode]
    def get_interactables(self) -> list[SemanticNode]
    def to_json(self, indent: int = 2) -> str
    def to_dict(self) -> dict
    def to_agent_summary(self) -> str
    def to_one_liner(self) -> str
```

### Config

```python
@dataclass
class Config:
    max_input_size: int = 10 * 1024 * 1024  # 10MB
    id_prefix: str = "sdom"
    max_depth: int = 50
    exclude_tags: list[str] = ["script", "style", "noscript", "template"]
    include_state_graph: bool = True
    validate: bool = True
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
