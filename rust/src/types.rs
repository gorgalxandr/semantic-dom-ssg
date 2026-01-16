//! Core type definitions for SemanticDOM
//!
//! This module defines the semantic types used throughout the crate,
//! including roles, intents, and node structures.

use ahash::AHashMap;
use serde::{Deserialize, Serialize};

/// Semantic role for an element based on ARIA and HTML5 semantics
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SemanticRole {
    /// Navigation landmark
    Navigation,
    /// Main content area
    Main,
    /// Header/banner region
    Header,
    /// Footer/contentinfo region
    Footer,
    /// Aside/complementary content
    Aside,
    /// Article content
    Article,
    /// Section of content
    Section,
    /// Search region
    Search,
    /// Form element
    Form,
    /// Button element
    Button,
    /// Link/anchor element
    Link,
    /// Text input field
    TextInput,
    /// Checkbox input
    Checkbox,
    /// Radio button input
    Radio,
    /// Select/dropdown element
    Select,
    /// Heading element (h1-h6)
    Heading,
    /// List element (ul/ol)
    List,
    /// List item
    ListItem,
    /// Table element
    Table,
    /// Image element
    Image,
    /// Video element
    Video,
    /// Audio element
    Audio,
    /// Dialog/modal element
    Dialog,
    /// Alert/notification
    Alert,
    /// Menu element
    Menu,
    /// Tab element
    Tab,
    /// Tab panel
    TabPanel,
    /// Generic interactive element
    Interactive,
    /// Generic container
    Container,
    /// Unknown/other role
    Unknown,
}

impl SemanticRole {
    /// Check if this role represents a landmark region
    pub fn is_landmark(&self) -> bool {
        matches!(
            self,
            SemanticRole::Navigation
                | SemanticRole::Main
                | SemanticRole::Header
                | SemanticRole::Footer
                | SemanticRole::Aside
                | SemanticRole::Search
        )
    }

    /// Check if this role represents an interactive element
    pub fn is_interactable(&self) -> bool {
        matches!(
            self,
            SemanticRole::Button
                | SemanticRole::Link
                | SemanticRole::TextInput
                | SemanticRole::Checkbox
                | SemanticRole::Radio
                | SemanticRole::Select
                | SemanticRole::Interactive
        )
    }
}

/// User intent classification for an element
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SemanticIntent {
    /// Navigation action
    Navigate,
    /// Form submission
    Submit,
    /// Trigger an action
    Action,
    /// Toggle state
    Toggle,
    /// Select from options
    Select,
    /// Input data
    Input,
    /// Search functionality
    Search,
    /// Play media
    Play,
    /// Pause media
    Pause,
    /// Open/show content
    Open,
    /// Close/hide content
    Close,
    /// Expand collapsed content
    Expand,
    /// Collapse expanded content
    Collapse,
    /// Download resource
    Download,
    /// Delete/remove item
    Delete,
    /// Edit/modify item
    Edit,
    /// Create new item
    Create,
    /// Unknown intent
    Unknown,
}

/// A semantic node in the DOM tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticNode {
    /// Unique identifier for this node
    pub id: String,
    /// Human-readable label
    pub label: String,
    /// Semantic role
    pub role: SemanticRole,
    /// User intent (for interactables)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<SemanticIntent>,
    /// CSS selector path to this element
    pub selector: String,
    /// Accessible name from ARIA or content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessible_name: Option<String>,
    /// Target URL for links/navigation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    /// Child node IDs
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<String>,
    /// Parent node ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    /// Additional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AHashMap<String, String>>,
    /// Depth in the tree (0 = root)
    pub depth: usize,
}

impl SemanticNode {
    /// Create a new semantic node
    pub fn new(id: String, label: String, role: SemanticRole, selector: String) -> Self {
        Self {
            id,
            label,
            role,
            intent: None,
            selector,
            accessible_name: None,
            href: None,
            children: Vec::new(),
            parent: None,
            metadata: None,
            depth: 0,
        }
    }
}

/// A state in the Semantic State Graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct State {
    /// Unique state identifier
    pub id: String,
    /// Human-readable state name
    pub name: String,
    /// State description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// URL pattern for this state
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_pattern: Option<String>,
    /// Whether this is the initial state
    #[serde(default)]
    pub is_initial: bool,
    /// Whether this is a terminal state
    #[serde(default)]
    pub is_terminal: bool,
}

/// A transition between states in the SSG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transition {
    /// Source state ID
    pub from: String,
    /// Target state ID
    pub to: String,
    /// Trigger element ID
    pub trigger: String,
    /// Action description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    /// Guard condition
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guard: Option<String>,
}

/// The Semantic State Graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateGraph {
    /// All states in the graph
    pub states: Vec<State>,
    /// All transitions between states
    pub transitions: Vec<Transition>,
    /// Initial state ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_state: Option<String>,
}

impl Default for StateGraph {
    fn default() -> Self {
        Self {
            states: Vec::new(),
            transitions: Vec::new(),
            initial_state: None,
        }
    }
}

impl StateGraph {
    /// Create a new empty state graph
    pub fn new() -> Self {
        Self::default()
    }

    /// Check if the graph is deterministic (no ambiguous transitions)
    pub fn is_deterministic(&self) -> bool {
        let mut seen: AHashMap<(&str, &str), bool> = AHashMap::new();
        for t in &self.transitions {
            let key = (t.from.as_str(), t.trigger.as_str());
            if seen.contains_key(&key) {
                return false;
            }
            seen.insert(key, true);
        }
        true
    }

    /// Find all states reachable from the initial state
    pub fn reachable_states(&self) -> Vec<&State> {
        let initial = match &self.initial_state {
            Some(id) => id,
            None => return Vec::new(),
        };

        let mut visited: AHashMap<&str, bool> = AHashMap::new();
        let mut queue = vec![initial.as_str()];

        while let Some(state_id) = queue.pop() {
            if visited.contains_key(state_id) {
                continue;
            }
            visited.insert(state_id, true);

            for t in &self.transitions {
                if t.from == state_id && !visited.contains_key(t.to.as_str()) {
                    queue.push(&t.to);
                }
            }
        }

        self.states
            .iter()
            .filter(|s| visited.contains_key(s.id.as_str()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_role_is_landmark() {
        assert!(SemanticRole::Navigation.is_landmark());
        assert!(SemanticRole::Main.is_landmark());
        assert!(!SemanticRole::Button.is_landmark());
    }

    #[test]
    fn test_role_is_interactable() {
        assert!(SemanticRole::Button.is_interactable());
        assert!(SemanticRole::Link.is_interactable());
        assert!(!SemanticRole::Navigation.is_interactable());
    }

    #[test]
    fn test_state_graph_deterministic() {
        let mut graph = StateGraph::new();
        graph.states.push(State {
            id: "home".to_string(),
            name: "Home".to_string(),
            description: None,
            url_pattern: Some("/".to_string()),
            is_initial: true,
            is_terminal: false,
        });
        graph.transitions.push(Transition {
            from: "home".to_string(),
            to: "about".to_string(),
            trigger: "about-link".to_string(),
            action: None,
            guard: None,
        });
        graph.initial_state = Some("home".to_string());

        assert!(graph.is_deterministic());

        // Add duplicate transition
        graph.transitions.push(Transition {
            from: "home".to_string(),
            to: "contact".to_string(),
            trigger: "about-link".to_string(), // Same trigger!
            action: None,
            guard: None,
        });

        assert!(!graph.is_deterministic());
    }
}
