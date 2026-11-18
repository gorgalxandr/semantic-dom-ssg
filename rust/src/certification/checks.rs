//! Individual certification checks
//!
//! Ratio checks pass vacuously when there is nothing to check: a page
//! without buttons cannot have unlabeled buttons. A document without any
//! semantic element is the exception and fails them.

use super::{CheckCategory, ValidationCheck};
use crate::parser::SemanticDOM;
use crate::types::{SemanticNode, SemanticRole};

/// Minimum share of elements that must satisfy a ratio check
const PASS_RATIO: f32 = 0.8;

/// Run every check, in a fixed order
pub(super) fn run_all(sdom: &SemanticDOM) -> Vec<ValidationCheck> {
    vec![
        // Structure checks (30%)
        check_has_landmarks(sdom),
        check_has_main(sdom),
        check_heading_hierarchy(sdom),
        check_unique_ids(sdom),
        // Accessibility checks (30%)
        check_accessible_names(sdom),
        check_link_text(sdom),
        check_button_text(sdom),
        check_form_labels(sdom),
        // Navigation checks (25%)
        check_navigation_exists(sdom),
        check_deterministic_fsm(sdom),
        check_reachable_states(sdom),
        // Interoperability checks (15%)
        check_selectors(sdom),
        check_intents(sdom),
    ]
}

/// Whether `matching` out of `total` meets the pass ratio
///
/// An empty set passes vacuously, unless the document has no semantic
/// elements at all: an empty document has nothing to certify.
fn meets_ratio(sdom: &SemanticDOM, matching: usize, total: usize) -> bool {
    if total == 0 {
        return !sdom.index.is_empty();
    }
    matching as f32 / total as f32 >= PASS_RATIO
}

fn percent(matching: usize, total: usize) -> f32 {
    if total == 0 {
        100.0
    } else {
        matching as f32 / total as f32 * 100.0
    }
}

fn has_name(node: &SemanticNode) -> bool {
    node.accessible_name.is_some() || !node.label.is_empty()
}

/// Count nodes with a matching role: `(matching the predicate, total)`
fn count_role(
    sdom: &SemanticDOM,
    is_role: impl Fn(&SemanticRole) -> bool,
    predicate: impl Fn(&SemanticNode) -> bool,
) -> (usize, usize) {
    sdom.index
        .values()
        .filter(|n| is_role(&n.role))
        .fold((0, 0), |(matching, total), n| {
            (matching + usize::from(predicate(n)), total + 1)
        })
}

fn check(
    id: &str,
    name: &str,
    category: CheckCategory,
    passed: bool,
    details: Option<String>,
    weight: f32,
) -> ValidationCheck {
    ValidationCheck {
        id: id.to_string(),
        name: name.to_string(),
        category,
        passed,
        details,
        weight,
    }
}

// Structure checks

fn check_has_landmarks(sdom: &SemanticDOM) -> ValidationCheck {
    check(
        "STRUCT-001",
        "Has landmark regions",
        CheckCategory::Structure,
        !sdom.landmarks.is_empty(),
        Some(format!("Found {} landmarks", sdom.landmarks.len())),
        1.0,
    )
}

fn check_has_main(sdom: &SemanticDOM) -> ValidationCheck {
    let (_, mains) = count_role(sdom, |r| matches!(r, SemanticRole::Main), |_| true);
    check(
        "STRUCT-002",
        "Has main content region",
        CheckCategory::Structure,
        mains > 0,
        None,
        1.0,
    )
}

fn check_heading_hierarchy(sdom: &SemanticDOM) -> ValidationCheck {
    check(
        "STRUCT-003",
        "Has heading structure",
        CheckCategory::Structure,
        !sdom.headings.is_empty(),
        Some(format!("Found {} headings", sdom.headings.len())),
        0.5,
    )
}

fn check_unique_ids(sdom: &SemanticDOM) -> ValidationCheck {
    // Semantic IDs are always unique; this reports duplicate `id`
    // attributes in the source document, which break `#id` selectors.
    let duplicates = sdom.duplicate_ids.len();
    let details = if duplicates == 0 {
        format!("{} unique nodes", sdom.index.len())
    } else {
        format!("{} duplicated HTML id value(s)", duplicates)
    };
    check(
        "STRUCT-004",
        "Unique element IDs",
        CheckCategory::Structure,
        duplicates == 0,
        Some(details),
        0.5,
    )
}

