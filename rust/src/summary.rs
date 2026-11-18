//! Token-efficient summary formats for AI agents
//!
//! Provides ultra-compact output formats optimized for LLM consumption,
//! reducing token usage by ~87% compared to JSON.

//!
//! Every string that originates from the parsed document is re-sanitised
//! here (single line, no control characters, length-capped), so the
//! line-oriented formats stay well-formed even if a caller has modified the
//! public fields of a [`SemanticDOM`] after parsing.

use crate::parser::SemanticDOM;
use crate::sanitize::sanitize_text;
use crate::types::{SemanticIntent, SemanticRole};
use crate::{MAX_LABEL_LENGTH, MAX_NAME_LENGTH};

/// Maximum number of actions listed in the agent summary
const MAX_SUMMARY_ACTIONS: usize = 10;

/// Maximum number of landmarks listed in the agent summary
const MAX_SUMMARY_LANDMARKS: usize = 10;

/// Generate a token-efficient agent summary
///
/// This format uses approximately 100 tokens compared to ~800 for JSON,
/// an 87% reduction in token usage.
///
/// # Format
/// ```text
/// LANDMARKS: nav(#main-nav), main(#content), footer(#footer)
/// ACTIONS: [submit]#login-btn, [navigate]a.nav-link, [toggle]#menu-btn
/// STATE: initial -> home, about, contact
/// ```
///
/// Each summary line starts with a fixed keyword (`PAGE:`, `LANDMARKS:`,
/// `ACTIONS:`, `STATE:`, `STATS:`). Text taken from the document can never
/// start a new line, so a page cannot forge additional lines.
///
/// # Arguments
/// * `sdom` - The SemanticDOM to summarize
///
/// # Returns
/// A compact string summary
pub fn to_agent_summary(sdom: &SemanticDOM) -> String {
    let mut lines = Vec::new();

    // Title line
    if let Some(title) = &sdom.title {
        lines.push(format!("PAGE: {}", sanitize_text(title, MAX_NAME_LENGTH)));
    }

    // Landmarks line
    let landmarks: Vec<String> = sdom
        .landmarks
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .map(|n| format!("{}({})", role_abbrev(&n.role), selector_short(&n.selector)))
        .take(MAX_SUMMARY_LANDMARKS)
        .collect();

    if !landmarks.is_empty() {
        lines.push(format!("LANDMARKS: {}", landmarks.join(", ")));
    }

    // Actions line (interactables)
    let actions: Vec<String> = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .map(|n| {
            let intent = n
                .intent
                .as_ref()
                .map(intent_abbrev)
                .unwrap_or_else(|| "act".to_string());
            format!("[{}]{}", intent, sanitize_text(&n.label, 20))
        })
        .take(MAX_SUMMARY_ACTIONS)
        .collect();

    if !actions.is_empty() {
        lines.push(format!("ACTIONS: {}", actions.join(", ")));
    }

    // State graph summary
    if !sdom.state_graph.states.is_empty() {
        let initial = sdom.state_graph.initial_state.as_deref();
        let states: Vec<String> = sdom
            .state_graph
            .states
            .iter()
            .filter(|s| Some(s.id.as_str()) != initial)
            .map(|s| sanitize_text(&s.name, 20))
            .take(5)
            .collect();

        lines.push(format!(
            "STATE: {} -> {}",
            sanitize_text(initial.unwrap_or("none"), MAX_LABEL_LENGTH),
            states.join(", ")
        ));
    }

    // Stats line
    lines.push(format!(
        "STATS: {}L {}A {}H",
        sdom.landmarks.len(),
        sdom.interactables.len(),
        sdom.headings.len()
    ));

    lines.join("\n")
}

