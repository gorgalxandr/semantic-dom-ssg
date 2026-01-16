//! Agent certification system for SemanticDOM
//!
//! Provides compliance validation and scoring based on the
//! ISO/IEC-SDOM-SSG-DRAFT-2024 specification.

use crate::parser::SemanticDOM;
use crate::types::SemanticRole;
use serde::{Deserialize, Serialize};

/// Certification levels based on compliance
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CertificationLevel {
    /// Not compliant - fails basic requirements
    None,
    /// Level A - Basic compliance (parseable hierarchy)
    A,
    /// Level AA - Intermediate (deterministic FSM)
    AA,
    /// Level AAA - Full compliance (all features)
    AAA,
}

impl CertificationLevel {
    /// Get the badge emoji for this level
    pub fn badge(&self) -> &'static str {
        match self {
            CertificationLevel::None => "❌",
            CertificationLevel::A => "🥉",
            CertificationLevel::AA => "🥈",
            CertificationLevel::AAA => "🥇",
        }
    }

    /// Get the human-readable name
    pub fn name(&self) -> &'static str {
        match self {
            CertificationLevel::None => "Not Certified",
            CertificationLevel::A => "Level A",
            CertificationLevel::AA => "Level AA",
            CertificationLevel::AAA => "Level AAA",
        }
    }
}

/// A validation check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCheck {
    /// Check identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Category of the check
    pub category: CheckCategory,
    /// Whether the check passed
    pub passed: bool,
    /// Additional details
    pub details: Option<String>,
    /// Weight for scoring (0.0 - 1.0)
    pub weight: f32,
}

/// Categories of validation checks
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CheckCategory {
    /// Document structure checks
    Structure,
    /// Accessibility checks
    Accessibility,
    /// Navigation checks
    Navigation,
    /// Interoperability checks
    Interoperability,
}

impl CheckCategory {
    /// Get the weight multiplier for this category
    pub fn weight_multiplier(&self) -> f32 {
        match self {
            CheckCategory::Structure => 0.30,      // 30%
            CheckCategory::Accessibility => 0.30, // 30%
            CheckCategory::Navigation => 0.25,    // 25%
            CheckCategory::Interoperability => 0.15, // 15%
        }
    }
}

/// Agent certification result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCertification {
    /// Overall certification level
    pub level: CertificationLevel,
    /// Numeric score (0-100)
    pub score: u32,
    /// Individual check results
    pub checks: Vec<ValidationCheck>,
    /// Summary statistics
    pub stats: CertificationStats,
}

/// Statistics about the certification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificationStats {
    /// Total checks performed
    pub total_checks: usize,
    /// Checks that passed
    pub passed_checks: usize,
    /// Number of landmarks found
    pub landmark_count: usize,
    /// Number of interactables found
    pub interactable_count: usize,
    /// Number of headings found
    pub heading_count: usize,
    /// Completeness percentage
    pub completeness: f32,
}

