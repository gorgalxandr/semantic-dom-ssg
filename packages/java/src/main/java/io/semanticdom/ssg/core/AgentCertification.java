package io.semanticdom.ssg.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Agent certification status indicating how well a page supports AI agent automation.
 * Levels: none, basic, standard, advanced, full
 */
public class AgentCertification {

    /**
     * Certification levels in ascending order of agent-readiness.
     */
    public enum Level {
        NONE(0),
        BASIC(25),
        STANDARD(50),
        ADVANCED(75),
        FULL(100);

        private final int minScore;

        Level(int minScore) {
            this.minScore = minScore;
        }

        public int getMinScore() {
            return minScore;
        }

        public static Level fromScore(int score) {
            if (score >= 100) return FULL;
            if (score >= 75) return ADVANCED;
            if (score >= 50) return STANDARD;
            if (score >= 25) return BASIC;
            return NONE;
        }
    }

    /**
     * Severity levels for validation failures.
     */
    public enum Severity {
        INFO,
        WARNING,
        ERROR,
        CRITICAL
    }

    private final Level level;
    private final int score;
    private final List<Check> checks;
    private final List<Failure> failures;

    public AgentCertification(Level level, int score, List<Check> checks, List<Failure> failures) {
        this.level = level;
        this.score = score;
        this.checks = new ArrayList<>(checks);
        this.failures = new ArrayList<>(failures);
    }

    public static AgentCertification none() {
        return new AgentCertification(Level.NONE, 0, List.of(), List.of());
    }

    public static Builder builder() {
        return new Builder();
    }

    public Level getLevel() {
        return level;
    }

    public int getScore() {
        return score;
    }

    public List<Check> getChecks() {
        return Collections.unmodifiableList(checks);
    }

    public List<Failure> getFailures() {
        return Collections.unmodifiableList(failures);
    }

    public boolean isPassing() {
        return level != Level.NONE;
    }

    public boolean hasErrors() {
        return failures.stream()
                .anyMatch(f -> f.severity() == Severity.ERROR || f.severity() == Severity.CRITICAL);
    }

    /**
     * A passed validation check.
     */
    public record Check(String id, String name, boolean passed) {
    }

    /**
     * A failed validation check.
     */
    public record Failure(
            String id,
            String name,
            String message,
            Severity severity,
            List<SemanticId> affectedNodes
    ) {
        public Failure(String id, String name, String message, Severity severity) {
            this(id, name, message, severity, List.of());
        }
    }

    public static class Builder {
        private final List<Check> checks = new ArrayList<>();
        private final List<Failure> failures = new ArrayList<>();

        public Builder addCheck(String id, String name, boolean passed) {
            checks.add(new Check(id, name, passed));
            return this;
        }

        public Builder addFailure(String id, String name, String message, Severity severity) {
            failures.add(new Failure(id, name, message, severity));
            return this;
        }

        public Builder addFailure(String id, String name, String message, Severity severity, List<SemanticId> nodes) {
            failures.add(new Failure(id, name, message, severity, nodes));
            return this;
        }

        public AgentCertification build() {
            int score = calculateScore();
            Level level = Level.fromScore(score);
            return new AgentCertification(level, score, checks, failures);
        }

        private int calculateScore() {
            if (checks.isEmpty()) return 0;

            long passed = checks.stream().filter(Check::passed).count();
            int baseScore = (int) ((passed * 100) / checks.size());

            // Deduct for failures by severity
            int deductions = 0;
            for (Failure f : failures) {
                deductions += switch (f.severity()) {
                    case CRITICAL -> 25;
                    case ERROR -> 15;
                    case WARNING -> 5;
                    case INFO -> 0;
                };
            }

            return Math.max(0, baseScore - deductions);
        }
    }
}
