//! Label, accessible-name and selector extraction
//!
//! All text taken from the document is sanitised and length-capped here, and
//! form control values are never read (only the caption of button-type
//! inputs is), so secrets typed or pre-filled into a page cannot leak into
//! any output format.

use super::classify::{input_type, is_button_input};
use crate::sanitize::{escape_css_identifier, sanitize_text, TextAccumulator};
use crate::types::SemanticRole;
use crate::{MAX_LABEL_LENGTH, MAX_NAME_LENGTH};
use ahash::AHashMap;
use ego_tree::iter::Edge;
use scraper::node::Element;
use scraper::{ElementRef, Html, Node};

/// Upper bound on tree edges visited while collecting one element's text
///
/// Keeps label extraction linear overall even for pathological nesting.
const TEXT_EDGE_BUDGET: usize = 4096;

/// How many ancestors are inspected when looking for a wrapping `<label>`
const LABEL_ANCESTOR_LIMIT: usize = 8;

/// Elements whose text content is a value or option list, not a caption
const VALUE_TAGS: &[&str] = &["textarea", "select", "datalist"];

/// Shared, read-only context for label extraction
#[derive(Debug)]
pub(crate) struct LabelContext<'a> {
    exclude_tags: &'a [String],
    /// `<label for="id">` captions keyed by the target id
    label_for: AHashMap<String, String>,
}

/// The human-readable texts derived for one element
#[derive(Debug)]
pub(crate) struct Labels {
    pub(crate) label: String,
    pub(crate) accessible_name: Option<String>,
}

impl<'a> LabelContext<'a> {
    /// Index every `<label for>` in the document (single linear pass)
    pub(crate) fn new(document: &Html, exclude_tags: &'a [String]) -> Self {
        let mut ctx = Self {
            exclude_tags,
            label_for: AHashMap::new(),
        };
        let labels = document
            .tree
            .nodes()
            .filter_map(ElementRef::wrap)
            .filter(|el| el.value().name() == "label");
        for label in labels {
            let Some(target) = label.value().attr("for") else {
                continue;
            };
            if ctx.label_for.contains_key(target) {
                continue;
            }
            let text = ctx.text_of(label, MAX_NAME_LENGTH);
            if !text.is_empty() {
                ctx.label_for.insert(target.to_string(), text);
            }
        }
        ctx
    }

    fn is_skipped(&self, tag: &str) -> bool {
        VALUE_TAGS.contains(&tag) || self.exclude_tags.iter().any(|t| t == tag)
    }

    /// Collect an element's visible text, sanitised and capped
    ///
    /// Skips excluded subtrees (scripts, styles) and form control values,
    /// and stops as soon as the cap or the edge budget is reached.
    pub(crate) fn text_of(&self, element: ElementRef, max_chars: usize) -> String {
        let mut acc = TextAccumulator::new(max_chars);
        let mut skip_depth = 0usize;

        for edge in element.traverse().skip(1).take(TEXT_EDGE_BUDGET) {
            if acc.is_full() {
                break;
            }
            match edge {
                Edge::Open(node) => match node.value() {
                    Node::Element(el) => {
                        if skip_depth > 0 || self.is_skipped(el.name()) {
                            skip_depth += 1;
                        }
                    }
                    Node::Text(text) if skip_depth == 0 => {
                        acc.push_str(text);
                    }
                    _ => {}
                },
                Edge::Close(node) => {
                    if node.value().is_element() {
                        skip_depth = skip_depth.saturating_sub(1);
                        // Adjacent blocks must not run together
                        acc.push_break();
                    }
                }
            }
        }
        acc.finish()
    }

    /// Caption from an associated `<label>` (`for` attribute or wrapping)
    fn associated_label(&self, element: ElementRef) -> Option<String> {
        if let Some(text) = element
            .value()
            .attr("id")
            .and_then(|id| self.label_for.get(id))
        {
            return Some(text.clone());
        }
        element
            .ancestors()
            .take(LABEL_ANCESTOR_LIMIT)
            .filter_map(ElementRef::wrap)
            .find(|el| el.value().name() == "label")
            .map(|label| self.text_of(label, MAX_NAME_LENGTH))
            .filter(|text| !text.is_empty())
    }

    /// Derive the label and accessible name of an element
    pub(crate) fn extract(&self, element: ElementRef, role: &SemanticRole) -> Labels {
        let el = element.value();
        let attr = |name: &str| {
            el.attr(name)
                .map(|v| sanitize_text(v, MAX_NAME_LENGTH))
                .filter(|v| !v.is_empty())
        };
        let tag = el.name();
        let is_input = tag == "input";
        let is_control = is_input || VALUE_TAGS.contains(&tag);

        // Accessible name: ARIA label, then native naming mechanisms
        let mut name = attr("aria-label");
        if name.is_none() && tag == "img" {
            name = attr("alt");
        }
        if name.is_none() {
            name = attr("title");
        }
        if name.is_none() && is_input && is_button_input(&input_type(el)) {
            name = attr("value").or_else(|| attr("alt"));
        }
        if name.is_none() && (is_control || matches!(role, SemanticRole::Interactive)) {
            name = self.associated_label(element);
        }
        if name.is_none() && !is_control {
            name = Some(self.text_of(element, MAX_NAME_LENGTH)).filter(|t| !t.is_empty());
        }
        if name.is_none() && is_control {
            name = attr("placeholder");
        }

        // Label: the accessible name, else a non-secret attribute hint
        let label = name
            .as_deref()
            .map(|n| sanitize_text(n, MAX_LABEL_LENGTH))
            .or_else(|| {
                is_control
                    .then(|| attr("name"))
                    .flatten()
                    .map(|n| sanitize_text(&n, MAX_LABEL_LENGTH))
            })
            .unwrap_or_else(|| fallback_label(el));

        Labels {
            label,
            accessible_name: name,
        }
    }
}

/// Fallback label: tag name with an id/class hint
fn fallback_label(el: &Element) -> String {
    let tag = el.name();
    let hint = if let Some(id) = el.attr("id").filter(|id| !id.trim().is_empty()) {
        format!("{tag}#{id}")
    } else if let Some(class) = el.attr("class").and_then(|c| c.split_whitespace().next()) {
        format!("{tag}.{class}")
    } else {
        tag.to_string()
    };
    sanitize_text(&hint, MAX_LABEL_LENGTH)
}

/// Build a CSS selector for an element
pub(crate) fn build_selector(el: &Element) -> String {
    let mut selector = escape_css_identifier(el.name());

    // Use ID if available (most specific)
    if let Some(id) = el.attr("id").filter(|id| !id.is_empty()) {
        selector.push('#');
        selector.push_str(&escape_css_identifier(id));
        return selector;
    }

    if let Some(classes) = el.attr("class") {
        for class in classes.split_whitespace().take(2) {
            selector.push('.');
            selector.push_str(&escape_css_identifier(class));
        }
    }

    selector
}
