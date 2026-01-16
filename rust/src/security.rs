//! Security module for input validation and sanitization
//!
//! Implements security hardening as per the ISO/IEC-SDOM-SSG-DRAFT-2024
//! specification including URL validation, input size limits, and
//! protocol allow-listing.

use crate::{Error, Result};
use url::Url;

/// Allowed URL protocols for security
const ALLOWED_PROTOCOLS: &[&str] = &["https", "http", "file"];

/// Dangerous protocols that must be blocked
const BLOCKED_PROTOCOLS: &[&str] = &["javascript", "data", "vbscript", "blob"];

/// Security configuration for SemanticDOM operations
#[derive(Debug, Clone)]
pub struct SecurityConfig {
    /// Maximum input size in bytes
    pub max_input_size: usize,
    /// Allowed URL protocols
    pub allowed_protocols: Vec<String>,
    /// Whether to validate URLs
    pub validate_urls: bool,
    /// Maximum URL length
    pub max_url_length: usize,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_input_size: 10 * 1024 * 1024, // 10MB
            allowed_protocols: ALLOWED_PROTOCOLS.iter().map(|s| s.to_string()).collect(),
            validate_urls: true,
            max_url_length: 2048,
        }
    }
}

impl SecurityConfig {
    /// Create a new security config with custom settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum input size
    pub fn with_max_input_size(mut self, size: usize) -> Self {
        self.max_input_size = size;
        self
    }

    /// Validate input size against the configured limit
    pub fn validate_input_size(&self, size: usize) -> Result<()> {
        if size > self.max_input_size {
            return Err(Error::InputTooLarge {
                max_size: self.max_input_size,
                actual_size: size,
            });
        }
        Ok(())
    }
}

/// Validate a URL against security rules
///
/// # Arguments
/// * `url` - The URL string to validate
///
/// # Returns
/// * `Ok(String)` - The sanitized URL if valid
/// * `Err(Error)` - If the URL has a disallowed protocol
///
/// # Security
/// - Only allows https, http, and file protocols
/// - Blocks javascript:, data:, vbscript:, and blob: URLs
/// - Allows relative URLs (starting with / or ./)
///
/// # Examples
/// ```
/// use semantic_dom_ssg::validate_url;
///
/// assert!(validate_url("https://example.com").is_ok());
/// assert!(validate_url("/relative/path").is_ok());
/// assert!(validate_url("javascript:alert(1)").is_err());
/// ```
pub fn validate_url(url: &str) -> Result<String> {
    // Empty URLs are allowed (no-op)
    if url.is_empty() {
        return Ok(String::new());
    }

    // Relative URLs are safe
    if url.starts_with('/') || url.starts_with("./") || url.starts_with("../") {
        return Ok(url.to_string());
    }

    // Fragment-only URLs are safe
    if url.starts_with('#') {
        return Ok(url.to_string());
    }

    // Try to parse as absolute URL
    match Url::parse(url) {
        Ok(parsed) => {
            let protocol = parsed.scheme().to_lowercase();

            // Check against blocked protocols first
            for blocked in BLOCKED_PROTOCOLS {
                if protocol == *blocked {
                    return Err(Error::InvalidUrlProtocol { protocol });
                }
            }

            // Check against allowed protocols
            if !ALLOWED_PROTOCOLS.contains(&protocol.as_str()) {
                return Err(Error::InvalidUrlProtocol { protocol });
            }

            Ok(parsed.to_string())
        }
        Err(_) => {
            // If it can't be parsed and doesn't look dangerous, allow it
            // This handles things like "path/to/file" without a protocol
            let lower = url.to_lowercase();
            for blocked in BLOCKED_PROTOCOLS {
                if lower.starts_with(&format!("{}:", blocked)) {
                    return Err(Error::InvalidUrlProtocol {
                        protocol: blocked.to_string(),
                    });
                }
            }
            Ok(url.to_string())
        }
    }
}

/// Sanitize a string for safe output
///
/// Removes or escapes potentially dangerous characters
pub fn sanitize_string(input: &str) -> String {
    input
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect()
}

/// Escape special characters for CSS selectors
pub fn escape_css_identifier(input: &str) -> String {
    let mut result = String::with_capacity(input.len() * 2);

    for (i, c) in input.chars().enumerate() {
        match c {
            // Characters that need escaping in CSS identifiers
            '!' | '"' | '#' | '$' | '%' | '&' | '\'' | '(' | ')' | '*' | '+' | ',' | '.' | '/'
            | ':' | ';' | '<' | '=' | '>' | '?' | '@' | '[' | '\\' | ']' | '^' | '`' | '{'
            | '|' | '}' | '~' => {
                result.push('\\');
                result.push(c);
            }
            // Digits at the start need escaping
            '0'..='9' if i == 0 => {
                result.push_str(&format!("\\3{} ", c));
            }
            // Hyphen at start needs escaping
            '-' if i == 0 => {
                result.push_str("\\-");
            }
            // Normal characters
            _ => result.push(c),
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_url_allowed() {
        assert!(validate_url("https://example.com").is_ok());
        assert!(validate_url("http://example.com").is_ok());
        assert!(validate_url("file:///path/to/file").is_ok());
        assert!(validate_url("/relative/path").is_ok());
        assert!(validate_url("./relative/path").is_ok());
        assert!(validate_url("../parent/path").is_ok());
        assert!(validate_url("#fragment").is_ok());
        assert!(validate_url("").is_ok());
    }

    #[test]
    fn test_validate_url_blocked() {
        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("data:text/html,<script>").is_err());
        assert!(validate_url("vbscript:msgbox").is_err());
        assert!(validate_url("blob:http://example.com/uuid").is_err());
    }

    #[test]
    fn test_validate_url_error_type() {
        let err = validate_url("javascript:alert(1)").unwrap_err();
        match err {
            Error::InvalidUrlProtocol { protocol } => {
                assert_eq!(protocol, "javascript");
            }
            _ => panic!("Expected InvalidUrlProtocol error"),
        }
    }

    #[test]
    fn test_security_config_input_size() {
        let config = SecurityConfig::new().with_max_input_size(100);
        assert!(config.validate_input_size(50).is_ok());
        assert!(config.validate_input_size(100).is_ok());
        assert!(config.validate_input_size(101).is_err());
    }

    #[test]
    fn test_escape_css_identifier() {
        assert_eq!(escape_css_identifier("simple"), "simple");
        assert_eq!(escape_css_identifier("with.dot"), "with\\.dot");
        assert_eq!(escape_css_identifier("with:colon"), "with\\:colon");
        assert_eq!(escape_css_identifier("#hash"), "\\#hash");
    }

    #[test]
    fn test_sanitize_string() {
        assert_eq!(sanitize_string("hello\nworld"), "hello\nworld");
        assert_eq!(sanitize_string("hello\tworld"), "hello\tworld");
        // Control characters should be removed
        assert_eq!(sanitize_string("hello\x00world"), "helloworld");
    }
}
