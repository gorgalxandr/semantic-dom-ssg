//! Security module for input validation and URL sanitization
//!
//! Implements security hardening as per the ISO/IEC-SDOM-SSG-DRAFT-2024
//! specification including URL validation, input size limits, and
//! protocol allow-listing.

use crate::sanitize::is_unsafe_inline;
use crate::{Error, Result};
use url::Url;

/// Allowed URL protocols for security
const ALLOWED_PROTOCOLS: &[&str] = &["https", "http", "file"];

/// Dangerous protocols that are blocked whatever the allow-list says
const BLOCKED_PROTOCOLS: &[&str] = &["javascript", "data", "vbscript", "blob"];

/// Default maximum input size in bytes (10MB)
pub(crate) const DEFAULT_MAX_INPUT_SIZE: usize = 10 * 1024 * 1024;

/// Default maximum URL length in bytes
const DEFAULT_MAX_URL_LENGTH: usize = 2048;

/// Security configuration for SemanticDOM operations
#[derive(Debug, Clone)]
pub struct SecurityConfig {
    /// Maximum input size in bytes
    pub max_input_size: usize,
    /// Allowed URL protocols (lowercase, without the trailing `:`)
    pub allowed_protocols: Vec<String>,
    /// Whether to apply the protocol allow-list to URLs
    ///
    /// Even when `false`, the always-blocked script protocols are rejected,
    /// the length limit applies and credentials/control characters are
    /// removed.
    pub validate_urls: bool,
    /// Maximum URL length in bytes
    pub max_url_length: usize,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_input_size: DEFAULT_MAX_INPUT_SIZE,
            allowed_protocols: ALLOWED_PROTOCOLS.iter().map(|s| s.to_string()).collect(),
            validate_urls: true,
            max_url_length: DEFAULT_MAX_URL_LENGTH,
        }
    }
}

impl SecurityConfig {
    /// Create a new security config with default settings
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

    /// Validate and sanitize a URL against this configuration
    ///
    /// See [`validate_url`] for the rules; this variant honours
    /// `allowed_protocols`, `validate_urls` and `max_url_length`.
    pub fn validate_url(&self, url: &str) -> Result<String> {
        sanitize_url(url, self.max_url_length, |scheme| {
            !self.validate_urls || self.allowed_protocols.iter().any(|p| p == scheme)
        })
    }
}

/// Validate a URL against the default security rules
///
/// # Arguments
/// * `url` - The URL string to validate
///
/// # Returns
/// * `Ok(String)` - The sanitized URL if valid
/// * `Err(Error)` - If the URL has a disallowed protocol, is malformed or
///   is longer than 2048 bytes
///
/// # Security
/// - Only allows https, http, and file protocols (scheme matched
///   case-insensitively, after removing the whitespace browsers ignore)
/// - Blocks javascript:, data:, vbscript:, blob: and every other scheme
/// - Allows relative and fragment-only URLs; whitespace and control
///   characters in them are percent-encoded
/// - Protocol-relative URLs (`//host/path`, `/\host`) are validated as
///   absolute URLs
/// - Credentials (`https://user:pass@host`) are removed from the result
///
/// # Examples
/// ```
/// use semantic_dom_ssg::validate_url;
///
/// assert!(validate_url("https://example.com").is_ok());
/// assert!(validate_url("/relative/path").is_ok());
/// assert!(validate_url("javascript:alert(1)").is_err());
/// assert_eq!(
///     validate_url("https://user:secret@example.com/a").unwrap(),
///     "https://example.com/a"
/// );
/// ```
pub fn validate_url(url: &str) -> Result<String> {
    sanitize_url(url, DEFAULT_MAX_URL_LENGTH, |scheme| {
        ALLOWED_PROTOCOLS.contains(&scheme)
    })
}

/// Whether a sanitized URL stays on the current site
///
/// True for path-, query- and fragment-relative references; false for
/// absolute and protocol-relative URLs. Expects [`validate_url`] output.
pub(crate) fn is_internal_url(url: &str) -> bool {
    !url.is_empty() && !url.starts_with("//") && extract_scheme(url).is_none()
}

fn invalid(reason: impl Into<String>) -> Error {
    Error::InvalidUrl {
        reason: reason.into(),
    }
}

/// Return the lowercased scheme if `url` starts with `scheme:`
fn extract_scheme(url: &str) -> Option<String> {
    let colon = url.find(':')?;
    let scheme = &url[..colon];
    let mut chars = scheme.chars();
    let valid = chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
    valid.then(|| scheme.to_ascii_lowercase())
}

/// Remove userinfo from a parsed URL (a no-op where none is permitted)
fn strip_credentials(parsed: &mut Url) {
    if !parsed.username().is_empty() || parsed.password().is_some() {
        let _ = parsed.set_username("");
        let _ = parsed.set_password(None);
    }
}

/// Percent-encode whitespace, control and invisible characters
fn encode_unsafe(url: &str) -> String {
    let mut out = String::with_capacity(url.len());
    let mut buf = [0u8; 4];
    for c in url.chars() {
        if is_unsafe_inline(c) {
            for byte in c.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{byte:02X}"));
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn sanitize_url(url: &str, max_length: usize, is_allowed: impl Fn(&str) -> bool) -> Result<String> {
    if url.len() > max_length {
        return Err(invalid(format!(
            "length {} exceeds maximum of {} bytes",
            url.len(),
            max_length
        )));
    }

    // Normalise the way browsers do before resolving a URL: strip leading
    // and trailing C0 control/space, drop tab and newline anywhere.
    let normalized: String = url
        .trim_matches(|c: char| c <= ' ')
        .chars()
        .filter(|c| !matches!(c, '\t' | '\n' | '\r'))
        .collect();

    if normalized.is_empty() {
        return Ok(String::new());
    }

    if let Some(scheme) = extract_scheme(&normalized) {
        if BLOCKED_PROTOCOLS.contains(&scheme.as_str()) || !is_allowed(&scheme) {
            return Err(Error::InvalidUrlProtocol { protocol: scheme });
        }
        let mut parsed = Url::parse(&normalized).map_err(|e| invalid(e.to_string()))?;
        strip_credentials(&mut parsed);
        return Ok(encode_unsafe(parsed.as_str()));
    }

    // Browsers treat `\` like `/` here, so `/\host` is protocol-relative too
    let mut leading = normalized.chars().map(|c| if c == '\\' { '/' } else { c });
    if leading.next() == Some('/') && leading.next() == Some('/') {
        let rest = normalized[2..].trim_start_matches(['/', '\\']);
        let mut parsed =
            Url::parse(&format!("https://{rest}")).map_err(|e| invalid(e.to_string()))?;
        strip_credentials(&mut parsed);
        return Ok(encode_unsafe(&parsed.as_str()["https:".len()..]));
    }

    Ok(encode_unsafe(&normalized))
}
