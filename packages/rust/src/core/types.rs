//! Core type definitions for SemanticDOM

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Strongly-typed semantic identifier for DOM elements.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct SemanticId(pub String);

impl SemanticId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn generate(role: &str, label: &str) -> Self {
        let prefix = Self::role_to_prefix(role);
        let descriptor = Self::sanitize_label(label);
        Self(format!("{}-{}", prefix, descriptor))
    }

    fn role_to_prefix(role: &str) -> &'static str {
        match role.to_lowercase().as_str() {
            "button" => "btn",
            "link" => "link",
            "textbox" | "input" => "input",
            "navigation" => "nav",
            "main" => "main",
            "banner" | "header" => "header",
            "contentinfo" | "footer" => "footer",
            "complementary" | "aside" => "aside",
            "form" => "form",
            "search" => "search",
            "checkbox" => "chk",
            "radio" => "radio",
            "listbox" | "combobox" => "select",
            "menu" => "menu",
            "menuitem" => "item",
            "tab" => "tab",
            "tabpanel" => "panel",
            "dialog" => "dialog",
            "alert" => "alert",
            "img" | "image" => "img",
            "heading" => "h",
            "list" => "list",
            "listitem" => "li",
            "table" => "table",
            "row" => "row",
            "cell" => "cell",
            _ => &role[..std::cmp::min(4, role.len())],
        }
    }

    fn sanitize_label(label: &str) -> String {
        if label.is_empty() {
            return "unnamed".to_string();
        }
        label
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .trim_matches('-')
            .chars()
            .take(32)
            .collect()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SemanticId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for SemanticId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl From<String> for SemanticId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

/// Accessibility information for a semantic node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A11yInfo {
    pub name: String,
    pub focusable: bool,
    pub in_tab_order: bool,
    pub level: Option<u8>,
}

impl Default for A11yInfo {
    fn default() -> Self {
        Self {
            name: String::new(),
            focusable: false,
            in_tab_order: false,
            level: None,
        }
    }
}

/// A node in the SemanticDOM tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticNode {
    pub id: SemanticId,
    pub role: String,
    pub label: String,
    pub intent: Option<String>,
    pub state: String,
    pub selector: String,
    pub xpath: String,
    pub a11y: A11yInfo,
    pub children: Vec<SemanticNode>,
    pub value: Option<serde_json::Value>,
}

impl SemanticNode {
    pub fn builder() -> SemanticNodeBuilder {
        SemanticNodeBuilder::default()
    }

    /// Check if this node is interactive.
    pub fn is_interactive(&self) -> bool {
        self.a11y.focusable
    }

    /// Check if this node is a landmark.
    pub fn is_landmark(&self) -> bool {
        matches!(
            self.role.to_lowercase().as_str(),
            "main" | "navigation" | "banner" | "contentinfo" | "complementary" | "form" | "search" | "region"
        )
    }

    /// Get all descendants of this node.
    pub fn descendants(&self) -> Vec<&SemanticNode> {
        let mut result = Vec::new();
        self.collect_descendants(&mut result);
        result
    }

    fn collect_descendants<'a>(&'a self, result: &mut Vec<&'a SemanticNode>) {
        for child in &self.children {
            result.push(child);
            child.collect_descendants(result);
        }
    }
}

#[derive(Default)]
pub struct SemanticNodeBuilder {
    id: Option<SemanticId>,
    role: String,
    label: String,
    intent: Option<String>,
    state: String,
    selector: String,
    xpath: String,
    a11y: A11yInfo,
    children: Vec<SemanticNode>,
    value: Option<serde_json::Value>,
}

