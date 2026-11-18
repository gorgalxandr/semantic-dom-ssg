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
//! ```rust
//! use semantic_dom_ssg::{SemanticDOM, Config};
//!
//! let html = r#"<html><body><main><button id="go">Submit</button></main></body></html>"#;
//! let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
//!
//! // O(1) lookup by semantic ID
//! let button = sdom.get("sdom_go").unwrap();
//! assert_eq!(button.label, "Submit");
//!
//! // Token-efficient summary (~100 tokens)
//! let summary = sdom.to_agent_summary();
//! println!("{}", summary);
//! ```
//!
//! ## Security
//!
//! The input document is treated as untrusted:
//! - Input size limits (10MB default) on every entry point
//! - Element nesting is limited to [`MAX_NESTING_DEPTH`]; parsing and
//!   analysis are iterative and linear in the input size
//! - URL protocol validation (https, http, file only), credentials removed
//! - Labels, names and titles are reduced to single-line text with control
//!   characters removed, so page content cannot forge summary lines
//! - Form control values (passwords, textarea contents) are never read
//! - No script execution (HTML parsing only)

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(clippy::all)]
#![allow(clippy::module_name_repetitions)]

mod certification;
mod parser;
mod sanitize;
mod security;
mod summary;
mod types;

pub use certification::{
    AgentCertification, CertificationLevel, CertificationStats, CheckCategory, ValidationCheck,
};
pub use parser::SemanticDOM;
pub use sanitize::sanitize_text;
pub use security::{validate_url, SecurityConfig};
pub use summary::{
    compare_token_usage, to_agent_summary, to_audio_summary, to_nav_summary, to_one_liner,
    TokenComparison,
};
pub use types::*;

use thiserror::Error;

/// Errors that can occur during SemanticDOM operations
#[derive(Error, Debug)]
#[non_exhaustive]
pub enum Error {
    /// Input exceeds maximum size limit
    ///
    /// For streamed input (`SemanticDOM::from_reader`) reading stops as soon
    /// as the limit is crossed, so `actual_size` is then a lower bound.
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

    /// URL is malformed or too long
    #[error("Invalid URL: {reason}")]
    InvalidUrl {
        /// Why the URL was rejected
        reason: String,
    },

    /// Elements are nested deeper than [`MAX_NESTING_DEPTH`]
    #[error("HTML elements are nested deeper than {max_depth} levels")]
    NestingTooDeep {
        /// Maximum supported nesting depth
        max_depth: usize,
    },

    /// HTML parsing or serialization error
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
    /// Maximum element nesting depth to analyse (default: 50)
    ///
    /// The `<html>` element is depth 1. Elements nested deeper are skipped
    /// together with their subtrees and [`SemanticDOM::truncated`] is set.
    pub max_depth: usize,
    /// Elements to exclude from parsing, together with everything inside
    /// them (lowercase tag names)
    pub exclude_tags: Vec<String>,
    /// Whether to generate state graph
    pub include_state_graph: bool,
    /// Reserved: certification is not run during parsing. Call
    /// [`AgentCertification::certify`] on the parsed document instead.
    pub validate: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_input_size: security::DEFAULT_MAX_INPUT_SIZE,
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

/// Maximum element nesting depth accepted by the parser
///
/// HTML tree construction costs time proportional to the nesting depth for
/// every tag, so unbounded nesting lets a small document consume minutes of
/// CPU. Parsing stops with [`Error::NestingTooDeep`] beyond this depth (the
/// same limit browsers apply). [`Config::max_depth`] separately limits how
/// deep the analysis looks.
pub const MAX_NESTING_DEPTH: usize = 512;

/// Maximum length of a node label, in characters
pub const MAX_LABEL_LENGTH: usize = 50;

/// Maximum length of an accessible name or document title, in characters
pub const MAX_NAME_LENGTH: usize = 200;

/// Standard reference
pub const STANDARD: &str = "ISO/IEC-SDOM-SSG-DRAFT-2024";

/// Crate version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Compiles and runs the README examples as doctests
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;
