package io.semanticdom.ssg.mcp;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.semanticdom.ssg.core.SemanticDOMParser;
import io.semanticdom.ssg.core.SemanticDocument;

import java.io.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * MCP Server implementation for SemanticDOM over stdio.
 * Implements JSON-RPC 2.0 protocol for Model Context Protocol.
 *
 * <p>Usage:
 * <pre>
 * java -jar semantic-dom-ssg.jar
 * </pre>
 *
 * <p>Or programmatically:
 * <pre>
 * {@code
 * SemanticDOMMCPServer server = new SemanticDOMMCPServer();
 * server.start();
 * }
 * </pre>
 */
public class SemanticDOMMCPServer {

    public static final String SERVER_NAME = "semantic-dom-ssg";
    public static final String SERVER_VERSION = "0.1.0";
    public static final String PROTOCOL_VERSION = "2024-11-05";

    private final ObjectMapper objectMapper;
    private final SemanticDOMMCPTools tools;
    private final SemanticDOMParser parser;
    private final AtomicBoolean running;

    private BufferedReader reader;
    private PrintWriter writer;

    public SemanticDOMMCPServer() {
        this.objectMapper = new ObjectMapper();
        this.tools = new SemanticDOMMCPTools();
        this.parser = new SemanticDOMParser();
        this.running = new AtomicBoolean(false);
    }

    /**
     * Start the MCP server on stdio.
     */
    public void start() {
        start(System.in, System.out);
    }

    /**
     * Start the MCP server with custom streams.
     */
    public void start(InputStream in, OutputStream out) {
        this.reader = new BufferedReader(new InputStreamReader(in));
        this.writer = new PrintWriter(new OutputStreamWriter(out), true);
        this.running.set(true);

        while (running.get()) {
            try {
                String line = reader.readLine();
                if (line == null) break;
                if (line.isBlank()) continue;

                JsonNode request = objectMapper.readTree(line);
                JsonNode response = handleRequest(request);

                if (response != null) {
                    writer.println(objectMapper.writeValueAsString(response));
                }
            } catch (IOException e) {
                // Log error to stderr, not stdout (MCP requirement)
                System.err.println("Error processing request: " + e.getMessage());
            }
        }
    }

    /**
     * Stop the MCP server.
     */
    public void stop() {
        running.set(false);
    }

    private JsonNode handleRequest(JsonNode request) {
        String jsonrpc = request.path("jsonrpc").asText();
        if (!"2.0".equals(jsonrpc)) {
            return errorResponse(null, -32600, "Invalid Request: jsonrpc must be '2.0'");
        }

        String method = request.path("method").asText();
        JsonNode params = request.get("params");
        JsonNode id = request.get("id");

        // Notifications (no id) don't get responses
        boolean isNotification = id == null || id.isNull();

        try {
            Object result = switch (method) {
                case "initialize" -> handleInitialize(params);
                case "initialized" -> {
                    yield null; // Notification, no response
                }
                case "tools/list" -> handleToolsList();
                case "tools/call" -> handleToolsCall(params);
                case "resources/list" -> handleResourcesList();
                case "resources/read" -> handleResourcesRead(params);
                case "prompts/list" -> handlePromptsList();
                case "shutdown" -> {
                    stop();
                    yield Map.of();
                }
                default -> throw new MCPException(-32601, "Method not found: " + method);
            };

            if (isNotification || result == null) {
                return null;
            }

            return successResponse(id, result);

        } catch (MCPException e) {
            return errorResponse(id, e.code, e.getMessage());
        } catch (Exception e) {
            return errorResponse(id, -32603, "Internal error: " + e.getMessage());
        }
    }

    private Object handleInitialize(JsonNode params) {
        Map<String, Object> serverInfo = Map.of(
                "name", SERVER_NAME,
                "version", SERVER_VERSION
        );

        Map<String, Object> capabilities = Map.of(
                "tools", Map.of(),
                "resources", Map.of("subscribe", false, "listChanged", true),
                "prompts", Map.of("listChanged", false)
        );

        return Map.of(
                "protocolVersion", PROTOCOL_VERSION,
                "serverInfo", serverInfo,
                "capabilities", capabilities
        );
    }

    private Object handleToolsList() {
        return Map.of("tools", tools.getToolDefinitions());
    }

