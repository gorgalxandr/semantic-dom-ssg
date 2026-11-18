//! Text sanitisation for untrusted document content
//!
//! Everything that is copied out of an HTML document (labels, titles,
//! identifiers, selectors) passes through this module before it reaches an
//! output format. The line-oriented agent summary in particular must never
//! contain a raw newline or control character taken from the page, otherwise
//! a hostile document could forge whole summary lines.

/// Characters removed outright: control characters, zero-width characters and
/// bidirectional overrides that can be used to disguise or reorder output.
fn is_stripped(c: char) -> bool {
    c.is_control()
        || matches!(
            c,
            '\u{200B}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}'
                | '\u{2060}'..='\u{2069}' | '\u{FEFF}'
        )
}

/// Whether a character may not appear verbatim in single-line output
pub(crate) fn is_unsafe_inline(c: char) -> bool {
    c.is_whitespace() || is_stripped(c)
}

/// Streaming single-line text builder with a hard character cap
///
/// Collapses every run of whitespace (including newlines and Unicode line
/// separators) into one space, drops control characters and never holds more
/// than `max_chars + 1` characters, so feeding it a huge text node is cheap.
#[derive(Debug)]
pub(crate) struct TextAccumulator {
    out: String,
    chars: usize,
    max_chars: usize,
    pending_space: bool,
}

impl TextAccumulator {
    /// Create an accumulator that yields at most `max_chars` characters
    pub(crate) fn new(max_chars: usize) -> Self {
        Self {
            out: String::new(),
            chars: 0,
            max_chars,
            pending_space: false,
        }
    }

    /// Whether the cap has been exceeded (further input is ignored)
    pub(crate) fn is_full(&self) -> bool {
        self.chars > self.max_chars
    }

    /// Mark a word boundary (used between separate text nodes)
    pub(crate) fn push_break(&mut self) {
        self.pending_space = true;
    }

    /// Append text; input beyond the cap is ignored
    pub(crate) fn push_str(&mut self, text: &str) {
        for c in text.chars() {
            if self.is_full() {
                break;
            }
            if c.is_whitespace() {
                self.pending_space = true;
            } else if !is_stripped(c) {
                if self.pending_space && !self.out.is_empty() {
                    self.out.push(' ');
                    self.chars += 1;
                }
                self.pending_space = false;
                if !self.is_full() {
                    self.out.push(c);
                    self.chars += 1;
                }
            }
        }
    }

    /// Finish, truncating with an ellipsis when the cap was exceeded
    pub(crate) fn finish(self) -> String {
        if self.is_full() {
            truncate_chars(&self.out, self.max_chars)
        } else {
            self.out
        }
    }
}

/// Sanitise untrusted text for single-line output
///
/// - every run of whitespace (spaces, tabs, newlines, `U+2028`, ...) becomes
///   a single space, and leading/trailing whitespace is removed
/// - control characters, zero-width characters and bidirectional overrides
///   are removed
/// - the result is capped at `max_chars` characters (not bytes); longer text
///   ends in `...`
///
/// # Examples
/// ```
/// use semantic_dom_ssg::sanitize_text;
///
/// assert_eq!(sanitize_text("  Sign\n in\u{0}  ", 50), "Sign in");
/// assert_eq!(sanitize_text("abcdefghij", 8), "abcde...");
/// ```
pub fn sanitize_text(input: &str, max_chars: usize) -> String {
    let mut acc = TextAccumulator::new(max_chars);
    acc.push_str(input);
    acc.finish()
}

/// Truncate to at most `max_chars` characters on a character boundary
///
/// Text that does not fit ends in `...` (the ellipsis counts towards the
/// cap). Never panics, whatever the input or the cap.
pub(crate) fn truncate_chars(s: &str, max_chars: usize) -> String {
    let Some((cut, _)) = s.char_indices().nth(max_chars) else {
        return s.to_string();
    };
    if max_chars < 3 {
        return s[..cut].to_string();
    }
    let keep = s
        .char_indices()
        .nth(max_chars - 3)
        .map_or(cut, |(idx, _)| idx);
    format!("{}...", &s[..keep])
}

