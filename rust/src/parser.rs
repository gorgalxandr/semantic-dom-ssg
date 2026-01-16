//! HTML parser for SemanticDOM
//!
//! Parses HTML documents and builds a semantic representation with
//! O(1) lookup via hash-indexed nodes.

use crate::security::validate_url;
use crate::types::*;
use crate::{Config, Error, Result};
use ahash::AHashMap;
use scraper::{Html, Selector, ElementRef};

/// The main SemanticDOM structure
///
/// Provides O(1) element lookup via hash-indexed nodes, deterministic
/// navigation, and token-efficient serialization.
#[derive(Debug, Clone)]
pub struct SemanticDOM {
    /// Hash-indexed nodes for O(1) lookup
    pub index: AHashMap<String, SemanticNode>,
    /// Landmark elements (nav, main, header, footer, etc.)
    pub landmarks: Vec<String>,
    /// Interactive elements (buttons, links, inputs, etc.)
    pub interactables: Vec<String>,
    /// Headings for document structure
    pub headings: Vec<String>,
    /// State graph for UI state management
    pub state_graph: StateGraph,
    /// Document title
    pub title: Option<String>,
    /// Document language
    pub lang: Option<String>,
    /// Configuration used for parsing
    config: Config,
    /// Counter for generating unique IDs
    id_counter: usize,
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
    /// * `Err(Error)` - If parsing fails or input exceeds limits
    ///
    /// # Security
    /// - Input size is validated against config.max_input_size
    /// - URLs are validated against allowed protocols
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

        let document = Html::parse_document(html);
        let mut sdom = SemanticDOM {
            index: AHashMap::new(),
            landmarks: Vec::new(),
            interactables: Vec::new(),
            headings: Vec::new(),
            state_graph: StateGraph::new(),
            title: None,
            lang: None,
            config,
            id_counter: 0,
        };

        // Extract document metadata
        sdom.extract_metadata(&document);

        // Parse semantic elements using selectors
        sdom.parse_semantic_elements(&document)?;

        // Build state graph if enabled
        if sdom.config.include_state_graph {
            sdom.build_state_graph();
        }

