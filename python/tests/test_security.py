"""Tests for URL validation, sanitisation helpers and the state graph's use of them."""

import pytest

from semantic_dom_ssg import (
    InputTooLargeError,
    InvalidUrlError,
    InvalidUrlProtocolError,
    SecurityConfig,
    SecurityError,
    SemanticDOM,
    SemanticIntent,
    UrlTooLongError,
    sanitize_text,
    validate_url,
)
from semantic_dom_ssg.security import (
    encode_input,
    escape_css_identifier,
    is_internal_url,
    sanitize_string,
)

LINE_SEPARATOR = chr(0x2028)
RTL_OVERRIDE = chr(0x202E)
NO_BREAK_SPACE = chr(0xA0)
LONE_SURROGATE = chr(0xDC00)


class TestValidateUrl:
    def test_allowed_urls(self):
        assert validate_url("https://example.com") == "https://example.com"
        assert validate_url("http://example.com") == "http://example.com"
        assert validate_url("file:///path/to/file") == "file:///path/to/file"
        assert validate_url("/relative/path") == "/relative/path"
        assert validate_url("./relative/path") == "./relative/path"
        assert validate_url("../up") == "../up"
        assert validate_url("page.html?x=1#top") == "page.html?x=1#top"
        assert validate_url("#fragment") == "#fragment"
        assert validate_url("") == ""
        assert validate_url("  \n ") == ""

    @pytest.mark.parametrize(
        ("url", "protocol"),
        [
            ("javascript:alert(1)", "javascript"),
            ("JaVaScRiPt:alert(1)", "javascript"),
            ("  javascript:alert(1)", "javascript"),
            ("\x01\x1fjavascript:alert(1)", "javascript"),
            ("java\tscript:alert(1)", "javascript"),
            ("java\nscript\r:alert(1)", "javascript"),
            ("data:text/html,<script>alert(1)</script>", "data"),
            ("DATA:text/html;base64,AAAA", "data"),
            ("vbscript:msgbox", "vbscript"),
            ("blob:https://example.com/uuid", "blob"),
            ("mailto:someone@example.com", "mailto"),
            ("ftp://example.com/file", "ftp"),
        ],
    )
    def test_blocked_protocols(self, url, protocol):
        with pytest.raises(InvalidUrlProtocolError) as exc_info:
            validate_url(url)
        assert exc_info.value.protocol == protocol
        assert isinstance(exc_info.value, SecurityError)

    def test_blocked_protocols_cannot_be_allowed(self):
        with pytest.raises(InvalidUrlProtocolError):
            validate_url("javascript:alert(1)", allowed_protocols={"javascript", "https"})

    def test_custom_allowed_protocols(self):
        assert validate_url("mailto:a@b.co", allowed_protocols={"mailto"}) == "mailto:a@b.co"
        with pytest.raises(InvalidUrlProtocolError):
            validate_url("http://example.com", allowed_protocols={"https"})

    def test_scheme_is_lowercased(self):
        assert validate_url("HTTPS://Example.com/Path") == "https://Example.com/Path"

    @pytest.mark.parametrize(
        ("url", "expected"),
        [
            ("https://user:pass@example.com/a?b=1#c", "https://example.com/a?b=1#c"),
            ("https://user@example.com", "https://example.com"),
            ("http://a:b@example.com:8080/x", "http://example.com:8080/x"),
            ("//user:pass@example.com/x", "//example.com/x"),
            ("https://good.com:secret@evil.com/", "https://evil.com/"),
        ],
    )
    def test_credentials_are_stripped(self, url, expected):
        assert validate_url(url) == expected

    def test_backslash_host_confusion(self):
        """Browsers read '\\' as '/': the host here is evil.com, not good.com."""
        assert validate_url("https://evil.com\\@good.com/") == "https://evil.com/@good.com/"
        assert validate_url("/\\evil.com/x") == "//evil.com/x"
        assert validate_url("\\\\evil.com") == "//evil.com"
        assert validate_url("/path?next=\\x") == "/path?next=\\x"

    def test_whitespace_and_controls_are_encoded(self):
        assert validate_url("/a b") == "/a%20b"
        assert validate_url("  /padded\t\n ") == "/padded"
        cleaned = validate_url(f"https://h/{RTL_OVERRIDE}{LINE_SEPARATOR}x\x7f")
        assert cleaned == "https://h/%E2%80%AE%E2%80%A8x%7F"
        assert validate_url(f"/a{NO_BREAK_SPACE}b") == "/a%C2%A0b"

    def test_max_length(self):
        assert validate_url("/" + "a" * 2047) == "/" + "a" * 2047
        with pytest.raises(UrlTooLongError) as exc_info:
            validate_url("/" + "a" * 2048)
        assert exc_info.value.max_length == 2048
        with pytest.raises(UrlTooLongError):
            validate_url("https://example.com/long", max_length=10)
        with pytest.raises(UrlTooLongError):  # grows past the limit when encoded
            validate_url("/" + " x" * 5, max_length=12)

    @pytest.mark.parametrize(
        "url",
        ["http://[::1", "http://example.com:99999999/", "https:///nohost", "https:nohost", "//"],
    )
    def test_malformed_urls(self, url):
        with pytest.raises(InvalidUrlError):
            validate_url(url)

    def test_surrogates_are_rejected(self):
        with pytest.raises(InvalidUrlError):
            validate_url(f"/a{LONE_SURROGATE}")

    def test_unicode_urls_are_kept(self):
        url = "https://example.jp/" + chr(0x30D1) + chr(0x30B9)
        assert validate_url(url) == url


