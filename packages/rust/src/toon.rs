//! TOON (Token-Oriented Object Notation) serializer

use crate::core::*;

/// TOON serializer for SemanticDOM.
pub struct ToonSerializer;

impl ToonSerializer {
    /// Serialize document to TOON format.
    pub fn serialize(doc: &SemanticDocument) -> String {
        Self::serialize_with_options(doc, &ToonOptions::default())
    }

    /// Serialize document with options.
    pub fn serialize_with_options(doc: &SemanticDocument, options: &ToonOptions) -> String {
        let mut output = String::new();

        // Header
        output.push_str(&format!("v:{}\n", doc.version));
        output.push_str(&format!("std:{}\n", doc.standard));
        output.push_str(&format!("url:{}\n", doc.url));
        output.push_str(&format!("title:{}\n", Self::escape(&doc.title)));
        output.push_str(&format!("lang:{}\n", doc.language));
        output.push_str(&format!("ts:{}\n", doc.generated_at));
        output.push('\n');

        // Certification
        output.push_str("cert:\n");
        output.push_str(&format!("  level:{:?}\n", doc.agent_ready.level).to_lowercase());
        output.push_str(&format!("  score:{}\n", doc.agent_ready.score));
        output.push('\n');

        // Root
        output.push_str("root:\n");
        Self::serialize_node(&mut output, &doc.root, 1, options);
        output.push('\n');

        // Landmarks
        let landmarks = doc.landmarks();
        if !landmarks.is_empty() {
            output.push_str("landmarks:\n");
            for landmark in landmarks {
                output.push_str(&format!(
                    "  - {} {} {}\n",
                    landmark.id,
                    landmark.role,
                    Self::escape(&landmark.label)
                ));
            }
            output.push('\n');
        }

        // Interactables
        let interactables = doc.interactables();
        if !interactables.is_empty() {
            output.push_str("interactables:\n");
            for inter in interactables {
                let intent_part = inter.intent.as_ref()
                    .map(|i| format!(" ->{}", i))
                    .unwrap_or_default();
                output.push_str(&format!(
                    "  - {} {} {}{}\n",
                    inter.id,
                    inter.role,
                    Self::escape(&inter.label),
                    intent_part
                ));
            }
        }

        output
    }

    /// Serialize a single node.
    pub fn serialize_node_string(node: &SemanticNode) -> String {
        let mut output = String::new();
        Self::serialize_node(&mut output, node, 0, &ToonOptions::default());
        output
    }

    fn serialize_node(output: &mut String, node: &SemanticNode, indent: usize, options: &ToonOptions) {
        let indent_str = "  ".repeat(indent);

        // Compact format
        let intent_part = node.intent.as_ref()
            .map(|i| format!(" ->{}", i))
            .unwrap_or_default();
        let state_part = if node.state == "idle" { String::new() } else { format!(" [{}]", node.state) };
        let label_part = if node.label.is_empty() { String::new() } else { format!(" \"{}\"", Self::escape(&node.label)) };

        output.push_str(&format!(
            "{}{} {}{}{}{}\n",
            indent_str,
            node.id,
            node.role,
            label_part,
            intent_part,
            state_part
        ));

        // A11y info
        if node.a11y.focusable || node.a11y.level.is_some() {
            let mut a11y_parts = vec!["a11y:".to_string()];
            if node.a11y.focusable { a11y_parts.push("focusable".to_string()); }
            if node.a11y.in_tab_order { a11y_parts.push("tab".to_string()); }
            if let Some(level) = node.a11y.level { a11y_parts.push(format!("L{}", level)); }
            output.push_str(&format!("{}  {}\n", indent_str, a11y_parts.join(" ")));
        }

        // Selectors
        if options.include_selectors && !node.selector.is_empty() {
            output.push_str(&format!("{}  sel:{}\n", indent_str, node.selector));
        }

        // Children
        for child in &node.children {
            Self::serialize_node(output, child, indent + 1, options);
        }
    }

    /// Serialize to JSON.
    pub fn serialize_json(doc: &SemanticDocument) -> String {
        serde_json::to_string_pretty(doc).unwrap_or_default()
    }

    /// Estimate token savings.
    pub fn estimate_token_savings(doc: &SemanticDocument) -> TokenSavings {
        let json = Self::serialize_json(doc);
        let toon = Self::serialize(doc);

        let json_tokens = (json.len() as f64 / 4.0).ceil() as usize;
        let toon_tokens = (toon.len() as f64 / 4.0).ceil() as usize;
        let savings = json_tokens.saturating_sub(toon_tokens);
        let savings_percent = if json_tokens > 0 {
            ((savings as f64 / json_tokens as f64) * 100.0).round() as u8
        } else {
            0
        };

        TokenSavings {
            json_tokens,
            toon_tokens,
            savings,
            savings_percent,
        }
    }

    fn escape(s: &str) -> String {
        s.replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    }
}

/// TOON serialization options.
#[derive(Debug, Clone)]
pub struct ToonOptions {
    pub include_selectors: bool,
    pub include_xpath: bool,
    pub indent_size: usize,
}

impl Default for ToonOptions {
    fn default() -> Self {
        Self {
            include_selectors: false,
            include_xpath: false,
            indent_size: 2,
        }
    }
}

/// Token savings comparison.
#[derive(Debug, Clone)]
pub struct TokenSavings {
    pub json_tokens: usize,
    pub toon_tokens: usize,
    pub savings: usize,
    pub savings_percent: u8,
}
