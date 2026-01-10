package io.semanticdom.ssg.core;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Parser for converting HTML to SemanticDOM structure.
 * Uses Jsoup for HTML parsing and builds the semantic tree with O(1) indexes.
 */
public class SemanticDOMParser {

    private final ParserConfig config;
    private final Map<String, AtomicInteger> idCounters = new HashMap<>();

    public SemanticDOMParser() {
        this(ParserConfig.defaults());
    }

    public SemanticDOMParser(ParserConfig config) {
        this.config = config;
    }

    /**
     * Parse HTML string into SemanticDocument.
     */
    public SemanticDocument parse(String html, String url) {
        Document doc = Jsoup.parse(html);
        return parse(doc, url);
    }

    /**
     * Parse Jsoup Document into SemanticDocument.
     */
    public SemanticDocument parse(Document doc, String url) {
        String title = doc.title();
        String language = doc.select("html").attr("lang");
        if (language.isEmpty()) {
            language = "en";
        }

        Element body = doc.body();
        SemanticNode root = parseElement(body);

        // Run certification checks
        AgentCertification certification = runCertificationChecks(root);

        return SemanticDocument.builder()
                .url(url)
                .title(title)
                .language(language)
                .root(root)
                .agentReady(certification)
                .build();
    }

    /**
     * Parse a single element into SemanticNode.
     */
    private SemanticNode parseElement(Element element) {
        String role = inferRole(element);
        String label = inferLabel(element);
        String intent = inferIntent(element);
        String state = inferState(element);
        String selector = buildSelector(element);
        String xpath = buildXPath(element);
        SemanticNode.A11yInfo a11y = buildA11y(element, label);

        SemanticId id = generateUniqueId(role, label, element);

        List<SemanticNode> children = new ArrayList<>();
        for (Element child : element.children()) {
            if (isSemanticElement(child)) {
                children.add(parseElement(child));
            } else {
                // Recursively process non-semantic wrappers
                for (Element grandchild : child.children()) {
                    if (isSemanticElement(grandchild)) {
                        children.add(parseElement(grandchild));
                    }
                }
            }
        }

        return SemanticNode.builder()
                .id(id)
                .role(role)
                .label(label)
                .intent(intent)
                .state(state)
                .selector(selector)
                .xpath(xpath)
                .a11y(a11y)
                .children(children)
                .value(extractValue(element))
                .build();
    }

    private String inferRole(Element element) {
        // Check explicit role attribute
        String role = element.attr("role");
        if (!role.isEmpty()) {
            return role;
        }

        // Check data-agent-role
        role = element.attr("data-agent-role");
        if (!role.isEmpty()) {
            return role;
        }

        // Infer from tag name
        String tag = element.tagName().toLowerCase();
        return switch (tag) {
            case "button" -> "button";
            case "a" -> "link";
            case "input" -> inferInputRole(element);
            case "textarea" -> "textbox";
            case "select" -> "listbox";
            case "nav" -> "navigation";
            case "main" -> "main";
            case "header" -> "banner";
            case "footer" -> "contentinfo";
            case "aside" -> "complementary";
            case "form" -> "form";
            case "h1", "h2", "h3", "h4", "h5", "h6" -> "heading";
            case "ul", "ol" -> "list";
            case "li" -> "listitem";
            case "table" -> "table";
            case "tr" -> "row";
            case "td", "th" -> "cell";
            case "img" -> "img";
            case "dialog" -> "dialog";
            case "menu" -> "menu";
            case "article" -> "article";
            case "section" -> element.hasAttr("aria-label") ? "region" : "generic";
            case "div", "span" -> "generic";
            default -> "generic";
        };
    }

    private String inferInputRole(Element element) {
        String type = element.attr("type").toLowerCase();
        return switch (type) {
            case "checkbox" -> "checkbox";
            case "radio" -> "radio";
            case "submit", "button", "reset" -> "button";
            case "search" -> "searchbox";
            case "email", "url", "tel" -> "textbox";
            case "number" -> "spinbutton";
            case "range" -> "slider";
            default -> "textbox";
        };
    }

