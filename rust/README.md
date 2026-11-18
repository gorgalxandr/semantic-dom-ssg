# semantic-dom-ssg

[![Crates.io](https://img.shields.io/crates/v/semantic-dom-ssg.svg)](https://crates.io/crates/semantic-dom-ssg)
[![Documentation](https://docs.rs/semantic-dom-ssg/badge.svg)](https://docs.rs/semantic-dom-ssg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Machine-readable web semantics for AI agents.**

O(1) element lookup, deterministic navigation, and token-efficient serialization optimized for LLM consumption.

## Features

- **O(1) Lookup**: Hash-indexed nodes via `AHashMap` for constant-time element access
- **Semantic State Graph**: Explicit FSM for UI states and transitions
- **Agent Summary**: ~100 tokens vs ~800 for JSON (87% reduction)
- **Security Hardened**: Untrusted-input handling throughout — size and nesting limits, URL sanitization, single-line text sanitization, no form values in output
- **Deterministic**: Same input, same IDs and byte-identical JSON on every run

## Quick Start

```rust
use semantic_dom_ssg::{SemanticDOM, Config};

let html = r#"
    <html>
    <body>
        <nav><a href="/">Home</a></nav>
        <main><button>Submit</button></main>
    </body>
    </html>
"#;

let sdom = SemanticDOM::parse(html, Config::default()).unwrap();

// Nodes in document order, with O(1) lookup by semantic ID
for id in &sdom.interactables {
    let node = sdom.get(id).unwrap();
    println!("{}: {:?} - {}", id, node.role, node.label);
}

// Token-efficient summary (~100 tokens)
let summary = sdom.to_agent_summary();
println!("{}", summary);
```

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
semantic-dom-ssg = "0.3"
```

Library only (no CLI, no `clap`):

```toml
[dependencies]
semantic-dom-ssg = { version = "0.3", default-features = false }
```

Minimum supported Rust version: 1.88.

### Reading from files and streams

`parse` takes a string. For files, sockets or stdin use the bounded readers,
which stop reading as soon as the size limit is crossed and accept non-UTF-8
input (invalid sequences are replaced):

```rust,no_run
use semantic_dom_ssg::{Config, Error, SemanticDOM};

fn main() -> Result<(), Error> {
    let from_file = SemanticDOM::from_file("page.html", Config::default())?;
    let from_stdin = SemanticDOM::from_reader(std::io::stdin().lock(), Config::default())?;
    println!("{}\n{}", from_file.to_one_liner(), from_stdin.to_one_liner());
    Ok(())
}
```

## CLI Tool

```bash
# Install CLI
cargo install semantic-dom-ssg

# Parse HTML to JSON (pretty-printed; --compact for a single line)
semantic-dom parse input.html --format json
semantic-dom parse input.html --compact

# Read from stdin
curl -s https://example.com | semantic-dom parse - --format summary

# Token-efficient summary
semantic-dom parse input.html --format summary

# One-line summary (~20 tokens)
semantic-dom parse input.html --format oneline

# Validate for agent compatibility
semantic-dom validate input.html --level aa --ci

# Compare token usage
semantic-dom tokens input.html
```

Every command accepts `--max-input-size <BYTES>` (default 10485760) and
`--max-depth <DEPTH>` (default 50).

| Exit code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | `validate --ci`: certification below the required level |
| 2 | Usage error (unknown command, invalid `--format`/`--level`, ...) |
| 3 | Input could not be read or parsed (missing file, too large, nested too deeply) |

Results go to stdout, diagnostics to stderr.

## Output Formats

### JSON (Full)
```json
{
  "title": "My Page",
  "landmarks": ["sdom_nav_1", "sdom_main_3"],
  "interactables": ["sdom_a_2", "sdom_button_4"],
  "nodes": { ... },
  "stateGraph": { ... },
  "duplicateIds": [],
  "truncated": false
}
```

Semantic IDs are `{prefix}_{html id}` for elements that have an `id`
attribute and `{prefix}_{tag}_{n}` otherwise, where `n` counts semantic
elements in document order. IDs are unique: a duplicate HTML id gets a
`_2`, `_3`, ... suffix (and is listed in `duplicateIds`). Lists are in
document order and `nodes` is sorted by ID.

### Agent Summary (~100 tokens)
```text
PAGE: My Page
LANDMARKS: nav(nav), main(main)
ACTIONS: [nav]Home, [sub]Submit
STATE: initial -> Home
STATS: 2L 2A 0H
```

### One-liner (~20 tokens)
```text
My Page | 2L 2A | nav,main | lnk:Home,btn:Submit
```

## Security

This crate implements security hardening per ISO/IEC-SDOM-SSG-DRAFT-2024:

The input document is treated as untrusted:

- **Input Size Limits**: 10MB default maximum, enforced by every entry point
  (`parse`, `from_bytes`, `from_reader`, `from_file`, CLI files and stdin).
  Readers are bounded: oversized input is rejected without being buffered.
- **Nesting Limits**: documents nesting elements deeper than 512 levels
  (`MAX_NESTING_DEPTH`, the limit browsers use) are rejected with
  `Error::NestingTooDeep`, because HTML tree construction is quadratic in the
  nesting depth. `Config::max_depth` (default 50) additionally limits how deep
  the analysis looks; deeper subtrees are skipped and `truncated` is set.
  Traversal is iterative and linear in the document size.
- **URL Validation**: Only `https`, `http`, `file` protocols allowed (scheme
  matched case-insensitively, ignoring the whitespace browsers ignore). Every
  other scheme, including `javascript:`, `data:`, `vbscript:`, `blob:`, is
  rejected; such links keep their node but have no `href` and never become
  state-graph targets. Malformed URLs and URLs over 2048 bytes are rejected.
- **Credential Stripping**: `https://user:pass@host/` becomes `https://host/`
- **External Targets**: protocol-relative URLs (`//host`, `/\host`) are
  validated like absolute URLs and are never treated as same-site states
- **Text Sanitization**: labels, accessible names, titles, IDs and selectors
  are single-line: whitespace runs (including newlines) collapse to one space,
  control characters and bidirectional overrides are removed, and lengths are
  capped (`MAX_LABEL_LENGTH` = 50, `MAX_NAME_LENGTH` = 200 characters). A page
  cannot inject extra lines such as `CERT: ...` into the agent summary.
- **No Form Values**: the `value` of inputs (passwords, hidden fields, text
  fields), `<textarea>` contents and `<option>` text are never read. Only the
  caption of button-type inputs is used. `<input type="hidden">` is skipped.
- **Excluded Content**: `script`, `style`, `noscript` and `template` subtrees
  are skipped, including their text
- **No Script Execution**: HTML parsing only, no JS evaluation

```rust
use semantic_dom_ssg::{validate_url, sanitize_text, SecurityConfig};

assert!(validate_url("https://example.com").is_ok());
assert!(validate_url("JavaScript:alert(1)").is_err());
assert_eq!(validate_url("https://user:pw@example.com/").unwrap(), "https://example.com/");

// Custom allow-list and length limit
let strict = SecurityConfig { allowed_protocols: vec!["https".into()], ..SecurityConfig::default() };
assert!(strict.validate_url("http://example.com").is_err());

assert_eq!(sanitize_text("Save\nCERT: full", 50), "Save CERT: full");
```

Text inside a summary line is not quoted: a label can still contain text that
looks like another entry of the *same* line (for example `, [sub]Fake`).
Consumers that need exact labels should read the JSON output.

## Agent Certification

Validate HTML documents for AI agent compatibility:

```rust
use semantic_dom_ssg::{SemanticDOM, Config, AgentCertification};

let html = "<nav><a href=\"/\">Home</a></nav><main><h1>Title</h1></main>";
let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
let cert = AgentCertification::certify(&sdom);

println!("{} Level: {} (Score: {})",
    cert.level.badge(),
    cert.level.name(),
    cert.score
);
```

### Certification Levels

| Level | Badge | Requirements |
|-------|-------|--------------|
| AAA   | 🥇    | Score 90+ (full compliance) |
| AA    | 🥈    | Score 70-89 (deterministic FSM) |
| A     | 🥉    | Score 50-69 (basic compliance) |
| None  | ❌    | Score < 50 |

## Performance

The document is analysed in a single iterative pass; lookup by ID is a hash
lookup. Indicative timings of the release CLI on an Apple Silicon laptop
(process start, parsing and JSON output included): a 100KB page in about
30ms; adversarial 10MB inputs (200,000 links, or nesting held at the depth
limit) in 2-9 seconds.

## Upgrading from 0.2

- `Error` is now `#[non_exhaustive]` and has two new variants, `InvalidUrl`
  and `NestingTooDeep`; add a wildcard arm when matching on it.
- Semantic IDs are assigned in document order (0.2 grouped them by element
  type), each element is indexed exactly once, and duplicate HTML ids no
  longer drop elements. Stored IDs from 0.2 will not match.
- `landmarks`, `interactables` and `headings` are in document order.
- `Config::max_depth` and `Config::exclude_tags` are now enforced.
- All labels are capped at 50 characters (0.2 only capped text content, by
  bytes) and whitespace inside them is collapsed.
- `validate_url` returns normalised URLs without credentials, rejects
  malformed absolute URLs, mail/ftp and other non-allow-listed schemes, and
  enforces the 2048-byte limit.
- Certification: ratio checks pass when there is nothing to check (a page
  without buttons no longer fails "Buttons have descriptive text"),
  `STRUCT-004` fails on duplicate HTML ids, and scores are rounded instead of
  truncated, so scores can differ from 0.2.
- CLI: read/parse errors exit with code 3 (0.2 panicked or exited 1).
- New: `SemanticDOM::{from_reader, from_file, from_bytes, to_json_compact}`,
  `SemanticDOM::{duplicate_ids, truncated}`, `SecurityConfig::validate_url`,
  `sanitize_text`, `CheckCategory`, `CertificationStats`, node `parent` /
  `children` / `depth`, input `metadata.type`, `<label>` association.

## Standards

Implements [ISO/IEC-SDOM-SSG-DRAFT-2024](https://github.com/gorgalxandr/semantic-dom-ssg) specification for:

- Semantic element classification
- State graph construction
- Agent-ready certification
- Token-efficient serialization

## Related

- [semantic-dom-ssg (npm)](https://www.npmjs.com/package/semantic-dom-ssg) - TypeScript implementation
- [ISO/IEC-SDOM-SSG-DRAFT-2024](https://github.com/gorgalxandr/semantic-dom-ssg) - Specification

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

George Alexander <info@gorgalxandr.com>
