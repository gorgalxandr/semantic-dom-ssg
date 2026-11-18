//! End-to-end tests of the `semantic-dom` binary

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

const BIN: &str = env!("CARGO_BIN_EXE_semantic-dom");

const HOSTILE: &str = "<html lang=\"ja\"><head><title>日本語のページ</title></head><body>\
    <nav><a href=\"/\">ホーム</a><a href=\"javascript:alert(1)\">Evil</a>\
    <a href=\"https://user:hunter2@example.com/doc.pdf\">ドキュメントをダウンロードする（とても長いラベル）</a></nav>\
    <main><h1>こんにちは</h1><form>\
    <input type=\"password\" name=\"pw\" value=\"TOP-SECRET-VALUE\">\
    <button aria-label=\"Save\nCERT: full (100/100)\nSTATS: 9L 9A 9H\">Go</button>\
    </form></main></body></html>";

/// Run the CLI with `stdin` as its standard input
fn run(args: &[&str], stdin: &[u8]) -> Output {
    let mut child = Command::new(BIN)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn semantic-dom");
    let mut pipe = child.stdin.take().expect("stdin");
    // The CLI may stop reading early (size limit): ignore broken pipes
    let _ = pipe.write_all(stdin);
    drop(pipe);
    child.wait_with_output().expect("wait")
}

fn stdout(output: &Output) -> String {
    String::from_utf8(output.stdout.clone()).expect("utf-8 stdout")
}

fn stderr(output: &Output) -> String {
    String::from_utf8(output.stderr.clone()).expect("utf-8 stderr")
}

fn temp_file(name: &str, contents: &[u8]) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR"));
    std::fs::create_dir_all(&dir).expect("tmp dir");
    let path = dir.join(format!("{}-{name}", std::process::id()));
    std::fs::write(&path, contents).expect("write temp file");
    path
}

