//! HTML to SemanticDOM parser

use super::*;
use scraper::{Html, Selector, ElementRef};
use std::collections::HashMap;

/// Parser for converting HTML to SemanticDOM.
pub struct SemanticDOMParser {
    id_counters: HashMap<String, usize>,
}

impl Default for SemanticDOMParser {
    fn default() -> Self {
        Self::new()
    }
}

impl SemanticDOMParser {
    pub fn new() -> Self {
        Self {
            id_counters: HashMap::new(),
        }
    }

    /// Parse HTML string into SemanticDocument.
    pub fn parse(&mut self, html: &str, url: &str) -> Result<SemanticDocument, ParseError> {
        let document = Html::parse_document(html);

        // Extract title
        let title = document
            .select(&Selector::parse("title").unwrap())
            .next()
            .map(|el| el.text().collect::<String>())
            .unwrap_or_default();

        // Extract language
        let language = document
            .select(&Selector::parse("html").unwrap())
            .next()
            .and_then(|el| el.value().attr("lang"))
            .unwrap_or("en")
            .to_string();

        // Parse body
        let body = document
            .select(&Selector::parse("body").unwrap())
            .next()
            .ok_or(ParseError::NoBody)?;

        let root = self.parse_element(body)?;

        // Run certification checks
        let certification = run_certification_checks(&root);

        Ok(SemanticDocument::builder()
            .url(url)
            .title(title)
            .language(language)
            .root(root)
            .agent_ready(certification)
            .build())
    }

    fn parse_element(&mut self, element: ElementRef) -> Result<SemanticNode, ParseError> {
        let role = self.infer_role(&element);
        let label = self.infer_label(&element);
        let _intent = self.infer_intent(&element, &role, &label);
        let state = self.infer_state(&element);
        let selector = self.build_selector(&element);
        let a11y = self.build_a11y(&element, &label);
        let id = self.generate_unique_id(&role, &label, &element);

        let mut children = Vec::new();
        for child in element.children() {
            if let Some(child_el) = ElementRef::wrap(child) {
                if self.is_semantic_element(&child_el) {
                    children.push(self.parse_element(child_el)?);
                } else {
                    // Process grandchildren of non-semantic wrappers
                    for grandchild in child_el.children() {
                        if let Some(gc_el) = ElementRef::wrap(grandchild) {
                            if self.is_semantic_element(&gc_el) {
                                children.push(self.parse_element(gc_el)?);
                            }
                        }
                    }
                }
            }
        }

        Ok(SemanticNode::builder()
            .id(id)
            .role(role)
            .label(label)
            .state(state)
            .selector(selector)
            .a11y(a11y)
            .children(children)
            .build())
    }

    fn infer_role(&self, element: &ElementRef) -> String {
        // Check explicit role
        if let Some(role) = element.value().attr("role") {
            return role.to_string();
        }

        // Check data-agent-role
        if let Some(role) = element.value().attr("data-agent-role") {
            return role.to_string();
        }

        // Infer from tag
        let tag = element.value().name();
        match tag {
            "button" => "button",
            "a" => "link",
            "input" => self.infer_input_role(element),
            "textarea" => "textbox",
            "select" => "listbox",
            "nav" => "navigation",
            "main" => "main",
            "header" => "banner",
            "footer" => "contentinfo",
            "aside" => "complementary",
            "form" => "form",
            "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => "heading",
            "ul" | "ol" => "list",
            "li" => "listitem",
            "table" => "table",
            "tr" => "row",
            "td" | "th" => "cell",
            "img" => "img",
            "dialog" => "dialog",
            "menu" => "menu",
            "article" => "article",
            "section" if element.value().attr("aria-label").is_some() => "region",
            _ => "generic",
        }.to_string()
    }