/// Generate a one-line summary (~20 tokens)
///
/// # Format
/// ```text
/// PageTitle | 3 landmarks, 5 actions | nav,main,footer | btn:Submit,link:Home
/// ```
pub fn to_one_liner(sdom: &SemanticDOM) -> String {
    let title = sanitize_text(sdom.title.as_deref().unwrap_or("Untitled"), 30);

    let landmarks: Vec<&str> = sdom
        .landmarks
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .map(|n| role_short(&n.role))
        .take(3)
        .collect();

    let actions: Vec<String> = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .map(|n| format!("{}:{}", role_short(&n.role), sanitize_text(&n.label, 10)))
        .take(3)
        .collect();

    format!(
        "{} | {}L {}A | {} | {}",
        title,
        sdom.landmarks.len(),
        sdom.interactables.len(),
        landmarks.join(","),
        actions.join(",")
    )
}

/// Generate a navigation-focused summary
pub fn to_nav_summary(sdom: &SemanticDOM) -> String {
    let mut lines = Vec::new();

    // Navigation links
    let nav_links: Vec<String> = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .filter(|n| matches!(n.role, SemanticRole::Link))
        .filter(|n| n.href.is_some())
        .map(|n| {
            let href = n.href.as_deref().unwrap_or("#");
            format!(
                "{} -> {}",
                sanitize_text(&n.label, MAX_LABEL_LENGTH),
                sanitize_text(href, MAX_NAME_LENGTH)
            )
        })
        .take(10)
        .collect();

    if !nav_links.is_empty() {
        lines.push("NAVIGATION:".to_string());
        for link in nav_links {
            lines.push(format!("  {}", link));
        }
    }

    // State transitions
    if !sdom.state_graph.transitions.is_empty() {
        lines.push("TRANSITIONS:".to_string());
        for t in sdom.state_graph.transitions.iter().take(5) {
            lines.push(format!(
                "  {} -[{}]-> {}",
                sanitize_text(&t.from, MAX_NAME_LENGTH),
                sanitize_text(&t.trigger, MAX_NAME_LENGTH),
                sanitize_text(&t.to, MAX_NAME_LENGTH)
            ));
        }
    }

    lines.join("\n")
}

/// Generate an audio/screen-reader friendly summary
pub fn to_audio_summary(sdom: &SemanticDOM) -> String {
    let mut parts = Vec::new();

    // Page title
    if let Some(title) = &sdom.title {
        parts.push(format!("Page: {}", sanitize_text(title, MAX_NAME_LENGTH)));
    }

    // Landmark summary
    let landmark_count = sdom.landmarks.len();
    if landmark_count > 0 {
        parts.push(format!(
            "{} landmark region{}",
            landmark_count,
            if landmark_count == 1 { "" } else { "s" }
        ));
    }

    // Action summary
    let action_count = sdom.interactables.len();
    if action_count > 0 {
        parts.push(format!(
            "{} interactive element{}",
            action_count,
            if action_count == 1 { "" } else { "s" }
        ));
    }

    // Main actions
    let main_actions: Vec<String> = sdom
        .interactables
        .iter()
        .filter_map(|id| sdom.index.get(id))
        .filter(|n| {
            n.intent
                .as_ref()
                .map(|i| !matches!(i, SemanticIntent::Unknown))
                .unwrap_or(false)
        })
        .map(|n| sanitize_text(&n.label, MAX_LABEL_LENGTH))
        .take(5)
        .collect();

    if !main_actions.is_empty() {
        parts.push(format!("Main actions: {}", main_actions.join(", ")));
    }

    parts.join(". ")
}

/// Compare token usage between formats
pub fn compare_token_usage(sdom: &SemanticDOM) -> TokenComparison {
    let json = sdom.to_json().unwrap_or_default();
    let summary = to_agent_summary(sdom);
    let one_liner = to_one_liner(sdom);

    // Rough token estimation (1 token ≈ 4 chars for English)
    let json_tokens = estimate_tokens(&json);
    let summary_tokens = estimate_tokens(&summary);
    let one_liner_tokens = estimate_tokens(&one_liner);

    TokenComparison {
        json_tokens,
        summary_tokens,
        one_liner_tokens,
        summary_reduction: reduction_percent(json_tokens, summary_tokens),
        one_liner_reduction: reduction_percent(json_tokens, one_liner_tokens),
    }
}

