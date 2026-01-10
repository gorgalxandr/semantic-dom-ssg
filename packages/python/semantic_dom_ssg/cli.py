"""SemanticDOM CLI."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Optional

from .core.parser import SemanticDOMParser
from .toon.serializer import ToonSerializer


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="semantic-dom",
        description="SemanticDOM & SSG validation and parsing CLI",
    )
    parser.add_argument("--version", action="version", version="0.1.0")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Parse command
    parse_parser = subparsers.add_parser("parse", help="Parse HTML to SemanticDOM")
    parse_parser.add_argument("file", help="HTML file to parse (use - for stdin)")
    parse_parser.add_argument("-o", "--output", help="Output file (default: stdout)")
    parse_parser.add_argument(
        "-f",
        "--format",
        choices=["json", "toon"],
        default="json",
        help="Output format",
    )
    parse_parser.add_argument("-u", "--url", default="file://local", help="Page URL")

    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate HTML for SemanticDOM compliance")
    validate_parser.add_argument("file", help="HTML file to validate (use - for stdin)")
    validate_parser.add_argument(
        "-f",
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format",
    )

    # Stats command
    stats_parser = subparsers.add_parser("stats", help="Show statistics")
    stats_parser.add_argument("file", help="HTML file to analyze (use - for stdin)")
    stats_parser.add_argument(
        "-f",
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format",
    )

    # MCP server command
    subparsers.add_parser("mcp-server", help="Run MCP server over stdio")

    args = parser.parse_args()

    if args.command == "parse":
        cmd_parse(args)
    elif args.command == "validate":
        cmd_validate(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "mcp-server":
        cmd_mcp_server()
    else:
        parser.print_help()
        sys.exit(1)


def read_input(file: str) -> str:
    """Read input from file or stdin."""
    if file == "-":
        return sys.stdin.read()
    with open(file, "r", encoding="utf-8") as f:
        return f.read()


def write_output(output: Optional[str], content: str) -> None:
    """Write output to file or stdout."""
    if output:
        with open(output, "w", encoding="utf-8") as f:
            f.write(content)
    else:
        print(content)


def cmd_parse(args: argparse.Namespace) -> None:
    """Parse HTML to SemanticDOM."""
    try:
        html = read_input(args.file)
        parser = SemanticDOMParser()
        doc = parser.parse(html, args.url)

        if args.format == "toon":
            output = ToonSerializer.serialize(doc)
            savings = ToonSerializer.estimate_token_savings(doc)
            print(
                f"# TOON format: ~{savings.savings_percent}% token savings "
                f"({savings.toon_tokens} vs {savings.json_tokens} tokens)",
                file=sys.stderr,
            )
        else:
            output = ToonSerializer.serialize_json(doc)

        write_output(args.output, output)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_validate(args: argparse.Namespace) -> None:
    """Validate HTML for SemanticDOM compliance."""
    try:
        html = read_input(args.file)
        parser = SemanticDOMParser()
        doc = parser.parse(html, "file://local")

        cert = doc.agent_ready

        if args.format == "json":
            print(
                json.dumps(
                    {
                        "level": cert.level.name.lower(),
                        "score": cert.score,
                        "checks": [
                            {"id": c.id, "name": c.name, "passed": c.passed}
                            for c in cert.checks
                        ],
                        "failures": [
                            {
                                "id": f.id,
                                "name": f.name,
                                "message": f.message,
                                "severity": f.severity.value,
                            }
                            for f in cert.failures
                        ],
                    },
                    indent=2,
                )
            )
        else:
            print("\nSemanticDOM Validation Report")
            print("=" * 50)
            print(f"\nCertification Level: {cert.level.name}")
            print(f"Score: {cert.score}/100\n")

            if cert.checks:
                print("Passed Checks:")
                for check in cert.checks:
                    if check.passed:
                        print(f"  ✓ {check.name}")
                print()

            if cert.failures:
                print("Failed Checks:")
                for failure in cert.failures:
                    print(f"  ✗ {failure.name}")
                    print(f"    [{failure.severity.value}] {failure.message}")
                print()

            print("-" * 50)
            passed = sum(1 for c in cert.checks if c.passed)
            print(f"Total: {passed} passed, {len(cert.failures)} failed")

        # Exit code based on errors
        has_errors = any(
            f.severity.value in ("error", "critical") for f in cert.failures
        )
        sys.exit(1 if has_errors else 0)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_stats(args: argparse.Namespace) -> None:
    """Show statistics about SemanticDOM structure."""
    try:
        html = read_input(args.file)
        parser = SemanticDOMParser()
        doc = parser.parse(html, "file://local")

        stats = {
            "totalNodes": doc.node_count,
            "landmarks": len(doc.landmarks),
            "interactables": len(doc.interactables),
            "stateGraphNodes": len(doc.state_graph),
            "certification": {
                "level": doc.agent_ready.level.name.lower(),
                "score": doc.agent_ready.score,
            },
        }

        if args.format == "json":
            print(json.dumps(stats, indent=2))
        else:
            print("\nSemanticDOM Statistics")
            print("=" * 50)
            print(f"\nTotal nodes: {stats['totalNodes']}")
            print(f"Landmarks: {stats['landmarks']}")
            print(f"Interactables: {stats['interactables']}")
            print(f"State graph nodes: {stats['stateGraphNodes']}")
            print(
                f"Certification: {stats['certification']['level']} "
                f"({stats['certification']['score']}/100)"
            )

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_mcp_server() -> None:
    """Run MCP server over stdio."""
    from .mcp.server import SemanticDOMMCPServer

    server = SemanticDOMMCPServer()
    server.run()


if __name__ == "__main__":
    main()