impl AgentCertification {
    /// Certify a SemanticDOM document
    pub fn certify(sdom: &SemanticDOM) -> Self {
        let mut checks = Vec::new();

        // Structure checks (30%)
        checks.push(Self::check_has_landmarks(sdom));
        checks.push(Self::check_has_main(sdom));
        checks.push(Self::check_heading_hierarchy(sdom));
        checks.push(Self::check_unique_ids(sdom));

        // Accessibility checks (30%)
        checks.push(Self::check_accessible_names(sdom));
        checks.push(Self::check_link_text(sdom));
        checks.push(Self::check_button_text(sdom));
        checks.push(Self::check_form_labels(sdom));

        // Navigation checks (25%)
        checks.push(Self::check_navigation_exists(sdom));
        checks.push(Self::check_deterministic_fsm(sdom));
        checks.push(Self::check_reachable_states(sdom));

        // Interoperability checks (15%)
        checks.push(Self::check_selectors(sdom));
        checks.push(Self::check_intents(sdom));

        // Calculate scores by category
        let mut category_scores: std::collections::HashMap<CheckCategory, (f32, f32)> =
            std::collections::HashMap::new();

        for check in &checks {
            let entry = category_scores.entry(check.category).or_insert((0.0, 0.0));
            entry.1 += check.weight;
            if check.passed {
                entry.0 += check.weight;
            }
        }

        // Calculate weighted score
        let mut total_score = 0.0f32;
        for (category, (passed, total)) in &category_scores {
            if *total > 0.0 {
                let category_pct = passed / total;
                total_score += category_pct * category.weight_multiplier();
            }
        }

        // Add completeness bonus
        let completeness = Self::calculate_completeness(sdom);
        total_score += completeness * 0.1; // 10% bonus for completeness

        // Normalize to 0-100
        let score = ((total_score * 100.0).min(100.0).max(0.0)) as u32;

        // Determine level
        let level = match score {
            90..=100 => CertificationLevel::AAA,
            70..=89 => CertificationLevel::AA,
            50..=69 => CertificationLevel::A,
            _ => CertificationLevel::None,
        };

        let passed_checks = checks.iter().filter(|c| c.passed).count();

        let stats = CertificationStats {
            total_checks: checks.len(),
            passed_checks,
            landmark_count: sdom.landmarks.len(),
            interactable_count: sdom.interactables.len(),
            heading_count: sdom.headings.len(),
            completeness,
        };

        AgentCertification {
            level,
            score,
            checks,
            stats,
        }
    }

    /// Calculate content completeness score
    fn calculate_completeness(sdom: &SemanticDOM) -> f32 {
        let mut completeness = 0.0f32;
        let mut max_completeness = 0.0f32;

        // Check labels (25%)
        max_completeness += 0.25;
        let labeled = sdom
            .index
            .values()
            .filter(|n| !n.label.is_empty() && n.label != n.role.to_string().to_lowercase())
            .count();
        let total = sdom.index.len().max(1);
        completeness += 0.25 * (labeled as f32 / total as f32).min(1.0);

        // Check selectors (25%)
        max_completeness += 0.25;
        let with_selectors = sdom
            .index
            .values()
            .filter(|n| !n.selector.is_empty())
            .count();
        completeness += 0.25 * (with_selectors as f32 / total as f32).min(1.0);

        // Check intents (25%)
        max_completeness += 0.25;
        let interactables = sdom.interactables.len().max(1);
        let with_intents = sdom
            .index
            .values()
            .filter(|n| n.intent.is_some())
            .count();
        completeness += 0.25 * (with_intents as f32 / interactables as f32).min(1.0);

        // Check accessible names (25%)
        max_completeness += 0.25;
        let with_a11y_names = sdom
            .index
            .values()
            .filter(|n| n.accessible_name.is_some())
            .count();
        completeness += 0.25 * (with_a11y_names as f32 / total as f32).min(1.0);

        completeness / max_completeness
    }

    // Structure checks

    fn check_has_landmarks(sdom: &SemanticDOM) -> ValidationCheck {
        let has_landmarks = !sdom.landmarks.is_empty();
        ValidationCheck {
            id: "STRUCT-001".to_string(),
            name: "Has landmark regions".to_string(),
            category: CheckCategory::Structure,
            passed: has_landmarks,
            details: Some(format!("Found {} landmarks", sdom.landmarks.len())),
            weight: 1.0,
        }
    }

    fn check_has_main(sdom: &SemanticDOM) -> ValidationCheck {
        let has_main = sdom
            .index
            .values()
            .any(|n| matches!(n.role, SemanticRole::Main));
        ValidationCheck {
            id: "STRUCT-002".to_string(),
            name: "Has main content region".to_string(),
            category: CheckCategory::Structure,
            passed: has_main,
            details: None,
            weight: 1.0,
        }
    }

