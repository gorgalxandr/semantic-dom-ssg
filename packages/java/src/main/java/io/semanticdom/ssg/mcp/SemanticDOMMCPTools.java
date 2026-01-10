package io.semanticdom.ssg.mcp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.semanticdom.ssg.core.*;
import io.semanticdom.ssg.toon.ToonSerializer;

import java.util.*;
import java.util.stream.Collectors;

/**
 * MCP (Model Context Protocol) tools for SemanticDOM.
 * Provides O(1) semantic element lookup and navigation capabilities.
 *
 * <p>For Spring AI MCP integration, annotate methods with @McpTool and @McpToolParam.
 * This class provides the core implementation without Spring dependencies.
 *
 * <p>Example Spring integration:
 * <pre>
 * {@code
 * @Service
 * public class SemanticDOMService {
 *     private final SemanticDOMMCPTools tools;
 *
 *     @McpTool(description = "Query element by semantic ID with O(1) lookup")
 *     public String semanticQuery(
 *         @McpToolParam(description = "Semantic ID of the element") String id
 *     ) {
 *         return tools.query(id);
 *     }
 * }
 * }
 * </pre>
 */
public class SemanticDOMMCPTools {

    private final ObjectMapper objectMapper;
    private SemanticDocument document;

    public SemanticDOMMCPTools() {
        this.objectMapper = new ObjectMapper();
    }

    public SemanticDOMMCPTools(SemanticDocument document) {
        this();
        this.document = document;
    }

    /**
     * Set the current document for tool operations.
     */
    public void setDocument(SemanticDocument document) {
        this.document = document;
    }

    /**
     * Get the current document.
     */
    public SemanticDocument getDocument() {
        return document;
    }

    /**
     * Query element by semantic ID with O(1) lookup.
     *
     * @param id Semantic ID of the element (e.g., "nav-main", "btn-submit")
     * @return Element details as TOON string, or error message
     */
    public String query(String id) {
        requireDocument();

        return document.query(id)
                .map(node -> ToonSerializer.serializeNode(node))
                .orElse(errorResponse("Element not found: " + id));
    }

    /**
     * Navigate to a landmark region.
     *
     * @param landmark Landmark role or ID (e.g., "main", "navigation", "nav-primary")
     * @return Landmark details and children as TOON string
     */
    public String navigate(String landmark) {
        requireDocument();

        return document.navigate(landmark)
                .map(node -> ToonSerializer.serializeNode(node))
                .orElse(errorResponse("Landmark not found: " + landmark));
    }

    /**
     * Get interaction details for an element.
     *
     * @param id Semantic ID of the interactive element
     * @return Interaction details including intent, state, and available actions
     */
    public String interact(String id) {
        requireDocument();

        Optional<SemanticNode> nodeOpt = document.query(id);
        if (nodeOpt.isEmpty()) {
            return errorResponse("Element not found: " + id);
        }

        SemanticNode node = nodeOpt.get();
        Optional<SSGNode> ssgNode = document.getStateNode(SemanticId.of(id));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", node.getId().value());
        result.put("role", node.getRole());
        result.put("label", node.getLabel());
        result.put("intent", node.getIntent().orElse(null));
        result.put("state", node.getState());
        result.put("selector", node.getSelector());
        result.put("xpath", node.getXpath());
        result.put("a11y", Map.of(
                "name", node.getA11y().name(),
                "focusable", node.getA11y().focusable(),
                "inTabOrder", node.getA11y().inTabOrder()
        ));

        if (ssgNode.isPresent()) {
            SSGNode ssg = ssgNode.get();
            result.put("stateGraph", Map.of(
                    "currentState", ssg.getCurrentState(),
                    "availableTransitions", ssg.getAvailableTransitions().stream()
                            .map(t -> Map.of("to", t.to(), "trigger", t.trigger()))
                            .toList()
            ));
        }

        return toJson(result);
    }

    /**
     * List all landmark regions on the page.
     *
     * @return List of landmarks with IDs, roles, and labels
     */
    public String listLandmarks() {
        requireDocument();

        List<Map<String, String>> landmarks = document.getLandmarks().stream()
                .map(l -> Map.of(
                        "id", l.getId().value(),
                        "role", l.getRole(),
                        "label", l.getLabel()
                ))
                .toList();

        return toJson(Map.of("landmarks", landmarks));
    }

    /**
     * List all interactive elements.
     *
     * @param filter Optional filter by role (e.g., "button", "link", "textbox")
     * @return List of interactables with IDs, roles, labels, and intents
     */
    public String listInteractables(String filter) {
        requireDocument();

        List<SemanticNode> interactables = document.getInteractables();

        if (filter != null && !filter.isBlank()) {
            interactables = interactables.stream()
                    .filter(i -> i.getRole().equalsIgnoreCase(filter))
                    .toList();
        }

        List<Map<String, Object>> result = interactables.stream()
                .map(i -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("id", i.getId().value());
                    map.put("role", i.getRole());
                    map.put("label", i.getLabel());
                    i.getIntent().ifPresent(intent -> map.put("intent", intent));
                    map.put("state", i.getState());
                    return map;
                })
                .toList();

