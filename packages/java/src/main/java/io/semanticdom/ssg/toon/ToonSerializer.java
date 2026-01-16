package io.semanticdom.ssg.toon;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.semanticdom.ssg.core.*;

import java.util.*;

/**
 * TOON (Token-Oriented Object Notation) serializer for SemanticDOM.
 * Provides ~40-50% token savings compared to JSON for LLM prompts.
 *
 * <p>TOON format features:
 * <ul>
 *   <li>Key folding for common paths</li>
 *   <li>Compact array notation</li>
 *   <li>Whitespace optimization</li>
 * </ul>
 */
public class ToonSerializer {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private ToonSerializer() {
    }

    /**
     * Serialize SemanticDocument to TOON format.
     *
     * @param document Document to serialize
     * @return TOON formatted string
     */
    public static String serialize(SemanticDocument document) {
        return serialize(document, ToonOptions.defaults());
    }

    /**
     * Serialize SemanticDocument to TOON format with options.
     *
     * @param document Document to serialize
     * @param options  Serialization options
     * @return TOON formatted string
     */
    public static String serialize(SemanticDocument document, ToonOptions options) {
        StringBuilder sb = new StringBuilder();

        // Document header
        appendLine(sb, "v:" + document.getVersion(), 0);
        appendLine(sb, "std:" + document.getStandard(), 0);
        appendLine(sb, "url:" + document.getUrl(), 0);
        appendLine(sb, "title:" + escapeString(document.getTitle()), 0);
        appendLine(sb, "lang:" + document.getLanguage(), 0);
        appendLine(sb, "ts:" + document.getGeneratedAt(), 0);
        sb.append("\n");

        // Agent certification
        AgentCertification cert = document.getAgentReady();
        appendLine(sb, "cert:", 0);
        appendLine(sb, "level:" + cert.getLevel().name().toLowerCase(), 1);
        appendLine(sb, "score:" + cert.getScore(), 1);
        sb.append("\n");

        // Root node
        appendLine(sb, "root:", 0);
        serializeNode(sb, document.getRoot(), 1, options);
        sb.append("\n");

        // Landmarks (compact)
        if (!document.getLandmarks().isEmpty()) {
            appendLine(sb, "landmarks:", 0);
            for (SemanticNode landmark : document.getLandmarks()) {
                appendLine(sb, "- " + landmark.getId().value() + " " +
                        landmark.getRole() + " " +
                        escapeString(landmark.getLabel()), 1);
            }
            sb.append("\n");
        }

        // Interactables (compact)
        if (!document.getInteractables().isEmpty()) {
            appendLine(sb, "interactables:", 0);
            for (SemanticNode inter : document.getInteractables()) {
                StringBuilder line = new StringBuilder();
                line.append("- ").append(inter.getId().value())
                        .append(" ").append(inter.getRole())
                        .append(" ").append(escapeString(inter.getLabel()));
                inter.getIntent().ifPresent(i -> line.append(" ->").append(i));
                appendLine(sb, line.toString(), 1);
            }
        }

        return sb.toString();
    }

    /**
     * Serialize a single node to TOON format.
     *
     * @param node Node to serialize
     * @return TOON formatted string
     */
    public static String serializeNode(SemanticNode node) {
        StringBuilder sb = new StringBuilder();
        serializeNode(sb, node, 0, ToonOptions.defaults());
        return sb.toString();
    }

    private static void serializeNode(StringBuilder sb, SemanticNode node, int indent, ToonOptions options) {
        // Compact single-line format for simple nodes
        String intentPart = node.getIntent().map(i -> " ->" + i).orElse("");
        String statePart = "idle".equals(node.getState()) ? "" : " [" + node.getState() + "]";
        String labelPart = node.getLabel().isEmpty() ? "" : " \"" + escapeString(node.getLabel()) + "\"";

        appendLine(sb, node.getId().value() + " " + node.getRole() + labelPart + intentPart + statePart, indent);

        // Accessibility info (if notable)
        if (node.getA11y().focusable() || node.getA11y().level() != null) {
            StringBuilder a11y = new StringBuilder("a11y:");
            if (node.getA11y().focusable()) a11y.append(" focusable");
            if (node.getA11y().inTabOrder()) a11y.append(" tab");
            if (node.getA11y().level() != null) a11y.append(" L").append(node.getA11y().level());
            appendLine(sb, a11y.toString(), indent + 1);
        }

        // Selectors (if verbose)
        if (options.includeSelectors()) {
            appendLine(sb, "sel:" + node.getSelector(), indent + 1);
        }

        // Children
        if (!node.getChildren().isEmpty()) {
            for (SemanticNode child : node.getChildren()) {
                serializeNode(sb, child, indent + 1, options);
            }
        }
    }

