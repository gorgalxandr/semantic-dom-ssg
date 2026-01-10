package io.semanticdom.ssg.core;

import java.util.Objects;

/**
 * Strongly-typed semantic identifier for DOM elements.
 * Provides O(1) lookup via the SemanticDocument index.
 *
 * <p>Format: {@code prefix-descriptor[-qualifier]}
 * <ul>
 *   <li>{@code nav-main} - Main navigation</li>
 *   <li>{@code btn-submit} - Submit button</li>
 *   <li>{@code input-email} - Email input field</li>
 * </ul>
 */
public record SemanticId(String value) {

    public SemanticId {
        Objects.requireNonNull(value, "Semantic ID cannot be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException("Semantic ID cannot be blank");
        }
    }

    /**
     * Create a SemanticId from a string value.
     */
    public static SemanticId of(String value) {
        return new SemanticId(value);
    }

    /**
     * Generate a SemanticId from role and label.
     */
    public static SemanticId generate(String role, String label) {
        String prefix = roleToPrefix(role);
        String descriptor = sanitizeLabel(label);
        return new SemanticId(prefix + "-" + descriptor);
    }

    private static String roleToPrefix(String role) {
        return switch (role.toLowerCase()) {
            case "button" -> "btn";
            case "link" -> "link";
            case "textbox", "input" -> "input";
            case "navigation" -> "nav";
            case "main" -> "main";
            case "banner", "header" -> "header";
            case "contentinfo", "footer" -> "footer";
            case "complementary", "aside" -> "aside";
            case "form" -> "form";
            case "search" -> "search";
            case "checkbox" -> "chk";
            case "radio" -> "radio";
            case "listbox", "combobox" -> "select";
            case "menu" -> "menu";
            case "menuitem" -> "item";
            case "tab" -> "tab";
            case "tabpanel" -> "panel";
            case "dialog" -> "dialog";
            case "alert" -> "alert";
            case "img", "image" -> "img";
            case "heading" -> "h";
            case "list" -> "list";
            case "listitem" -> "li";
            case "table" -> "table";
            case "row" -> "row";
            case "cell" -> "cell";
            default -> role.toLowerCase().substring(0, Math.min(4, role.length()));
        };
    }

    private static String sanitizeLabel(String label) {
        if (label == null || label.isBlank()) {
            return "unnamed";
        }
        return label.toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "")
                .substring(0, Math.min(32, label.length()));
    }

    @Override
    public String toString() {
        return value;
    }
}