        return toJson(Map.of("interactables", result));
    }

    /**
     * Get the Semantic State Graph.
     *
     * @param id Optional: filter to specific element ID
     * @return State graph with states and transitions
     */
    public String getStateGraph(String id) {
        requireDocument();

        if (id != null && !id.isBlank()) {
            return document.getStateNode(SemanticId.of(id))
                    .map(ssg -> toJson(Map.of(
                            "id", id,
                            "currentState", ssg.getCurrentState(),
                            "transitions", ssg.getTransitions().stream()
                                    .map(t -> Map.of("from", t.from(), "to", t.to(), "trigger", t.trigger()))
                                    .toList()
                    )))
                    .orElse(errorResponse("State graph node not found: " + id));
        }

        List<Map<String, Object>> nodes = new ArrayList<>();
        document.getStateGraph().forEach((nodeId, ssg) -> {
            nodes.add(Map.of(
                    "id", nodeId.value(),
                    "currentState", ssg.getCurrentState(),
                    "transitions", ssg.getTransitions().stream()
                            .map(t -> Map.of("from", t.from(), "to", t.to(), "trigger", t.trigger()))
                            .toList()
            ));
        });

        return toJson(Map.of("stateGraph", nodes));
    }

    /**
     * Get agent certification status.
     *
     * @return Certification level, score, and any failed checks
     */
    public String getCertification() {
        requireDocument();

        AgentCertification cert = document.getAgentReady();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("level", cert.getLevel().name().toLowerCase());
        result.put("score", cert.getScore());
        result.put("passed", cert.getChecks().stream()
                .filter(AgentCertification.Check::passed)
                .map(AgentCertification.Check::name)
                .toList());
        result.put("failed", cert.getFailures().stream()
                .map(f -> Map.of(
                        "name", f.name(),
                        "severity", f.severity().name().toLowerCase(),
                        "message", f.message()
                ))
                .toList());

        return toJson(result);
    }

    /**
     * Get full document as TOON format.
     *
     * @return Complete SemanticDocument serialized as TOON
     */
    public String getDocumentAsToon() {
        requireDocument();
        return ToonSerializer.serialize(document);
    }

    /**
     * Get full document as JSON format.
     *
     * @return Complete SemanticDocument serialized as JSON
     */
    public String getDocumentAsJson() {
        requireDocument();
        return ToonSerializer.serializeAsJson(document);
    }

    /**
     * Get MCP tool definitions for this service.
     *
     * @return List of MCP tool descriptors
     */
    public List<Map<String, Object>> getToolDefinitions() {
        return List.of(
                toolDef("semantic_query",
                        "Query element by semantic ID with O(1) lookup time",
                        Map.of("id", prop("string", "Semantic ID of the element")),
                        List.of("id")),

                toolDef("semantic_navigate",
                        "Navigate to a landmark region",
                        Map.of("landmark", prop("string", "Landmark role or ID")),
                        List.of("landmark")),

                toolDef("semantic_interact",
                        "Get interaction details for an element",
                        Map.of("id", prop("string", "Semantic ID of the interactive element")),
                        List.of("id")),

                toolDef("semantic_list_landmarks",
                        "List all landmark regions on the page",
                        Map.of(),
                        List.of()),

                toolDef("semantic_list_interactables",
                        "List all interactive elements",
                        Map.of("filter", prop("string", "Optional filter by role")),
                        List.of()),

                toolDef("semantic_state_graph",
                        "Get the Semantic State Graph",
                        Map.of("id", prop("string", "Optional: filter to specific element ID")),
                        List.of()),

                toolDef("semantic_certification",
                        "Get agent certification status",
                        Map.of(),
                        List.of())
        );
    }

    /**
     * Execute an MCP tool by name.
     *
     * @param toolName Name of the tool to execute
     * @param args     Tool arguments
     * @return Tool result
     */
    public String executeTool(String toolName, Map<String, String> args) {
        return switch (toolName) {
            case "semantic_query" -> query(args.get("id"));
            case "semantic_navigate" -> navigate(args.get("landmark"));
            case "semantic_interact" -> interact(args.get("id"));
            case "semantic_list_landmarks" -> listLandmarks();
            case "semantic_list_interactables" -> listInteractables(args.get("filter"));
            case "semantic_state_graph" -> getStateGraph(args.get("id"));
            case "semantic_certification" -> getCertification();
            default -> errorResponse("Unknown tool: " + toolName);
        };
    }

    private void requireDocument() {
        if (document == null) {
            throw new IllegalStateException("No document loaded. Call setDocument() first.");
        }
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return errorResponse("Serialization error: " + e.getMessage());
        }
    }

    private String errorResponse(String message) {
        return "{\"error\": \"" + message.replace("\"", "\\\"") + "\"}";
    }

    private Map<String, Object> toolDef(String name, String description,
                                        Map<String, Map<String, String>> properties,
                                        List<String> required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (!required.isEmpty()) {
            schema.put("required", required);
        }

        return Map.of(
                "name", name,
                "description", description,
                "inputSchema", schema
        );
    }

    private Map<String, String> prop(String type, String description) {
        return Map.of("type", type, "description", description);
    }
}