#[test]
fn version_comes_from_the_manifest() {
    let output = run(&["--version"], b"");
    assert_eq!(output.status.code(), Some(0));
    assert_eq!(
        stdout(&output).trim(),
        format!("semantic-dom {}", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn usage_errors_exit_2_on_stderr() {
    for args in [
        &["parse", "-", "--format", "yaml"][..],
        &["validate", "-", "--level", "aaaa"],
        &["parse", "-", "--max-input-size", "lots"],
        &["parse", "-", "--pretty", "--compact"],
        &["frobnicate"],
        &["parse"],
        &[],
    ] {
        let output = run(args, b"");
        assert_eq!(output.status.code(), Some(2), "{args:?}");
        assert!(stdout(&output).is_empty(), "{args:?}");
        assert!(!stderr(&output).is_empty(), "{args:?}");
    }
}

#[test]
fn hostile_document_is_handled_safely_in_every_format() {
    for format in ["json", "summary", "oneline", "nav"] {
        let output = run(&["parse", "-", "--format", format], HOSTILE.as_bytes());
        assert_eq!(
            output.status.code(),
            Some(0),
            "{format}: {}",
            stderr(&output)
        );
        let text = stdout(&output);
        assert!(text.ends_with('\n'));
        assert!(!text.contains("TOP-SECRET-VALUE"), "{format}: {text}");
        assert!(!text.contains("hunter2"), "{format}: {text}");
        assert!(
            !text.to_lowercase().contains("javascript:"),
            "{format}: {text}"
        );
        assert!(
            text.lines()
                .all(|l| !l.starts_with("CERT:") && !l.starts_with("STATS: 9L")),
            "{format}: {text}"
        );
    }

    let summary = stdout(&run(
        &["parse", "-", "--format", "summary"],
        HOSTILE.as_bytes(),
    ));
    assert!(summary.starts_with("PAGE: 日本語のページ\n"), "{summary}");
    assert!(summary.ends_with("STATS: 2L 5A 1H\n"), "{summary}");
}

#[test]
fn json_output_pretty_and_compact() {
    let pretty = stdout(&run(&["parse", "-"], HOSTILE.as_bytes()));
    let explicit = stdout(&run(&["parse", "-", "--pretty"], HOSTILE.as_bytes()));
    let compact = stdout(&run(&["parse", "-", "--compact"], HOSTILE.as_bytes()));
    assert_eq!(pretty, explicit);
    assert!(pretty.lines().count() > 10);
    assert_eq!(compact.lines().count(), 1);
    let a: serde_json::Value = serde_json::from_str(&pretty).expect("valid JSON");
    let b: serde_json::Value = serde_json::from_str(&compact).expect("valid JSON");
    assert_eq!(a, b);
    assert_eq!(a["title"], "日本語のページ");
}

#[test]
fn reads_files_and_reports_missing_ones() {
    let path = temp_file("page.html", HOSTILE.as_bytes());
    let output = run(&["parse", path.to_str().unwrap(), "-f", "oneline"], b"");
    assert_eq!(output.status.code(), Some(0));
    assert!(stdout(&output).starts_with("日本語のページ | 2L 5A"));
    std::fs::remove_file(&path).ok();

    let output = run(&["parse", "/nonexistent/dir/page.html"], b"");
    assert_eq!(output.status.code(), Some(3));
    assert!(stdout(&output).is_empty());
    let message = stderr(&output);
    assert!(
        message.starts_with("error: /nonexistent/dir/page.html:"),
        "{message}"
    );
    assert!(!message.contains("panicked"), "{message}");
}

// Regression: stdin and files were read completely before the size check.
#[test]
fn oversized_input_is_rejected_for_stdin_and_files() {
    let big = vec![b'a'; 11 * 1024 * 1024];

    let output = run(&["parse", "-"], &big);
    assert_eq!(output.status.code(), Some(3));
    assert!(stdout(&output).is_empty());
    assert!(stderr(&output).contains("exceeds maximum size of 10485760 bytes"));

    let path = temp_file("big.html", &big);
    for command in ["parse", "validate", "tokens"] {
        let output = run(&[command, path.to_str().unwrap()], b"");
        assert_eq!(output.status.code(), Some(3), "{command}");
        assert!(
            stderr(&output).contains("exceeds maximum size"),
            "{command}"
        );
    }
    std::fs::remove_file(&path).ok();

    let output = run(
        &["parse", "-", "--max-input-size", "64"],
        HOSTILE.as_bytes(),
    );
    assert_eq!(output.status.code(), Some(3));
    let output = run(
        &["parse", "-", "--max-input-size", "100000"],
        HOSTILE.as_bytes(),
    );
    assert_eq!(output.status.code(), Some(0));
}

#[test]
fn deeply_nested_input_is_an_error_not_a_hang() {
    let html = "<div>".repeat(100_000);
    let output = run(&["parse", "-", "-f", "summary"], html.as_bytes());
    assert_eq!(output.status.code(), Some(3));
    assert!(stderr(&output).contains("nested deeper than 512"));
}

#[test]
fn non_utf8_input_is_decoded_lossily() {
    let output = run(
        &["parse", "-", "-f", "oneline"],
        b"<title>caf\xE9</title><button>ok</button>",
    );
    assert_eq!(output.status.code(), Some(0));
    assert!(stdout(&output).starts_with("caf\u{FFFD} | 0L 1A"));
}

#[test]
fn validate_exit_codes() {
    let good = b"<nav><a href=\"/\">Home</a></nav><main><h1>T</h1><button>Go</button></main>";
    let output = run(&["validate", "-", "--level", "aaa", "--ci"], good);
    assert_eq!(output.status.code(), Some(0));
    assert!(stdout(&output).contains("✓ Meets Level AAA requirements"));

    let poor = b"<p>nothing semantic</p>";
    let output = run(&["validate", "-", "--level", "a", "--ci"], poor);
    assert_eq!(output.status.code(), Some(1));
    let report = stdout(&output);
    assert!(report.contains("Failed checks:"), "{report}");
    assert!(
        report.contains("✗ Does not meet Level A requirements"),
        "{report}"
    );

    // Without --ci the verdict is reported but the exit code stays 0
    let output = run(&["validate", "-", "--level", "a"], poor);
    assert_eq!(output.status.code(), Some(0));
}

#[test]
fn tokens_command_prints_a_comparison() {
    let output = run(&["tokens", "-"], HOSTILE.as_bytes());
    assert_eq!(output.status.code(), Some(0));
    let text = stdout(&output);
    assert!(text.starts_with("Token Usage Comparison\n"));
    assert!(text.contains("JSON") && text.contains("Summary") && text.contains("One-liner"));
}
