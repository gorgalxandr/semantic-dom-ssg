"""Tests for SemanticDOM parser."""

import pytest

from semantic_dom_ssg import (
    AgentCertification,
    Config,
    SemanticDOM,
    SemanticRole,
    validate_url,
)
from semantic_dom_ssg.security import InputTooLargeError, InvalidUrlProtocolError


class TestSemanticDOM:
    """Tests for SemanticDOM parsing."""

    def test_parse_simple_html(self):
        """Test parsing simple HTML."""
        html = """
        <html>
        <body>
            <nav>
                <a href="#home">Home</a>
                <a href="#about">About</a>
            </nav>
            <main>
                <h1>Welcome</h1>
                <button>Click me</button>
            </main>
        </body>
        </html>
        """
        sdom = SemanticDOM.parse(html)

        assert len(sdom.landmarks) > 0
        assert len(sdom.interactables) > 0

    def test_o1_lookup(self):
        """Test O(1) lookup via dict."""
        html = '<html><body><button id="test-btn">Test</button></body></html>'
        sdom = SemanticDOM.parse(html)

        # Lookup should be O(1) via dict
        node = next(
            (n for n in sdom.index.values() if n.role == SemanticRole.BUTTON), None
        )
        assert node is not None

    def test_agent_summary(self):
        """Test agent summary generation."""
        html = """
        <html>
        <body>
            <nav><a href="#home">Home</a></nav>
            <main><button>Submit</button></main>
        </body>
        </html>
        """
        sdom = SemanticDOM.parse(html)
        summary = sdom.to_agent_summary()

        assert "LANDMARKS:" in summary
        assert "ACTIONS:" in summary

    def test_input_size_limit(self):
        """Test input size limit enforcement."""
        config = Config(max_input_size=100)
        html = "x" * 200

        with pytest.raises(InputTooLargeError) as exc_info:
            SemanticDOM.parse(html, config)

        assert exc_info.value.max_size == 100
        assert exc_info.value.actual_size == 200


class TestUrlValidation:
    """Tests for URL validation."""

    def test_allowed_urls(self):
        """Test that safe URLs are allowed."""
        assert validate_url("https://example.com") == "https://example.com"
        assert validate_url("http://example.com") == "http://example.com"
        assert validate_url("file:///path/to/file") == "file:///path/to/file"
        assert validate_url("/relative/path") == "/relative/path"
        assert validate_url("./relative/path") == "./relative/path"
        assert validate_url("#fragment") == "#fragment"
        assert validate_url("") == ""

    def test_blocked_urls(self):
        """Test that dangerous URLs are blocked."""
        with pytest.raises(InvalidUrlProtocolError):
            validate_url("javascript:alert(1)")

        with pytest.raises(InvalidUrlProtocolError):
            validate_url("data:text/html,<script>alert(1)</script>")

        with pytest.raises(InvalidUrlProtocolError):
            validate_url("vbscript:msgbox")


class TestCertification:
    """Tests for agent certification."""

    def test_certification_basic(self):
        """Test basic certification."""
        html = """
        <html>
        <body>
            <nav><a href="/">Home</a></nav>
            <main><h1>Title</h1><button>Click</button></main>
        </body>
        </html>
        """
        sdom = SemanticDOM.parse(html)
        cert = AgentCertification.certify(sdom)

        assert cert.score > 0
        assert len(cert.checks) > 0

    def test_certification_levels(self):
        """Test certification level ordering."""
        from semantic_dom_ssg.certification import CertificationLevel

        assert CertificationLevel.AAA > CertificationLevel.AA
        assert CertificationLevel.AA > CertificationLevel.A
        assert CertificationLevel.A > CertificationLevel.NONE


class TestSummary:
    """Tests for summary formats."""

    def test_one_liner(self):
        """Test one-liner summary."""
        html = """
        <html>
        <head><title>Test</title></head>
        <body>
            <nav><a href="/">Home</a></nav>
            <main><button>Click</button></main>
        </body>
        </html>
        """
        sdom = SemanticDOM.parse(html)
        one_liner = sdom.to_one_liner()

        # Should be a single line
        assert "\n" not in one_liner
        assert "Test" in one_liner

    def test_token_comparison(self):
        """Test token usage comparison."""
        from semantic_dom_ssg.summary import compare_token_usage

        html = """
        <html>
        <body>
            <nav><a href="/">Home</a></nav>
            <main><button>Submit</button></main>
        </body>
        </html>
        """
        sdom = SemanticDOM.parse(html)
        comparison = compare_token_usage(sdom)

        # Summary should be smaller than JSON
        assert comparison.summary_tokens < comparison.json_tokens
        assert comparison.summary_reduction > 0
