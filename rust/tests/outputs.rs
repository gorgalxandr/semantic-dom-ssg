//! Summary formats, JSON output and certification

use semantic_dom_ssg::{
    compare_token_usage, to_agent_summary, to_audio_summary, to_nav_summary, to_one_liner,
    AgentCertification, CertificationLevel, CheckCategory, Config, SemanticDOM, SemanticNode,
    SemanticRole, StateGraph, VERSION,
};

const PAGE: &str = r#"<html lang="en"><head><title>Test Page</title></head><body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <main><h1>Welcome</h1><button>Submit</button><button>Cancel</button></main>
    </body></html>"#;

fn parse(html: &str) -> SemanticDOM {
    SemanticDOM::parse(html, Config::default()).expect("parse")
}

fn check_passed(cert: &AgentCertification, id: &str) -> bool {
    cert.checks
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("check {id} exists"))
        .passed
}

#[test]
fn agent_summary_format() {
    let summary = to_agent_summary(&parse(PAGE));
    assert_eq!(
        summary,
        "PAGE: Test Page\n\
         LANDMARKS: nav(nav), main(main)\n\
         ACTIONS: [nav]Home, [nav]About, [sub]Submit, [close]Cancel\n\
         STATE: initial -> Home, About\n\
         STATS: 2L 4A 1H"
    );
    assert_eq!(parse(PAGE).to_agent_summary(), summary);
}

#[test]
fn agent_summary_stays_compact_on_large_pages() {
    let html = format!(
        "{}{}",
        "<nav>n</nav>".repeat(500),
        "<button>b</button>".repeat(500)
    );
    let summary = to_agent_summary(&parse(&html));
    assert!(summary.len() < 600, "{} bytes", summary.len());
    assert!(summary.ends_with("STATS: 500L 500A 0H"));
}

#[test]
fn one_liner_format() {
    let one_liner = to_one_liner(&parse(PAGE));
    assert_eq!(
        one_liner,
        "Test Page | 2L 4A | nav,main | lnk:Home,lnk:About,btn:Submit"
    );
    assert_eq!(to_one_liner(&parse("")), "Untitled | 0L 0A |  | ");
}

#[test]
fn nav_and_audio_summaries() {
    let sdom = parse(PAGE);
    assert_eq!(
        to_nav_summary(&sdom),
        "NAVIGATION:\n  Home -> /\n  About -> /about\n\
         TRANSITIONS:\n  initial -[sdom_a_2]-> state__\n  initial -[sdom_a_3]-> state__about"
    );
    assert_eq!(
        to_audio_summary(&sdom),
        "Page: Test Page. 2 landmark regions. 4 interactive elements. \
         Main actions: Home, About, Submit, Cancel"
    );
}

#[test]
fn token_comparison_never_underflows() {
    let comparison = compare_token_usage(&parse(PAGE));
    assert!(comparison.summary_tokens < comparison.json_tokens);
    assert!(comparison.summary_reduction > 0.0 && comparison.summary_reduction < 100.0);
    assert!(comparison.one_liner_reduction > comparison.summary_reduction);

    // Summary larger than the JSON baseline is reported as negative, not a panic
    let no_graph = Config {
        include_state_graph: false,
        ..Config::default()
    };
    let comparison = compare_token_usage(&SemanticDOM::parse("", no_graph).unwrap());
    assert!(comparison.summary_reduction.is_finite());
}

#[test]
fn json_is_valid_sorted_and_complete() {
    let sdom = parse(PAGE);
    let pretty = sdom.to_json().unwrap();
    let compact = sdom.to_json_compact().unwrap();
    assert!(!compact.contains('\n'));

    let value: serde_json::Value = serde_json::from_str(&pretty).unwrap();
    assert_eq!(
        value,
        serde_json::from_str::<serde_json::Value>(&compact).unwrap()
    );
    assert_eq!(value["title"], "Test Page");
    assert_eq!(value["lang"], "en");
    assert_eq!(value["truncated"], false);
    assert_eq!(value["nodes"].as_object().unwrap().len(), sdom.index.len());
    assert_eq!(value["stateGraph"]["states"].as_array().unwrap().len(), 3);

    // Nodes round-trip through serde
    let node: SemanticNode = serde_json::from_value(value["nodes"]["sdom_a_2"].clone()).unwrap();
    assert_eq!(node.role, SemanticRole::Link);
    assert_eq!(node.href.as_deref(), Some("/"));
    assert_eq!(node.parent.as_deref(), Some("sdom_nav_1"));
}

#[test]
fn state_graph_can_be_disabled() {
    let config = Config {
        include_state_graph: false,
        ..Config::default()
    };
    let sdom = SemanticDOM::parse(PAGE, config).unwrap();
    assert!(sdom.state_graph.states.is_empty());
    assert!(!sdom.to_agent_summary().contains("STATE:"));
}

