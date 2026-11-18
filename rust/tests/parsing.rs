//! Parser behaviour: classification, IDs, hierarchy, limits

use semantic_dom_ssg::{
    Config, Error, SemanticDOM, SemanticIntent, SemanticRole, MAX_NESTING_DEPTH,
};

fn parse(html: &str) -> SemanticDOM {
    SemanticDOM::parse(html, Config::default()).expect("parse")
}

fn roles(sdom: &SemanticDOM, role: SemanticRole) -> usize {
    sdom.index.values().filter(|n| n.role == role).count()
}

#[test]
fn parses_landmarks_interactables_and_headings() {
    let sdom = parse(
        r##"<html lang="en"><head><title> My  Page </title></head><body>
            <nav><a href="#home">Home</a><a href="#about">About</a></nav>
            <main><h1>Welcome</h1><button>Click me</button></main>
        </body></html>"##,
    );
    assert_eq!(sdom.title.as_deref(), Some("My Page"));
    assert_eq!(sdom.lang.as_deref(), Some("en"));
    assert_eq!(sdom.landmarks.len(), 2);
    assert_eq!(sdom.interactables.len(), 3);
    assert_eq!(sdom.headings.len(), 1);
    assert_eq!(sdom.get_landmarks().len(), 2);
    assert_eq!(sdom.get_interactables().len(), 3);
}

#[test]
fn lookup_by_html_id() {
    let sdom = parse(r#"<button id="test-btn">Test</button>"#);
    let node = sdom
        .get("sdom_test-btn")
        .expect("node indexed under its id");
    assert_eq!(node.role, SemanticRole::Button);
    assert_eq!(node.selector, "button#test-btn");
    assert!(sdom.get("missing").is_none());
}

#[test]
fn every_listed_id_resolves() {
    let sdom =
        parse(r#"<nav id="n"><a href="/a">A</a></nav><main><h2>T</h2><input name="q"></main>"#);
    for id in sdom
        .landmarks
        .iter()
        .chain(&sdom.interactables)
        .chain(&sdom.headings)
    {
        assert_eq!(&sdom.get(id).expect("listed id is indexed").id, id);
    }
}

// Regression: duplicate HTML ids made the second element vanish silently.
#[test]
fn duplicate_html_ids_do_not_overwrite_or_drop_nodes() {
    let sdom = parse(
        r#"<button id="go">First</button><button id="go">Second</button>
           <button id="go">Third</button>"#,
    );
    assert_eq!(sdom.interactables, ["sdom_go", "sdom_go_2", "sdom_go_3"]);
    assert_eq!(sdom.get("sdom_go").unwrap().label, "First");
    assert_eq!(sdom.get("sdom_go_2").unwrap().label, "Second");
    assert_eq!(sdom.get("sdom_go_3").unwrap().label, "Third");
    assert_eq!(sdom.duplicate_ids, ["go"]);
}

// Regression: an HTML id shaped like a generated ID shadowed another node.
#[test]
fn html_id_equal_to_generated_id_does_not_collide() {
    for html in [
        r#"<button id="button_2">Named</button><button>Anonymous</button>"#,
        r#"<button>Anonymous</button><button id="button_1">Named</button>"#,
        r#"<button id="go_2">A</button><button id="go">B</button><button id="go">C</button>"#,
    ] {
        let sdom = parse(html);
        assert_eq!(
            sdom.index.len(),
            3 - usize::from(!html.contains("go")),
            "{html}"
        );
        assert_eq!(sdom.interactables.len(), sdom.index.len(), "{html}");
        let mut ids = sdom.interactables.clone();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), sdom.index.len(), "ids unique for {html}");
    }
}

