//! Single-pass document traversal
//!
//! Walks the DOM once, in document order and without recursion, so cost is
//! linear in the document size and stack use does not depend on nesting.

use super::classify::{classify, determine_intent, input_type};
use super::ids::IdAllocator;
use super::label::{build_selector, LabelContext};
use super::SemanticDOM;
use crate::sanitize::{sanitize_identifier, sanitize_text};
use crate::security::validate_url;
use crate::types::{SemanticNode, SemanticRole};
use crate::{Config, MAX_NAME_LENGTH};
use ahash::{AHashMap, AHashSet};
use ego_tree::iter::Edge;
use scraper::{ElementRef, Html};

/// Maximum number of duplicate HTML ids reported
const MAX_REPORTED_DUPLICATES: usize = 100;

/// Tracks `id` attributes to report duplicates in the source document
#[derive(Debug, Default)]
struct HtmlIdTracker {
    seen: AHashSet<String>,
    reported: AHashSet<String>,
}

impl HtmlIdTracker {
    /// Record an id; returns it (sanitised) the first time it repeats
    fn record(&mut self, id: &str) -> Option<String> {
        if self.seen.insert(id.to_string()) || self.reported.len() >= MAX_REPORTED_DUPLICATES {
            return None;
        }
        self.reported
            .insert(id.to_string())
            .then(|| sanitize_identifier(id, 64))
    }
}

/// Populate `sdom` from a parsed document
pub(crate) fn populate(sdom: &mut SemanticDOM, document: &Html, config: &Config) {
    let ctx = LabelContext::new(document, &config.exclude_tags);
    let mut ids = IdAllocator::new(&config.id_prefix);
    let mut html_ids = HtmlIdTracker::default();

    let root = document.root_element();
    sdom.lang = root
        .value()
        .attr("lang")
        .map(|lang| sanitize_identifier(lang, 35))
        .filter(|lang| !lang.is_empty());

    // Element nesting depth of the current position (<html> is 1)
    let mut depth = 0usize;
    // Depth at which the subtree currently being skipped started
    let mut skip_from: Option<usize> = None;
    // Open semantic ancestors: (element depth, node id)
    let mut ancestors: Vec<(usize, String)> = Vec::new();

    for edge in root.traverse() {
        match edge {
            Edge::Open(node) => {
                let Some(element) = ElementRef::wrap(node) else {
                    continue;
                };
                depth += 1;
                if skip_from.is_some() {
                    continue;
                }
                let el = element.value();
                let tag = el.name();
                if depth > config.max_depth {
                    sdom.truncated = true;
                    skip_from = Some(depth);
                    continue;
                }
                if config.exclude_tags.iter().any(|t| t == tag) {
                    skip_from = Some(depth);
                    continue;
                }

                if let Some(id) = el.attr("id").filter(|id| !id.is_empty()) {
                    if let Some(duplicate) = html_ids.record(id) {
                        sdom.duplicate_ids.push(duplicate);
                    }
                }
                if tag == "title" && sdom.title.is_none() {
                    sdom.title = Some(ctx.text_of(element, MAX_NAME_LENGTH));
                }

                let Some(role) = classify(el) else {
                    continue;
                };
                let node_id = ids.allocate(tag, el.attr("id"));
                let mut node = build_node(&ctx, element, role, node_id.clone());
                node.depth = ancestors.len();
                if let Some((_, parent_id)) = ancestors.last() {
                    node.parent = Some(parent_id.clone());
                    if let Some(parent) = sdom.index.get_mut(parent_id) {
                        parent.children.push(node_id.clone());
                    }
                }

                if node.role.is_landmark() {
                    sdom.landmarks.push(node_id.clone());
                }
                if node.role.is_interactable() {
                    sdom.interactables.push(node_id.clone());
                }
                if matches!(node.role, SemanticRole::Heading) {
                    sdom.headings.push(node_id.clone());
                }

                ancestors.push((depth, node_id.clone()));
                // The allocator guarantees the key is new
                let previous = sdom.index.insert(node_id, node);
                debug_assert!(previous.is_none(), "semantic IDs must be unique");
            }
            Edge::Close(node) => {
                if !node.value().is_element() {
                    continue;
                }
                if skip_from == Some(depth) {
                    skip_from = None;
                }
                if ancestors.last().is_some_and(|(d, _)| *d == depth) {
                    ancestors.pop();
                }
                depth -= 1;
            }
        }
    }
}

/// Build the semantic node for a classified element
fn build_node(
    ctx: &LabelContext,
    element: ElementRef,
    role: SemanticRole,
    id: String,
) -> SemanticNode {
    let el = element.value();
    let labels = ctx.extract(element, &role);
    let mut node = SemanticNode::new(id, labels.label, role, build_selector(el));
    node.accessible_name = labels.accessible_name;

    // Only validated, non-empty targets are exposed as navigable
    if matches!(node.role, SemanticRole::Link) {
        node.href = el
            .attr("href")
            .and_then(|href| validate_url(href).ok())
            .filter(|href| !href.is_empty());
    }

    if node.role.is_interactable() {
        node.intent = Some(determine_intent(
            el,
            &node.role,
            &node.label,
            node.href.as_deref(),
        ));
    }

    if el.name() == "input" {
        let mut metadata = AHashMap::new();
        metadata.insert("type".to_string(), sanitize_text(&input_type(el), 32));
        node.metadata = Some(metadata);
    }

    node
}