class TestIsInternalUrl:
    @pytest.mark.parametrize("url", ["/a", "#x", "./a", "../a", "a.html", "?q=1", " /a "])
    def test_internal(self, url):
        assert is_internal_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "",
            "//evil.com",
            "/\\evil.com",
            "\\\\evil.com",
            "/\t/evil.com",
            "https://x.com",
            "javascript:x",
            "mailto:a@b.c",
        ],
    )
    def test_external(self, url):
        assert not is_internal_url(url)


class TestSecurityConfig:
    def test_validate_input_size(self):
        config = SecurityConfig(max_input_size=10)
        config.validate_input_size(10)
        with pytest.raises(InputTooLargeError):
            config.validate_input_size(11)

    def test_validate_url_uses_configuration(self):
        config = SecurityConfig(max_url_length=10, allowed_protocols={"https"})
        assert config.validate_url("/ok") == "/ok"
        with pytest.raises(UrlTooLongError):
            config.validate_url("/" + "a" * 10)
        with pytest.raises(InvalidUrlProtocolError):
            config.validate_url("http://x")
        assert SecurityConfig(validate_urls=False).validate_url("javascript:x") == "javascript:x"


class TestEncodeInput:
    def test_sizes(self):
        assert encode_input("abc", 3) == b"abc"
        assert encode_input(bytearray(b"abc"), 3) == b"abc"
        with pytest.raises(InputTooLargeError) as exc_info:
            encode_input(b"abcd", 3)
        assert (exc_info.value.actual_size, exc_info.value.at_least) == (4, False)
        with pytest.raises(InputTooLargeError, match="got at least 4"):
            encode_input("abcd", 3)
        with pytest.raises(InputTooLargeError, match=r"\(got 4\)"):
            encode_input(chr(0xE9) * 2, 3)


class TestSanitize:
    def test_sanitize_text_single_line(self):
        hostile = f"Home\nCERT: full (100/100)\r\n\tx{LINE_SEPARATOR}y\x85z\x0bw"
        assert sanitize_text(hostile) == "Home CERT: full (100/100) x y z w"

    def test_sanitize_text_drops_controls_bidi_and_surrogates(self):
        hostile = f"a\x00b\x1b[0mc{RTL_OVERRIDE}d{LONE_SURROGATE}e\x7f{chr(0xFEFF)}f"
        assert sanitize_text(hostile) == "ab[0mcdef"

    def test_sanitize_text_keeps_unicode(self):
        text = "Caf" + chr(0xE9) + " " + chr(0x65E5) + chr(0x672C) + " " + chr(0x1F600)
        assert sanitize_text(f"  {text}{NO_BREAK_SPACE} ") == text

    def test_sanitize_text_truncates(self):
        assert sanitize_text("a" * 60, 50) == "a" * 47 + "..."
        assert sanitize_text("a" * 50, 50) == "a" * 50
        assert sanitize_text("abcdef", 3) == "abc"
        assert sanitize_text("word " * 20, 13) == "word word..."

    def test_sanitize_string_was_a_no_op(self):
        """0.2.0 tested c.isdecimal(), so no control character was ever removed."""
        assert sanitize_string("a\x00b\x1bc\nd\te\x7f") == "abc\nd\te"
        assert sanitize_string(f"a{LINE_SEPARATOR}b") == "ab"


