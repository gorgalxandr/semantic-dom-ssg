# semantic-dom-ssg

**Machine-readable web semantics for AI agents.**

An implementation of the ISO/IEC draft standard for SemanticDOM and Semantic State Graph (SSG), providing O(1) element lookup, deterministic navigation, and token-efficient serialization formats optimized for LLM consumption.

## Implementations

| Language | Package | Status |
|----------|---------|--------|
| TypeScript | [![npm](https://img.shields.io/npm/v/semantic-dom-ssg.svg)](https://www.npmjs.com/package/semantic-dom-ssg) | Published |
| Rust | [![crates.io](https://img.shields.io/crates/v/semantic-dom-ssg.svg)](https://crates.io/crates/semantic-dom-ssg) | Ready |
| Python | [![PyPI](https://img.shields.io/pypi/v/semantic-dom-ssg.svg)](https://pypi.org/project/semantic-dom-ssg/) | Ready |

## The Problem

When AI agents interact with web content, they face several challenges:

1. **Token inefficiency**: JSON/HTML representations consume excessive context tokens
2. **Navigation complexity**: DOM traversal requires O(n) scanning
3. **State opacity**: UI state and transitions are implicit, not machine-readable
4. **No standard format**: Every site structures semantics differently

## The Solution

semantic-dom-ssg provides:

| Feature | Benefit |
|---------|---------|
| **O(1) Lookup** | Hash-indexed nodes for instant element access |
| **State Graph** | Explicit FSM for UI states and valid transitions |
| **Agent Summary** | ~100 tokens vs ~800 for JSON (87% reduction) |
| **Security Hardened** | Input validation, URL sanitization, size limits |

## Quick Start

### TypeScript/JavaScript

```bash
npm install semantic-dom-ssg
```

```typescript
import { createSemanticDOM, toAgentSummary } from 'semantic-dom-ssg';

const sdom = createSemanticDOM();
const doc = sdom.parse(document.body, window.location.href);

// Generate agent summary (~100 tokens)
const summary = toAgentSummary(doc);

// O(1) element lookup. IDs are stable: the same DOM always yields the same IDs.
const button = doc.index.get(doc.interactables[0].id);
```

### Rust

```toml
[dependencies]
semantic-dom-ssg = "0.3"
```

```rust
use semantic_dom_ssg::{SemanticDOM, Config};

let html = r#"<html><body><nav><a href="/">Home</a></nav></body></html>"#;
let sdom = SemanticDOM::parse(html, None)?;

// O(1) lookup via HashMap
for (id, node) in &sdom.index {
    println!("{}: {:?}", id, node.role);
}

// Token-efficient summary (~100 tokens)
println!("{}", sdom.to_agent_summary());
```

### Python

```bash
pip install semantic-dom-ssg
```

```python
from semantic_dom_ssg import SemanticDOM

html = """<html><body><nav><a href="/">Home</a></nav></body></html>"""
sdom = SemanticDOM.parse(html)

# O(1) lookup via dict
for node_id, node in sdom.index.items():
    print(f"{node_id}: {node.role.value}")

# Token-efficient summary (~100 tokens)
print(sdom.to_agent_summary())
```

## CLI Tools

All implementations provide compatible CLI tools:

```bash
# TypeScript
npx semantic-dom parse index.html --format summary

# Rust
semantic-dom parse index.html --format summary

# Python
semantic-dom parse index.html --format summary
```

### Commands

| Command | Description |
|---------|-------------|
| `parse <file>` | Parse HTML to semantic format |
| `validate <file>` | Check agent readiness certification |
| `tokens <file>` | Compare token usage between formats |
| `mcp <file>` | Serve a page to an MCP client over stdio (TypeScript) |

### Output Formats

| Format | Tokens | Use Case |
|--------|--------|----------|
| `summary` | ~100 | LLM context, quick overview |
| `oneline` | ~20 | Ultra-compressed contexts |
| `json` | ~800 | Full programmatic access |

## Agent Certification

Documents are scored based on completeness and structure quality:

| Level | Score | Requirements |
|-------|-------|--------------|
| AAA | 90+ | Full compliance, complete metadata |
| AA | 70-89 | Deterministic FSM, strong structure |
| A | 50-69 | Basic compliance |
| None | <50 | Not agent-ready |

Scoring categories:
- **Structure** (30%): Landmarks, heading hierarchy, unique IDs
- **Accessibility** (30%): Accessible names, link/button text
- **Navigation** (25%): Navigation landmark, deterministic FSM
- **Interoperability** (15%): CSS selectors, semantic intents

## Security

All implementations enforce security hardening per ISO/IEC-SDOM-SSG-DRAFT-2024:

- **Input Size Limits**: 10MB default maximum, enforced while reading
- **URL Validation**: Only `https`, `http`, `file` protocols allowed; credentials stripped
- **Protocol Blocking**: `javascript:`, `data:`, `vbscript:`, `blob:` blocked
- **No Script Execution**: HTML parsing only, no JS evaluation
- **Secret Redaction**: password, hidden, payment and one-time-code values are never emitted
- **Single-line Labels**: page text cannot add lines to an agent summary

Page content is untrusted input. Output is safe to *display* to a model, but a
model should still treat labels as data, not instructions. See [SECURITY.md](SECURITY.md).

## Repository Structure

```
semantic-dom-ssg/
├── typescript/          # TypeScript/JavaScript implementation
│   ├── src/            # core, cli, mcp, react, vanilla, eslint-plugin, toon, summary
│   └── packages/       # Homebrew formula
├── rust/               # Rust implementation
│   └── src/            # Source code
├── python/             # Python implementation
│   ├── semantic_dom_ssg/
│   └── tests/
└── fixtures/           # Shared test fixtures
```

## Development

### TypeScript

Requires Node.js 22.13+. Run from the repository root:

```bash
npm ci
npm run verify   # file sizes, typecheck, lint, tests, build, package check
```

### Rust

```bash
cd rust
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

### Python

```bash
cd python
pip install -e ".[dev]"
ruff check . && mypy --strict semantic_dom_ssg && pytest
```

## Standards

Implements: `ISO/IEC-SDOM-SSG-DRAFT-2024`

Built on:
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [Schema.org](https://schema.org/) vocabulary

## License

MIT

## Author

George Alexander <info@gorgalxandr.com>
