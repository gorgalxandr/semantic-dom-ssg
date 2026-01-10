"""HTML to SemanticDOM parser."""

from __future__ import annotations

import time
from typing import Optional

from bs4 import BeautifulSoup, Tag

from .types import (
    A11yInfo,
    AgentCertification,
    CertificationLevel,
    Check,
    Failure,
    SemanticDocument,
    SemanticId,
    SemanticNode,
    Severity,
)

VERSION = "0.1.0"
STANDARD = "ISO/IEC-SDOM-SSG-DRAFT-2024"


class SemanticDOMParser:
    """Parser for converting HTML to SemanticDOM."""

    def __init__(self) -> None:
        self._id_counters: dict[str, int] = {}

    def parse(self, html: str, url: str, title: Optional[str] = None) -> SemanticDocument:
        """Parse HTML string into SemanticDocument."""
        self._id_counters.clear()

        soup = BeautifulSoup(html, "lxml")

        # Extract title
        if title is None:
            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else ""

        # Extract language
        html_tag = soup.find("html")
        language = html_tag.get("lang", "en") if html_tag else "en"

        # Parse body
        body = soup.find("body")
        if not body:
            raise ValueError("HTML document has no body element")

        root = self._parse_element(body)

        # Run certification checks
        certification = self._run_certification_checks(root)

        return SemanticDocument(
            version=VERSION,
            standard=STANDARD,
            url=url,
            title=title,
            language=language,
            generated_at=int(time.time() * 1000),
            root=root,
            agent_ready=certification,
        )

    def _parse_element(self, element: Tag) -> SemanticNode:
        role = self._infer_role(element)
        label = self._infer_label(element)
        intent = self._infer_intent(element, role, label)
        state = self._infer_state(element)
        selector = self._build_selector(element)
        a11y = self._build_a11y(element, label)
        node_id = self._generate_unique_id(role, label, element)

        children: list[SemanticNode] = []
        for child in element.children:
            if isinstance(child, Tag):
                if self._is_semantic_element(child):
                    children.append(self._parse_element(child))
                else:
                    # Process grandchildren of non-semantic wrappers
                    for grandchild in child.children:
                        if isinstance(grandchild, Tag) and self._is_semantic_element(
                            grandchild
                        ):
                            children.append(self._parse_element(grandchild))

        node = SemanticNode(
            id=node_id,
            role=role,
            label=label,
            intent=intent,
            state=state,
            selector=selector,
            xpath="",  # XPath generation skipped for simplicity
            a11y=a11y,
            children=children,
        )

        # Set parent references
        for child in children:
            child.parent = node

        return node

    def _infer_role(self, element: Tag) -> str:
        # Check explicit role
        if role := element.get("role"):
            return str(role)

        # Check data-agent-role
        if role := element.get("data-agent-role"):
            return str(role)

        # Infer from tag
        tag = element.name.lower()
        role_map = {
            "button": "button",
            "a": "link",
            "textarea": "textbox",
            "select": "listbox",
            "nav": "navigation",
            "main": "main",
            "header": "banner",
            "footer": "contentinfo",
            "aside": "complementary",
            "form": "form",
            "h1": "heading",
            "h2": "heading",
            "h3": "heading",
            "h4": "heading",
            "h5": "heading",
            "h6": "heading",
            "ul": "list",
            "ol": "list",
            "li": "listitem",
            "table": "table",
            "tr": "row",
            "td": "cell",
            "th": "cell",
            "img": "img",
            "dialog": "dialog",
            "menu": "menu",
            "article": "article",
        }

        if tag in role_map:
            return role_map[tag]

        if tag == "input":
            return self._infer_input_role(element)

        if tag == "section" and element.get("aria-label"):
            return "region"

        return "generic"

    def _infer_input_role(self, element: Tag) -> str:
        input_type = str(element.get("type", "text")).lower()
        type_map = {
            "checkbox": "checkbox",
            "radio": "radio",
            "submit": "button",
            "button": "button",
            "reset": "button",
            "search": "searchbox",
            "number": "spinbutton",
            "range": "slider",
        }
        return type_map.get(input_type, "textbox")

    def _infer_label(self, element: Tag) -> str:
        # Priority: aria-label > data-agent-label > title > text > alt > placeholder
        if label := element.get("aria-label"):
            return str(label)

        if label := element.get("data-agent-label"):
            return str(label)

        if label := element.get("title"):
            return str(label)

        # Text content
        text = element.get_text(strip=True)
        if text and len(text) <= 100:
            return text

        if label := element.get("alt"):
            return str(label)

        if label := element.get("placeholder"):
            return str(label)

        return ""

    def _infer_intent(
        self, element: Tag, role: str, label: str
    ) -> Optional[str]:
        if intent := element.get("data-agent-intent"):
            return str(intent)

        label_lower = label.lower()

        if role == "button":
            intent_map = {
                ("submit", "send"): "submit",
                ("cancel", "close"): "cancel",
                ("delete", "remove"): "delete",
                ("add", "create", "new"): "create",
                ("edit", "update"): "edit",
                ("save",): "save",
                ("search",): "search",
                ("login", "sign in"): "login",
                ("logout", "sign out"): "logout",
            }
            for keywords, intent in intent_map.items():
                if any(kw in label_lower for kw in keywords):
                    return intent

        if role == "link":
            href = element.get("href", "")
            if isinstance(href, str):
                if href.startswith("mailto:"):
                    return "email"
                if href.startswith("tel:"):
                    return "phone"

        return None

    def _infer_state(self, element: Tag) -> str:
        if element.get("disabled") is not None or element.get("aria-disabled") == "true":
            return "disabled"

        aria_expanded = element.get("aria-expanded")
        if aria_expanded == "true":
            return "expanded"
        if aria_expanded == "false":
            return "collapsed"

        if element.get("aria-selected") == "true":
            return "selected"

        aria_checked = element.get("aria-checked")
        if aria_checked == "true":
            return "checked"
        if aria_checked == "false":
            return "unchecked"
        if aria_checked == "mixed":
            return "mixed"

        if element.get("aria-hidden") == "true":
            return "hidden"

        if element.get("open") is not None:
            return "open"

        return "idle"

    def _build_selector(self, element: Tag) -> str:
        if el_id := element.get("id"):
            return f"#{el_id}"

        if agent_id := element.get("data-agent-id"):
            return f'[data-agent-id="{agent_id}"]'

        selector = element.name
        if classes := element.get("class"):
            if isinstance(classes, list) and classes:
                selector += f".{classes[0]}"
            elif isinstance(classes, str):
                first_class = classes.split()[0] if classes.split() else ""
                if first_class:
                    selector += f".{first_class}"

        return selector

    def _build_a11y(self, element: Tag, label: str) -> A11yInfo:
        focusable = self._is_focusable(element)
        in_tab_order = focusable and self._is_in_tab_order(element)
        level = self._get_heading_level(element)

        return A11yInfo(
            name=label, focusable=focusable, in_tab_order=in_tab_order, level=level
        )

    def _is_focusable(self, element: Tag) -> bool:
        tag = element.name.lower()

        if tag in ("a", "button", "input", "select", "textarea"):
            return element.get("disabled") is None

        tabindex = element.get("tabindex")
        if tabindex is not None:
            try:
                return int(tabindex) >= 0
            except (ValueError, TypeError):
                pass

        return False

    def _is_in_tab_order(self, element: Tag) -> bool:
        tabindex = element.get("tabindex")
        if tabindex is not None:
            try:
                return int(tabindex) >= 0
            except (ValueError, TypeError):
                pass
        return True

    def _get_heading_level(self, element: Tag) -> Optional[int]:
        tag = element.name.lower()
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            return int(tag[1])

        aria_level = element.get("aria-level")
        if aria_level is not None:
            try:
                return int(aria_level)
            except (ValueError, TypeError):
                pass

        return None

    def _is_semantic_element(self, element: Tag) -> bool:
        tag = element.name.lower()

        semantic_tags = {
            "main",
            "nav",
            "header",
            "footer",
            "aside",
            "article",
            "section",
            "button",
            "a",
            "input",
            "select",
            "textarea",
            "form",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "table",
            "tr",
            "td",
            "th",
            "img",
            "dialog",
            "menu",
        }

        if tag in semantic_tags:
            return True

        return bool(
            element.get("role")
            or element.get("data-agent-id")
            or element.get("data-agent-role")
            or element.get("aria-label")
        )

    def _generate_unique_id(
        self, role: str, label: str, element: Tag
    ) -> SemanticId:
        if agent_id := element.get("data-agent-id"):
            return SemanticId(str(agent_id))

        if html_id := element.get("id"):
            return SemanticId(str(html_id))

        base_id = SemanticId.generate(role, label)
        base_str = str(base_id)

        self._id_counters[base_str] = self._id_counters.get(base_str, 0) + 1
        count = self._id_counters[base_str]

        if count == 1:
            return base_id
        return SemanticId(f"{base_str}-{count}")

    def _run_certification_checks(self, root: SemanticNode) -> AgentCertification:
        checks: list[Check] = []
        failures: list[Failure] = []

        all_nodes = [root] + root.descendants()

        # Check 1: Interactive elements have accessible names
        no_name = [n.id for n in all_nodes if n.is_interactive() and not n.a11y.name]
        has_accessible_names = len(no_name) == 0
        checks.append(
            Check(
                id="accessible-names",
                name="All interactive elements have accessible names",
                passed=has_accessible_names,
            )
        )
        if not has_accessible_names:
            failures.append(
                Failure(
                    id="accessible-names",
                    name="Missing accessible names",
                    message=f"{len(no_name)} interactive elements lack accessible names",
                    severity=Severity.ERROR,
                    affected_nodes=no_name,
                )
            )

        # Check 2: Page has landmarks
        landmark_count = sum(1 for n in all_nodes if n.is_landmark())
        has_landmarks = landmark_count > 0
        checks.append(
            Check(id="has-landmarks", name="Page has landmark regions", passed=has_landmarks)
        )
        if not has_landmarks:
            failures.append(
                Failure(
                    id="has-landmarks",
                    name="No landmarks",
                    message="Page should have at least one landmark region",
                    severity=Severity.WARNING,
                )
            )

        # Check 3: Buttons have intents
        buttons = [n for n in all_nodes if n.role == "button"]
        buttons_no_intent = [n.id for n in buttons if n.intent is None]
        buttons_have_intents = len(buttons_no_intent) <= len(buttons) // 2
        checks.append(
            Check(
                id="button-intents",
                name="Most buttons have semantic intents",
                passed=buttons_have_intents,
            )
        )
        if not buttons_have_intents:
            failures.append(
                Failure(
                    id="button-intents",
                    name="Buttons missing intents",
                    message=f"{len(buttons_no_intent)} buttons lack semantic intents",
                    severity=Severity.INFO,
                    affected_nodes=buttons_no_intent,
                )
            )

        # Check 4: Valid heading hierarchy
        heading_levels = sorted(
            [n.a11y.level for n in all_nodes if n.role == "heading" and n.a11y.level]
        )
        valid_heading_hierarchy = True
        for i in range(1, len(heading_levels)):
            if heading_levels[i] - heading_levels[i - 1] > 1:
                valid_heading_hierarchy = False
                break
        checks.append(
            Check(
                id="heading-hierarchy",
                name="Valid heading hierarchy",
                passed=valid_heading_hierarchy,
            )
        )
        if not valid_heading_hierarchy:
            failures.append(
                Failure(
                    id="heading-hierarchy",
                    name="Invalid heading hierarchy",
                    message="Heading levels should not skip",
                    severity=Severity.WARNING,
                )
            )

        # Check 5: Form inputs have labels
        form_roles = {"textbox", "searchbox", "listbox", "combobox"}
        inputs_no_label = [n.id for n in all_nodes if n.role in form_roles and not n.label]
        forms_have_labels = len(inputs_no_label) == 0
        checks.append(
            Check(id="form-labels", name="Form inputs have labels", passed=forms_have_labels)
        )
        if not forms_have_labels:
            failures.append(
                Failure(
                    id="form-labels",
                    name="Form inputs missing labels",
                    message=f"{len(inputs_no_label)} form inputs lack labels",
                    severity=Severity.ERROR,
                    affected_nodes=inputs_no_label,
                )
            )

        # Calculate score
        passed_count = sum(1 for c in checks if c.passed)
        base_score = (passed_count * 100 // len(checks)) if checks else 0

        deductions = sum(
            {
                Severity.CRITICAL: 25,
                Severity.ERROR: 15,
                Severity.WARNING: 5,
                Severity.INFO: 0,
            }[f.severity]
            for f in failures
        )

        score = max(0, base_score - deductions)
        level = CertificationLevel.from_score(score)

        return AgentCertification(
            level=level, score=score, checks=checks, failures=failures
        )