#[test]
fn state_graph_helpers() {
    let mut graph = StateGraph::new();
    assert!(graph.is_deterministic());
    assert!(graph.reachable_states().is_empty());

    let sdom = parse(PAGE);
    graph = sdom.state_graph.clone();
    assert!(graph.is_deterministic());
    assert_eq!(graph.reachable_states().len(), 3);

    let mut duplicate = graph.transitions[0].clone();
    duplicate.to = "elsewhere".to_string();
    graph.transitions.push(duplicate);
    assert!(!graph.is_deterministic(), "same trigger, two targets");
}

#[test]
fn certification_of_a_well_formed_page() {
    let cert = AgentCertification::certify(&parse(PAGE));
    assert_eq!(cert.level, CertificationLevel::AAA);
    assert_eq!(cert.score, 100);
    assert_eq!(cert.stats.total_checks, 13);
    assert_eq!(cert.stats.passed_checks, 13);
    assert_eq!(cert.stats.landmark_count, 2);
    assert_eq!(cert.stats.interactable_count, 4);
    assert_eq!(cert.stats.heading_count, 1);
    for category in CheckCategory::ALL {
        assert!(cert.checks.iter().any(|c| c.category == category));
    }
    let weights: f32 = CheckCategory::ALL
        .iter()
        .map(|c| c.weight_multiplier())
        .sum();
    assert!((weights - 1.0).abs() < 1e-6);
}

// Regression: the score summed floats in hash-map order and truncated, so
// the same document could land on either side of a level boundary.
#[test]
fn certification_is_deterministic() {
    let html = r#"<main><h1>T</h1><a href="/a">A</a><button></button><input></main>"#;
    let first = AgentCertification::certify(&parse(html));
    for _ in 0..50 {
        let again = AgentCertification::certify(&parse(html));
        assert_eq!((again.score, again.level), (first.score, first.level));
    }
}

// Regression: ratio checks failed on pages with nothing to check.
#[test]
fn checks_pass_vacuously_without_subjects() {
    let cert = AgentCertification::certify(&parse("<main><h1>Just text</h1></main>"));
    for id in [
        "A11Y-001",
        "A11Y-002",
        "A11Y-003",
        "A11Y-004",
        "INTEROP-002",
    ] {
        assert!(check_passed(&cert, id), "{id} must pass with no subjects");
    }
    assert!(!check_passed(&cert, "NAV-001"));
}

#[test]
fn documents_without_semantics_are_not_certified() {
    for html in ["", "<p>plain text</p>", "<div><span>x</span></div>"] {
        let cert = AgentCertification::certify(&parse(html));
        assert!(!check_passed(&cert, "STRUCT-001"));
        assert!(!check_passed(&cert, "A11Y-001"));
        assert!(cert.score < 50, "{html:?} scored {}", cert.score);
        assert_eq!(cert.level, CertificationLevel::None);
    }
}

#[test]
fn unlabeled_controls_fail_accessibility_checks() {
    let cert = AgentCertification::certify(&parse(
        r#"<main><button></button><button></button><a href="/x"></a></main>"#,
    ));
    assert!(!check_passed(&cert, "A11Y-002"));
    assert!(!check_passed(&cert, "A11Y-003"));
}

// Regression: STRUCT-004 "Unique element IDs" could never fail.
#[test]
fn duplicate_html_ids_fail_the_unique_id_check() {
    let unique = AgentCertification::certify(&parse(r#"<main id="a"><p id="b">x</p></main>"#));
    assert!(check_passed(&unique, "STRUCT-004"));

    let duplicated = AgentCertification::certify(&parse(r#"<main id="a"><p id="a">x</p></main>"#));
    assert!(!check_passed(&duplicated, "STRUCT-004"));
}

#[test]
fn certification_levels_and_badges() {
    assert!(CertificationLevel::AAA > CertificationLevel::AA);
    assert!(CertificationLevel::AA > CertificationLevel::A);
    assert!(CertificationLevel::A > CertificationLevel::None);
    assert_eq!(CertificationLevel::AAA.badge(), "🥇");
    assert_eq!(CertificationLevel::None.name(), "Not Certified");
}

#[test]
fn version_matches_the_manifest() {
    assert_eq!(VERSION, env!("CARGO_PKG_VERSION"));
    assert_eq!(SemanticRole::TextInput.to_string(), "TextInput");
    assert!(SemanticRole::Search.is_landmark());
    assert!(SemanticRole::Checkbox.is_interactable());
    assert!(!SemanticRole::Heading.is_interactable());
}