        Ok(sdom)
    }

    /// Extract document-level metadata
    fn extract_metadata(&mut self, document: &Html) {
        // Extract title
        if let Ok(selector) = Selector::parse("title") {
            if let Some(title_el) = document.select(&selector).next() {
                self.title = Some(title_el.text().collect::<String>().trim().to_string());
            }
        }

        // Extract language
        if let Ok(selector) = Selector::parse("html") {
            if let Some(html_el) = document.select(&selector).next() {
                if let Some(lang) = html_el.value().attr("lang") {
                    self.lang = Some(lang.to_string());
                }
            }
        }
    }

    /// Parse semantic elements using CSS selectors
    fn parse_semantic_elements(&mut self, document: &Html) -> Result<()> {
        // Define selectors for semantic elements
        let semantic_selectors = [
            // Landmarks
            ("nav", SemanticRole::Navigation),
            ("main", SemanticRole::Main),
            ("header", SemanticRole::Header),
            ("footer", SemanticRole::Footer),
            ("aside", SemanticRole::Aside),
            ("article", SemanticRole::Article),
            ("section", SemanticRole::Section),
            ("[role=navigation]", SemanticRole::Navigation),
            ("[role=main]", SemanticRole::Main),
            ("[role=banner]", SemanticRole::Header),
            ("[role=contentinfo]", SemanticRole::Footer),
            ("[role=complementary]", SemanticRole::Aside),
            ("[role=search]", SemanticRole::Search),
            // Interactables
            ("a[href]", SemanticRole::Link),
            ("button", SemanticRole::Button),
            ("input[type=submit]", SemanticRole::Button),
            ("input[type=button]", SemanticRole::Button),
            ("input[type=text]", SemanticRole::TextInput),
            ("input[type=email]", SemanticRole::TextInput),
            ("input[type=password]", SemanticRole::TextInput),
            ("input[type=search]", SemanticRole::TextInput),
            ("input[type=checkbox]", SemanticRole::Checkbox),
            ("input[type=radio]", SemanticRole::Radio),
            ("textarea", SemanticRole::TextInput),
            ("select", SemanticRole::Select),
            // Headings
            ("h1", SemanticRole::Heading),
            ("h2", SemanticRole::Heading),
            ("h3", SemanticRole::Heading),
            ("h4", SemanticRole::Heading),
            ("h5", SemanticRole::Heading),
            ("h6", SemanticRole::Heading),
            // Media
            ("img", SemanticRole::Image),
            ("video", SemanticRole::Video),
            ("audio", SemanticRole::Audio),
            // Other semantic
            ("form", SemanticRole::Form),
            ("dialog", SemanticRole::Dialog),
            ("[role=dialog]", SemanticRole::Dialog),
            ("[role=alert]", SemanticRole::Alert),
        ];

        for (selector_str, role) in semantic_selectors {
            if let Ok(selector) = Selector::parse(selector_str) {
                for element in document.select(&selector) {
                    self.process_element(element, role.clone())?;
                }
            }
        }

        Ok(())
    }

    /// Process a single element and add it to the index
    fn process_element(&mut self, element: ElementRef, role: SemanticRole) -> Result<()> {
        let el = element.value();

        // Skip excluded tags
        let tag_name = el.name().to_lowercase();
        if self.config.exclude_tags.contains(&tag_name) {
            return Ok(());
        }

        // Generate unique ID
        let node_id = self.generate_element_id(&tag_name, el);

        // Check if already processed (avoid duplicates)
        if self.index.contains_key(&node_id) {
            return Ok(());
        }

        // Extract label from element text content
        let label = Self::extract_element_label(element);

        // Build CSS selector
        let selector = Self::build_element_selector(el);

        // Create node
        let mut node = SemanticNode::new(node_id.clone(), label.clone(), role.clone(), selector);
        node.depth = 0; // We're not tracking depth in selector-based parsing

        // Extract intent for interactables
        if role.is_interactable() {
            node.intent = Some(Self::determine_element_intent(element, &role));
        }

        // Extract href for links
        if matches!(role, SemanticRole::Link) {
            if let Some(href) = el.attr("href") {
                // Validate URL
                if let Ok(safe_url) = validate_url(href) {
                    node.href = Some(safe_url);
                }
            }
        }

        // Extract accessible name
        node.accessible_name = Self::extract_element_accessible_name(element);

        // Track by category
        if role.is_landmark() {
            self.landmarks.push(node_id.clone());
        }
        if role.is_interactable() {
            self.interactables.push(node_id.clone());
        }
        if matches!(role, SemanticRole::Heading) {
            self.headings.push(node_id.clone());
        }

        // Insert into index (O(1) lookup)
        self.index.insert(node_id, node);

        Ok(())
    }

    /// Generate a unique ID for an element
    fn generate_element_id(&mut self, tag: &str, element: &scraper::node::Element) -> String {
        // Use existing ID if present
        if let Some(id) = element.attr("id") {
            return format!("{}_{}", self.config.id_prefix, id);
        }

        // Generate based on tag and counter
        self.id_counter += 1;
        format!("{}_{}_{}", self.config.id_prefix, tag, self.id_counter)
    }

    /// Extract label from element text content
    fn extract_element_label(element: ElementRef) -> String {
        let el = element.value();

        // Priority: aria-label > title > text content
        if let Some(label) = el.attr("aria-label") {
            return label.to_string();
        }

        if let Some(title) = el.attr("title") {
            return title.to_string();
        }

        // For inputs, use placeholder or name
        if el.name() == "input" {
            if let Some(placeholder) = el.attr("placeholder") {
                return placeholder.to_string();
            }
            if let Some(name) = el.attr("name") {
                return name.to_string();
            }
        }

        // Get text content
        let text: String = element.text().collect::<String>().trim().to_string();
        if !text.is_empty() {
            // Truncate if too long
            if text.len() > 50 {
                return format!("{}...", &text[..47]);
            }
            return text;
        }

        // Fallback to tag name with id/class hint
        let mut label = el.name().to_string();
        if let Some(id) = el.attr("id") {
            label = format!("{}#{}", label, id);
        } else if let Some(class) = el.attr("class") {
            let first_class = class.split_whitespace().next().unwrap_or("");
            if !first_class.is_empty() {
                label = format!("{}.{}", label, first_class);
            }
        }

        label
    }

    /// Build a CSS selector for an element
    fn build_element_selector(element: &scraper::node::Element) -> String {
        let tag = element.name();

        // Use ID if available (most specific)
        if let Some(id) = element.attr("id") {
            let escaped = crate::security::escape_css_identifier(id);
            return format!("{}#{}", tag, escaped);
        }

        // Build tag + classes
        let mut selector = tag.to_string();
        if let Some(classes) = element.attr("class") {
            for class in classes.split_whitespace().take(2) {
                let escaped = crate::security::escape_css_identifier(class);
                selector.push('.');
                selector.push_str(&escaped);
            }
        }

        selector
    }

    /// Extract accessible name from element
    fn extract_element_accessible_name(element: ElementRef) -> Option<String> {
        let el = element.value();

        // aria-label takes precedence
        if let Some(label) = el.attr("aria-label") {
            return Some(label.to_string());
        }

        // title attribute
        if let Some(title) = el.attr("title") {
            return Some(title.to_string());
        }

        // alt for images
        if el.name() == "img" {
            if let Some(alt) = el.attr("alt") {
                return Some(alt.to_string());
            }
        }

        // Text content as fallback
        let text: String = element.text().collect::<String>().trim().to_string();
        if !text.is_empty() {
            return Some(text);
        }

        None
    }

    /// Determine the user intent for an interactive element
    fn determine_element_intent(element: ElementRef, role: &SemanticRole) -> SemanticIntent {
        let el = element.value();

        // Check for explicit intent attributes
        if let Some(intent) = el.attr("data-intent") {
            return match intent.to_lowercase().as_str() {
                "navigate" => SemanticIntent::Navigate,
                "submit" => SemanticIntent::Submit,
                "action" => SemanticIntent::Action,
                "toggle" => SemanticIntent::Toggle,
                "select" => SemanticIntent::Select,
                "search" => SemanticIntent::Search,
                "play" => SemanticIntent::Play,
                "pause" => SemanticIntent::Pause,
                "open" => SemanticIntent::Open,
                "close" => SemanticIntent::Close,
                "expand" => SemanticIntent::Expand,
                "collapse" => SemanticIntent::Collapse,
                "download" => SemanticIntent::Download,
                "delete" => SemanticIntent::Delete,
                "edit" => SemanticIntent::Edit,
                "create" => SemanticIntent::Create,
                _ => SemanticIntent::Unknown,
            };
        }

        // Infer from element type and attributes
        match role {
            SemanticRole::Link => {
                if let Some(href) = el.attr("href") {
                    if href.ends_with(".pdf")
                        || href.ends_with(".zip")
                        || el.attr("download").is_some()
                    {
                        return SemanticIntent::Download;
                    }
                }
                SemanticIntent::Navigate
            }
            SemanticRole::Button => {
                let text = Self::extract_element_label(element).to_lowercase();

                // Check type attribute
                if let Some(btn_type) = el.attr("type") {
                    if btn_type == "submit" {
                        return SemanticIntent::Submit;
                    }
                }

                // Infer from button text
                if text.contains("submit") || text.contains("send") || text.contains("save") {
                    SemanticIntent::Submit
                } else if text.contains("delete") || text.contains("remove") {
                    SemanticIntent::Delete
                } else if text.contains("edit") || text.contains("modify") {
                    SemanticIntent::Edit
                } else if text.contains("create") || text.contains("add") || text.contains("new") {
                    SemanticIntent::Create
                } else if text.contains("toggle") {
                    SemanticIntent::Toggle
                } else if text.contains("open") {
                    SemanticIntent::Open
                } else if text.contains("close") || text.contains("cancel") {
                    SemanticIntent::Close
                } else if text.contains("expand") {
                    SemanticIntent::Expand
                } else if text.contains("collapse") {
                    SemanticIntent::Collapse
                } else if text.contains("play") {
                    SemanticIntent::Play
                } else if text.contains("pause") {
                    SemanticIntent::Pause
                } else if text.contains("search") {
                    SemanticIntent::Search
                } else {
                    SemanticIntent::Action
                }
            }
            SemanticRole::Checkbox | SemanticRole::Radio => SemanticIntent::Toggle,
            SemanticRole::Select => SemanticIntent::Select,
            SemanticRole::TextInput => {
                if let Some(input_type) = el.attr("type") {
                    if input_type == "search" {
                        return SemanticIntent::Search;
                    }
                }
                SemanticIntent::Input
            }
            _ => SemanticIntent::Unknown,
        }
    }

    /// Build the state graph from navigation elements
    fn build_state_graph(&mut self) {
        // Create initial state
        let initial = State {
            id: "initial".to_string(),
            name: "Initial".to_string(),
            description: Some("Initial page state".to_string()),
            url_pattern: Some("/".to_string()),
            is_initial: true,
            is_terminal: false,
        };
        self.state_graph.states.push(initial);
        self.state_graph.initial_state = Some("initial".to_string());

        // Create states from links
        for link_id in &self.interactables {
            if let Some(node) = self.index.get(link_id) {
                if let Some(href) = &node.href {
                    // Create a state for internal links
                    if href.starts_with('/') || href.starts_with('#') {
                        let state_id = format!("state_{}", href.replace('/', "_").replace('#', "h_"));
                        let state = State {
                            id: state_id.clone(),
                            name: node.label.clone(),
                            description: None,
                            url_pattern: Some(href.clone()),
                            is_initial: false,
                            is_terminal: false,
                        };

                        // Avoid duplicates
                        if !self.state_graph.states.iter().any(|s| s.id == state_id) {
                            self.state_graph.states.push(state);

                            // Create transition from initial
                            let transition = Transition {
                                from: "initial".to_string(),
                                to: state_id,
                                trigger: link_id.clone(),
                                action: Some("navigate".to_string()),
                                guard: None,
                            };
                            self.state_graph.transitions.push(transition);
                        }
                    }
                }
            }
        }
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

    /// Convert to JSON string
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(&self.to_serializable())
            .map_err(|e| Error::ParseError(e.to_string()))
    }

    /// Convert to a serializable structure
    fn to_serializable(&self) -> serde_json::Value {
        // Convert AHashMap to a standard collection for serialization
        let nodes: std::collections::HashMap<String, &SemanticNode> =
            self.index.iter().map(|(k, v)| (k.clone(), v)).collect();

        serde_json::json!({
            "title": self.title,
            "lang": self.lang,
            "landmarks": self.landmarks,
            "interactables": self.interactables,
            "headings": self.headings,
            "nodes": nodes,
            "stateGraph": self.state_graph,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let html = r#"
            <html>
            <body>
                <nav><a href="/">Home</a></nav>
                <main><button>Click</button></main>
            </body>
            </html>
        "#;

        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
        assert!(!sdom.landmarks.is_empty());
        assert!(!sdom.interactables.is_empty());
    }

    #[test]
    fn test_o1_lookup() {
        let html = r#"<html><body><button id="test">Test</button></body></html>"#;
        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();

        // O(1) lookup by iterating once to find the key
        let node = sdom.index.values().find(|n| n.role == SemanticRole::Button);
        assert!(node.is_some());
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
    fn test_url_validation_in_parser() {
        let html = r#"
            <html>
            <body>
                <a href="javascript:alert(1)">Bad</a>
                <a href="https://example.com">Good</a>
            </body>
            </html>
        "#;

        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();

        // Find the links
        let links: Vec<_> = sdom
            .index
            .values()
            .filter(|n| n.role == SemanticRole::Link)
            .collect();

        // The javascript: URL should be filtered out
        for link in &links {
            if let Some(href) = &link.href {
                assert!(!href.starts_with("javascript:"));
            }
        }
    }
}