// Regression: an element matching two selectors (tag + role) was indexed twice.
#[test]
fn element_is_indexed_exactly_once() {
    let sdom = parse(r#"<nav role="navigation">x</nav><main role="main">y</main>"#);
    assert_eq!(sdom.landmarks.len(), 2);
    assert_eq!(sdom.index.len(), 2);

    let sdom = parse(r#"<div role="search"><input type="search" name="q"></div>"#);
    assert_eq!(roles(&sdom, SemanticRole::Search), 1);
    assert_eq!(roles(&sdom, SemanticRole::TextInput), 1);
}

#[test]
fn ids_and_json_are_deterministic_across_runs() {
    let html = r#"<nav><a href="/a">A</a><a href="/b">B</a></nav>
        <main><h1>T</h1><form><input name="q"><input type="checkbox" id="c">
        <button>Go</button></form></main><footer>f</footer>"#;
    let first = parse(html);
    for _ in 0..5 {
        let again = parse(html);
        assert_eq!(first.landmarks, again.landmarks);
        assert_eq!(first.interactables, again.interactables);
        assert_eq!(first.to_json().unwrap(), again.to_json().unwrap());
    }
    // Document order, not grouped by tag
    assert_eq!(
        first.landmarks,
        ["sdom_nav_1", "sdom_main_4", "sdom_footer_9"]
    );
}

#[test]
fn hierarchy_is_tracked() {
    let sdom = parse(r#"<main id="m"><nav id="n"><a id="l" href="/x">X</a></nav></main>"#);
    let main = sdom.get("sdom_m").unwrap();
    let nav = sdom.get("sdom_n").unwrap();
    let link = sdom.get("sdom_l").unwrap();
    assert_eq!((main.depth, nav.depth, link.depth), (0, 1, 2));
    assert_eq!(main.children, ["sdom_n"]);
    assert_eq!(nav.parent.as_deref(), Some("sdom_m"));
    assert_eq!(link.parent.as_deref(), Some("sdom_n"));
}

// Regression: exclude_tags never excluded anything inside the listed tags.
#[test]
fn excluded_subtrees_are_skipped() {
    let sdom = parse(
        r#"<main><noscript><button>Hidden</button></noscript>
           <template><a href="/t">T</a></template>
           <script>document.write("<button>js</button>")</script>
           <button>Visible</button></main>"#,
    );
    assert_eq!(sdom.interactables.len(), 1);
    let main = sdom.get(&sdom.landmarks[0]).unwrap();
    assert_eq!(
        main.label, "Visible",
        "script text must not leak into labels"
    );
}

#[test]
fn input_types_are_classified() {
    let sdom = parse(
        r#"<input name="plain"><input type="TEXT" name="t"><input type="hidden" name="h">
           <input type="submit" value="Send it"><input type="checkbox"><input type="radio">
           <textarea name="ta"></textarea><select name="s"><option>One</option></select>"#,
    );
    assert_eq!(roles(&sdom, SemanticRole::TextInput), 3);
    assert_eq!(roles(&sdom, SemanticRole::Button), 1);
    assert_eq!(roles(&sdom, SemanticRole::Checkbox), 1);
    assert_eq!(roles(&sdom, SemanticRole::Radio), 1);
    assert_eq!(roles(&sdom, SemanticRole::Select), 1);
    assert_eq!(
        sdom.interactables.len(),
        7,
        "hidden input is not interactable"
    );

    let submit = sdom
        .index
        .values()
        .find(|n| n.role == SemanticRole::Button)
        .unwrap();
    assert_eq!(submit.label, "Send it");
    assert_eq!(submit.intent, Some(SemanticIntent::Submit));
    let select = sdom
        .index
        .values()
        .find(|n| n.role == SemanticRole::Select)
        .unwrap();
    assert_eq!(select.label, "s", "option text is not a label");
}

#[test]
fn form_controls_use_associated_labels() {
    let sdom = parse(
        r#"<label for="email">Email address</label><input id="email" type="email">
           <label>Remember me <input id="rem" type="checkbox"></label>"#,
    );
    assert_eq!(sdom.get("sdom_email").unwrap().label, "Email address");
    assert_eq!(
        sdom.get("sdom_rem").unwrap().accessible_name.as_deref(),
        Some("Remember me")
    );
}

#[test]
fn intents_are_inferred() {
    let sdom = parse(
        r#"<a id="d" href="/files/Report.PDF?v=2">Report</a><a id="n" href="/x">X</a>
           <a id="j" href="javascript:void(0)">JS</a>
           <button id="del">Delete item</button><button id="e" data-intent="expand">More</button>
           <input id="s" type="search">"#,
    );
    let intent = |id: &str| sdom.get(id).unwrap().intent.clone().unwrap();
    assert_eq!(intent("sdom_d"), SemanticIntent::Download);
    assert_eq!(intent("sdom_n"), SemanticIntent::Navigate);
    assert_eq!(intent("sdom_j"), SemanticIntent::Action);
    assert_eq!(intent("sdom_del"), SemanticIntent::Delete);
    assert_eq!(intent("sdom_e"), SemanticIntent::Expand);
    assert_eq!(intent("sdom_s"), SemanticIntent::Search);
}

// Regression: Config::max_depth was documented but never applied.
#[test]
fn max_depth_is_enforced_and_reported() {
    let html = format!(
        "<body>{}<button>Deep</button>{}<button>Shallow</button></body>",
        "<div>".repeat(60),
        "</div>".repeat(60)
    );
    let sdom = parse(&html);
    assert!(sdom.truncated);
    assert_eq!(sdom.interactables.len(), 1);
    assert_eq!(sdom.get(&sdom.interactables[0]).unwrap().label, "Shallow");

    let config = Config {
        max_depth: 100,
        ..Config::default()
    };
    let sdom = SemanticDOM::parse(&html, config).unwrap();
    assert!(!sdom.truncated);
    assert_eq!(sdom.interactables.len(), 2);
}

// Regression: tree construction is quadratic in nesting depth, so deeply
// nested input could occupy the parser for minutes.
#[test]
fn pathological_nesting_is_rejected_quickly() {
    let depth = 200_000;
    let html = format!(
        "{}<button>x</button>{}",
        "<section>text ".repeat(depth),
        "</section>".repeat(depth)
    );
    let started = std::time::Instant::now();
    for max_depth in [50, usize::MAX] {
        let config = Config {
            max_depth,
            ..Config::default()
        };
        assert!(matches!(
            SemanticDOM::parse(&html, config),
            Err(Error::NestingTooDeep { max_depth }) if max_depth == MAX_NESTING_DEPTH
        ));
    }
    assert!(
        started.elapsed() < std::time::Duration::from_secs(20),
        "took {:?}",
        started.elapsed()
    );
}

#[test]
fn nesting_up_to_the_limit_is_accepted() {
    // <html><body> plus 500 sections stays within the limit
    let html = format!(
        "{}<button>x</button>{}",
        "<section>".repeat(500),
        "</section>".repeat(500)
    );
    let config = Config {
        max_depth: usize::MAX,
        ..Config::default()
    };
    let sdom = SemanticDOM::parse(&html, config).unwrap();
    assert_eq!(sdom.index.len(), 501);
    assert!(!sdom.truncated);
    let button = sdom.get(&sdom.interactables[0]).unwrap();
    assert_eq!(button.depth, 500);
    assert!(sdom.to_json().is_ok());
}

// Chunked parsing must not change results, wherever a chunk boundary falls.
#[test]
fn chunk_boundaries_do_not_affect_parsing() {
    for padding in 4080..4100 {
        let html = format!(
            "<main><p>{}</p><a href=\"/日本語\">リンク先のページ</a><button>押す</button></main>",
            "é".repeat(padding / 2)
        );
        let sdom = parse(&html);
        assert_eq!(sdom.interactables.len(), 2, "padding {padding}");
        let link = sdom.get(&sdom.interactables[0]).unwrap();
        assert_eq!(link.label, "リンク先のページ");
        assert_eq!(link.href.as_deref(), Some("/日本語"));
    }
}

#[test]
fn large_flat_documents_scale_linearly() {
    let mut html = String::from("<nav>");
    for i in 0..20_000 {
        html.push_str(&format!(r#"<a id="dup" href="/p/{i}">Page {i}</a>"#));
    }
    html.push_str("</nav>");
    let started = std::time::Instant::now();
    let sdom = parse(&html);
    assert_eq!(sdom.interactables.len(), 20_000);
    assert_eq!(sdom.state_graph.states.len(), 20_001);
    assert_eq!(sdom.state_graph.reachable_states().len(), 20_001);
    assert!(started.elapsed() < std::time::Duration::from_secs(60));
}

#[test]
fn input_size_limit_applies_to_every_entry_point() {
    let config = || Config {
        max_input_size: 100,
        ..Config::default()
    };
    let html = "x".repeat(200);
    assert!(matches!(
        SemanticDOM::parse(&html, config()),
        Err(Error::InputTooLarge {
            max_size: 100,
            actual_size: 200
        })
    ));
    assert!(matches!(
        SemanticDOM::from_bytes(html.as_bytes(), config()),
        Err(Error::InputTooLarge { .. })
    ));
    assert!(SemanticDOM::parse(&"x".repeat(100), config()).is_ok());
}

/// A reader that never ends and counts how much was pulled from it
struct Endless(usize);

impl std::io::Read for Endless {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        buf.fill(b'a');
        self.0 += buf.len();
        Ok(buf.len())
    }
}

// Regression: stdin/file input was read in full before any size check.
#[test]
fn from_reader_stops_reading_at_the_limit() {
    let config = Config {
        max_input_size: 1000,
        ..Config::default()
    };
    let mut endless = Endless(0);
    let result = SemanticDOM::from_reader(&mut endless, config);
    assert!(matches!(
        result,
        Err(Error::InputTooLarge { max_size: 1000, .. })
    ));
    assert!(endless.0 <= 1_000_000, "read {} bytes", endless.0);
}

#[test]
fn from_reader_and_bytes_accept_non_utf8_and_bom() {
    let sdom = SemanticDOM::from_reader(
        &b"\xEF\xBB\xBF<title>caf\xE9</title><button>ok</button>"[..],
        Config::default(),
    )
    .unwrap();
    assert_eq!(sdom.title.as_deref(), Some("caf\u{FFFD}"));
    assert_eq!(sdom.interactables.len(), 1);
}

#[test]
fn from_file_reports_missing_files() {
    let result = SemanticDOM::from_file("/nonexistent/semantic-dom.html", Config::default());
    assert!(matches!(result, Err(Error::IoError(_))));
}

#[test]
fn empty_and_garbage_input_do_not_panic() {
    for html in [
        "",
        " ",
        "<",
        "<<<>>>",
        "</html>",
        "\u{0}\u{1}",
        "<a href>",
        "<input type>",
    ] {
        let sdom = parse(html);
        let _ = sdom.to_json().unwrap();
        let _ = sdom.to_agent_summary();
        let _ = sdom.to_one_liner();
    }
}
