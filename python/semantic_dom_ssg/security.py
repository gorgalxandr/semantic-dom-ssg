"""Security module for input validation and sanitization."""

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse


class SecurityError(Exception):
    """Base exception for security-related errors."""

    pass


class InputTooLargeError(SecurityError):
    """Input exceeds maximum allowed size."""

    def __init__(self, max_size: int, actual_size: int):
        self.max_size = max_size
        self.actual_size = actual_size
        super().__init__(
            f"Input exceeds maximum size of {max_size} bytes (got {actual_size})"
        )


class InvalidUrlProtocolError(SecurityError):
    """URL has disallowed protocol."""

    def __init__(self, protocol: str):
        self.protocol = protocol
        super().__init__(f"URL has disallowed protocol: {protocol}")


# Allowed URL protocols
ALLOWED_PROTOCOLS = {"https", "http", "file"}

# Blocked URL protocols
BLOCKED_PROTOCOLS = {"javascript", "data", "vbscript", "blob"}


@dataclass
class SecurityConfig:
    """Security configuration for SemanticDOM operations."""

    # Maximum input size in bytes
    max_input_size: int = 10 * 1024 * 1024  # 10MB

    # Allowed URL protocols
    allowed_protocols: set[str] = field(default_factory=lambda: ALLOWED_PROTOCOLS.copy())

    # Whether to validate URLs
    validate_urls: bool = True

    # Maximum URL length
    max_url_length: int = 2048

    def validate_input_size(self, size: int) -> None:
        """Validate input size against the configured limit.

        Args:
            size: Size in bytes to validate

        Raises:
            InputTooLargeError: If size exceeds max_input_size
        """
        if size > self.max_input_size:
            raise InputTooLargeError(self.max_input_size, size)


def validate_url(url: str) -> str:
    """Validate a URL against security rules.

    Args:
        url: The URL string to validate

    Returns:
        The sanitized URL if valid

    Raises:
        InvalidUrlProtocolError: If the URL has a disallowed protocol

    Security:
        - Only allows https, http, and file protocols
        - Blocks javascript:, data:, vbscript:, and blob: URLs
        - Allows relative URLs (starting with / or ./)

    Examples:
        >>> validate_url("https://example.com")
        'https://example.com'
        >>> validate_url("/relative/path")
        '/relative/path'
        >>> validate_url("javascript:alert(1)")
        Traceback (most recent call last):
        ...
        InvalidUrlProtocolError: URL has disallowed protocol: javascript
    """
    # Empty URLs are allowed (no-op)
    if not url:
        return ""

    # Relative URLs are safe
    if url.startswith("/") or url.startswith("./") or url.startswith("../"):
        return url

    # Fragment-only URLs are safe
    if url.startswith("#"):
        return url

    # Try to parse as absolute URL
    try:
        parsed = urlparse(url)
        protocol = parsed.scheme.lower()

        if not protocol:
            # No protocol - check if it looks dangerous
            lower_url = url.lower()
            for blocked in BLOCKED_PROTOCOLS:
                if lower_url.startswith(f"{blocked}:"):
                    raise InvalidUrlProtocolError(blocked)
            return url

        # Check against blocked protocols first
        if protocol in BLOCKED_PROTOCOLS:
            raise InvalidUrlProtocolError(protocol)

        # Check against allowed protocols
        if protocol not in ALLOWED_PROTOCOLS:
            raise InvalidUrlProtocolError(protocol)

        return url
    except InvalidUrlProtocolError:
        raise
    except Exception:
        # If parsing fails, check for dangerous patterns
        lower_url = url.lower()
        for blocked in BLOCKED_PROTOCOLS:
            if lower_url.startswith(f"{blocked}:"):
                raise InvalidUrlProtocolError(blocked)
        return url


def escape_css_identifier(identifier: str) -> str:
    """Escape special characters for CSS selectors.

    Args:
        identifier: The string to escape

    Returns:
        The escaped string safe for use in CSS selectors
    """
    result = []
    for i, char in enumerate(identifier):
        # Characters that need escaping in CSS identifiers
        if char in '!"#$%&\'()*+,./:;<=>?@[\\]^`{|}~':
            result.append(f"\\{char}")
        # Digits at the start need escaping
        elif char.isdigit() and i == 0:
            result.append(f"\\3{char} ")
        # Hyphen at start needs escaping
        elif char == "-" and i == 0:
            result.append("\\-")
        else:
            result.append(char)
    return "".join(result)


def sanitize_string(text: str) -> str:
    """Sanitize a string for safe output.

    Removes or escapes potentially dangerous characters.

    Args:
        text: The string to sanitize

    Returns:
        The sanitized string
    """
    # Remove control characters except newlines and tabs
    return "".join(c for c in text if not (c.isdecimal() and ord(c) < 32) or c in "\n\t")
