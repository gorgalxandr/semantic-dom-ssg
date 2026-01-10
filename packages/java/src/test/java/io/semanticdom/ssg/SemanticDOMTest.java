package io.semanticdom.ssg;

import io.semanticdom.ssg.core.*;
import io.semanticdom.ssg.mcp.SemanticDOMMCPTools;
import io.semanticdom.ssg.toon.ToonSerializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class SemanticDOMTest {

    private SemanticDOMParser parser;

    @BeforeEach
    void setUp() {
        parser = new SemanticDOMParser();
    }

    @Test
    void shouldParseSimpleHTML() {
        String html = """
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
                    <button>Click me</button>
                </main>
            </body>
            </html>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        assertThat(doc.getVersion()).isEqualTo("0.1.0");
        assertThat(doc.getStandard()).isEqualTo("ISO/IEC-SDOM-SSG-DRAFT-2024");
        assertThat(doc.getUrl()).isEqualTo("https://example.com");
        assertThat(doc.getTitle()).isEqualTo("Test Page");
        assertThat(doc.getLanguage()).isEqualTo("en");
    }

    @Test
    void shouldIndexLandmarks() {
        String html = """
            <body>
                <header>Header</header>
                <nav>Navigation</nav>
                <main>Main content</main>
                <aside>Sidebar</aside>
                <footer>Footer</footer>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        assertThat(doc.getLandmarks()).hasSize(5);
        assertThat(doc.getLandmarks().stream().map(SemanticNode::getRole))
                .containsExactlyInAnyOrder("banner", "navigation", "main", "complementary", "contentinfo");
    }

    @Test
    void shouldIndexInteractables() {
        String html = """
            <body>
                <button>Submit</button>
                <a href="/">Home</a>
                <input type="text" placeholder="Name">
                <select><option>Option 1</option></select>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        assertThat(doc.getInteractables()).hasSize(4);
    }

    @Test
    void shouldProvideO1Lookup() {
        String html = """
            <body>
                <button id="submit-btn">Submit</button>
                <button data-agent-id="cancel-btn">Cancel</button>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        // O(1) lookup by ID
        assertThat(doc.query("submit-btn")).isPresent();
        assertThat(doc.query("submit-btn").get().getLabel()).isEqualTo("Submit");

        assertThat(doc.query("cancel-btn")).isPresent();
        assertThat(doc.query("cancel-btn").get().getLabel()).isEqualTo("Cancel");
    }

    @Test
    void shouldInferIntents() {
        String html = """
            <body>
                <button>Submit form</button>
                <button>Delete item</button>
                <button>Cancel</button>
                <a href="mailto:test@example.com">Email us</a>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        var buttons = doc.getInteractables().stream()
                .filter(n -> "button".equals(n.getRole()))
                .toList();

        assertThat(buttons.get(0).getIntent()).contains("submit");
        assertThat(buttons.get(1).getIntent()).contains("delete");
        assertThat(buttons.get(2).getIntent()).contains("cancel");
    }

    @Test
    void shouldBuildStateGraph() {
        String html = """
            <body>
                <button>Click me</button>
                <input type="checkbox">
                <details><summary>More</summary>Content</details>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        assertThat(doc.getStateGraph()).isNotEmpty();

        // Check button state transitions
        var buttonId = doc.getInteractables().stream()
                .filter(n -> "button".equals(n.getRole()))
                .findFirst()
                .map(SemanticNode::getId)
                .orElseThrow();

        assertThat(doc.getStateNode(buttonId)).isPresent();
        var ssg = doc.getStateNode(buttonId).get();
        assertThat(ssg.getTransitions()).isNotEmpty();
    }

    @Test
    void shouldGenerateCertification() {
        String html = """
            <body>
                <nav aria-label="Main">
                    <a href="/">Home</a>
                </nav>
                <main>
                    <h1>Title</h1>
                    <button aria-label="Submit form">Submit</button>
                </main>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");

        AgentCertification cert = doc.getAgentReady();
        assertThat(cert.getLevel()).isNotEqualTo(AgentCertification.Level.NONE);
        assertThat(cert.getScore()).isGreaterThan(0);
    }

    @Test
    void shouldSerializeToToon() {
        String html = """
            <body>
                <main>
                    <h1>Title</h1>
                    <button>Click</button>
                </main>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");
        String toon = ToonSerializer.serialize(doc);

        assertThat(toon).contains("v:0.1.0");
        assertThat(toon).contains("std:ISO/IEC-SDOM-SSG-DRAFT-2024");
        assertThat(toon).contains("root:");
    }

    @Test
    void shouldEstimateTokenSavings() {
        String html = """
            <body>
                <nav aria-label="Main">
                    <a href="/">Home</a>
                    <a href="/about">About</a>
                </nav>
                <main>
                    <h1>Welcome</h1>
                    <p>Content here</p>
                    <button>Submit</button>
                </main>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");
        var savings = ToonSerializer.estimateTokenSavings(doc);

        assertThat(savings.savingsPercent()).isGreaterThan(0);
        assertThat(savings.toonTokens()).isLessThan(savings.jsonTokens());
    }

    @Test
    void shouldExecuteMCPTools() {
        String html = """
            <body>
                <nav aria-label="Main navigation">
                    <a href="/">Home</a>
                </nav>
                <main>
                    <button id="submit-btn">Submit</button>
                </main>
            </body>
            """;

        SemanticDocument doc = parser.parse(html, "https://example.com");
        SemanticDOMMCPTools tools = new SemanticDOMMCPTools(doc);

        // Test query
        String queryResult = tools.query("submit-btn");
        assertThat(queryResult).contains("submit-btn");
        assertThat(queryResult).contains("button");

        // Test navigate
        String navResult = tools.navigate("navigation");
        assertThat(navResult).contains("navigation");

        // Test list landmarks
        String landmarksResult = tools.listLandmarks();
        assertThat(landmarksResult).contains("landmarks");
        assertThat(landmarksResult).contains("navigation");
        assertThat(landmarksResult).contains("main");

        // Test certification
        String certResult = tools.getCertification();
        assertThat(certResult).contains("level");
        assertThat(certResult).contains("score");
    }
}
