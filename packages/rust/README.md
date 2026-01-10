# SemanticDOM SSG - Rust

Rust implementation of the SemanticDOM & Semantic State Graph (SSG) specification for AI-first web development.

## Installation

```toml
[dependencies]
semantic-dom-ssg = "0.1"
```

## Quick Start

```rust
use semantic_dom_ssg::{SemanticDOMParser, ToonSerializer};

fn main() {
    let html = r#"
        <html>
        <body>
            <nav aria-label="Main">
                <a href="/">Home</a>
            </nav>
            <main>
                <button id="submit">Submit</button>
            </main>
        </body>
        </html>
    "#;

    let mut parser = SemanticDOMParser::new();
    let doc = parser.parse(html, "https://example.com").unwrap();

    // O(1) element lookup
    if let Some(button) = doc.query("submit") {
        println!("Found: {} - {}", button.role, button.label);
    }

    // List landmarks
    for landmark in doc.landmarks() {
        println!("Landmark: {} - {}", landmark.role, landmark.label);
    }

    // Get certification score
    println!("Score: {}/100", doc.agent_ready.score);

    // Serialize to TOON format (40-50% token savings)
    let toon = ToonSerializer::serialize(&doc);
    println!("{}", toon);
}
```

## MCP Server

Run the MCP server for AI agent integration:

```bash
cargo run --bin mcp_server --features mcp
```

## Features

- `default` - Core parsing and serialization
- `mcp` - MCP server support (tokio, async-trait)

## Specification

Implements ISO/IEC-SDOM-SSG-DRAFT-2024:
- O(1) element lookup via semantic IDs
- Semantic State Graph for UI state modeling
- TOON format for token-efficient serialization
- Agent certification scoring

## License

MIT
