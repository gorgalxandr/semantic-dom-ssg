"""CLI tool for semantic-dom-ssg."""

import argparse
import sys
from typing import Optional

from .certification import AgentCertification, CertificationLevel
from .config import Config
from .parser import SemanticDOM
from .summary import compare_token_usage, to_nav_summary


def main(args: Optional[list[str]] = None) -> int:
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        prog="semantic-dom",
        description="Machine-readable web semantics for AI agents",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Parse command
    parse_parser = subparsers.add_parser("parse", help="Parse HTML and output SemanticDOM")
    parse_parser.add_argument("input", help="Input file (use '-' for stdin)")
    parse_parser.add_argument(
        "-f",
        "--format",
        choices=["json", "summary", "oneline", "nav"],
        default="json",
        help="Output format",
    )

    # Validate command
    validate_parser = subparsers.add_parser(
        "validate", help="Validate HTML for agent compatibility"
    )
    validate_parser.add_argument("input", help="Input file (use '-' for stdin)")
    validate_parser.add_argument(
        "-l",
        "--level",
        choices=["a", "aa", "aaa"],
        default="a",
        help="Minimum certification level",
    )
    validate_parser.add_argument(
        "--ci", action="store_true", help="Exit with error if validation fails"
    )

    # Tokens command
    tokens_parser = subparsers.add_parser(
        "tokens", help="Compare token usage between formats"
    )
    tokens_parser.add_argument("input", help="Input file (use '-' for stdin)")

    parsed_args = parser.parse_args(args)

    if not parsed_args.command:
        parser.print_help()
        return 0

    try:
        if parsed_args.command == "parse":
            return cmd_parse(parsed_args)
        elif parsed_args.command == "validate":
            return cmd_validate(parsed_args)
        elif parsed_args.command == "tokens":
            return cmd_tokens(parsed_args)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    return 0


def cmd_parse(args: argparse.Namespace) -> int:
    """Handle parse command."""
    html = read_input(args.input)
    config = Config.default()

    sdom = SemanticDOM.parse(html, config)

    if args.format == "json":
        print(sdom.to_json())
    elif args.format == "summary":
        print(sdom.to_agent_summary())
    elif args.format == "oneline":
        print(sdom.to_one_liner())
    elif args.format == "nav":
        print(to_nav_summary(sdom))

    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Handle validate command."""
    html = read_input(args.input)
    config = Config.default()

    sdom = SemanticDOM.parse(html, config)
    cert = AgentCertification.certify(sdom)

    # Print certification results
    print(f"{cert.level.badge} SemanticDOM Certification")
    print(f"Level: {cert.level.name_str} (Score: {cert.score})")
    print()
    print("Statistics:")
    print(f"  Landmarks: {cert.stats.landmark_count}")
    print(f"  Interactables: {cert.stats.interactable_count}")
    print(f"  Headings: {cert.stats.heading_count}")
    print(f"  Completeness: {cert.stats.completeness * 100:.1f}%")
    print()
    print(f"Checks: {cert.stats.passed_checks}/{cert.stats.total_checks} passed")
    print()

    # Print failed checks
    failed = [c for c in cert.checks if not c.passed]
    if failed:
        print("Failed checks:")
        for check in failed:
            detail = check.details or check.name
            print(f"  ❌ {check.id} - {detail}")
        print()

    # Check against required level
    level_map = {
        "a": CertificationLevel.A,
        "aa": CertificationLevel.AA,
        "aaa": CertificationLevel.AAA,
    }
    required = level_map[args.level]

    if cert.level >= required:
        print(f"✓ Meets {required.name_str} requirements")
        return 0
    else:
        print(f"✗ Does not meet {required.name_str} requirements")
        if args.ci:
            return 1
        return 0


def cmd_tokens(args: argparse.Namespace) -> int:
    """Handle tokens command."""
    html = read_input(args.input)
    config = Config.default()

    sdom = SemanticDOM.parse(html, config)
    comparison = compare_token_usage(sdom)

    print("Token Usage Comparison")
    print("======================")
    print()
    print("Format          Tokens    Reduction")
    print("------          ------    ---------")
    print(f"JSON            {comparison.json_tokens:>6}    (baseline)")
    print(f"Summary         {comparison.summary_tokens:>6}    {comparison.summary_reduction:>5.1f}%")
    print(f"One-liner       {comparison.one_liner_tokens:>6}    {comparison.one_liner_reduction:>5.1f}%")

    return 0


def read_input(path: str) -> str:
    """Read input from file or stdin."""
    if path == "-":
        return sys.stdin.read()
    else:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()


if __name__ == "__main__":
    sys.exit(main())
