package io.semanticdom.ssg.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Semantic State Graph node representing an element's state machine.
 * Tracks current state and possible state transitions.
 */
public class SSGNode {

    private final SemanticId nodeId;
    private final String currentState;
    private final List<StateTransition> transitions;

    public SSGNode(SemanticId nodeId, String currentState, List<StateTransition> transitions) {
        this.nodeId = nodeId;
        this.currentState = currentState;
        this.transitions = new ArrayList<>(transitions);
    }

    /**
     * Create SSGNode from a SemanticNode.
     */
    public static SSGNode from(SemanticNode node) {
        List<StateTransition> transitions = inferTransitions(node);
        return new SSGNode(node.getId(), node.getState(), transitions);
    }

    private static List<StateTransition> inferTransitions(SemanticNode node) {
        List<StateTransition> transitions = new ArrayList<>();
        String role = node.getRole().toLowerCase();
        String currentState = node.getState();

        switch (role) {
            case "button" -> {
                transitions.add(new StateTransition("idle", "focused", "focus"));
                transitions.add(new StateTransition("focused", "idle", "blur"));
                transitions.add(new StateTransition("focused", "pressed", "mousedown"));
                transitions.add(new StateTransition("pressed", "focused", "mouseup"));
                if ("disabled".equals(currentState)) {
                    transitions.add(new StateTransition("disabled", "idle", "enable"));
                }
            }
            case "textbox", "input" -> {
                transitions.add(new StateTransition("idle", "focused", "focus"));
                transitions.add(new StateTransition("focused", "idle", "blur"));
                transitions.add(new StateTransition("focused", "editing", "input"));
                transitions.add(new StateTransition("editing", "focused", "change"));
            }
            case "checkbox" -> {
                transitions.add(new StateTransition("unchecked", "checked", "click"));
                transitions.add(new StateTransition("checked", "unchecked", "click"));
                transitions.add(new StateTransition("idle", "focused", "focus"));
            }
            case "link" -> {
                transitions.add(new StateTransition("idle", "focused", "focus"));
                transitions.add(new StateTransition("focused", "idle", "blur"));
                transitions.add(new StateTransition("focused", "visited", "click"));
            }
            case "tab" -> {
                transitions.add(new StateTransition("inactive", "active", "click"));
                transitions.add(new StateTransition("active", "inactive", "deselect"));
            }
            case "dialog" -> {
                transitions.add(new StateTransition("closed", "open", "open"));
                transitions.add(new StateTransition("open", "closed", "close"));
            }
            case "menu" -> {
                transitions.add(new StateTransition("collapsed", "expanded", "open"));
                transitions.add(new StateTransition("expanded", "collapsed", "close"));
            }
            default -> {
                // Generic interactive element transitions
                if (node.isInteractive()) {
                    transitions.add(new StateTransition("idle", "focused", "focus"));
                    transitions.add(new StateTransition("focused", "idle", "blur"));
                }
            }
        }

        return transitions;
    }

    public SemanticId getNodeId() {
        return nodeId;
    }

    public String getCurrentState() {
        return currentState;
    }

    public List<StateTransition> getTransitions() {
        return Collections.unmodifiableList(transitions);
    }

    /**
     * Get transitions available from the current state.
     */
    public List<StateTransition> getAvailableTransitions() {
        return transitions.stream()
                .filter(t -> t.from().equals(currentState))
                .toList();
    }

    /**
     * Check if a transition is possible from current state.
     */
    public boolean canTransition(String trigger) {
        return getAvailableTransitions().stream()
                .anyMatch(t -> t.trigger().equals(trigger));
    }

    /**
     * Represents a state transition in the FSM.
     */
    public record StateTransition(String from, String to, String trigger) {
    }
}