/// Percentage saved relative to a baseline (negative if larger; 0 for an
/// empty baseline). Computed in floating point: cannot underflow.
fn reduction_percent(baseline: usize, tokens: usize) -> f32 {
    if baseline == 0 {
        return 0.0;
    }
    (baseline as f32 - tokens as f32) / baseline as f32 * 100.0
}

/// Token usage comparison result
#[derive(Debug, Clone)]
pub struct TokenComparison {
    /// Estimated tokens for JSON format
    pub json_tokens: usize,
    /// Estimated tokens for summary format
    pub summary_tokens: usize,
    /// Estimated tokens for one-liner format
    pub one_liner_tokens: usize,
    /// Percentage reduction for summary vs JSON
    pub summary_reduction: f32,
    /// Percentage reduction for one-liner vs JSON
    pub one_liner_reduction: f32,
}

// Helper functions

fn role_abbrev(role: &SemanticRole) -> &'static str {
    match role {
        SemanticRole::Navigation => "nav",
        SemanticRole::Main => "main",
        SemanticRole::Header => "header",
        SemanticRole::Footer => "footer",
        SemanticRole::Aside => "aside",
        SemanticRole::Article => "article",
        SemanticRole::Section => "section",
        SemanticRole::Search => "search",
        SemanticRole::Form => "form",
        SemanticRole::Button => "btn",
        SemanticRole::Link => "link",
        SemanticRole::TextInput => "input",
        SemanticRole::Checkbox => "check",
        SemanticRole::Radio => "radio",
        SemanticRole::Select => "select",
        SemanticRole::Heading => "h",
        SemanticRole::List => "list",
        SemanticRole::ListItem => "li",
        SemanticRole::Table => "table",
        SemanticRole::Image => "img",
        SemanticRole::Video => "video",
        SemanticRole::Audio => "audio",
        SemanticRole::Dialog => "dialog",
        SemanticRole::Alert => "alert",
        SemanticRole::Menu => "menu",
        SemanticRole::Tab => "tab",
        SemanticRole::TabPanel => "tabpanel",
        SemanticRole::Interactive => "int",
        SemanticRole::Container => "div",
        SemanticRole::Unknown => "?",
    }
}

fn role_short(role: &SemanticRole) -> &'static str {
    match role {
        SemanticRole::Navigation => "nav",
        SemanticRole::Main => "main",
        SemanticRole::Header => "hdr",
        SemanticRole::Footer => "ftr",
        SemanticRole::Button => "btn",
        SemanticRole::Link => "lnk",
        SemanticRole::TextInput => "inp",
        _ => "el",
    }
}

fn intent_abbrev(intent: &SemanticIntent) -> String {
    match intent {
        SemanticIntent::Navigate => "nav",
        SemanticIntent::Submit => "sub",
        SemanticIntent::Action => "act",
        SemanticIntent::Toggle => "tog",
        SemanticIntent::Select => "sel",
        SemanticIntent::Input => "inp",
        SemanticIntent::Search => "srch",
        SemanticIntent::Play => "play",
        SemanticIntent::Pause => "pause",
        SemanticIntent::Open => "open",
        SemanticIntent::Close => "close",
        SemanticIntent::Expand => "exp",
        SemanticIntent::Collapse => "col",
        SemanticIntent::Download => "dl",
        SemanticIntent::Delete => "del",
        SemanticIntent::Edit => "edit",
        SemanticIntent::Create => "new",
        SemanticIntent::Unknown => "?",
    }
    .to_string()
}

fn selector_short(selector: &str) -> String {
    sanitize_text(selector, 20)
}

fn estimate_tokens(text: &str) -> usize {
    // Rough estimation: 1 token ≈ 4 characters for English
    // This is a simplification; actual tokenization varies by model
    text.len().div_ceil(4)
}