    private String inferLabel(Element element) {
        // Priority order for label inference
        // 1. aria-label
        String label = element.attr("aria-label");
        if (!label.isEmpty()) return label;

        // 2. aria-labelledby
        String labelledBy = element.attr("aria-labelledby");
        if (!labelledBy.isEmpty()) {
            Element labelEl = element.ownerDocument().getElementById(labelledBy);
            if (labelEl != null) {
                return labelEl.text().trim();
            }
        }

        // 3. data-agent-label
        label = element.attr("data-agent-label");
        if (!label.isEmpty()) return label;

        // 4. title attribute
        label = element.attr("title");
        if (!label.isEmpty()) return label;

        // 5. Text content (for buttons, links)
        String text = element.ownText().trim();
        if (!text.isEmpty() && text.length() <= 100) {
            return text;
        }

        // 6. Alt text for images
        label = element.attr("alt");
        if (!label.isEmpty()) return label;

        // 7. Placeholder for inputs
        label = element.attr("placeholder");
        if (!label.isEmpty()) return label;

        // 8. Associated label element
        String id = element.attr("id");
        if (!id.isEmpty()) {
            Elements labels = element.ownerDocument().select("label[for=" + id + "]");
            if (!labels.isEmpty()) {
                return labels.first().text().trim();
            }
        }

        return "";
    }

    private String inferIntent(Element element) {
        // Check data-agent-intent
        String intent = element.attr("data-agent-intent");
        if (!intent.isEmpty()) return intent;

        // Infer from common patterns
        String role = inferRole(element);
        String label = inferLabel(element).toLowerCase();

        // Button intents
        if ("button".equals(role)) {
            if (label.contains("submit") || label.contains("send")) return "submit";
            if (label.contains("cancel") || label.contains("close")) return "cancel";
            if (label.contains("delete") || label.contains("remove")) return "delete";
            if (label.contains("add") || label.contains("create") || label.contains("new")) return "create";
            if (label.contains("edit") || label.contains("update")) return "edit";
            if (label.contains("save")) return "save";
            if (label.contains("search")) return "search";
            if (label.contains("login") || label.contains("sign in")) return "login";
            if (label.contains("logout") || label.contains("sign out")) return "logout";
        }

        // Link intents
        if ("link".equals(role)) {
            String href = element.attr("href");
            if (href.startsWith("mailto:")) return "email";
            if (href.startsWith("tel:")) return "phone";
            if (label.contains("home")) return "navigate-home";
            if (label.contains("back")) return "navigate-back";
        }

        // Input intents
        if ("textbox".equals(role) || "searchbox".equals(role)) {
            if (label.contains("email")) return "input-email";
            if (label.contains("password")) return "input-password";
            if (label.contains("search")) return "search";
            if (label.contains("name")) return "input-name";
        }

        return null;
    }

    private String inferState(Element element) {
        // Check aria-disabled
        if ("true".equals(element.attr("aria-disabled")) || element.hasAttr("disabled")) {
            return "disabled";
        }

        // Check aria-expanded
        String expanded = element.attr("aria-expanded");
        if ("true".equals(expanded)) return "expanded";
        if ("false".equals(expanded)) return "collapsed";

        // Check aria-selected
        if ("true".equals(element.attr("aria-selected"))) return "selected";

        // Check aria-checked
        String checked = element.attr("aria-checked");
        if ("true".equals(checked)) return "checked";
        if ("false".equals(checked)) return "unchecked";
        if ("mixed".equals(checked)) return "mixed";

        // Check aria-pressed
        if ("true".equals(element.attr("aria-pressed"))) return "pressed";

        // Check aria-hidden
        if ("true".equals(element.attr("aria-hidden"))) return "hidden";

        // Check open attribute for details/dialog
        if (element.hasAttr("open")) return "open";

        return "idle";
    }

    private String buildSelector(Element element) {
        StringBuilder selector = new StringBuilder();

        String id = element.attr("id");
        if (!id.isEmpty()) {
            return "#" + id;
        }

        String agentId = element.attr("data-agent-id");
        if (!agentId.isEmpty()) {
            return "[data-agent-id=\"" + agentId + "\"]";
        }

        // Build path-based selector
        selector.append(element.tagName());
        String className = element.className();
        if (!className.isEmpty()) {
            String[] classes = className.split("\\s+");
            if (classes.length > 0 && !classes[0].isEmpty()) {
                selector.append(".").append(classes[0]);
            }
        }

        return selector.toString();
    }

