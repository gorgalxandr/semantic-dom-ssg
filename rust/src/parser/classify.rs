//! Role and intent classification for HTML elements

use crate::types::{SemanticIntent, SemanticRole};
use scraper::node::Element;

/// `<input>` types that behave like buttons (their `value` is a caption)
pub(crate) fn is_button_input(input_type: &str) -> bool {
    matches!(input_type, "submit" | "button" | "reset" | "image")
}

/// The effective, lowercased `type` of an `<input>` (default: `text`)
pub(crate) fn input_type(el: &Element) -> String {
    el.attr("type")
        .map(|t| t.trim().to_ascii_lowercase())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "text".to_string())
}

/// Determine the semantic role of an element, if it has one
///
/// An explicit, recognised ARIA `role` wins over the tag name. Each element
/// gets exactly one role, so it can never be indexed twice.
pub(crate) fn classify(el: &Element) -> Option<SemanticRole> {
    if let Some(role) = el.attr("role").and_then(role_from_aria) {
        return Some(role);
    }

    let role = match el.name() {
        "nav" => SemanticRole::Navigation,
        "main" => SemanticRole::Main,
        "header" => SemanticRole::Header,
        "footer" => SemanticRole::Footer,
        "aside" => SemanticRole::Aside,
        "article" => SemanticRole::Article,
        "section" => SemanticRole::Section,
        "a" if el.attr("href").is_some() => SemanticRole::Link,
        "button" => SemanticRole::Button,
        "input" => match input_type(el).as_str() {
            // Hidden inputs are not perceivable and often carry tokens
            "hidden" => return None,
            t if is_button_input(t) => SemanticRole::Button,
            "checkbox" => SemanticRole::Checkbox,
            "radio" => SemanticRole::Radio,
            "file" | "range" | "color" => SemanticRole::Interactive,
            _ => SemanticRole::TextInput,
        },
        "textarea" => SemanticRole::TextInput,
        "select" => SemanticRole::Select,
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => SemanticRole::Heading,
        "img" => SemanticRole::Image,
        "video" => SemanticRole::Video,
        "audio" => SemanticRole::Audio,
        "form" => SemanticRole::Form,
        "dialog" => SemanticRole::Dialog,
        _ => return None,
    };
    Some(role)
}

/// Map an ARIA `role` attribute (first recognised token) to a role
fn role_from_aria(attr: &str) -> Option<SemanticRole> {
    attr.split_ascii_whitespace().find_map(|token| {
        let role = match token.to_ascii_lowercase().as_str() {
            "navigation" => SemanticRole::Navigation,
            "main" => SemanticRole::Main,
            "banner" => SemanticRole::Header,
            "contentinfo" => SemanticRole::Footer,
            "complementary" => SemanticRole::Aside,
            "search" => SemanticRole::Search,
            "dialog" | "alertdialog" => SemanticRole::Dialog,
            "alert" => SemanticRole::Alert,
            "button" => SemanticRole::Button,
            "link" => SemanticRole::Link,
            "checkbox" | "switch" => SemanticRole::Checkbox,
            "radio" => SemanticRole::Radio,
            "textbox" | "searchbox" => SemanticRole::TextInput,
            "combobox" | "listbox" => SemanticRole::Select,
            "tab" => SemanticRole::Tab,
            "tabpanel" => SemanticRole::TabPanel,
            "menu" | "menubar" => SemanticRole::Menu,
            _ => return None,
        };
        Some(role)
    })
}

/// Parse an explicit `data-intent` attribute
fn explicit_intent(value: &str) -> SemanticIntent {
    match value.trim().to_ascii_lowercase().as_str() {
        "navigate" => SemanticIntent::Navigate,
        "submit" => SemanticIntent::Submit,
        "action" => SemanticIntent::Action,
        "toggle" => SemanticIntent::Toggle,
        "select" => SemanticIntent::Select,
        "input" => SemanticIntent::Input,
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
    }
}

/// Infer a button's intent from its caption
fn button_intent(label: &str) -> SemanticIntent {
    let text = label.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| text.contains(w));

    if has(&["submit", "send", "save"]) {
        SemanticIntent::Submit
    } else if has(&["delete", "remove"]) {
        SemanticIntent::Delete
    } else if has(&["edit", "modify"]) {
        SemanticIntent::Edit
    } else if has(&["create", "add", "new"]) {
        SemanticIntent::Create
    } else if has(&["toggle"]) {
        SemanticIntent::Toggle
    } else if has(&["open"]) {
        SemanticIntent::Open
    } else if has(&["close", "cancel"]) {
        SemanticIntent::Close
    } else if has(&["expand"]) {
        SemanticIntent::Expand
    } else if has(&["collapse"]) {
        SemanticIntent::Collapse
    } else if has(&["play"]) {
        SemanticIntent::Play
    } else if has(&["pause"]) {
        SemanticIntent::Pause
    } else if has(&["search"]) {
        SemanticIntent::Search
    } else {
        SemanticIntent::Action
    }
}

/// Whether a (sanitized) link target points at a downloadable file
fn is_download_target(href: &str) -> bool {
    let path = href.split(['?', '#']).next().unwrap_or("");
    let path = path.to_ascii_lowercase();
    path.ends_with(".pdf") || path.ends_with(".zip")
}

/// Determine the user intent for an interactive element
///
/// `href` is the already validated link target; a link whose target was
/// rejected (for example `javascript:`) is an action, not a navigation.
pub(crate) fn determine_intent(
    el: &Element,
    role: &SemanticRole,
    label: &str,
    href: Option<&str>,
) -> SemanticIntent {
    if let Some(intent) = el.attr("data-intent") {
        return explicit_intent(intent);
    }

    match role {
        SemanticRole::Link => match href {
            Some(h) if el.attr("download").is_some() || is_download_target(h) => {
                SemanticIntent::Download
            }
            Some(_) => SemanticIntent::Navigate,
            None if el.attr("href").is_some_and(|h| h.trim().is_empty()) => {
                SemanticIntent::Navigate
            }
            None => SemanticIntent::Action,
        },
        SemanticRole::Button => {
            let is_submit = el
                .attr("type")
                .is_some_and(|t| t.trim().eq_ignore_ascii_case("submit"));
            if is_submit {
                SemanticIntent::Submit
            } else {
                button_intent(label)
            }
        }
        SemanticRole::Checkbox | SemanticRole::Radio => SemanticIntent::Toggle,
        SemanticRole::Select => SemanticIntent::Select,
        SemanticRole::TextInput => {
            let is_search = el
                .attr("type")
                .is_some_and(|t| t.trim().eq_ignore_ascii_case("search"));
            if is_search {
                SemanticIntent::Search
            } else {
                SemanticIntent::Input
            }
        }
        _ => SemanticIntent::Unknown,
    }
}
