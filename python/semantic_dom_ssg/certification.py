"""Agent certification system for SemanticDOM.

Provides compliance validation and scoring based on the
ISO/IEC-SDOM-SSG-DRAFT-2024 specification.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from .types import SemanticRole

if TYPE_CHECKING:
    from .parser import SemanticDOM


class CertificationLevel(Enum):
    """Certification levels based on compliance."""

    NONE = "none"
    A = "a"
    AA = "aa"
    AAA = "aaa"

    @property
    def badge(self) -> str:
        """Get the badge emoji for this level."""
        badges = {
            CertificationLevel.NONE: "❌",
            CertificationLevel.A: "🥉",
            CertificationLevel.AA: "🥈",
            CertificationLevel.AAA: "🥇",
        }
        return badges[self]

    @property
    def name_str(self) -> str:
        """Get the human-readable name."""
        names = {
            CertificationLevel.NONE: "Not Certified",
            CertificationLevel.A: "Level A",
            CertificationLevel.AA: "Level AA",
            CertificationLevel.AAA: "Level AAA",
        }
        return names[self]

    @property
    def rank(self) -> int:
        """Position in the ordering NONE < A < AA < AAA."""
        return _LEVEL_ORDER.index(self.value)

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, CertificationLevel):
            return NotImplemented
        return self.rank < other.rank

    def __le__(self, other: object) -> bool:
        if not isinstance(other, CertificationLevel):
            return NotImplemented
        return self.rank <= other.rank

    def __gt__(self, other: object) -> bool:
        if not isinstance(other, CertificationLevel):
            return NotImplemented
        return self.rank > other.rank

    def __ge__(self, other: object) -> bool:
        if not isinstance(other, CertificationLevel):
            return NotImplemented
        return self.rank >= other.rank


_LEVEL_ORDER = ("none", "a", "aa", "aaa")


class CheckCategory(Enum):
    """Categories of validation checks."""

    STRUCTURE = "structure"
    ACCESSIBILITY = "accessibility"
    NAVIGATION = "navigation"
    INTEROPERABILITY = "interoperability"

    @property
    def weight_multiplier(self) -> float:
        """Get the weight multiplier for this category."""
        weights = {
            CheckCategory.STRUCTURE: 0.30,  # 30%
            CheckCategory.ACCESSIBILITY: 0.30,  # 30%
            CheckCategory.NAVIGATION: 0.25,  # 25%
            CheckCategory.INTEROPERABILITY: 0.15,  # 15%
        }
        return weights[self]


@dataclass
class ValidationCheck:
    """A validation check result."""

    id: str
    name: str
    category: CheckCategory
    passed: bool
    details: str | None = None
    weight: float = 1.0


@dataclass
class CertificationStats:
    """Statistics about the certification."""

    total_checks: int
    passed_checks: int
    landmark_count: int
    interactable_count: int
    heading_count: int
    completeness: float


@dataclass
class AgentCertification:
    """Agent certification result."""

    level: CertificationLevel
    score: int
    checks: list[ValidationCheck]
    stats: CertificationStats

    @classmethod
    def certify(cls, sdom: SemanticDOM) -> AgentCertification:
        """Certify a SemanticDOM document.

        Args:
            sdom: The SemanticDOM to certify

        Returns:
            AgentCertification with level, score, and check results
        """
        checks: list[ValidationCheck] = []

        # Structure checks (30%)
        checks.append(cls._check_has_landmarks(sdom))
        checks.append(cls._check_has_main(sdom))
        checks.append(cls._check_heading_hierarchy(sdom))
        checks.append(cls._check_unique_ids(sdom))

        # Accessibility checks (30%)
        checks.append(cls._check_accessible_names(sdom))
        checks.append(cls._check_link_text(sdom))
        checks.append(cls._check_button_text(sdom))
        checks.append(cls._check_form_labels(sdom))

        # Navigation checks (25%)
        checks.append(cls._check_navigation_exists(sdom))
        checks.append(cls._check_deterministic_fsm(sdom))
        checks.append(cls._check_reachable_states(sdom))

        # Interoperability checks (15%)
        checks.append(cls._check_selectors(sdom))
        checks.append(cls._check_intents(sdom))

        # Calculate scores by category
        category_scores: dict[CheckCategory, tuple[float, float]] = {}
        for check in checks:
            if check.category not in category_scores:
                category_scores[check.category] = (0.0, 0.0)
            passed, total = category_scores[check.category]
            total += check.weight
            if check.passed:
                passed += check.weight
            category_scores[check.category] = (passed, total)

        # Calculate weighted score
        total_score = 0.0
        for category, (passed, total) in category_scores.items():
            if total > 0:
                category_pct = passed / total
                total_score += category_pct * category.weight_multiplier

        # Add completeness bonus
        completeness = cls._calculate_completeness(sdom)
        total_score += completeness * 0.1  # 10% bonus

        # Normalize to 0-100
        # (truncated, like the Rust implementation; the epsilon absorbs float error
        # so that e.g. 0.7 * 100 is 70 and not 69)
        score = int(min(100.0, max(0.0, total_score * 100 + 1e-9)))

        # Determine level
        if score >= 90:
            level = CertificationLevel.AAA
        elif score >= 70:
            level = CertificationLevel.AA
        elif score >= 50:
            level = CertificationLevel.A
        else:
            level = CertificationLevel.NONE

        passed_checks = sum(1 for c in checks if c.passed)

        stats = CertificationStats(
            total_checks=len(checks),
            passed_checks=passed_checks,
            landmark_count=len(sdom.landmarks),
            interactable_count=len(sdom.interactables),
            heading_count=len(sdom.headings),
            completeness=completeness,
        )

        return cls(level=level, score=score, checks=checks, stats=stats)

    @staticmethod
    def _calculate_completeness(sdom: SemanticDOM) -> float:
        """Calculate content completeness score."""
        completeness = 0.0
        max_completeness = 0.0
        total = max(len(sdom.index), 1)

        # Check labels (25%)
        max_completeness += 0.25
        labeled = sum(1 for n in sdom.index.values() if n.label and n.label != n.role.value)
        completeness += 0.25 * min(labeled / total, 1.0)

        # Check selectors (25%)
        max_completeness += 0.25
        with_selectors = sum(1 for n in sdom.index.values() if n.selector)
        completeness += 0.25 * min(with_selectors / total, 1.0)

        # Check intents (25%)
        max_completeness += 0.25
        with_intents = sum(1 for n in sdom.index.values() if n.intent is not None)
        completeness += 0.25 * _coverage(with_intents, len(sdom.interactables))

        # Check accessible names (25%)
        max_completeness += 0.25
        with_a11y = sum(1 for n in sdom.index.values() if n.accessible_name is not None)
        completeness += 0.25 * min(with_a11y / total, 1.0)

        return completeness / max_completeness if max_completeness > 0 else 0.0

    # Structure checks

    @staticmethod
    def _check_has_landmarks(sdom: SemanticDOM) -> ValidationCheck:
        return ValidationCheck(
            id="STRUCT-001",
            name="Has landmark regions",
            category=CheckCategory.STRUCTURE,
            passed=len(sdom.landmarks) > 0,
            details=f"Found {len(sdom.landmarks)} landmarks",
        )

    @staticmethod
    def _check_has_main(sdom: SemanticDOM) -> ValidationCheck:
        has_main = any(n.role == SemanticRole.MAIN for n in sdom.index.values())
        return ValidationCheck(
            id="STRUCT-002",
            name="Has main content region",
            category=CheckCategory.STRUCTURE,
            passed=has_main,
        )

    @staticmethod
    def _check_heading_hierarchy(sdom: SemanticDOM) -> ValidationCheck:
        return ValidationCheck(
            id="STRUCT-003",
            name="Has heading structure",
            category=CheckCategory.STRUCTURE,
            passed=len(sdom.headings) > 0,
            details=f"Found {len(sdom.headings)} headings",
            weight=0.5,
        )

    @staticmethod
    def _check_unique_ids(sdom: SemanticDOM) -> ValidationCheck:
        duplicates = len(sdom.duplicate_ids)
        if duplicates:
            details = f"{duplicates} duplicated id value{'s' if duplicates != 1 else ''} in source"
        else:
            details = f"{len(sdom.index)} unique nodes"
        return ValidationCheck(
            id="STRUCT-004",
            name="Unique element IDs",
            category=CheckCategory.STRUCTURE,
            passed=duplicates == 0,
            details=details,
            weight=0.5,
        )

    # Accessibility checks

    @staticmethod
    def _check_accessible_names(sdom: SemanticDOM) -> ValidationCheck:
        nodes = sdom.get_interactables()
        named = sum(1 for n in nodes if n.accessible_name)
        return ValidationCheck(
            id="A11Y-001",
            name="Interactables have accessible names",
            category=CheckCategory.ACCESSIBILITY,
            passed=_coverage(named, len(nodes)) >= PASS_THRESHOLD,
            details=f"{named}/{len(nodes)} ({_coverage(named, len(nodes)) * 100:.0f}%)",
        )

    @staticmethod
    def _check_link_text(sdom: SemanticDOM) -> ValidationCheck:
        links = [n for n in sdom.index.values() if n.role == SemanticRole.LINK]
        with_text = sum(1 for n in links if n.accessible_name)
        return ValidationCheck(
            id="A11Y-002",
            name="Links have descriptive text",
            category=CheckCategory.ACCESSIBILITY,
            passed=_coverage(with_text, len(links)) >= PASS_THRESHOLD,
            details=f"{with_text}/{len(links)} links have text",
            weight=0.75,
        )

    @staticmethod
    def _check_button_text(sdom: SemanticDOM) -> ValidationCheck:
        buttons = [n for n in sdom.index.values() if n.role == SemanticRole.BUTTON]
        with_text = sum(1 for n in buttons if n.accessible_name)
        return ValidationCheck(
            id="A11Y-003",
            name="Buttons have descriptive text",
            category=CheckCategory.ACCESSIBILITY,
            passed=_coverage(with_text, len(buttons), empty=1.0) >= PASS_THRESHOLD,
            details=f"{with_text}/{len(buttons)} buttons have text",
            weight=0.75,
        )

    @staticmethod
    def _check_form_labels(sdom: SemanticDOM) -> ValidationCheck:
        inputs = [n for n in sdom.index.values() if n.role in _FORM_ROLES]
        with_labels = sum(1 for n in inputs if n.accessible_name)
        return ValidationCheck(
            id="A11Y-004",
            name="Form inputs have labels",
            category=CheckCategory.ACCESSIBILITY,
            passed=_coverage(with_labels, len(inputs), empty=1.0) >= PASS_THRESHOLD,
            details=f"{with_labels}/{len(inputs)} inputs have labels",
            weight=0.5,
        )

    # Navigation checks

    @staticmethod
    def _check_navigation_exists(sdom: SemanticDOM) -> ValidationCheck:
        has_nav = any(n.role == SemanticRole.NAVIGATION for n in sdom.index.values())
        return ValidationCheck(
            id="NAV-001",
            name="Has navigation landmark",
            category=CheckCategory.NAVIGATION,
            passed=has_nav,
        )

    @staticmethod
    def _check_deterministic_fsm(sdom: SemanticDOM) -> ValidationCheck:
        graph = sdom.state_graph
        return ValidationCheck(
            id="NAV-002",
            name="State graph is deterministic",
            category=CheckCategory.NAVIGATION,
            passed=graph.is_deterministic(),
            details=f"{len(graph.states)} states, {len(graph.transitions)} transitions",
        )

    @staticmethod
    def _check_reachable_states(sdom: SemanticDOM) -> ValidationCheck:
        total_states = len(sdom.state_graph.states)
        reachable = len(sdom.state_graph.reachable_states())
        return ValidationCheck(
            id="NAV-003",
            name="All states reachable",
            category=CheckCategory.NAVIGATION,
            passed=reachable == total_states,
            details=f"{reachable}/{total_states} states reachable",
            weight=0.75,
        )

    # Interoperability checks

    @staticmethod
    def _check_selectors(sdom: SemanticDOM) -> ValidationCheck:
        with_selectors = sum(1 for n in sdom.index.values() if n.selector)
        coverage = _coverage(with_selectors, len(sdom.index))
        return ValidationCheck(
            id="INTEROP-001",
            name="Elements have CSS selectors",
            category=CheckCategory.INTEROPERABILITY,
            passed=coverage >= PASS_THRESHOLD,
            details=f"{coverage * 100:.0f}% coverage",
        )

    @staticmethod
    def _check_intents(sdom: SemanticDOM) -> ValidationCheck:
        nodes = sdom.get_interactables()
        with_intents = sum(1 for n in nodes if n.intent is not None)
        coverage = _coverage(with_intents, len(nodes))
        return ValidationCheck(
            id="INTEROP-002",
            name="Interactables have intents",
            category=CheckCategory.INTEROPERABILITY,
            passed=coverage >= PASS_THRESHOLD,
            details=f"{coverage * 100:.0f}% coverage",
            weight=0.75,
        )


#: Share of elements that must satisfy a coverage check for it to pass.
PASS_THRESHOLD = 0.8

_FORM_ROLES = frozenset(
    {SemanticRole.TEXT_INPUT, SemanticRole.CHECKBOX, SemanticRole.RADIO, SemanticRole.SELECT}
)


def _coverage(part: int, total: int, *, empty: float = 0.0) -> float:
    """Share of ``total`` covered by ``part``.

    ``empty`` is the result when there is nothing to cover: 0.0 for checks that
    require the element kind to exist (a page with no interactables is not
    agent-ready), 1.0 for checks that only apply when the kind is present.
    """
    return empty if total == 0 else min(part / total, 1.0)
