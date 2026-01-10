//! # semantic-dom-ssg
//!
//! Rust implementation of ISO/IEC draft standard for SemanticDOM and Semantic State Graph.
//! Provides O(1) element lookup, deterministic navigation, and agent-ready web interoperability.
//!
//! ## Features
//!
//! - **O(1) Lookup**: Query any element by semantic ID instantly
//! - **Semantic State Graph**: FSM representation of UI states and transitions
//! - **Agent Certification**: Automated accessibility and agent-readiness scoring
//! - **MCP Compatible**: Model Context Protocol server support
//! - **TOON Serialization**: ~40-50% token savings for LLM prompts
//!
//! ## Example
//!
//! ```rust
//! use semantic_dom_ssg::{SemanticDOMParser, SemanticDocument};
//!
//! let html = r#"
//!     <html>
//!     <body>
//!         <nav aria-label="Main">
//!             <a href="/">Home</a>
//!         </nav>
//!         <main>
//!             <button id="submit-btn">Submit</button>
//!         </main>
//!     </body>
//!     </html>
//! "#;
//!
//! let parser = SemanticDOMParser::new();
//! let doc = parser.parse(html, "https://example.com").unwrap();
//!
//! // O(1) lookup
//! if let Some(button) = doc.query("submit-btn") {
//!     println!("Found button: {}", button.label);
//! }
//!
//! // Navigate to landmarks
//! for landmark in doc.landmarks() {
//!     println!("Landmark: {} - {}", landmark.role, landmark.label);
//! }
//! ```

pub mod core;
pub mod toon;

#[cfg(feature = "mcp")]
pub mod mcp;

pub use core::*;
pub use toon::ToonSerializer;

/// Library version
pub const VERSION: &str = "0.1.0";

/// ISO/IEC standard reference
pub const STANDARD: &str = "ISO/IEC-SDOM-SSG-DRAFT-2024";