    fn infer_input_role(&self, element: &ElementRef) -> &'static str {
        match element.value().attr("type").unwrap_or("text") {
            "checkbox" => "checkbox",
            "radio" => "radio",
            "submit" | "button" | "reset" => "button",
            "search" => "searchbox",
            "number" => "spinbutton",
            "range" => "slider",
            _ => "textbox",
        }
    }

    fn infer_label(&self, element: &ElementRef) -> String {
        // Priority: aria-label > aria-labelledby > data-agent-label > title > text > alt > placeholder
        if let Some(label) = element.value().attr("aria-label") {
            return label.to_string();
        }

        if let Some(label) = element.value().attr("data-agent-label") {
            return label.to_string();
        }

        if let Some(title) = element.value().attr("title") {
            return title.to_string();
        }

        // Text content
        let text: String = element.text().collect();
        let text = text.trim();
        if !text.is_empty() && text.len() <= 100 {
            return text.to_string();
        }

        if let Some(alt) = element.value().attr("alt") {
            return alt.to_string();
        }

        if let Some(placeholder) = element.value().attr("placeholder") {
            return placeholder.to_string();
        }

        String::new()
    }

    fn infer_intent(&self, element: &ElementRef, role: &str, label: &str) -> Option<String> {
        if let Some(intent) = element.value().attr("data-agent-intent") {
            return Some(intent.to_string());
        }

        let label_lower = label.to_lowercase();

        if role == "button" {
            if label_lower.contains("submit") || label_lower.contains("send") {
                return Some("submit".to_string());
            }
            if label_lower.contains("cancel") || label_lower.contains("close") {
                return Some("cancel".to_string());
            }
            if label_lower.contains("delete") || label_lower.contains("remove") {
                return Some("delete".to_string());
            }
            if label_lower.contains("add") || label_lower.contains("create") {
                return Some("create".to_string());
            }
            if label_lower.contains("save") {
                return Some("save".to_string());
            }
            if label_lower.contains("search") {
                return Some("search".to_string());
            }
        }

        if role == "link" {
            if let Some(href) = element.value().attr("href") {
                if href.starts_with("mailto:") {
                    return Some("email".to_string());
                }
                if href.starts_with("tel:") {
                    return Some("phone".to_string());
                }
            }
        }

        None
    }

    fn infer_state(&self, element: &ElementRef) -> String {
        if element.value().attr("disabled").is_some() ||
           element.value().attr("aria-disabled") == Some("true") {
            return "disabled".to_string();
        }

        match element.value().attr("aria-expanded") {
            Some("true") => return "expanded".to_string(),
            Some("false") => return "collapsed".to_string(),
            _ => {}
        }

        if element.value().attr("aria-selected") == Some("true") {
            return "selected".to_string();
        }

        match element.value().attr("aria-checked") {
            Some("true") => return "checked".to_string(),
            Some("false") => return "unchecked".to_string(),
            Some("mixed") => return "mixed".to_string(),
            _ => {}
        }

        if element.value().attr("aria-hidden") == Some("true") {
            return "hidden".to_string();
        }

        if element.value().attr("open").is_some() {
            return "open".to_string();
        }

        "idle".to_string()
    }

    fn build_selector(&self, element: &ElementRef) -> String {
        if let Some(id) = element.value().attr("id") {
            return format!("#{}", id);
        }

        if let Some(agent_id) = element.value().attr("data-agent-id") {
            return format!("[data-agent-id=\"{}\"]", agent_id);
        }

        let mut selector = element.value().name().to_string();
        if let Some(class) = element.value().attr("class") {
            if let Some(first_class) = class.split_whitespace().next() {
                selector.push('.');
                selector.push_str(first_class);
            }
        }

        selector
    }

    fn build_a11y(&self, element: &ElementRef, label: &str) -> A11yInfo {
        let focusable = self.is_focusable(element);
        let in_tab_order = focusable && self.is_in_tab_order(element);
        let level = self.get_heading_level(element);

        A11yInfo {
            name: label.to_string(),
            focusable,
            in_tab_order,
            level,
        }
    }

    fn is_focusable(&self, element: &ElementRef) -> bool {
        let tag = element.value().name();

        if ["a", "button", "input", "select", "textarea"].contains(&tag) {
            return element.value().attr("disabled").is_none();
        }

        if let Some(tabindex) = element.value().attr("tabindex") {
            if let Ok(index) = tabindex.parse::<i32>() {
                return index >= 0;
            }
        }

        false
    }

    fn is_in_tab_order(&self, element: &ElementRef) -> bool {
        if let Some(tabindex) = element.value().attr("tabindex") {
            if let Ok(index) = tabindex.parse::<i32>() {
                return index >= 0;
            }
        }
        true
    }

    fn get_heading_level(&self, element: &ElementRef) -> Option<u8> {
        let tag = element.value().name();
        match tag {
            "h1" => Some(1),
            "h2" => Some(2),
            "h3" => Some(3),
            "h4" => Some(4),
            "h5" => Some(5),
            "h6" => Some(6),
            _ => element.value().attr("aria-level")
                .and_then(|l| l.parse().ok()),
        }
    }

    fn is_semantic_element(&self, element: &ElementRef) -> bool {
        let tag = element.value().name();

        let semantic_tags = [
            "main", "nav", "header", "footer", "aside", "article", "section",
            "button", "a", "input", "select", "textarea", "form",
            "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
            "table", "tr", "td", "th", "img", "dialog", "menu",
        ];

        if semantic_tags.contains(&tag) {
            return true;
        }

        element.value().attr("role").is_some() ||
        element.value().attr("data-agent-id").is_some() ||
        element.value().attr("data-agent-role").is_some() ||
        element.value().attr("aria-label").is_some()
    }

    fn generate_unique_id(&mut self, role: &str, label: &str, element: &ElementRef) -> SemanticId {
        if let Some(agent_id) = element.value().attr("data-agent-id") {
            return SemanticId::new(agent_id);
        }

        if let Some(html_id) = element.value().attr("id") {
            return SemanticId::new(html_id);
        }

        let base_id = SemanticId::generate(role, label);
        let counter = self.id_counters.entry(base_id.0.clone()).or_insert(0);
        *counter += 1;

        if *counter == 1 {
            base_id
        } else {
            SemanticId::new(format!("{}-{}", base_id.0, counter))
        }
    }
}

/// Parser error types.
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("HTML document has no body element")]
    NoBody,

    #[error("Failed to parse HTML: {0}")]
    HtmlError(String),
}