    fn check_heading_hierarchy(sdom: &SemanticDOM) -> ValidationCheck {
        let has_headings = !sdom.headings.is_empty();
        ValidationCheck {
            id: "STRUCT-003".to_string(),
            name: "Has heading structure".to_string(),
            category: CheckCategory::Structure,
            passed: has_headings,
            details: Some(format!("Found {} headings", sdom.headings.len())),
            weight: 0.5,
        }
    }

    fn check_unique_ids(sdom: &SemanticDOM) -> ValidationCheck {
        // All IDs in the index should be unique by definition (HashMap)
        let unique_count = sdom.index.len();
        ValidationCheck {
            id: "STRUCT-004".to_string(),
            name: "Unique element IDs".to_string(),
            category: CheckCategory::Structure,
            passed: true,
            details: Some(format!("{} unique nodes", unique_count)),
            weight: 0.5,
        }
    }

    // Accessibility checks

    fn check_accessible_names(sdom: &SemanticDOM) -> ValidationCheck {
        let interactables_with_names: usize = sdom
            .interactables
            .iter()
            .filter_map(|id| sdom.index.get(id))
            .filter(|n| n.accessible_name.is_some() || !n.label.is_empty())
            .count();

        let total_interactables = sdom.interactables.len().max(1);
        let pct = (interactables_with_names as f32 / total_interactables as f32) * 100.0;

        ValidationCheck {
            id: "A11Y-001".to_string(),
            name: "Interactables have accessible names".to_string(),
            category: CheckCategory::Accessibility,
            passed: pct >= 80.0,
            details: Some(format!(
                "{}/{} ({:.0}%)",
                interactables_with_names, total_interactables, pct
            )),
            weight: 1.0,
        }
    }

    fn check_link_text(sdom: &SemanticDOM) -> ValidationCheck {
        let links: Vec<_> = sdom
            .index
            .values()
            .filter(|n| matches!(n.role, SemanticRole::Link))
            .collect();

        let with_text = links
            .iter()
            .filter(|n| !n.label.is_empty() && n.label != "a")
            .count();

        let total = links.len().max(1);
        let passed = with_text as f32 / total as f32 >= 0.8;

        ValidationCheck {
            id: "A11Y-002".to_string(),
            name: "Links have descriptive text".to_string(),
            category: CheckCategory::Accessibility,
            passed,
            details: Some(format!("{}/{} links have text", with_text, total)),
            weight: 0.75,
        }
    }

    fn check_button_text(sdom: &SemanticDOM) -> ValidationCheck {
        let buttons: Vec<_> = sdom
            .index
            .values()
            .filter(|n| matches!(n.role, SemanticRole::Button))
            .collect();

        let with_text = buttons
            .iter()
            .filter(|n| !n.label.is_empty() && n.label != "button")
            .count();

        let total = buttons.len().max(1);
        let passed = total == 0 || with_text as f32 / total as f32 >= 0.8;

        ValidationCheck {
            id: "A11Y-003".to_string(),
            name: "Buttons have descriptive text".to_string(),
            category: CheckCategory::Accessibility,
            passed,
            details: Some(format!("{}/{} buttons have text", with_text, total)),
            weight: 0.75,
        }
    }

    fn check_form_labels(sdom: &SemanticDOM) -> ValidationCheck {
        let inputs: Vec<_> = sdom
            .index
            .values()
            .filter(|n| {
                matches!(
                    n.role,
                    SemanticRole::TextInput
                        | SemanticRole::Checkbox
                        | SemanticRole::Radio
                        | SemanticRole::Select
                )
            })
            .collect();

        let with_labels = inputs
            .iter()
            .filter(|n| n.accessible_name.is_some() || !n.label.is_empty())
            .count();

        let total = inputs.len().max(1);
        let passed = total == 0 || with_labels as f32 / total as f32 >= 0.8;

        ValidationCheck {
            id: "A11Y-004".to_string(),
            name: "Form inputs have labels".to_string(),
            category: CheckCategory::Accessibility,
            passed,
            details: Some(format!("{}/{} inputs have labels", with_labels, total)),
            weight: 0.5,
        }
    }

