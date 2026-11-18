//! Agent certification system for SemanticDOM
//!
//! Provides compliance validation and scoring based on the
//! ISO/IEC-SDOM-SSG-DRAFT-2024 specification.

mod checks;

use crate::parser::SemanticDOM;
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
    /// Every category, in scoring order
    pub const ALL: [CheckCategory; 4] = [
        CheckCategory::Structure,
        CheckCategory::Accessibility,
        CheckCategory::Navigation,
        CheckCategory::Interoperability,
    ];

    /// Get the weight multiplier for this category
    pub fn weight_multiplier(&self) -> f32 {
        match self {
            CheckCategory::Structure => 0.30,
            CheckCategory::Accessibility => 0.30,
            CheckCategory::Navigation => 0.25,
            CheckCategory::Interoperability => 0.15,
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
    ///
    /// The score is deterministic: categories are combined in a fixed order
    /// and the result is rounded to the nearest integer.
    pub fn certify(sdom: &SemanticDOM) -> Self {
        let checks = checks::run_all(sdom);

        // Weighted pass rate per category, combined in a fixed order
        let mut total_score = 0.0f32;
        for category in CheckCategory::ALL {
            let (passed, total) = checks.iter().filter(|c| c.category == category).fold(
                (0.0f32, 0.0f32),
                |(passed, total), c| {
                    let gained = if c.passed { c.weight } else { 0.0 };
                    (passed + gained, total + c.weight)
                },
            );
            if total > 0.0 {
                total_score += (passed / total) * category.weight_multiplier();
            }
        }

        // Add completeness bonus
        let completeness = Self::calculate_completeness(sdom);
        total_score += completeness * 0.1; // 10% bonus for completeness

        // Normalize to 0-100
        let score = (total_score * 100.0).round().clamp(0.0, 100.0) as u32;

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

    /// Calculate content completeness score (0.0 - 1.0)
    fn calculate_completeness(sdom: &SemanticDOM) -> f32 {
        let total = sdom.index.len().max(1) as f32;
        let interactables = sdom.interactables.len().max(1) as f32;
        let share = |count: usize, of: f32| (count as f32 / of).min(1.0);

        let labeled = sdom
            .index
            .values()
            .filter(|n| !n.label.is_empty() && n.label != n.role.to_string().to_lowercase())
            .count();
        let with_selectors = sdom
            .index
            .values()
            .filter(|n| !n.selector.is_empty())
            .count();
        let with_intents = sdom.index.values().filter(|n| n.intent.is_some()).count();
        let with_a11y_names = sdom
            .index
            .values()
            .filter(|n| n.accessible_name.is_some())
            .count();

        // Four equally weighted aspects
        0.25 * share(labeled, total)
            + 0.25 * share(with_selectors, total)
            + 0.25 * share(with_intents, interactables)
            + 0.25 * share(with_a11y_names, total)
    }
}
