//! Agent certification checks

use super::*;

/// Run certification checks on a semantic tree.
pub fn run_certification_checks(root: &SemanticNode) -> AgentCertification {
    let mut checks = Vec::new();
    let mut failures = Vec::new();

    let all_nodes = collect_all_nodes(root);

    // Check 1: All interactive elements have accessible names
    let no_name: Vec<SemanticId> = all_nodes
        .iter()
        .filter(|n| n.is_interactive() && n.a11y.name.is_empty())
        .map(|n| n.id.clone())
        .collect();

    let has_accessible_names = no_name.is_empty();
    checks.push(Check {
        id: "accessible-names".to_string(),
        name: "All interactive elements have accessible names".to_string(),
        passed: has_accessible_names,
    });

    if !has_accessible_names {
        failures.push(Failure {
            id: "accessible-names".to_string(),
            name: "Missing accessible names".to_string(),
            message: format!("{} interactive elements lack accessible names", no_name.len()),
            severity: Severity::Error,
            affected_nodes: no_name,
        });
    }

    // Check 2: Page has landmarks
    let landmark_count = all_nodes.iter().filter(|n| n.is_landmark()).count();
    let has_landmarks = landmark_count > 0;
    checks.push(Check {
        id: "has-landmarks".to_string(),
        name: "Page has landmark regions".to_string(),
        passed: has_landmarks,
    });

    if !has_landmarks {
        failures.push(Failure {
            id: "has-landmarks".to_string(),
            name: "No landmarks".to_string(),
            message: "Page should have at least one landmark region".to_string(),
            severity: Severity::Warning,
            affected_nodes: vec![],
        });
    }

    // Check 3: Buttons have intents
    let buttons: Vec<&SemanticNode> = all_nodes.iter().copied().filter(|n| n.role == "button").collect();
    let buttons_no_intent: Vec<SemanticId> = buttons
        .iter()
        .filter(|n| n.intent.is_none())
        .map(|n| n.id.clone())
        .collect();

    let buttons_have_intents = buttons_no_intent.len() <= buttons.len() / 2;
    checks.push(Check {
        id: "button-intents".to_string(),
        name: "Most buttons have semantic intents".to_string(),
        passed: buttons_have_intents,
    });

    if !buttons_have_intents {
        failures.push(Failure {
            id: "button-intents".to_string(),
            name: "Buttons missing intents".to_string(),
            message: format!("{} buttons lack semantic intents", buttons_no_intent.len()),
            severity: Severity::Info,
            affected_nodes: buttons_no_intent,
        });
    }

    // Check 4: Valid heading hierarchy
    let heading_levels: Vec<u8> = all_nodes
        .iter()
        .filter(|n| n.role == "heading")
        .filter_map(|n| n.a11y.level)
        .collect();

    let mut valid_heading_hierarchy = true;
    for i in 1..heading_levels.len() {
        if heading_levels[i] > heading_levels[i - 1] + 1 {
            valid_heading_hierarchy = false;
            break;
        }
    }

    checks.push(Check {
        id: "heading-hierarchy".to_string(),
        name: "Valid heading hierarchy".to_string(),
        passed: valid_heading_hierarchy,
    });

    if !valid_heading_hierarchy {
        failures.push(Failure {
            id: "heading-hierarchy".to_string(),
            name: "Invalid heading hierarchy".to_string(),
            message: "Heading levels should not skip".to_string(),
            severity: Severity::Warning,
            affected_nodes: vec![],
        });
    }

    // Check 5: Form inputs have labels
    let form_roles = ["textbox", "searchbox", "listbox", "combobox"];
    let inputs_no_label: Vec<SemanticId> = all_nodes
        .iter()
        .filter(|n| form_roles.contains(&n.role.as_str()) && n.label.is_empty())
        .map(|n| n.id.clone())
        .collect();

    let forms_have_labels = inputs_no_label.is_empty();
    checks.push(Check {
        id: "form-labels".to_string(),
        name: "Form inputs have labels".to_string(),
        passed: forms_have_labels,
    });

    if !forms_have_labels {
        failures.push(Failure {
            id: "form-labels".to_string(),
            name: "Form inputs missing labels".to_string(),
            message: format!("{} form inputs lack labels", inputs_no_label.len()),
            severity: Severity::Error,
            affected_nodes: inputs_no_label,
        });
    }

    // Calculate score
    let passed = checks.iter().filter(|c| c.passed).count();
    let base_score = if checks.is_empty() {
        0
    } else {
        ((passed * 100) / checks.len()) as u8
    };

    let deductions: u8 = failures.iter().map(|f| match f.severity {
        Severity::Critical => 25,
        Severity::Error => 15,
        Severity::Warning => 5,
        Severity::Info => 0,
    }).sum();

    let score = base_score.saturating_sub(deductions);
    let level = CertificationLevel::from_score(score);

    AgentCertification {
        level,
        score,
        checks,
        failures,
    }
}

fn collect_all_nodes(node: &SemanticNode) -> Vec<&SemanticNode> {
    let mut result = vec![node];
    for child in &node.children {
        result.extend(collect_all_nodes(child));
    }
    result
}
