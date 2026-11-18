"""CLI tool for semantic-dom-ssg.

Exit codes:
    0  success
    1  ``validate --ci``: the document does not meet the required level
    2  usage error, unreadable input, input too large or not valid UTF-8
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import warnings
from collections.abc import Callable

from bs4 import MarkupResemblesLocatorWarning, XMLParsedAsHTMLWarning

from . import __version__
from .certification import AgentCertification, CertificationLevel
from .config import Config
from .parser import SemanticDOM
from .security import DEFAULT_MAX_INPUT_SIZE, InputTooLargeError, SecurityError
from .summary import compare_token_usage, to_audio_summary, to_nav_summary

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_ERROR = 2

_LEVELS = {
    "a": CertificationLevel.A,
    "aa": CertificationLevel.AA,
    "aaa": CertificationLevel.AAA,
}
_FORMATS: dict[str, Callable[[SemanticDOM], str]] = {
    "json": lambda sdom: sdom.to_json(),
    "summary": lambda sdom: sdom.to_agent_summary(),
    "oneline": lambda sdom: sdom.to_one_liner(),
    "nav": to_nav_summary,
    "audio": to_audio_summary,
}


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser."""
    parser = argparse.ArgumentParser(
        prog="semantic-dom",
        description="Machine-readable web semantics for AI agents",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", metavar="COMMAND", required=True)

    parse_parser = subparsers.add_parser("parse", help="Parse HTML and output SemanticDOM")
    parse_parser.add_argument("input", help="Input file (use '-' for stdin)")
    parse_parser.add_argument(
        "-f",
        "--format",
        choices=sorted(_FORMATS),
        default="json",
        help="Output format (default: json)",
    )
    parse_parser.set_defaults(handler=cmd_parse)

    validate_parser = subparsers.add_parser(
        "validate", help="Validate HTML for agent compatibility"
    )
    validate_parser.add_argument("input", help="Input file (use '-' for stdin)")
    validate_parser.add_argument(
        "-l",
        "--level",
        type=str.lower,
        choices=sorted(_LEVELS),
        default="a",
        help="Minimum certification level (default: a)",
    )
    validate_parser.add_argument(
        "--ci", action="store_true", help="Exit with status 1 if the level is not met"
    )
    validate_parser.set_defaults(handler=cmd_validate)

    tokens_parser = subparsers.add_parser("tokens", help="Compare token usage between formats")
    tokens_parser.add_argument("input", help="Input file (use '-' for stdin)")
    tokens_parser.set_defaults(handler=cmd_tokens)

    return parser


def main(args: list[str] | None = None) -> int:
    """Main entry point for CLI. Returns the process exit code."""
    parser = build_parser()
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit as exc:  # argparse: --help/--version (0) or usage error (2)
        return exc.code if isinstance(exc.code, int) else EXIT_ERROR

    _make_streams_safe()
    # Input is always treated as HTML text; bs4's "looks like XML / a file name"
    # hints are noise on stderr here.
    for category in (XMLParsedAsHTMLWarning, MarkupResemblesLocatorWarning):
        warnings.filterwarnings("ignore", category=category)
    try:
        handler: Callable[[argparse.Namespace], int] = parsed_args.handler
        code = handler(parsed_args)
        sys.stdout.flush()
        return code
    except BrokenPipeError:
        # The reader went away (e.g. `| head`); avoid a second error at shutdown.
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except (OSError, ValueError):
            pass
        return EXIT_OK
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except (OSError, SecurityError, UnicodeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return EXIT_ERROR


def _make_streams_safe() -> None:
    """Never crash on a console that cannot encode a character (e.g. cp1252)."""
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            try:
                stream.reconfigure(errors="backslashreplace")
            except (OSError, ValueError):
                pass


def _load(args: argparse.Namespace) -> SemanticDOM:
    config = Config.default()
    return SemanticDOM.parse(read_input(args.input, config.max_input_size), config)


def cmd_parse(args: argparse.Namespace) -> int:
    """Handle parse command."""
    print(_FORMATS[args.format](_load(args)))
    return EXIT_OK


def cmd_validate(args: argparse.Namespace) -> int:
    """Handle validate command."""
    cert = AgentCertification.certify(_load(args))

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

    failed = [c for c in cert.checks if not c.passed]
    if failed:
        print("Failed checks:")
        for check in failed:
            print(f"  \N{CROSS MARK} {check.id} - {check.details or check.name}")
        print()

    required = _LEVELS[args.level]
    if cert.level >= required:
        print(f"\N{CHECK MARK} Meets {required.name_str} requirements")
        return EXIT_OK
    print(f"\N{BALLOT X} Does not meet {required.name_str} requirements")
    return EXIT_FAILED if args.ci else EXIT_OK


def cmd_tokens(args: argparse.Namespace) -> int:
    """Handle tokens command."""
    comparison = compare_token_usage(_load(args))

    print("Token Usage Comparison")
    print("======================")
    print()
    print("Format          Tokens    Reduction")
    print("------          ------    ---------")
    print(f"JSON            {comparison.json_tokens:>6}    (baseline)")
    print(
        f"Summary         {comparison.summary_tokens:>6}    {comparison.summary_reduction:>5.1f}%"
    )
    print(
        f"One-liner       {comparison.one_liner_tokens:>6}    "
        f"{comparison.one_liner_reduction:>5.1f}%"
    )
    return EXIT_OK


def read_input(path: str, max_size: int = DEFAULT_MAX_INPUT_SIZE) -> str:
    """Read UTF-8 input from a file or stdin (``-``), reading at most ``max_size`` bytes.

    The read itself is bounded, so oversized input is rejected without being
    loaded into memory.

    Raises:
        InputTooLargeError: If the input is larger than ``max_size`` bytes
        OSError: If the file cannot be read
        UnicodeDecodeError: If the input is not valid UTF-8
    """
    if path == "-":
        data = sys.stdin.buffer.read(max_size + 1)
    else:
        with open(path, "rb") as handle:
            data = handle.read(max_size + 1)
    if len(data) > max_size:
        raise InputTooLargeError(max_size, len(data), at_least=True)
    return data.decode("utf-8-sig")


if __name__ == "__main__":
    sys.exit(main())
