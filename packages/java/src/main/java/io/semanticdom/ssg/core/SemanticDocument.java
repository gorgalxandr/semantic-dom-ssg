package io.semanticdom.ssg.core;

import java.time.Instant;
import java.util.*;

/**
 * Complete SemanticDOM document with O(1) element lookup.
 * Implements ISO/IEC draft standard for SemanticDOM and Semantic State Graph.
 */
public class SemanticDocument {

    public static final String VERSION = "0.1.0";
    public static final String STANDARD = "ISO/IEC-SDOM-SSG-DRAFT-2024";

    private final String version;
    private final String standard;
    private final String url;
    private final String title;
    private final String language;
    private final long generatedAt;
    private final SemanticNode root;
    private final AgentCertification agentReady;

    // O(1) lookup indexes
    private final Map<SemanticId, SemanticNode> index;
    private final List<SemanticNode> landmarks;
    private final List<SemanticNode> interactables;
    private final Map<SemanticId, SSGNode> stateGraph;

    private SemanticDocument(Builder builder) {
        this.version = VERSION;
        this.standard = STANDARD;
        this.url = Objects.requireNonNull(builder.url);
        this.title = builder.title != null ? builder.title : "";
        this.language = builder.language != null ? builder.language : "en";
        this.generatedAt = builder.generatedAt > 0 ? builder.generatedAt : Instant.now().toEpochMilli();
        this.root = Objects.requireNonNull(builder.root);
        this.agentReady = builder.agentReady != null ? builder.agentReady : AgentCertification.none();

        // Build indexes
        this.index = new HashMap<>();
        this.landmarks = new ArrayList<>();
        this.interactables = new ArrayList<>();
        this.stateGraph = new HashMap<>();

        buildIndexes(root);
    }

    private void buildIndexes(SemanticNode node) {
        // Add to main index
        index.put(node.getId(), node);

        // Add to landmarks if applicable
        if (node.isLandmark()) {
            landmarks.add(node);
        }

        // Add to interactables if applicable
        if (node.isInteractive()) {
            interactables.add(node);
        }

        // Add to state graph if stateful
        if (!"idle".equals(node.getState()) || node.isInteractive()) {
            stateGraph.put(node.getId(), SSGNode.from(node));
        }

        // Process children
        for (SemanticNode child : node.getChildren()) {
            buildIndexes(child);
        }
    }

    /**
     * O(1) lookup by semantic ID.
     */
    public Optional<SemanticNode> query(SemanticId id) {
        return Optional.ofNullable(index.get(id));
    }

    /**
     * O(1) lookup by string ID.
     */
    public Optional<SemanticNode> query(String id) {
        return query(SemanticId.of(id));
    }

    /**
     * Navigate to a landmark by role or ID.
     */
    public Optional<SemanticNode> navigate(String landmarkRoleOrId) {
        return landmarks.stream()
                .filter(l -> l.getRole().equalsIgnoreCase(landmarkRoleOrId)
                        || l.getId().value().equalsIgnoreCase(landmarkRoleOrId))
                .findFirst();
    }

    /**
     * Get all landmarks in document order.
     */
    public List<SemanticNode> getLandmarks() {
        return Collections.unmodifiableList(landmarks);
    }

    /**
     * Get all interactive elements.
     */
    public List<SemanticNode> getInteractables() {
        return Collections.unmodifiableList(interactables);
    }

    /**
     * Get the Semantic State Graph.
     */
    public Map<SemanticId, SSGNode> getStateGraph() {
        return Collections.unmodifiableMap(stateGraph);
    }

    /**
     * Get state graph node for an element.
     */
    public Optional<SSGNode> getStateNode(SemanticId id) {
        return Optional.ofNullable(stateGraph.get(id));
    }

    public String getVersion() {
        return version;
    }

    public String getStandard() {
        return standard;
    }

    public String getUrl() {
        return url;
    }

    public String getTitle() {
        return title;
    }

    public String getLanguage() {
        return language;
    }

    public long getGeneratedAt() {
        return generatedAt;
    }

    public SemanticNode getRoot() {
        return root;
    }

    public AgentCertification getAgentReady() {
        return agentReady;
    }

    public Map<SemanticId, SemanticNode> getIndex() {
        return Collections.unmodifiableMap(index);
    }

    /**
     * Get total node count.
     */
    public int getNodeCount() {
        return index.size();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String url;
        private String title;
        private String language;
        private long generatedAt;
        private SemanticNode root;
        private AgentCertification agentReady;

        public Builder url(String url) {
            this.url = url;
            return this;
        }

        public Builder title(String title) {
            this.title = title;
            return this;
        }

        public Builder language(String language) {
            this.language = language;
            return this;
        }

        public Builder generatedAt(long generatedAt) {
            this.generatedAt = generatedAt;
            return this;
        }

        public Builder root(SemanticNode root) {
            this.root = root;
            return this;
        }

        public Builder agentReady(AgentCertification agentReady) {
            this.agentReady = agentReady;
            return this;
        }

        public SemanticDocument build() {
            return new SemanticDocument(this);
        }
    }
}