/// Reduce an untrusted string to a safe identifier fragment
///
/// Keeps alphanumerics, `-`, `_`, `.` and `:`; every other character becomes
/// `_`. The result is capped at `max_chars` characters and may be empty.
pub(crate) fn sanitize_identifier(input: &str, max_chars: usize) -> String {
    input
        .trim()
        .chars()
        .filter(|c| c.is_whitespace() || !is_stripped(*c))
        .take(max_chars)
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ':') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Escape a string for use as a CSS identifier (CSSOM `CSS.escape`)
///
/// Control characters, whitespace and line separators are hex-escaped, so
/// the result never contains a raw newline.
pub(crate) fn escape_css_identifier(input: &str) -> String {
    let mut result = String::with_capacity(input.len() + 8);
    let lone_hyphen = input == "-";
    let mut previous = None;

    for (i, c) in input.chars().enumerate() {
        let digit_needs_escape =
            c.is_ascii_digit() && (i == 0 || (i == 1 && previous == Some('-')));
        if c == '\0' {
            result.push('\u{FFFD}');
        } else if digit_needs_escape || (is_unsafe_inline(c) && c != ' ') {
            result.push_str(&format!("\\{:x} ", c as u32));
        } else if lone_hyphen {
            result.push_str("\\-");
        } else if c.is_ascii_alphanumeric() || c == '-' || c == '_' || !c.is_ascii() {
            result.push(c);
        } else {
            result.push('\\');
            result.push(c);
        }
        previous = Some(c);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // Regression: byte-index truncation panicked inside multi-byte characters.
    #[test]
    fn truncate_chars_respects_char_boundaries() {
        assert_eq!(truncate_chars("hello", 10), "hello");
        assert_eq!(truncate_chars("hello", 5), "hello");
        assert_eq!(truncate_chars("hello!", 5), "he...");
        assert_eq!(truncate_chars("日本語のテキスト", 5), "日本...");
        assert_eq!(truncate_chars("🙂🙂🙂🙂", 3), "...");
        for max in 0..12 {
            for text in ["", "a", "ééééééééééé", "日本語日本語日本語", "a🙂b🙂c🙂d🙂"]
            {
                let out = truncate_chars(text, max);
                assert!(out.chars().count() <= max.max(text.chars().count().min(max)));
            }
        }
        // Regression: `max_len - 3` underflowed for tiny limits
        assert_eq!(truncate_chars("hello", 2), "he");
        assert_eq!(truncate_chars("hello", 0), "");
    }

    #[test]
    fn accumulator_is_bounded_and_joins_nodes() {
        let mut acc = TextAccumulator::new(8);
        acc.push_str("ab");
        acc.push_break();
        acc.push_str("cd  ");
        assert!(!acc.is_full());
        acc.push_str(&"x".repeat(1_000_000));
        assert!(acc.is_full());
        assert_eq!(acc.finish(), "ab cd...");
    }

    #[test]
    fn identifiers_are_reduced_to_safe_characters() {
        assert_eq!(sanitize_identifier("main-nav_1", 64), "main-nav_1");
        assert_eq!(sanitize_identifier(" a b\nc ", 64), "a_b_c");
        assert_eq!(sanitize_identifier("x\u{0}y<z>", 64), "xy_z_");
        assert_eq!(sanitize_identifier("日本語", 2), "日本");
        assert_eq!(sanitize_identifier(" \n ", 64), "");
    }

    #[test]
    fn css_identifiers_are_escaped() {
        assert_eq!(escape_css_identifier("simple"), "simple");
        assert_eq!(escape_css_identifier("with.dot"), "with\\.dot");
        assert_eq!(escape_css_identifier("with:colon"), "with\\:colon");
        assert_eq!(escape_css_identifier("#hash"), "\\#hash");
        assert_eq!(escape_css_identifier("1st"), "\\31 st");
        assert_eq!(escape_css_identifier("-1"), "-\\31 ");
        assert_eq!(escape_css_identifier("-"), "\\-");
        assert_eq!(escape_css_identifier("a b"), "a\\ b");
        assert_eq!(escape_css_identifier("日本"), "日本");
        // Regression: newlines and control characters were passed through
        assert_eq!(escape_css_identifier("a\nb"), "a\\a b");
        assert_eq!(escape_css_identifier("a\u{1}\u{2028}"), "a\\1 \\2028 ");
        assert!(!escape_css_identifier("x\r\n\t\u{85}y")
            .chars()
            .any(|c| c.is_control()));
    }
}
