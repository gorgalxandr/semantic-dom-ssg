//! Collision-free, deterministic semantic ID allocation

use crate::sanitize::sanitize_identifier;
use ahash::{AHashMap, AHashSet};

/// Maximum number of characters taken from an HTML `id` attribute
const MAX_ID_CHARS: usize = 64;

/// Hands out semantic IDs that are unique within one document
///
/// IDs depend only on the document and the configured prefix, so parsing the
/// same input twice yields the same IDs.
#[derive(Debug)]
pub(crate) struct IdAllocator {
    prefix: String,
    counter: usize,
    used: AHashSet<String>,
    /// Next disambiguation suffix to try per colliding base ID
    next_suffix: AHashMap<String, usize>,
}

impl IdAllocator {
    pub(crate) fn new(prefix: &str) -> Self {
        Self {
            prefix: prefix.to_string(),
            counter: 0,
            used: AHashSet::new(),
            next_suffix: AHashMap::new(),
        }
    }

    /// Allocate an ID for an element
    ///
    /// Uses the element's `id` attribute when it has a usable one, otherwise
    /// `{prefix}_{tag}_{n}`. A candidate that is already taken (duplicate
    /// HTML ids, or an HTML id that looks like a generated ID) is never
    /// reused: the new element gets a `_2`, `_3`, ... suffix or the next
    /// free counter value instead.
    pub(crate) fn allocate(&mut self, tag: &str, html_id: Option<&str>) -> String {
        let from_attr = html_id
            .map(|id| sanitize_identifier(id, MAX_ID_CHARS))
            .filter(|id| !id.is_empty());

        let id = match from_attr {
            Some(attr) => {
                let base = format!("{}_{}", self.prefix, attr);
                if self.used.contains(&base) {
                    self.disambiguate(base)
                } else {
                    base
                }
            }
            None => self.generate(tag),
        };
        self.used.insert(id.clone());
        id
    }

    fn disambiguate(&mut self, base: String) -> String {
        let next = self.next_suffix.entry(base.clone()).or_insert(2);
        loop {
            let candidate = format!("{}_{}", base, next);
            *next += 1;
            if !self.used.contains(&candidate) {
                return candidate;
            }
        }
    }

    fn generate(&mut self, tag: &str) -> String {
        let tag = sanitize_identifier(tag, MAX_ID_CHARS);
        loop {
            self.counter += 1;
            let candidate = format!("{}_{}_{}", self.prefix, tag, self.counter);
            if !self.used.contains(&candidate) {
                return candidate;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ahash::AHashSet;

    #[test]
    fn allocations_never_repeat() {
        let mut ids = IdAllocator::new("sdom");
        let requests = [
            ("button", Some("go")),
            ("button", Some("go")),
            ("button", Some("go_2")),
            ("button", Some("go")),
            ("a", Some("a_3")),
            ("a", None),
            ("a", None),
            ("a", None),
            ("a", Some(" \n")),
            ("we\nird", None),
            ("a", Some("x\ny")),
        ];
        let allocated: Vec<String> = requests
            .iter()
            .map(|(tag, id)| ids.allocate(tag, *id))
            .collect();
        assert_eq!(
            allocated,
            [
                "sdom_go",
                "sdom_go_2",
                "sdom_go_2_2",
                "sdom_go_3",
                "sdom_a_3",
                "sdom_a_1",
                "sdom_a_2",
                "sdom_a_4",
                "sdom_a_5",
                "sdom_we_ird_6",
                "sdom_x_y",
            ]
        );
        let unique: AHashSet<_> = allocated.iter().collect();
        assert_eq!(unique.len(), allocated.len());
    }

    #[test]
    fn many_duplicates_stay_linear() {
        let mut ids = IdAllocator::new("p");
        let last = (0..200_000)
            .map(|_| ids.allocate("div", Some("same")))
            .last();
        assert_eq!(last.as_deref(), Some("p_same_200000"));
    }
}