// Accessibility checks

fn check_accessible_names(sdom: &SemanticDOM) -> ValidationCheck {
    let total = sdom.interactables.len();
    let named = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .filter(|n| has_name(n))
        .count();
    check(
        "A11Y-001",
        "Interactables have accessible names",
        CheckCategory::Accessibility,
        meets_ratio(sdom, named, total),
        Some(format!(
            "{}/{} ({:.0}%)",
            named,
            total,
            percent(named, total)
        )),
        1.0,
    )
}

fn check_link_text(sdom: &SemanticDOM) -> ValidationCheck {
    let (with_text, total) = count_role(
        sdom,
        |r| matches!(r, SemanticRole::Link),
        |n| !n.label.is_empty() && n.label != "a",
    );
    check(
        "A11Y-002",
        "Links have descriptive text",
        CheckCategory::Accessibility,
        meets_ratio(sdom, with_text, total),
        Some(format!("{}/{} links have text", with_text, total)),
        0.75,
    )
}

fn check_button_text(sdom: &SemanticDOM) -> ValidationCheck {
    let (with_text, total) = count_role(
        sdom,
        |r| matches!(r, SemanticRole::Button),
        |n| !n.label.is_empty() && n.label != "button" && n.label != "input",
    );
    check(
        "A11Y-003",
        "Buttons have descriptive text",
        CheckCategory::Accessibility,
        meets_ratio(sdom, with_text, total),
        Some(format!("{}/{} buttons have text", with_text, total)),
        0.75,
    )
}

fn check_form_labels(sdom: &SemanticDOM) -> ValidationCheck {
    let (with_labels, total) = count_role(
        sdom,
        |r| {
            matches!(
                r,
                SemanticRole::TextInput
                    | SemanticRole::Checkbox
                    | SemanticRole::Radio
                    | SemanticRole::Select
            )
        },
        has_name,
    );
    check(
        "A11Y-004",
        "Form inputs have labels",
        CheckCategory::Accessibility,
        meets_ratio(sdom, with_labels, total),
        Some(format!("{}/{} inputs have labels", with_labels, total)),
        0.5,
    )
}

// Navigation checks

fn check_navigation_exists(sdom: &SemanticDOM) -> ValidationCheck {
    let (_, navs) = count_role(sdom, |r| matches!(r, SemanticRole::Navigation), |_| true);
    check(
        "NAV-001",
        "Has navigation landmark",
        CheckCategory::Navigation,
        navs > 0,
        None,
        1.0,
    )
}

fn check_deterministic_fsm(sdom: &SemanticDOM) -> ValidationCheck {
    check(
        "NAV-002",
        "State graph is deterministic",
        CheckCategory::Navigation,
        sdom.state_graph.is_deterministic(),
        Some(format!(
            "{} states, {} transitions",
            sdom.state_graph.states.len(),
            sdom.state_graph.transitions.len()
        )),
        1.0,
    )
}

fn check_reachable_states(sdom: &SemanticDOM) -> ValidationCheck {
    let total_states = sdom.state_graph.states.len();
    let reachable = sdom.state_graph.reachable_states().len();
    check(
        "NAV-003",
        "All states reachable",
        CheckCategory::Navigation,
        reachable == total_states,
        Some(format!("{}/{} states reachable", reachable, total_states)),
        0.75,
    )
}

// Interoperability checks

fn check_selectors(sdom: &SemanticDOM) -> ValidationCheck {
    let total = sdom.index.len();
    let with_selectors = sdom
        .index
        .values()
        .filter(|n| !n.selector.is_empty())
        .count();
    check(
        "INTEROP-001",
        "Elements have CSS selectors",
        CheckCategory::Interoperability,
        meets_ratio(sdom, with_selectors, total),
        Some(format!("{:.0}% coverage", percent(with_selectors, total))),
        1.0,
    )
}

fn check_intents(sdom: &SemanticDOM) -> ValidationCheck {
    let total = sdom.interactables.len();
    let with_intents = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .filter(|n| n.intent.is_some())
        .count();
    check(
        "INTEROP-002",
        "Interactables have intents",
        CheckCategory::Interoperability,
        meets_ratio(sdom, with_intents, total),
        Some(format!("{:.0}% coverage", percent(with_intents, total))),
        0.75,
    )
}
