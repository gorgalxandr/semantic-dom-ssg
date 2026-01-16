"""Agent certification system for SemanticDOM.

Provides compliance validation and scoring based on the
ISO/IEC-SDOM-SSG-DRAFT-2024 specification.
"""

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Optional

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

    def __lt__(self, other: "CertificationLevel") -> bool:
        order = [CertificationLevel.NONE, CertificationLevel.A, CertificationLevel.AA, CertificationLevel.AAA]
        return order.index(self) < order.index(other)

    def __le__(self, other: "CertificationLevel") -> bool:
        return self == other or self < other

    def __gt__(self, other: "CertificationLevel") -> bool:
        return not self <= other

    def __ge__(self, other: "CertificationLevel") -> bool:
        return not self < other


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
    details: Optional[str] = None
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
    def certify(cls, sdom: "SemanticDOM") -> "AgentCertification":
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
        score = int(min(100, max(0, total_score * 100)))

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
    def _calculate_completeness(sdom: "SemanticDOM") -> float:
        """Calculate content completeness score."""
        completeness = 0.0
        max_completeness = 0.0
        total = max(len(sdom.index), 1)

        # Check labels (25%)
        max_completeness += 0.25
        labeled = sum(
            1 for n in sdom.index.values() if n.label and n.label != n.role.value
        )
        completeness += 0.25 * min(labeled / total, 1.0)

        # Check selectors (25%)
        max_completeness += 0.25
        with_selectors = sum(1 for n in sdom.index.values() if n.selector)
        completeness += 0.25 * min(with_selectors / total, 1.0)

        # Check intents (25%)
        max_completeness += 0.25
        interactables = max(len(sdom.interactables), 1)
        with_intents = sum(1 for n in sdom.index.values() if n.intent is not None)
        completeness += 0.25 * min(with_intents / interactables, 1.0)

        # Check accessible names (25%)
        max_completeness += 0.25
        with_a11y = sum(1 for n in sdom.index.values() if n.accessible_name is not None)
        completeness += 0.25 * min(with_a11y / total, 1.0)

        return completeness / max_completeness if max_completeness > 0 else 0.0

    # Structure checks

    @staticmethod
    def _check_has_landmarks(sdom: "SemanticDOM") -> ValidationCheck:
        return ValidationCheck(
            id="STRUCT-001",
            name="Has landmark regions",
            category=CheckCategory.STRUCTURE,
            passed=len(sdom.landmarks) > 0,
            details=f"Found {len(sdom.landmarks)} landmarks",
        )

    @staticmethod
    def _check_has_main(sdom: "SemanticDOM") -> ValidationCheck:
        has_main = any(n.role == SemanticRole.MAIN for n in sdom.index.values())
        return ValidationCheck(
            id="STRUCT-002",
            name="Has main content region",
            category=CheckCategory.STRUCTURE,
            passed=has_main,
        )

    @staticmethod
    def _check_heading_hierarchy(sdom: "SemanticDOM") -> ValidationCheck:
        return ValidationCheck(
            id="STRUCT-003",
            name="Has heading structure",
            category=CheckCategory.STRUCTURE,
            passed=len(sdom.headings) > 0,
            details=f"Found {len(sdom.headings)} headings",
            weight=0.5,
        )

    @staticmethod
    def _check_unique_ids(sdom: "SemanticDOM") -> ValidationCheck:
        return ValidationCheck(
            id="STRUCT-004",
            name="Unique element IDs",
            category=CheckCategory.STRUCTURE,
            passed=True,  # Dict keys are unique by definition
            details=f"{len(sdom.index)} unique nodes",
            weight=0.5,
        )

    # Accessibility checks

    @staticmethod
    def _check_accessible_names(sdom: "SemanticDOM") -> ValidationCheck:
        interactables_with_names = sum(
            1
            for node_id in sdom.interactables
            if (node := sdom.index.get(node_id))
            and (node.accessible_name or node.label)
        )
        total = max(len(sdom.interactables), 1)
        pct = (interactables_with_names / total) * 100

        return ValidationCheck(
            id="A11Y-001",
            name="Interactables have accessible names",
            category=CheckCategory.ACCESSIBILITY,
            passed=pct >= 80,
            details=f"{interactables_with_names}/{total} ({pct:.0f}%)",
        )

    @staticmethod
    def _check_link_text(sdom: "SemanticDOM") -> ValidationCheck:
        links = [n for n in sdom.index.values() if n.role == SemanticRole.LINK]
        with_text = sum(1 for n in links if n.label and n.label != "a")
        total = max(len(links), 1)
        passed = with_text / total >= 0.8

        return ValidationCheck(
            id="A11Y-002",
            name="Links have descriptive text",
            category=CheckCategory.ACCESSIBILITY,
            passed=passed,
            details=f"{with_text}/{total} links have text",
            weight=0.75,
        )

    @staticmethod
    def _check_button_text(sdom: "SemanticDOM") -> ValidationCheck:
        buttons = [n for n in sdom.index.values() if n.role == SemanticRole.BUTTON]
        with_text = sum(1 for n in buttons if n.label and n.label != "button")
        total = max(len(buttons), 1)
        passed = total == 0 or with_text / total >= 0.8

        return ValidationCheck(
            id="A11Y-003",
            name="Buttons have descriptive text",
            category=CheckCategory.ACCESSIBILITY,
            passed=passed,
            details=f"{with_text}/{total} buttons have text",
            weight=0.75,
        )

    @staticmethod
    def _check_form_labels(sdom: "SemanticDOM") -> ValidationCheck:
        inputs = [
            n
            for n in sdom.index.values()
            if n.role
            in {
                SemanticRole.TEXT_INPUT,
                SemanticRole.CHECKBOX,
                SemanticRole.RADIO,
                SemanticRole.SELECT,
            }
        ]
        with_labels = sum(
            1 for n in inputs if n.accessible_name is not None or n.label
        )
        total = max(len(inputs), 1)
        passed = total == 0 or with_labels / total >= 0.8

        return ValidationCheck(
            id="A11Y-004",
            name="Form inputs have labels",
            category=CheckCategory.ACCESSIBILITY,
            passed=passed,
            details=f"{with_labels}/{total} inputs have labels",
            weight=0.5,
        )

    # Navigation checks

    @staticmethod
    def _check_navigation_exists(sdom: "SemanticDOM") -> ValidationCheck:
        has_nav = any(n.role == SemanticRole.NAVIGATION for n in sdom.index.values())
        return ValidationCheck(
            id="NAV-001",
            name="Has navigation landmark",
            category=CheckCategory.NAVIGATION,
            passed=has_nav,
        )

    @staticmethod
    def _check_deterministic_fsm(sdom: "SemanticDOM") -> ValidationCheck:
        is_deterministic = sdom.state_graph.is_deterministic()
        return ValidationCheck(
            id="NAV-002",
            name="State graph is deterministic",
            category=CheckCategory.NAVIGATION,
            passed=is_deterministic,
            details=f"{len(sdom.state_graph.states)} states, {len(sdom.state_graph.transitions)} transitions",
        )

    @staticmethod
    def _check_reachable_states(sdom: "SemanticDOM") -> ValidationCheck:
        total_states = len(sdom.state_graph.states)
        reachable = len(sdom.state_graph.reachable_states())
        passed = total_states == 0 or reachable == total_states

        return ValidationCheck(
            id="NAV-003",
            name="All states reachable",
            category=CheckCategory.NAVIGATION,
            passed=passed,
            details=f"{reachable}/{total_states} states reachable",
            weight=0.75,
        )

    # Interoperability checks

    @staticmethod
    def _check_selectors(sdom: "SemanticDOM") -> ValidationCheck:
        with_selectors = sum(1 for n in sdom.index.values() if n.selector)
        total = max(len(sdom.index), 1)
        pct = (with_selectors / total) * 100

        return ValidationCheck(
            id="INTEROP-001",
            name="Elements have CSS selectors",
            category=CheckCategory.INTEROPERABILITY,
            passed=pct >= 80,
            details=f"{pct:.0f}% coverage",
        )

    @staticmethod
    def _check_intents(sdom: "SemanticDOM") -> ValidationCheck:
        interactables_with_intents = sum(
            1
            for node_id in sdom.interactables
            if (node := sdom.index.get(node_id)) and node.intent is not None
        )
        total = max(len(sdom.interactables), 1)
        pct = (interactables_with_intents / total) * 100

        return ValidationCheck(
            id="INTEROP-002",
            name="Interactables have intents",
            category=CheckCategory.INTEROPERABILITY,
            passed=pct >= 80,
            details=f"{pct:.0f}% coverage",
            weight=0.75,
        )
