//! Depth-limited HTML parsing
//!
//! The HTML tree builder checks the stack of open elements for every tag, so
//! its cost grows with the square of the nesting depth: a few megabytes of
//! `<div><div><div>...` would keep it busy for a very long time. The input is
//! therefore fed to the parser in small chunks and parsing is abandoned as
//! soon as the tree grows deeper than [`MAX_NESTING_DEPTH`].

use crate::{Error, Result, MAX_NESTING_DEPTH};
use ego_tree::Tree;
use html5ever::driver::{self, ParseOpts};
use html5ever::tendril::{StrTendril, TendrilSink};
use scraper::{Html, HtmlTreeSink, Node};

/// Bytes handed to the parser between depth checks
///
/// Bounds how far past the limit a hostile document can nest before it is
/// noticed (one level needs at least three bytes).
const CHUNK_BYTES: usize = 4096;

/// Parse a document, failing fast on excessive nesting
pub(crate) fn parse_html(html: &str) -> Result<Html> {
    let sink = HtmlTreeSink::new(Html::new_document());
    let mut parser = driver::parse_document(sink, ParseOpts::default());
    let mut checked = 0usize;
    let mut rest = html;

    while !rest.is_empty() {
        let mut end = rest.len().min(CHUNK_BYTES);
        while !rest.is_char_boundary(end) {
            end -= 1;
        }
        let (chunk, tail) = rest.split_at(end);
        parser.process(StrTendril::from_slice(chunk));
        checked = check_depth(&parser.tokenizer.sink.sink.0.borrow().tree, checked)?;
        rest = tail;
    }

    Ok(parser.finish())
}

/// Verify the depth of every node created since the previous check
///
/// Returns the number of nodes checked so far. Each node costs at most
/// `MAX_NESTING_DEPTH` steps, and nodes stay attached once created, so
/// nesting cannot hide between two checks.
fn check_depth(tree: &Tree<Node>, already_checked: usize) -> Result<usize> {
    let total = tree.nodes().len();
    let new_nodes = total.saturating_sub(already_checked);

    for node in tree.nodes().rev().take(new_nodes) {
        if !node.value().is_element() {
            continue;
        }
        if node.ancestors().take(MAX_NESTING_DEPTH + 1).count() > MAX_NESTING_DEPTH {
            return Err(Error::NestingTooDeep {
                max_depth: MAX_NESTING_DEPTH,
            });
        }
    }
    Ok(total)
}
