"""Tests for SemanticDOM SSG."""

import pytest

from semantic_dom_ssg import SemanticDOMParser, ToonSerializer


@pytest.fixture
def parser():
    return SemanticDOMParser()


@pytest.fixture
def sample_html():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Test Page</title></head>
    <body>
        <nav aria-label="Main navigation">
            <a href="/">Home</a>
            <a href="/about">About</a>
        </nav>
        <main>
            <h1>Welcome</h1>
            <button>Submit</button>
        </main>
        <footer>
            <p>Copyright 2024</p>
        </footer>
    </body>
    </html>
    """


class TestSemanticDOMParser:
    def test_parse_basic_html(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")

        assert doc.version == "0.1.0"
        assert doc.standard == "ISO/IEC-SDOM-SSG-DRAFT-2024"
        assert doc.url == "https://example.com"
        assert doc.title == "Test Page"
        assert doc.language == "en"

    def test_index_landmarks(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")

        landmarks = doc.landmarks
        roles = {l.role for l in landmarks}

        assert "navigation" in roles
        assert "main" in roles
        assert "contentinfo" in roles

    def test_index_interactables(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")

        interactables = doc.interactables
        roles = {i.role for i in interactables}

        assert "link" in roles
        assert "button" in roles

    def test_o1_lookup(self, parser):
        html = """
        <body>
            <button id="submit-btn">Submit</button>
            <button data-agent-id="cancel-btn">Cancel</button>
        </body>
        """
        doc = parser.parse(html, "https://example.com")

        submit_btn = doc.query("submit-btn")
        assert submit_btn is not None
        assert submit_btn.label == "Submit"

        cancel_btn = doc.query("cancel-btn")
        assert cancel_btn is not None
        assert cancel_btn.label == "Cancel"

    def test_infer_intents(self, parser):
        html = """
        <body>
            <button>Submit form</button>
            <button>Delete item</button>
            <button>Cancel</button>
        </body>
        """
        doc = parser.parse(html, "https://example.com")

        buttons = [n for n in doc.interactables if n.role == "button"]
        intents = [b.intent for b in buttons]

        assert "submit" in intents
        assert "delete" in intents
        assert "cancel" in intents

    def test_certification(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")

        cert = doc.agent_ready
        assert cert.score > 0
        assert len(cert.checks) > 0


class TestToonSerializer:
    def test_serialize_to_toon(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")
        toon = ToonSerializer.serialize(doc)

        assert "v:0.1.0" in toon
        assert "std:ISO/IEC-SDOM-SSG-DRAFT-2024" in toon
        assert "root:" in toon
        assert "landmarks:" in toon

    def test_serialize_to_json(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")
        json_str = ToonSerializer.serialize_json(doc)

        assert '"version": "0.1.0"' in json_str
        assert '"standard": "ISO/IEC-SDOM-SSG-DRAFT-2024"' in json_str

    def test_token_savings(self, parser, sample_html):
        doc = parser.parse(sample_html, "https://example.com")
        savings = ToonSerializer.estimate_token_savings(doc)

        assert savings.toon_tokens < savings.json_tokens
        assert savings.savings_percent > 0


class TestStateGraph:
    def test_state_graph_creation(self, parser):
        html = """
        <body>
            <button>Click me</button>
            <input type="checkbox">
        </body>
        """
        doc = parser.parse(html, "https://example.com")

        state_graph = doc.state_graph
        assert len(state_graph) > 0

    def test_button_transitions(self, parser):
        html = "<body><button id='test-btn'>Test</button></body>"
        doc = parser.parse(html, "https://example.com")

        state_graph = doc.state_graph
        btn_id = next(k for k in state_graph.keys() if "btn" in str(k))
        ssg_node = state_graph[btn_id]

        transitions = ssg_node.transitions
        triggers = [t.trigger for t in transitions]

        assert "focus" in triggers
        assert "blur" in triggers
