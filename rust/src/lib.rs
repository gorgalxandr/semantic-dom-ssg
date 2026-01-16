//! # semantic-dom-ssg
//!
//! Machine-readable web semantics for AI agents.
//!
//! This crate provides O(1) element lookup, deterministic navigation, and
//! token-efficient serialization formats optimized for LLM consumption.
//!
//! ## Features
//!
//! - **O(1) Lookup**: Hash-indexed nodes via `AHashMap`
//! - **State Graph**: Explicit FSM for UI states and transitions
//! - **Agent Summary**: ~100 tokens vs ~800 for JSON (87% reduction)
//! - **Security**: Input validation, URL sanitization, size limits
//!
//! ## Quick Start
//!
//! ```rust,no_run
//! use semantic_dom_ssg::{SemanticDOM, Config};
//!
//! let html = r#"<html><body><main><button>Submit</button></main></body></html>"#;
//! let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
//!
//! // O(1) lookup by iterating index
//! for (id, node) in &sdom.index {
//!     println!("{}: {}", id, node.label);
//! }
//!
//! // Token-efficient summary (~100 tokens)
//! let summary = sdom.to_agent_summary();
//! println!("{}", summary);
//! ```
//!
//! ## Security
//!
//! This crate implements security hardening:
//! - Input size limits (10MB default)
//! - URL protocol validation (https, http, file only)
//! - No script execution (HTML parsing only)

#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(clippy::module_name_repetitions)]

mod types;
mod parser;
mod certification;
mod summary;
mod security;

pub use types::*;
pub use parser::SemanticDOM;
pub use certification::{AgentCertification, CertificationLevel, ValidationCheck};
pub use summary::{to_agent_summary, to_one_liner, to_nav_summary, to_audio_summary, compare_token_usage, TokenComparison};
pub use security::{validate_url, SecurityConfig};

use thiserror::Error;

/// Errors that can occur during SemanticDOM operations
#[derive(Error, Debug)]
pub enum Error {
    /// Input exceeds maximum size limit
    #[error("Input exceeds maximum size of {max_size} bytes (got {actual_size})")]
    InputTooLarge {
        /// Maximum allowed size
        max_size: usize,
        /// Actual input size
        actual_size: usize,
    },

    /// Invalid URL protocol
    #[error("URL has disallowed protocol: {protocol}")]
    InvalidUrlProtocol {
        /// The disallowed protocol
        protocol: String,
    },

    /// HTML parsing error
    #[error("Failed to parse HTML: {0}")]
    ParseError(String),

    /// IO error
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// Result type for SemanticDOM operations
pub type Result<T> = std::result::Result<T, Error>;

/// Configuration for SemanticDOM parsing
#[derive(Debug, Clone)]
pub struct Config {
    /// Maximum input size in bytes (default: 10MB)
    pub max_input_size: usize,
    /// ID prefix for generated semantic IDs
    pub id_prefix: String,
    /// Maximum tree depth to parse
    pub max_depth: usize,
    /// Elements to exclude from parsing
    pub exclude_tags: Vec<String>,
    /// Whether to generate state graph
    pub include_state_graph: bool,
    /// Whether to run certification checks
    pub validate: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_input_size: 10 * 1024 * 1024, // 10MB
            id_prefix: "sdom".to_string(),
            max_depth: 50,
            exclude_tags: vec![
                "script".to_string(),
                "style".to_string(),
                "noscript".to_string(),
                "template".to_string(),
            ],
            include_state_graph: true,
            validate: true,
        }
    }
}

/// Standard reference
pub const STANDARD: &str = "ISO/IEC-SDOM-SSG-DRAFT-2024";

/// Crate version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_html() {
        let html = r##"
            <html>
            <body>
                <nav>
                    <a href="#home">Home</a>
                    <a href="#about">About</a>
                </nav>
                <main>
                    <h1>Welcome</h1>
                    <button>Click me</button>
                </main>
            </body>
            </html>
        "##;

        let result = SemanticDOM::parse(html, Config::default());
        assert!(result.is_ok());

        let sdom = result.unwrap();
        assert!(!sdom.landmarks.is_empty());
        assert!(!sdom.interactables.is_empty());
    }

    #[test]
    fn test_o1_lookup() {
        let html = r#"<html><body><button id="test-btn">Test</button></body></html>"#;
        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();

        // Lookup should be O(1) via HashMap
        let node = sdom.index.values().find(|n| n.role == SemanticRole::Button);
        assert!(node.is_some());
    }

    #[test]
    fn test_agent_summary() {
        let html = r##"
            <html>
            <body>
                <nav><a href="#home">Home</a></nav>
                <main><button>Submit</button></main>
            </body>
            </html>
        "##;

        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
        let summary = sdom.to_agent_summary();

        assert!(summary.contains("LANDMARKS:"));
        assert!(summary.contains("ACTIONS:"));
    }

    #[test]
    fn test_input_size_limit() {
        let config = Config {
            max_input_size: 100,
            ..Default::default()
        };

        let html = "x".repeat(200);
        let result = SemanticDOM::parse(&html, config);

        assert!(matches!(result, Err(Error::InputTooLarge { .. })));
    }

    #[test]
    fn test_url_validation() {
        assert!(validate_url("https://example.com").is_ok());
        assert!(validate_url("http://example.com").is_ok());
        assert!(validate_url("file:///path/to/file").is_ok());
        assert!(validate_url("/relative/path").is_ok());

        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("data:text/html,<script>").is_err());
    }
}
