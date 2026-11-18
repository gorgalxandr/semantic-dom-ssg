//! HTML parser for SemanticDOM
//!
//! Parses HTML documents and builds a semantic representation with
//! O(1) lookup via hash-indexed nodes.

mod classify;
mod document;
mod ids;
mod label;
mod state_graph;
mod walk;

use crate::types::*;
use crate::{Config, Error, Result};
use ahash::AHashMap;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

/// The main SemanticDOM structure
///
/// Provides O(1) element lookup via hash-indexed nodes, deterministic
/// navigation, and token-efficient serialization.
#[derive(Debug, Clone)]
pub struct SemanticDOM {
    /// Hash-indexed nodes for O(1) lookup
    pub index: AHashMap<String, SemanticNode>,
    /// Landmark elements (nav, main, header, footer, etc.), in document order
    pub landmarks: Vec<String>,
    /// Interactive elements (buttons, links, inputs, etc.), in document order
    pub interactables: Vec<String>,
    /// Headings for document structure, in document order
    pub headings: Vec<String>,
    /// State graph for UI state management
    pub state_graph: StateGraph,
    /// Document title
    pub title: Option<String>,
    /// Document language
    pub lang: Option<String>,
    /// HTML `id` values that occur more than once in the source document
    /// (at most 100 are reported)
    pub duplicate_ids: Vec<String>,
    /// Whether part of the document was skipped because it is nested deeper
    /// than [`Config::max_depth`]
    pub truncated: bool,
    /// Configuration used for parsing
    config: Config,
}

impl SemanticDOM {
    /// Parse an HTML document into a SemanticDOM representation
    ///
    /// # Arguments
    /// * `html` - The HTML string to parse
    /// * `config` - Configuration options
    ///
    /// # Returns
    /// * `Ok(SemanticDOM)` - The parsed semantic DOM
    /// * `Err(Error)` - If the input exceeds the configured size limit or
    ///   nests elements deeper than [`MAX_NESTING_DEPTH`](crate::MAX_NESTING_DEPTH)
    ///
    /// # Security
    /// - Input size is validated against config.max_input_size
    /// - URLs are validated against allowed protocols
    /// - Text taken from the document is sanitised and length-capped
    /// - No script execution (HTML parsing only)
    ///
    /// # Examples
    /// ```
    /// use semantic_dom_ssg::{SemanticDOM, Config};
    ///
    /// let html = "<html><body><nav><a href=\"/\">Home</a></nav></body></html>";
    /// let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
    /// assert!(!sdom.landmarks.is_empty());
    /// ```
    pub fn parse(html: &str, config: Config) -> Result<Self> {
        // Security: validate input size
        if html.len() > config.max_input_size {
            return Err(Error::InputTooLarge {
                max_size: config.max_input_size,
                actual_size: html.len(),
            });
        }

        let document = document::parse_html(html)?;
        let mut sdom = SemanticDOM {
            index: AHashMap::new(),
            landmarks: Vec::new(),
            interactables: Vec::new(),
            headings: Vec::new(),
            state_graph: StateGraph::new(),
            title: None,
            lang: None,
            duplicate_ids: Vec::new(),
            truncated: false,
            config,
        };

        let config = sdom.config.clone();
        walk::populate(&mut sdom, &document, &config);

        if config.include_state_graph {
            sdom.state_graph = state_graph::build(sdom.get_interactables().into_iter());
        }

        Ok(sdom)
    }

    /// Parse raw bytes, replacing invalid UTF-8 sequences
    ///
    /// The size limit is checked before any decoding or parsing.
    pub fn from_bytes(bytes: &[u8], config: Config) -> Result<Self> {
        if bytes.len() > config.max_input_size {
            return Err(Error::InputTooLarge {
                max_size: config.max_input_size,
                actual_size: bytes.len(),
            });
        }
        let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
        Self::parse(&String::from_utf8_lossy(bytes), config)
    }

    /// Parse a document from a reader (file, stdin, socket, ...)
    ///
    /// Reads at most `config.max_input_size + 1` bytes: oversized or endless
    /// input is rejected without being buffered in full.
    ///
    /// # Examples
    /// ```
    /// use semantic_dom_ssg::{SemanticDOM, Config};
    ///
    /// let html = b"<main><button>Go</button></main>";
    /// let sdom = SemanticDOM::from_reader(&html[..], Config::default()).unwrap();
    /// assert_eq!(sdom.interactables.len(), 1);
    /// ```
    pub fn from_reader<R: Read>(reader: R, config: Config) -> Result<Self> {
        let limit = u64::try_from(config.max_input_size)
            .unwrap_or(u64::MAX)
            .saturating_add(1);
        let mut buffer = Vec::new();
        reader.take(limit).read_to_end(&mut buffer)?;
        Self::from_bytes(&buffer, config)
    }

    /// Parse a document from a file, enforcing the input size limit
    pub fn from_file<P: AsRef<Path>>(path: P, config: Config) -> Result<Self> {
        Self::from_reader(std::fs::File::open(path)?, config)
    }

    /// Get a node by ID in O(1) time
    pub fn get(&self, id: &str) -> Option<&SemanticNode> {
        self.index.get(id)
    }

    /// Get all landmark nodes
    pub fn get_landmarks(&self) -> Vec<&SemanticNode> {
        self.landmarks
            .iter()
            .filter_map(|id| self.index.get(id))
            .collect()
    }

    /// Get all interactable nodes
    pub fn get_interactables(&self) -> Vec<&SemanticNode> {
        self.interactables
            .iter()
            .filter_map(|id| self.index.get(id))
            .collect()
    }

    /// Convert to a pretty-printed JSON string
    ///
    /// Output is deterministic: nodes are emitted sorted by ID.
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(&self.to_serializable())
            .map_err(|e| Error::ParseError(e.to_string()))
    }

    /// Convert to a compact, single-line JSON string
    pub fn to_json_compact(&self) -> Result<String> {
        serde_json::to_string(&self.to_serializable()).map_err(|e| Error::ParseError(e.to_string()))
    }

    /// Convert to a serializable structure
    fn to_serializable(&self) -> serde_json::Value {
        // Sorted map: hash-map iteration order differs from run to run
        let nodes: BTreeMap<&str, &SemanticNode> =
            self.index.iter().map(|(k, v)| (k.as_str(), v)).collect();

        serde_json::json!({
            "title": self.title,
            "lang": self.lang,
            "landmarks": self.landmarks,
            "interactables": self.interactables,
            "headings": self.headings,
            "nodes": nodes,
            "stateGraph": self.state_graph,
            "duplicateIds": self.duplicate_ids,
            "truncated": self.truncated,
        })
    }

    /// Generate token-efficient agent summary
    pub fn to_agent_summary(&self) -> String {
        crate::summary::to_agent_summary(self)
    }

    /// Generate one-line summary
    pub fn to_one_liner(&self) -> String {
        crate::summary::to_one_liner(self)
    }
}