    /**
     * Serialize SemanticDocument to JSON format.
     *
     * @param document Document to serialize
     * @return JSON formatted string
     */
    public static String serializeAsJson(SemanticDocument document) {
        Map<String, Object> map = documentToMap(document);
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize document", e);
        }
    }

    private static Map<String, Object> documentToMap(SemanticDocument document) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("version", document.getVersion());
        map.put("standard", document.getStandard());
        map.put("url", document.getUrl());
        map.put("title", document.getTitle());
        map.put("language", document.getLanguage());
        map.put("generatedAt", document.getGeneratedAt());
        map.put("agentReady", certificationToMap(document.getAgentReady()));
        map.put("root", nodeToMap(document.getRoot()));
        map.put("landmarks", document.getLandmarks().stream()
                .map(l -> Map.of("id", l.getId().value(), "role", l.getRole(), "label", l.getLabel()))
                .toList());
        map.put("interactables", document.getInteractables().stream()
                .map(i -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", i.getId().value());
                    m.put("role", i.getRole());
                    m.put("label", i.getLabel());
                    i.getIntent().ifPresent(intent -> m.put("intent", intent));
                    return m;
                })
                .toList());
        return map;
    }

    private static Map<String, Object> nodeToMap(SemanticNode node) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", node.getId().value());
        map.put("role", node.getRole());
        map.put("label", node.getLabel());
        node.getIntent().ifPresent(i -> map.put("intent", i));
        map.put("state", node.getState());
        map.put("selector", node.getSelector());
        map.put("xpath", node.getXpath());
        Map<String, Object> a11yMap = new LinkedHashMap<>();
        a11yMap.put("name", node.getA11y().name());
        a11yMap.put("focusable", node.getA11y().focusable());
        a11yMap.put("inTabOrder", node.getA11y().inTabOrder());
        if (node.getA11y().level() != null) {
            a11yMap.put("level", node.getA11y().level());
        }
        map.put("a11y", a11yMap);
        map.put("children", node.getChildren().stream()
                .map(ToonSerializer::nodeToMap)
                .toList());
        return map;
    }

    private static Map<String, Object> certificationToMap(AgentCertification cert) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("level", cert.getLevel().name().toLowerCase());
        map.put("score", cert.getScore());
        map.put("checks", cert.getChecks().stream()
                .map(c -> Map.of("id", c.id(), "name", c.name(), "passed", c.passed()))
                .toList());
        map.put("failures", cert.getFailures().stream()
                .map(f -> Map.of("id", f.id(), "name", f.name(), "message", f.message(),
                        "severity", f.severity().name().toLowerCase()))
                .toList());
        return map;
    }

    /**
     * Estimate token savings from using TOON vs JSON.
     *
     * @param document Document to analyze
     * @return Token comparison stats
     */
    public static TokenSavings estimateTokenSavings(SemanticDocument document) {
        String json = serializeAsJson(document);
        String toon = serialize(document);

        // Rough estimate: ~4 chars per token
        int jsonTokens = (int) Math.ceil(json.length() / 4.0);
        int toonTokens = (int) Math.ceil(toon.length() / 4.0);
        int savings = jsonTokens - toonTokens;
        int savingsPercent = (int) Math.round((savings * 100.0) / jsonTokens);

        return new TokenSavings(jsonTokens, toonTokens, savings, savingsPercent);
    }

    private static void appendLine(StringBuilder sb, String content, int indent) {
        sb.append("  ".repeat(indent)).append(content).append("\n");
    }

    private static String escapeString(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    /**
     * Token savings comparison result.
     */
    public record TokenSavings(
            int jsonTokens,
            int toonTokens,
            int savings,
            int savingsPercent
    ) {
    }

    /**
     * TOON serialization options.
     */
    public record ToonOptions(
            boolean includeSelectors,
            boolean includeXPath,
            int indentSize
    ) {
        public static ToonOptions defaults() {
            return new ToonOptions(false, false, 2);
        }

        public static ToonOptions verbose() {
            return new ToonOptions(true, true, 2);
        }
    }
}