class TestEscapeCssIdentifier:
    @pytest.mark.parametrize(
        ("raw", "escaped"),
        [
            ("plain-id_1", "plain-id_1"),
            ("1abc", "\\31 abc"),
            ("-", "\\-"),
            ("-1", "\\-\\31 "),
            ("a.b:c", "a\\.b\\:c"),
            ("a b", "a\\ b"),
            ("a\nb", "a\\a b"),
            ("a\x00b", "a" + chr(0xFFFD) + "b"),
            ("caf" + chr(0xE9), "caf" + chr(0xE9)),
            (chr(0xB2) + "x", chr(0xB2) + "x"),
            (f"a{LINE_SEPARATOR}b", "a\\2028 b"),
            (f"a{RTL_OVERRIDE}b", "a\\202e b"),
        ],
    )
    def test_escape(self, raw, escaped):
        assert escape_css_identifier(raw) == escaped
        assert "\n" not in escape_css_identifier(raw)


class TestStateGraph:
    def test_states_from_internal_links(self):
        sdom = SemanticDOM.parse(
            '<a href="/about">About</a><a href="#top">Top</a><a href="faq.html">FAQ</a>'
        )
        graph = sdom.state_graph
        assert [s.id for s in graph.states] == [
            "initial",
            "state__about",
            "state_h_top",
            "state_faq.html",
        ]
        assert [s.url_pattern for s in graph.states[1:]] == ["/about", "#top", "faq.html"]
        assert [(t.from_state, t.to_state, t.trigger) for t in graph.transitions] == [
            ("initial", "state__about", "sdom_a_1"),
            ("initial", "state_h_top", "sdom_a_2"),
            ("initial", "state_faq.html", "sdom_a_3"),
        ]
        assert graph.is_deterministic()
        assert len(graph.reachable_states()) == 4

    def test_colliding_hrefs_get_distinct_states(self):
        """0.2.0 mapped '/a/b' and '/a_b' to the same state and dropped the second."""
        sdom = SemanticDOM.parse(
            '<a href="/a/b">1</a><a href="/a_b">2</a><a href="/a b">3</a><a href="/a/b">again</a>'
        )
        states = sdom.state_graph.states[1:]
        assert [s.url_pattern for s in states] == ["/a/b", "/a_b", "/a%20b"]
        assert len({s.id for s in states}) == 3
        assert [s.id for s in states][:2] == ["state__a_b", "state__a_b_2"]
        assert len(sdom.state_graph.transitions) == 3

    def test_unsafe_links_never_become_states_or_hrefs(self):
        html = (
            '<a href="javascript:alert(1)">js</a><a href=" JAVA&#9;SCRIPT:alert(1)">js2</a>'
            '<a href="data:text/html,x">data</a><a href="vbscript:x">vb</a>'
        )
        sdom = SemanticDOM.parse(html)
        assert len(sdom.interactables) == 4
        for node in sdom.index.values():
            assert node.href is None
            assert node.intent == SemanticIntent.ACTION
        assert [s.id for s in sdom.state_graph.states] == ["initial"]
        assert sdom.state_graph.transitions == []
        output = sdom.to_json().lower()
        assert "javascript" not in output and "alert" not in output and "data:" not in output

    def test_external_and_protocol_relative_links_are_not_states(self):
        """0.2.0 treated '//evil.com' and '/\\evil.com' as internal paths."""
        sdom = SemanticDOM.parse(
            '<a href="//evil.com/x">1</a><a href="/\\evil.com">2</a>'
            '<a href="https://user:pw@example.com/">3</a>'
        )
        assert [n.href for n in sdom.index.values()] == [
            "//evil.com/x",
            "//evil.com",
            "https://example.com/",
        ]
        assert [s.id for s in sdom.state_graph.states] == ["initial"]

    def test_state_ids_are_output_safe(self):
        sdom = SemanticDOM.parse(
            '<a href="/x?a=1&amp;b=&quot;2&quot;#fé">q</a><a href="/' + "p" * 500 + '">long</a>'
        )
        for state in sdom.state_graph.states:
            assert (
                state.id.isascii()
                and state.id.replace("-", "")
                .replace(".", "")
                .replace("~", "")
                .replace("_", "")
                .isalnum()
            )
            assert len(state.id) <= len("state_") + 64

    def test_overlong_href_is_dropped(self):
        sdom = SemanticDOM.parse('<a href="/' + "a" * 3000 + '">long</a>')
        (node,) = sdom.index.values()
        assert node.href is None and len(sdom.state_graph.states) == 1

    def test_reachability_is_linear(self):
        """0.2.0 scanned every transition per state (quadratic in link count)."""
        import time

        html = "".join(f'<a href="/p{i}">l{i}</a>' for i in range(30_000))
        sdom = SemanticDOM.parse(html)
        start = time.perf_counter()
        assert len(sdom.state_graph.reachable_states()) == 30_001
        assert time.perf_counter() - start < 5