    private String buildXPath(Element element) {
        List<String> parts = new ArrayList<>();
        Element current = element;

        while (current != null && !current.tagName().equals("#root")) {
            String tag = current.tagName();
            Elements siblings = current.parent() != null
                    ? current.parent().children().select(tag)
                    : new Elements();

            if (siblings.size() > 1) {
                int index = siblings.indexOf(current) + 1;
                parts.add(0, tag + "[" + index + "]");
            } else {
                parts.add(0, tag);
            }

            current = current.parent();
        }

        return "/" + String.join("/", parts);
    }

    private SemanticNode.A11yInfo buildA11y(Element element, String label) {
        boolean focusable = isFocusable(element);
        boolean inTabOrder = isInTabOrder(element);
        Integer level = null;

        String tag = element.tagName().toLowerCase();
        if (tag.matches("h[1-6]")) {
            level = Integer.parseInt(tag.substring(1));
        }

        String ariaLevel = element.attr("aria-level");
        if (!ariaLevel.isEmpty()) {
            try {
                level = Integer.parseInt(ariaLevel);
            } catch (NumberFormatException ignored) {
            }
        }

        return SemanticNode.A11yInfo.of(label, focusable, inTabOrder, level);
    }

    private boolean isFocusable(Element element) {
        String tag = element.tagName().toLowerCase();

        // Naturally focusable elements
        if (Set.of("a", "button", "input", "select", "textarea").contains(tag)) {
            return !element.hasAttr("disabled");
        }

        // Check tabindex
        String tabindex = element.attr("tabindex");
        if (!tabindex.isEmpty()) {
            try {
                return Integer.parseInt(tabindex) >= 0;
            } catch (NumberFormatException e) {
                return false;
            }
        }

        return false;
    }

    private boolean isInTabOrder(Element element) {
        if (!isFocusable(element)) return false;

        String tabindex = element.attr("tabindex");
        if (!tabindex.isEmpty()) {
            try {
                return Integer.parseInt(tabindex) >= 0;
            } catch (NumberFormatException e) {
                return false;
            }
        }

        return true;
    }

    private boolean isSemanticElement(Element element) {
        String tag = element.tagName().toLowerCase();

        // Always semantic
        if (Set.of("main", "nav", "header", "footer", "aside", "article", "section",
                "button", "a", "input", "select", "textarea", "form",
                "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
                "table", "tr", "td", "th", "img", "dialog", "menu").contains(tag)) {
            return true;
        }

        // Check for semantic attributes
        return element.hasAttr("role") ||
                element.hasAttr("data-agent-id") ||
                element.hasAttr("data-agent-role") ||
                element.hasAttr("aria-label");
    }

    private SemanticId generateUniqueId(String role, String label, Element element) {
        // Check for explicit agent ID
        String agentId = element.attr("data-agent-id");
        if (!agentId.isEmpty()) {
            return SemanticId.of(agentId);
        }

        // Check for HTML id
        String htmlId = element.attr("id");
        if (!htmlId.isEmpty()) {
            return SemanticId.of(htmlId);
        }

        // Generate from role and label
        String baseId = SemanticId.generate(role, label).value();
        AtomicInteger counter = idCounters.computeIfAbsent(baseId, k -> new AtomicInteger(0));
        int count = counter.incrementAndGet();

        if (count == 1) {
            return SemanticId.of(baseId);
        }
        return SemanticId.of(baseId + "-" + count);
    }

    private Object extractValue(Element element) {
        String tag = element.tagName().toLowerCase();

        if ("input".equals(tag)) {
            String type = element.attr("type").toLowerCase();
            if ("checkbox".equals(type) || "radio".equals(type)) {
                return element.hasAttr("checked");
            }
            return element.attr("value");
        }

        if ("select".equals(tag)) {
            Elements selected = element.select("option[selected]");
            if (!selected.isEmpty()) {
                return selected.first().attr("value");
            }
        }

        if ("textarea".equals(tag)) {
            return element.text();
        }

        return null;
    }

