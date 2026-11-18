"""Security module: input limits, URL validation and output sanitisation.

Everything that comes out of an HTML document is untrusted. This module is the
single place where that data is bounded and neutralised before it reaches the
JSON or line-oriented summary output.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import quote, urlsplit, urlunsplit

__all__ = [
    "ALLOWED_PROTOCOLS",
    "BLOCKED_PROTOCOLS",
    "DEFAULT_MAX_INPUT_SIZE",
    "DEFAULT_MAX_URL_LENGTH",
    "InputTooLargeError",
    "InvalidUrlError",
    "InvalidUrlProtocolError",
    "SecurityConfig",
    "SecurityError",
    "UrlTooLongError",
    "encode_input",
    "escape_css_identifier",
    "is_internal_url",
    "sanitize_string",
    "sanitize_text",
    "validate_url",
]

#: Default maximum input size in bytes (10 MiB).
DEFAULT_MAX_INPUT_SIZE = 10 * 1024 * 1024

#: Default maximum URL length in characters.
DEFAULT_MAX_URL_LENGTH = 2048

#: URL schemes that may appear in output.
ALLOWED_PROTOCOLS = {"https", "http", "file"}

#: URL schemes that are always rejected, even if a caller allows them.
BLOCKED_PROTOCOLS = {"javascript", "data", "vbscript", "blob"}


class SecurityError(Exception):
    """Base exception for security-related errors."""


class InputTooLargeError(SecurityError):
    """Input exceeds maximum allowed size (measured in bytes)."""

    def __init__(self, max_size: int, actual_size: int, *, at_least: bool = False):
        self.max_size = max_size
        self.actual_size = actual_size
        self.at_least = at_least
        got = f"at least {actual_size}" if at_least else str(actual_size)
        super().__init__(f"Input exceeds maximum size of {max_size} bytes (got {got})")


class InvalidUrlError(SecurityError):
    """URL is malformed or otherwise unsafe to emit."""


class InvalidUrlProtocolError(InvalidUrlError):
    """URL has disallowed protocol."""

    def __init__(self, protocol: str):
        self.protocol = protocol
        super().__init__(f"URL has disallowed protocol: {protocol}")


class UrlTooLongError(InvalidUrlError):
    """URL exceeds the maximum allowed length."""

    def __init__(self, max_length: int, actual_length: int):
        self.max_length = max_length
        self.actual_length = actual_length
        super().__init__(f"URL exceeds maximum length of {max_length} characters")


# Leading/trailing characters browsers strip from URLs (C0 controls and space).
_C0_AND_SPACE = "".join(chr(i) for i in range(0x21))
# ASCII tab/newline are removed from anywhere inside a URL by browsers, which is
# what makes "java\tscript:" dangerous.
_TAB_NEWLINE = {0x09: None, 0x0A: None, 0x0D: None}
_SCHEME_RE = re.compile(r"([A-Za-z][A-Za-z0-9+.\-]*):")
_SURROGATE_RE = re.compile("[\ud800-\udfff]")
_BIDI = "\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff"
# Characters that must never appear raw in an emitted URL.
_URL_UNSAFE_RE = re.compile(f"[\\s\x00-\x1f\x7f-\x9f{_BIDI}]")
# Characters removed from human-readable text. Whitespace-like controls are not
# listed here: they are collapsed to a single space instead.
_TEXT_DROP_RE = re.compile(f"[\x00-\x08\x0e-\x1b\x7f-\x84\x86-\x9f\ud800-\udfff{_BIDI}]")
_STRING_DROP_RE = re.compile(f"[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029\ud800-\udfff{_BIDI}]")
_SPECIAL_SCHEMES = {"http", "https", "file", "ftp", "ws", "wss"}


def _normalise_backslashes(url: str) -> str:
    """Turn backslashes into slashes before the query/fragment, as browsers do."""
    cut = len(url)
    for sep in "?#":
        pos = url.find(sep)
        if pos != -1:
            cut = min(cut, pos)
    return url[:cut].replace("\\", "/") + url[cut:]


def _clean_url(url: str) -> str:
    return url.strip(_C0_AND_SPACE).translate(_TAB_NEWLINE)


def validate_url(
    url: str,
    *,
    max_length: int = DEFAULT_MAX_URL_LENGTH,
    allowed_protocols: set[str] | frozenset[str] | None = None,
) -> str:
    """Validate a URL against security rules and return a sanitised copy.

    Args:
        url: The URL string to validate.
        max_length: Maximum length in characters of the sanitised URL.
        allowed_protocols: Schemes to accept (default: ``https``, ``http``, ``file``).
            ``javascript``, ``data``, ``vbscript`` and ``blob`` are always rejected.

    Returns:
        The sanitised URL: surrounding whitespace and embedded tabs/newlines are
        removed, the scheme is lower-cased, credentials (``user:pass@``) are
        stripped, and whitespace/control characters are percent-encoded. An
        empty URL is returned as ``""``.

    Raises:
        InvalidUrlProtocolError: If the URL has a disallowed protocol.
        UrlTooLongError: If the URL is longer than ``max_length``.
        InvalidUrlError: If the URL is malformed.

    Examples:
        >>> validate_url("https://example.com")
        'https://example.com'
        >>> validate_url("https://user:secret@example.com/a")
        'https://example.com/a'
        >>> validate_url("/relative/path")
        '/relative/path'
    """
    allowed = ALLOWED_PROTOCOLS if allowed_protocols is None else allowed_protocols
    cleaned = _clean_url(url)
    if not cleaned:
        return ""
    if len(cleaned) > max_length:
        raise UrlTooLongError(max_length, len(cleaned))
    if _SURROGATE_RE.search(cleaned):
        raise InvalidUrlError("URL contains unpaired surrogate characters")

    match = _SCHEME_RE.match(cleaned)
    scheme = match.group(1).lower() if match else ""
    if scheme:
        if scheme in BLOCKED_PROTOCOLS or scheme not in {p.lower() for p in allowed}:
            raise InvalidUrlProtocolError(scheme)
        cleaned = scheme + cleaned[len(scheme) :]

    if not scheme or scheme in _SPECIAL_SCHEMES:
        cleaned = _normalise_backslashes(cleaned)
    cleaned = _URL_UNSAFE_RE.sub(lambda m: quote(m.group(0), safe=""), cleaned)

    if cleaned.startswith("//") or scheme in _SPECIAL_SCHEMES:
        try:
            parts = urlsplit(cleaned)
            _ = parts.port  # raises ValueError for a malformed port
        except ValueError as exc:
            raise InvalidUrlError(f"Malformed URL: {exc}") from None
        host = parts.netloc.rpartition("@")[2]
        if not host and scheme != "file":
            raise InvalidUrlError("URL has no host")
        if host != parts.netloc:
            cleaned = urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))

    if len(cleaned) > max_length:
        raise UrlTooLongError(max_length, len(cleaned))
    return cleaned


def is_internal_url(url: str) -> bool:
    """Return True if ``url`` is a same-origin reference (path, query or fragment).

    Absolute URLs (``https://...``, ``mailto:...``) and protocol-relative URLs
    (``//host``, including the ``/\\host`` and ``\\\\host`` spellings browsers
    accept) are external.
    """
    cleaned = _normalise_backslashes(_clean_url(url))
    if not cleaned or cleaned.startswith("//"):
        return False
    return _SCHEME_RE.match(cleaned) is None


@dataclass
class SecurityConfig:
    """Security configuration for SemanticDOM operations."""

    # Maximum input size in bytes
    max_input_size: int = DEFAULT_MAX_INPUT_SIZE

    # Allowed URL protocols
    allowed_protocols: set[str] = field(default_factory=lambda: ALLOWED_PROTOCOLS.copy())

    # Whether to validate URLs
    validate_urls: bool = True

    # Maximum URL length
    max_url_length: int = DEFAULT_MAX_URL_LENGTH

    def validate_input_size(self, size: int) -> None:
        """Validate an input size in bytes against the configured limit.

        Raises:
            InputTooLargeError: If size exceeds max_input_size
        """
        if size > self.max_input_size:
            raise InputTooLargeError(self.max_input_size, size)

    def validate_url(self, url: str) -> str:
        """Validate ``url`` using this configuration (no-op if ``validate_urls`` is False)."""
        if not self.validate_urls:
            return url
        return validate_url(
            url, max_length=self.max_url_length, allowed_protocols=self.allowed_protocols
        )


def encode_input(data: str | bytes | bytearray, max_size: int) -> bytes:
    """Return ``data`` as UTF-8 bytes, enforcing ``max_size`` in bytes.

    Unpaired surrogates in ``str`` input (which cannot be encoded) are replaced.

    Raises:
        InputTooLargeError: If the encoded input is larger than ``max_size``.
    """
    if isinstance(data, str):
        # Every character is at least one byte, so this avoids encoding huge input.
        if len(data) > max_size:
            raise InputTooLargeError(max_size, len(data), at_least=True)
        raw = data.encode("utf-8", "replace")
    else:
        raw = bytes(data)
    if len(raw) > max_size:
        raise InputTooLargeError(max_size, len(raw))
    return raw


def escape_css_identifier(identifier: str) -> str:
    """Escape a string for use as a CSS identifier (``#id`` / ``.class``).

    Follows the CSSOM ``CSS.escape`` algorithm; whitespace and control
    characters are hex-escaped so the result is always a single line.
    """
    result: list[str] = []
    for i, char in enumerate(identifier):
        code = ord(char)
        if code == 0 or 0xD800 <= code <= 0xDFFF:
            result.append("\ufffd")
        elif char.isascii() and char.isdigit():
            leading = i == 0 or (i == 1 and identifier[0] == "-")
            result.append(f"\\{code:x} " if leading else char)
        elif char == "-":
            result.append("\\-" if i == 0 else char)
        elif code < 0x20 or 0x7F <= code <= 0x9F or (code >= 0x80 and char.isspace()):
            result.append(f"\\{code:x} ")
        elif code >= 0x80:
            result.append(f"\\{code:x} " if _TEXT_DROP_RE.match(char) else char)
        elif char == "_" or char.isalnum():
            result.append(char)
        else:
            result.append(f"\\{char}")
    return "".join(result)


def sanitize_text(text: str, max_length: int | None = None) -> str:
    """Reduce untrusted text to a single safe line.

    Control characters, unpaired surrogates and bidirectional overrides are
    removed; every run of whitespace (including newlines and Unicode line
    separators) becomes one space. If ``max_length`` is given, longer text is
    truncated and ends in ``...``.
    """
    cleaned = " ".join(_TEXT_DROP_RE.sub("", text).split())
    if max_length is not None and len(cleaned) > max_length:
        if max_length <= 3:
            return cleaned[:max_length]
        return cleaned[: max_length - 3].rstrip() + "..."
    return cleaned


def sanitize_string(text: str) -> str:
    """Remove control characters from a string, keeping newlines and tabs.

    Use :func:`sanitize_text` instead when the result must be a single line.
    """
    return _STRING_DROP_RE.sub("", text)
