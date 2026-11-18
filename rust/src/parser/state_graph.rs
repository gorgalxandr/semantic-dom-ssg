//! State graph construction from navigation links

use crate::security::is_internal_url;
use crate::types::{SemanticNode, SemanticRole, State, StateGraph, Transition};
use ahash::{AHashMap, AHashSet};

/// ID of the initial state
const INITIAL_STATE: &str = "initial";

/// Maximum number of characters of a link target used in a state ID
const MAX_SLUG_CHARS: usize = 64;

/// Turn a link target into a readable state ID fragment
///
/// Not injective on its own (`/a/b` and `/a_b` share a slug); the caller
/// disambiguates colliding slugs.
fn slug(href: &str) -> String {
    let mut out = String::new();
    for c in href.chars().take(MAX_SLUG_CHARS) {
        match c {
            '#' => out.push_str("h_"),
            c if c.is_alphanumeric() || matches!(c, '-' | '.') => out.push(c),
            _ => out.push('_'),
        }
    }
    out
}

/// Build the state graph: one state per distinct internal link target and
/// one transition per link
///
/// Only validated, same-site targets become states. Links whose `href` was
/// rejected by URL validation (for example `javascript:`) have no `href` on
/// their node and therefore never appear here; absolute and
/// protocol-relative URLs are external and are skipped as well.
pub(crate) fn build<'a>(links: impl Iterator<Item = &'a SemanticNode>) -> StateGraph {
    let mut graph = StateGraph::new();
    graph.states.push(State {
        id: INITIAL_STATE.to_string(),
        name: "Initial".to_string(),
        description: Some("Initial page state".to_string()),
        url_pattern: Some("/".to_string()),
        is_initial: true,
        is_terminal: false,
    });
    graph.initial_state = Some(INITIAL_STATE.to_string());

    let mut state_by_href: AHashMap<&str, String> = AHashMap::new();
    let mut used_ids: AHashSet<String> = AHashSet::new();
    let mut next_suffix: AHashMap<String, usize> = AHashMap::new();

    for node in links.filter(|n| matches!(n.role, SemanticRole::Link)) {
        let Some(href) = node.href.as_deref().filter(|h| is_internal_url(h)) else {
            continue;
        };

        let state_id = match state_by_href.get(href) {
            Some(id) => id.clone(),
            None => {
                let base = format!("state_{}", slug(href));
                let mut id = base.clone();
                while used_ids.contains(&id) {
                    let n = next_suffix.entry(base.clone()).or_insert(2);
                    id = format!("{base}_{n}");
                    *n += 1;
                }
                used_ids.insert(id.clone());
                state_by_href.insert(href, id.clone());
                graph.states.push(State {
                    id: id.clone(),
                    name: node.label.clone(),
                    description: None,
                    url_pattern: Some(href.to_string()),
                    is_initial: false,
                    is_terminal: false,
                });
                id
            }
        };

        graph.transitions.push(Transition {
            from: INITIAL_STATE.to_string(),
            to: state_id,
            trigger: node.id.clone(),
            action: Some("navigate".to_string()),
            guard: None,
        });
    }

    graph
}