impl SemanticNodeBuilder {
    pub fn id(mut self, id: impl Into<SemanticId>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn role(mut self, role: impl Into<String>) -> Self {
        self.role = role.into();
        self
    }

    pub fn label(mut self, label: impl Into<String>) -> Self {
        self.label = label.into();
        self
    }

    pub fn intent(mut self, intent: impl Into<String>) -> Self {
        self.intent = Some(intent.into());
        self
    }

    pub fn state(mut self, state: impl Into<String>) -> Self {
        self.state = state.into();
        self
    }

    pub fn selector(mut self, selector: impl Into<String>) -> Self {
        self.selector = selector.into();
        self
    }

    pub fn xpath(mut self, xpath: impl Into<String>) -> Self {
        self.xpath = xpath.into();
        self
    }

    pub fn a11y(mut self, a11y: A11yInfo) -> Self {
        self.a11y = a11y;
        self
    }

    pub fn child(mut self, child: SemanticNode) -> Self {
        self.children.push(child);
        self
    }

    pub fn children(mut self, children: Vec<SemanticNode>) -> Self {
        self.children = children;
        self
    }

    pub fn value(mut self, value: serde_json::Value) -> Self {
        self.value = Some(value);
        self
    }

    pub fn build(self) -> SemanticNode {
        SemanticNode {
            id: self.id.unwrap_or_else(|| SemanticId::generate(&self.role, &self.label)),
            role: self.role,
            label: self.label,
            intent: self.intent,
            state: if self.state.is_empty() { "idle".to_string() } else { self.state },
            selector: self.selector,
            xpath: self.xpath,
            a11y: self.a11y,
            children: self.children,
            value: self.value,
        }
    }
}

/// State transition in the Semantic State Graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateTransition {
    pub from: String,
    pub to: String,
    pub trigger: String,
}

/// Semantic State Graph node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSGNode {
    pub node_id: SemanticId,
    pub current_state: String,
    pub transitions: Vec<StateTransition>,
}

impl SSGNode {
    pub fn from_semantic_node(node: &SemanticNode) -> Self {
        let transitions = Self::infer_transitions(node);
        Self {
            node_id: node.id.clone(),
            current_state: node.state.clone(),
            transitions,
        }
    }

    fn infer_transitions(node: &SemanticNode) -> Vec<StateTransition> {
        let mut transitions = Vec::new();
        let role = node.role.to_lowercase();

        match role.as_str() {
            "button" => {
                transitions.push(StateTransition { from: "idle".into(), to: "focused".into(), trigger: "focus".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "idle".into(), trigger: "blur".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "pressed".into(), trigger: "mousedown".into() });
                transitions.push(StateTransition { from: "pressed".into(), to: "focused".into(), trigger: "mouseup".into() });
            }
            "textbox" | "input" => {
                transitions.push(StateTransition { from: "idle".into(), to: "focused".into(), trigger: "focus".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "idle".into(), trigger: "blur".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "editing".into(), trigger: "input".into() });
            }
            "checkbox" => {
                transitions.push(StateTransition { from: "unchecked".into(), to: "checked".into(), trigger: "click".into() });
                transitions.push(StateTransition { from: "checked".into(), to: "unchecked".into(), trigger: "click".into() });
            }
            "link" => {
                transitions.push(StateTransition { from: "idle".into(), to: "focused".into(), trigger: "focus".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "visited".into(), trigger: "click".into() });
            }
            _ if node.is_interactive() => {
                transitions.push(StateTransition { from: "idle".into(), to: "focused".into(), trigger: "focus".into() });
                transitions.push(StateTransition { from: "focused".into(), to: "idle".into(), trigger: "blur".into() });
            }
            _ => {}
        }

        transitions
    }

    /// Get transitions available from current state.
    pub fn available_transitions(&self) -> Vec<&StateTransition> {
        self.transitions
            .iter()
            .filter(|t| t.from == self.current_state)
            .collect()
    }
}

/// Complete SemanticDOM document with O(1) lookup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticDocument {
    pub version: String,
    pub standard: String,
    pub url: String,
    pub title: String,
    pub language: String,
    pub generated_at: u64,
    pub root: SemanticNode,
    pub agent_ready: AgentCertification,
    #[serde(skip)]
    index: HashMap<SemanticId, usize>,
    #[serde(skip)]
    all_nodes: Vec<SemanticId>,
}

impl SemanticDocument {
    pub fn builder() -> SemanticDocumentBuilder {
        SemanticDocumentBuilder::default()
    }

    /// O(1) lookup by semantic ID.
    pub fn query(&self, id: impl Into<SemanticId>) -> Option<&SemanticNode> {
        let id = id.into();
        self.find_node(&self.root, &id)
    }

    fn find_node<'a>(&'a self, node: &'a SemanticNode, id: &SemanticId) -> Option<&'a SemanticNode> {
        if &node.id == id {
            return Some(node);
        }
        for child in &node.children {
            if let Some(found) = self.find_node(child, id) {
                return Some(found);
            }
        }
        None
    }

    /// Navigate to a landmark by role or ID.
    pub fn navigate(&self, landmark: &str) -> Option<&SemanticNode> {
        self.landmarks()
            .into_iter()
            .find(|l| l.role.eq_ignore_ascii_case(landmark) || l.id.as_str().eq_ignore_ascii_case(landmark))
    }