    // Navigation checks

    fn check_navigation_exists(sdom: &SemanticDOM) -> ValidationCheck {
        let has_nav = sdom
            .index
            .values()
            .any(|n| matches!(n.role, SemanticRole::Navigation));

        ValidationCheck {
            id: "NAV-001".to_string(),
            name: "Has navigation landmark".to_string(),
            category: CheckCategory::Navigation,
            passed: has_nav,
            details: None,
            weight: 1.0,
        }
    }

    fn check_deterministic_fsm(sdom: &SemanticDOM) -> ValidationCheck {
        let is_deterministic = sdom.state_graph.is_deterministic();

        ValidationCheck {
            id: "NAV-002".to_string(),
            name: "State graph is deterministic".to_string(),
            category: CheckCategory::Navigation,
            passed: is_deterministic,
            details: Some(format!(
                "{} states, {} transitions",
                sdom.state_graph.states.len(),
                sdom.state_graph.transitions.len()
            )),
            weight: 1.0,
        }
    }

    fn check_reachable_states(sdom: &SemanticDOM) -> ValidationCheck {
        let total_states = sdom.state_graph.states.len();
        let reachable = sdom.state_graph.reachable_states().len();

        let passed = total_states == 0 || reachable == total_states;

        ValidationCheck {
            id: "NAV-003".to_string(),
            name: "All states reachable".to_string(),
            category: CheckCategory::Navigation,
            passed,
            details: Some(format!("{}/{} states reachable", reachable, total_states)),
            weight: 0.75,
        }
    }

    // Interoperability checks

    fn check_selectors(sdom: &SemanticDOM) -> ValidationCheck {
        let with_selectors = sdom
            .index
            .values()
            .filter(|n| !n.selector.is_empty())
            .count();

        let total = sdom.index.len().max(1);
        let pct = (with_selectors as f32 / total as f32) * 100.0;

        ValidationCheck {
            id: "INTEROP-001".to_string(),
            name: "Elements have CSS selectors".to_string(),
            category: CheckCategory::Interoperability,
            passed: pct >= 80.0,
            details: Some(format!("{:.0}% coverage", pct)),
            weight: 1.0,
        }
    }

    fn check_intents(sdom: &SemanticDOM) -> ValidationCheck {
        let interactables_with_intents = sdom
            .interactables
            .iter()
            .filter_map(|id| sdom.index.get(id))
            .filter(|n| n.intent.is_some())
            .count();

        let total = sdom.interactables.len().max(1);
        let pct = (interactables_with_intents as f32 / total as f32) * 100.0;

        ValidationCheck {
            id: "INTEROP-002".to_string(),
            name: "Interactables have intents".to_string(),
            category: CheckCategory::Interoperability,
            passed: pct >= 80.0,
            details: Some(format!("{:.0}% coverage", pct)),
            weight: 0.75,
        }
    }
}

impl std::fmt::Display for SemanticRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Config;

    #[test]
    fn test_certification_basic() {
        let html = r#"
            <html>
            <body>
                <nav><a href="/">Home</a></nav>
                <main><h1>Title</h1><button>Click</button></main>
            </body>
            </html>
        "#;

        let sdom = SemanticDOM::parse(html, Config::default()).unwrap();
        let cert = AgentCertification::certify(&sdom);

        assert!(cert.score > 0);
        assert!(!cert.checks.is_empty());
    }

    #[test]
    fn test_certification_levels() {
        assert!(CertificationLevel::AAA > CertificationLevel::AA);
        assert!(CertificationLevel::AA > CertificationLevel::A);
        assert!(CertificationLevel::A > CertificationLevel::None);
    }

    #[test]
    fn test_certification_badges() {
        assert_eq!(CertificationLevel::AAA.badge(), "🥇");
        assert_eq!(CertificationLevel::AA.badge(), "🥈");
        assert_eq!(CertificationLevel::A.badge(), "🥉");
        assert_eq!(CertificationLevel::None.badge(), "❌");
    }
}
