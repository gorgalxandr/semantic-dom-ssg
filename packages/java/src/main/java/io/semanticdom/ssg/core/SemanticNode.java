package io.semanticdom.ssg.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * A node in the SemanticDOM tree representing a semantic element.
 * Each node has an O(1) lookup ID and contains accessibility metadata.
 */
public class SemanticNode {

    private final SemanticId id;
    private final String role;
    private final String label;
    private final String intent;
    private final String state;
    private final String selector;
    private final String xpath;
    private final A11yInfo a11y;
    private final List<SemanticNode> children;
    private final Object value;
    private SemanticNode parent;

    private SemanticNode(Builder builder) {
        this.id = Objects.requireNonNull(builder.id, "id is required");
        this.role = Objects.requireNonNull(builder.role, "role is required");
        this.label = builder.label != null ? builder.label : "";
        this.intent = builder.intent;
        this.state = builder.state != null ? builder.state : "idle";
        this.selector = builder.selector != null ? builder.selector : "";
        this.xpath = builder.xpath != null ? builder.xpath : "";
        this.a11y = builder.a11y != null ? builder.a11y : A11yInfo.empty();
        this.children = new ArrayList<>(builder.children);
        this.value = builder.value;
        this.parent = builder.parent;

        // Set parent reference on children
        for (SemanticNode child : this.children) {
            child.parent = this;
        }
    }

    public SemanticId getId() {
        return id;
    }

    public String getRole() {
        return role;
    }

    public String getLabel() {
        return label;
    }

    public Optional<String> getIntent() {
        return Optional.ofNullable(intent);
    }

    public String getState() {
        return state;
    }

    public String getSelector() {
        return selector;
    }

    public String getXpath() {
        return xpath;
    }

    public A11yInfo getA11y() {
        return a11y;
    }

    public List<SemanticNode> getChildren() {
        return Collections.unmodifiableList(children);
    }

    public Optional<Object> getValue() {
        return Optional.ofNullable(value);
    }

    public Optional<SemanticNode> getParent() {
        return Optional.ofNullable(parent);
    }

    /**
     * Check if this node is interactive (focusable).
     */
    public boolean isInteractive() {
        return a11y.focusable();
    }

    /**
     * Check if this node is a landmark region.
     */
    public boolean isLandmark() {
        return switch (role.toLowerCase()) {
            case "main", "navigation", "banner", "contentinfo",
                 "complementary", "form", "search", "region" -> true;
            default -> false;
        };
    }

    /**
     * Get all descendants of this node.
     */
    public List<SemanticNode> getDescendants() {
        List<SemanticNode> result = new ArrayList<>();
        collectDescendants(this, result);
        return result;
    }

    private void collectDescendants(SemanticNode node, List<SemanticNode> result) {
        for (SemanticNode child : node.children) {
            result.add(child);
            collectDescendants(child, result);
        }
    }

    public static Builder builder() {
        return new Builder();
    }

    /**
     * Accessibility information for a semantic node.
     */
    public record A11yInfo(
            String name,
            boolean focusable,
            boolean inTabOrder,
            Integer level
    ) {
        public static A11yInfo empty() {
            return new A11yInfo("", false, false, null);
        }

        public static A11yInfo of(String name, boolean focusable, boolean inTabOrder) {
            return new A11yInfo(name, focusable, inTabOrder, null);
        }

        public static A11yInfo of(String name, boolean focusable, boolean inTabOrder, Integer level) {
            return new A11yInfo(name, focusable, inTabOrder, level);
        }
    }

    public static class Builder {
        private SemanticId id;
        private String role;
        private String label;
        private String intent;
        private String state;
        private String selector;
        private String xpath;
        private A11yInfo a11y;
        private final List<SemanticNode> children = new ArrayList<>();
        private Object value;
        private SemanticNode parent;

        public Builder id(SemanticId id) {
            this.id = id;
            return this;
        }

        public Builder id(String id) {
            this.id = SemanticId.of(id);
            return this;
        }

        public Builder role(String role) {
            this.role = role;
            return this;
        }

        public Builder label(String label) {
            this.label = label;
            return this;
        }

        public Builder intent(String intent) {
            this.intent = intent;
            return this;
        }

        public Builder state(String state) {
            this.state = state;
            return this;
        }

        public Builder selector(String selector) {
            this.selector = selector;
            return this;
        }

        public Builder xpath(String xpath) {
            this.xpath = xpath;
            return this;
        }

        public Builder a11y(A11yInfo a11y) {
            this.a11y = a11y;
            return this;
        }

        public Builder addChild(SemanticNode child) {
            this.children.add(child);
            return this;
        }

        public Builder children(List<SemanticNode> children) {
            this.children.clear();
            this.children.addAll(children);
            return this;
        }

        public Builder value(Object value) {
            this.value = value;
            return this;
        }

        public Builder parent(SemanticNode parent) {
            this.parent = parent;
            return this;
        }

        public SemanticNode build() {
            return new SemanticNode(this);
        }
    }
}