    /// Get all landmarks.
    pub fn landmarks(&self) -> Vec<&SemanticNode> {
        self.collect_by_predicate(&self.root, |n| n.is_landmark())
    }

    /// Get all interactive elements.
    pub fn interactables(&self) -> Vec<&SemanticNode> {
        self.collect_by_predicate(&self.root, |n| n.is_interactive())
    }

    fn collect_by_predicate<'a, F>(&'a self, node: &'a SemanticNode, predicate: F) -> Vec<&'a SemanticNode>
    where
        F: Fn(&SemanticNode) -> bool + Copy,
    {
        let mut result = Vec::new();
        if predicate(node) {
            result.push(node);
        }
        for child in &node.children {
            result.extend(self.collect_by_predicate(child, predicate));
        }
        result
    }

    /// Get the state graph.
    pub fn state_graph(&self) -> HashMap<SemanticId, SSGNode> {
        let mut graph = HashMap::new();
        self.build_state_graph(&self.root, &mut graph);
        graph
    }

    fn build_state_graph(&self, node: &SemanticNode, graph: &mut HashMap<SemanticId, SSGNode>) {
        if node.is_interactive() || node.state != "idle" {
            graph.insert(node.id.clone(), SSGNode::from_semantic_node(node));
        }
        for child in &node.children {
            self.build_state_graph(child, graph);
        }
    }

    /// Get total node count.
    pub fn node_count(&self) -> usize {
        self.count_nodes(&self.root)
    }

    fn count_nodes(&self, node: &SemanticNode) -> usize {
        1 + node.children.iter().map(|c| self.count_nodes(c)).sum::<usize>()
    }
}

#[derive(Default)]
pub struct SemanticDocumentBuilder {
    url: String,
    title: String,
    language: String,
    generated_at: u64,
    root: Option<SemanticNode>,
    agent_ready: Option<AgentCertification>,
}

impl SemanticDocumentBuilder {
    pub fn url(mut self, url: impl Into<String>) -> Self {
        self.url = url.into();
        self
    }

    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = title.into();
        self
    }

    pub fn language(mut self, language: impl Into<String>) -> Self {
        self.language = language.into();
        self
    }

    pub fn generated_at(mut self, ts: u64) -> Self {
        self.generated_at = ts;
        self
    }

    pub fn root(mut self, root: SemanticNode) -> Self {
        self.root = Some(root);
        self
    }

    pub fn agent_ready(mut self, cert: AgentCertification) -> Self {
        self.agent_ready = Some(cert);
        self
    }

    pub fn build(self) -> SemanticDocument {
        use std::time::{SystemTime, UNIX_EPOCH};

        let generated_at = if self.generated_at > 0 {
            self.generated_at
        } else {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64
        };

        SemanticDocument {
            version: crate::VERSION.to_string(),
            standard: crate::STANDARD.to_string(),
            url: self.url,
            title: self.title,
            language: if self.language.is_empty() { "en".to_string() } else { self.language },
            generated_at,
            root: self.root.expect("root is required"),
            agent_ready: self.agent_ready.unwrap_or_default(),
            index: HashMap::new(),
            all_nodes: Vec::new(),
        }
    }
}

/// Agent certification level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CertificationLevel {
    None,
    Basic,
    Standard,
    Advanced,
    Full,
}

impl Default for CertificationLevel {
    fn default() -> Self {
        Self::None
    }
}

impl CertificationLevel {
    pub fn from_score(score: u8) -> Self {
        match score {
            100.. => Self::Full,
            75..=99 => Self::Advanced,
            50..=74 => Self::Standard,
            25..=49 => Self::Basic,
            _ => Self::None,
        }
    }
}

/// Severity of validation failures.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Error,
    Critical,
}

/// Passed validation check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Check {
    pub id: String,
    pub name: String,
    pub passed: bool,
}

/// Failed validation check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Failure {
    pub id: String,
    pub name: String,
    pub message: String,
    pub severity: Severity,
    pub affected_nodes: Vec<SemanticId>,
}

/// Agent certification status.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentCertification {
    pub level: CertificationLevel,
    pub score: u8,
    pub checks: Vec<Check>,
    pub failures: Vec<Failure>,
}

impl AgentCertification {
    pub fn is_passing(&self) -> bool {
        self.level != CertificationLevel::None
    }

    pub fn has_errors(&self) -> bool {
        self.failures
            .iter()
            .any(|f| matches!(f.severity, Severity::Error | Severity::Critical))
    }
}