    private Object handleToolsCall(JsonNode params) throws MCPException {
        String name = params.path("name").asText();
        JsonNode arguments = params.get("arguments");

        Map<String, String> args = new LinkedHashMap<>();
        if (arguments != null && arguments.isObject()) {
            arguments.fields().forEachRemaining(entry ->
                    args.put(entry.getKey(), entry.getValue().asText())
            );
        }

        // Special handling for parse_html tool
        if ("parse_html".equals(name)) {
            String html = args.get("html");
            String url = args.getOrDefault("url", "file://local");
            if (html == null || html.isBlank()) {
                throw new MCPException(-32602, "Missing required parameter: html");
            }
            SemanticDocument doc = parser.parse(html, url);
            tools.setDocument(doc);
            return Map.of(
                    "content", Map.of(
                            "type", "text",
                            "text", "Document parsed: " + doc.getNodeCount() + " nodes, " +
                                    "certification: " + doc.getAgentReady().getLevel().name().toLowerCase()
                    )
            );
        }

        String result = tools.executeTool(name, args);

        return Map.of(
                "content", Map.of(
                        "type", "text",
                        "text", result
                )
        );
    }

    private Object handleResourcesList() {
        if (tools.getDocument() == null) {
            return Map.of("resources", java.util.List.of());
        }

        SemanticDocument doc = tools.getDocument();
        return Map.of("resources", java.util.List.of(
                Map.of(
                        "uri", "semantic-dom://" + extractHost(doc.getUrl()) + extractPath(doc.getUrl()),
                        "mimeType", "application/toon",
                        "name", doc.getTitle().isEmpty() ? "SemanticDOM Document" : doc.getTitle(),
                        "description", "SemanticDOM with " + doc.getLandmarks().size() + " landmarks, " +
                                doc.getInteractables().size() + " interactables"
                )
        ));
    }

    private Object handleResourcesRead(JsonNode params) throws MCPException {
        if (tools.getDocument() == null) {
            throw new MCPException(-32602, "No document loaded. Call parse_html tool first.");
        }

        String uri = params.path("uri").asText();
        if (uri.isBlank()) {
            throw new MCPException(-32602, "Missing required parameter: uri");
        }

        return Map.of(
                "contents", java.util.List.of(
                        Map.of(
                                "uri", uri,
                                "mimeType", "application/toon",
                                "text", tools.getDocumentAsToon()
                        )
                )
        );
    }

    private Object handlePromptsList() {
        return Map.of("prompts", java.util.List.of(
                Map.of(
                        "name", "analyze_page",
                        "description", "Analyze page structure and provide navigation guidance",
                        "arguments", java.util.List.of(
                                Map.of("name", "goal", "description", "What you want to accomplish", "required", true)
                        )
                ),
                Map.of(
                        "name", "find_element",
                        "description", "Find the best element to interact with for a given task",
                        "arguments", java.util.List.of(
                                Map.of("name", "task", "description", "Description of what you want to do", "required", true)
                        )
                ),
                Map.of(
                        "name", "automation_plan",
                        "description", "Generate a step-by-step automation plan using semantic IDs",
                        "arguments", java.util.List.of(
                                Map.of("name", "workflow", "description", "Description of the workflow", "required", true)
                        )
                )
        ));
    }

    private JsonNode successResponse(JsonNode id, Object result) {
        try {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jsonrpc", "2.0");
            response.put("id", objectMapper.treeToValue(id, Object.class));
            response.put("result", result);
            return objectMapper.valueToTree(response);
        } catch (JsonProcessingException e) {
            return errorResponse(id, -32603, "Failed to serialize response");
        }
    }

    private JsonNode errorResponse(JsonNode id, int code, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("jsonrpc", "2.0");
        if (id != null) {
            try {
                response.put("id", objectMapper.treeToValue(id, Object.class));
            } catch (JsonProcessingException ignored) {
                response.put("id", null);
            }
        } else {
            response.put("id", null);
        }
        response.put("error", Map.of("code", code, "message", message));
        return objectMapper.valueToTree(response);
    }

    private String extractHost(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            return u.getHost();
        } catch (Exception e) {
            return "local";
        }
    }

    private String extractPath(String url) {
        try {
            java.net.URL u = new java.net.URL(url);
            return u.getPath().isEmpty() ? "/" : u.getPath();
        } catch (Exception e) {
            return "/";
        }
    }

    private static class MCPException extends Exception {
        final int code;

        MCPException(int code, String message) {
            super(message);
            this.code = code;
        }
    }

    /**
     * Main entry point for running as standalone MCP server.
     */
    public static void main(String[] args) {
        SemanticDOMMCPServer server = new SemanticDOMMCPServer();
        server.start();
    }
}