    private AgentCertification runCertificationChecks(SemanticNode root) {
        AgentCertification.Builder builder = AgentCertification.builder();
        List<SemanticNode> allNodes = new ArrayList<>();
        allNodes.add(root);
        allNodes.addAll(root.getDescendants());

        // Check 1: All interactive elements have accessible names
        List<SemanticId> noName = new ArrayList<>();
        for (SemanticNode node : allNodes) {
            if (node.isInteractive() && node.getA11y().name().isEmpty()) {
                noName.add(node.getId());
            }
        }
        boolean hasAccessibleNames = noName.isEmpty();
        builder.addCheck("accessible-names", "All interactive elements have accessible names", hasAccessibleNames);
        if (!hasAccessibleNames) {
            builder.addFailure("accessible-names", "Missing accessible names",
                    noName.size() + " interactive elements lack accessible names",
                    AgentCertification.Severity.ERROR, noName);
        }

        // Check 2: Page has landmarks
        long landmarkCount = allNodes.stream().filter(SemanticNode::isLandmark).count();
        boolean hasLandmarks = landmarkCount > 0;
        builder.addCheck("has-landmarks", "Page has landmark regions", hasLandmarks);
        if (!hasLandmarks) {
            builder.addFailure("has-landmarks", "No landmarks",
                    "Page should have at least one landmark region (main, navigation, etc.)",
                    AgentCertification.Severity.WARNING);
        }

        // Check 3: Buttons have intents
        List<SemanticId> buttonsNoIntent = new ArrayList<>();
        for (SemanticNode node : allNodes) {
            if ("button".equals(node.getRole()) && node.getIntent().isEmpty()) {
                buttonsNoIntent.add(node.getId());
            }
        }
        boolean buttonsHaveIntents = buttonsNoIntent.size() <= (allNodes.stream()
                .filter(n -> "button".equals(n.getRole())).count() / 2);
        builder.addCheck("button-intents", "Most buttons have semantic intents", buttonsHaveIntents);
        if (!buttonsHaveIntents) {
            builder.addFailure("button-intents", "Buttons missing intents",
                    buttonsNoIntent.size() + " buttons lack semantic intents",
                    AgentCertification.Severity.INFO, buttonsNoIntent);
        }

        // Check 4: Heading hierarchy
        List<Integer> headingLevels = allNodes.stream()
                .filter(n -> "heading".equals(n.getRole()))
                .map(n -> n.getA11y().level())
                .filter(Objects::nonNull)
                .sorted()
                .toList();

        boolean validHeadingHierarchy = true;
        for (int i = 1; i < headingLevels.size(); i++) {
            if (headingLevels.get(i) - headingLevels.get(i - 1) > 1) {
                validHeadingHierarchy = false;
                break;
            }
        }
        builder.addCheck("heading-hierarchy", "Valid heading hierarchy", validHeadingHierarchy);
        if (!validHeadingHierarchy) {
            builder.addFailure("heading-hierarchy", "Invalid heading hierarchy",
                    "Heading levels should not skip (e.g., h1 to h3)",
                    AgentCertification.Severity.WARNING);
        }

        // Check 5: Forms have labels
        List<SemanticId> inputsNoLabel = new ArrayList<>();
        for (SemanticNode node : allNodes) {
            if (Set.of("textbox", "searchbox", "listbox", "combobox").contains(node.getRole())
                    && node.getLabel().isEmpty()) {
                inputsNoLabel.add(node.getId());
            }
        }
        boolean formsHaveLabels = inputsNoLabel.isEmpty();
        builder.addCheck("form-labels", "Form inputs have labels", formsHaveLabels);
        if (!formsHaveLabels) {
            builder.addFailure("form-labels", "Form inputs missing labels",
                    inputsNoLabel.size() + " form inputs lack labels",
                    AgentCertification.Severity.ERROR, inputsNoLabel);
        }

        return builder.build();
    }

    /**
     * Parser configuration options.
     */
    public record ParserConfig(
            boolean includeStateGraph,
            boolean computeBounds
    ) {
        public static ParserConfig defaults() {
            return new ParserConfig(true, false);
        }
    }
}
