"""Tests for the command line interface and packaging metadata."""

import io
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import ClassVar

import pytest

import semantic_dom_ssg
from semantic_dom_ssg import Config, InputTooLargeError
from semantic_dom_ssg.cli import main, read_input

GOOD = """<html><head><title>Café 日本</title></head><body>
<nav><a href="/">Home</a></nav><main><h1>Title</h1><button>Click</button></main></body></html>"""
POOR = "<p>nothing</p>"


@pytest.fixture
def good(tmp_path: Path) -> str:
    path = tmp_path / "good.html"
    path.write_text(GOOD, encoding="utf-8")
    return str(path)


@pytest.fixture
def poor(tmp_path: Path) -> str:
    path = tmp_path / "poor.html"
    path.write_text(POOR, encoding="utf-8")
    return str(path)


class FakeStdin:
    def __init__(self, data: bytes):
        self.buffer = io.BytesIO(data)


class TestParseCommand:
    def test_json_is_default(self, good, capsys):
        assert main(["parse", good]) == 0
        captured = capsys.readouterr()
        data = json.loads(captured.out)
        assert data["title"] == "Café 日本"
        assert captured.err == ""

    @pytest.mark.parametrize(
        ("fmt", "expected"),
        [
            ("summary", "STATS: 2L 2A 1H"),
            ("oneline", "| 2L 2A | nav,main | lnk:Home,btn:Click"),
            ("nav", "  Home -> /"),
            ("audio", "2 landmark regions"),
        ],
    )
    def test_formats(self, good, capsys, fmt, expected):
        assert main(["parse", good, "--format", fmt]) == 0
        assert expected in capsys.readouterr().out

    def test_stdin(self, monkeypatch, capsys):
        monkeypatch.setattr(sys, "stdin", FakeStdin(GOOD.encode("utf-8")))
        assert main(["parse", "-", "-f", "oneline"]) == 0
        assert capsys.readouterr().out.startswith("Café 日本 | ")

    def test_utf8_bom_is_skipped(self, tmp_path, capsys):
        path = tmp_path / "bom.html"
        path.write_bytes(b"\xef\xbb\xbf<title>T</title>")
        assert main(["parse", str(path), "-f", "oneline"]) == 0
        assert capsys.readouterr().out.startswith("T | ")


class TestValidateCommand:
    def test_passing_document(self, good, capsys):
        assert main(["validate", good, "--level", "aaa", "--ci"]) == 0
        out = capsys.readouterr().out
        assert "Level: Level AAA (Score: 100)" in out
        assert "Checks: 13/13 passed" in out
        assert "Meets Level AAA requirements" in out
        assert "Failed checks" not in out

    def test_ci_failure_exits_1(self, poor, capsys):
        assert main(["validate", poor, "--level", "aa", "--ci"]) == 1
        out = capsys.readouterr().out
        assert "Does not meet Level AA requirements" in out
        assert "STRUCT-001 - Found 0 landmarks" in out

    def test_failure_without_ci_exits_0(self, poor, capsys):
        assert main(["validate", poor, "--level", "aaa"]) == 0
        assert "Does not meet" in capsys.readouterr().out

    def test_level_is_case_insensitive_and_defaults_to_a(self, good, capsys):
        assert main(["validate", good, "-l", "AA", "--ci"]) == 0
        assert main(["validate", good, "--ci"]) == 0
        assert "Meets Level A requirements" in capsys.readouterr().out


class TestTokensCommand:
    def test_tokens(self, good, capsys):
        assert main(["tokens", good]) == 0
        out = capsys.readouterr().out
        assert "Token Usage Comparison" in out
        assert re.search(r"^JSON\s+\d+\s+\(baseline\)$", out, re.MULTILINE)
        assert re.search(r"^Summary\s+\d+\s+\d+\.\d%$", out, re.MULTILINE)


class TestUsageAndErrors:
    def test_version(self, capsys):
        assert main(["--version"]) == 0
        assert capsys.readouterr().out.strip() == f"semantic-dom {semantic_dom_ssg.__version__}"

    def test_help(self, capsys):
        assert main(["--help"]) == 0
        assert "validate" in capsys.readouterr().out

    def test_no_command_is_a_usage_error(self, capsys):
        """0.2.0 printed help and exited 0, so a broken CI invocation passed."""
        assert main([]) == 2
        captured = capsys.readouterr()
        assert captured.out == "" and "usage:" in captured.err

    @pytest.mark.parametrize(
        "argv",
        [
            ["bogus"],
            ["parse"],
            ["parse", "x.html", "--format", "yaml"],
            ["validate", "x.html", "--level", "aaaa"],
            ["parse", "x.html", "--unknown"],
        ],
    )
    def test_invalid_arguments(self, argv, capsys):
        assert main(argv) == 2
        captured = capsys.readouterr()
        assert captured.out == "" and "error:" in captured.err

    def test_missing_file(self, tmp_path, capsys):
        assert main(["parse", str(tmp_path / "missing.html")]) == 2
        captured = capsys.readouterr()
        assert captured.out == ""
        assert captured.err.startswith("Error: ") and "missing.html" in captured.err
        assert "Traceback" not in captured.err

    def test_directory_as_input(self, tmp_path, capsys):
        assert main(["tokens", str(tmp_path)]) == 2
        assert capsys.readouterr().err.startswith("Error: ")

    def test_invalid_utf8(self, tmp_path, capsys):
        path = tmp_path / "latin1.html"
        path.write_bytes(b"<title>caf\xe9</title>")
        assert main(["parse", str(path)]) == 2
        captured = capsys.readouterr()
        assert captured.out == "" and "utf-8" in captured.err

    def test_oversized_file(self, tmp_path, capsys, monkeypatch):
        monkeypatch.setattr(Config, "default", classmethod(lambda cls: cls(max_input_size=64)))
        path = tmp_path / "big.html"
        path.write_bytes(b"<p>" + b"x" * 100)
        assert main(["parse", str(path)]) == 2
        captured = capsys.readouterr()
        assert captured.out == ""
        assert "Input exceeds maximum size of 64 bytes" in captured.err

    def test_keyboard_interrupt(self, good, capsys, monkeypatch):
        def interrupt(*args, **kwargs):
            raise KeyboardInterrupt

        monkeypatch.setattr("semantic_dom_ssg.cli.SemanticDOM.parse", interrupt)
        assert main(["parse", good]) == 130


class TestReadInput:
    def test_file_read_is_bounded_and_counts_bytes(self, tmp_path):
        path = tmp_path / "two-byte.html"
        path.write_text("é" * 6, encoding="utf-8")  # 6 characters, 12 bytes
        assert read_input(str(path), max_size=12) == "é" * 6
        with pytest.raises(InputTooLargeError) as exc_info:
            read_input(str(path), max_size=11)
        assert exc_info.value.max_size == 11

    def test_stdin_read_is_bounded(self, monkeypatch):
        """0.2.0 read all of stdin as text before any size check."""

        class CountingStream(io.BytesIO):
            requested: ClassVar[list[int]] = []

            def read(self, size: int = -1) -> bytes:
                self.requested.append(size)
                return super().read(size)

        stdin = FakeStdin(b"")
        stdin.buffer = CountingStream(b"x" * 10_000)
        monkeypatch.setattr(sys, "stdin", stdin)
        with pytest.raises(InputTooLargeError) as exc_info:
            read_input("-", max_size=100)
        assert CountingStream.requested == [101]
        assert stdin.buffer.tell() == 101
        assert exc_info.value.at_least and exc_info.value.actual_size == 101

    def test_stdin_within_limit(self, monkeypatch):
        monkeypatch.setattr(sys, "stdin", FakeStdin(b"<p>ok</p>"))
        assert read_input("-", max_size=9) == "<p>ok</p>"


class TestSubprocess:
    """End-to-end runs through a real interpreter and real pipes."""

    def run(self, *argv: str, stdin: bytes = b"", env_extra: dict | None = None):
        import os

        env = {**os.environ, **(env_extra or {})}
        return subprocess.run(
            [sys.executable, "-m", "semantic_dom_ssg", *argv],
            input=stdin,
            capture_output=True,
            env=env,
            timeout=120,
            check=False,
        )

    def test_module_entry_point_with_stdin(self):
        result = self.run("parse", "-", "-f", "summary", stdin=GOOD.encode("utf-8"))
        assert result.returncode == 0, result.stderr
        assert result.stdout.decode("utf-8").splitlines()[0] == "PAGE: Café 日本"

    def test_ascii_console_does_not_crash(self):
        """Badges and page text must not raise UnicodeEncodeError on a non-UTF-8 console."""
        env = {"PYTHONIOENCODING": "ascii", "PYTHONUTF8": "0"}
        result = self.run("validate", "-", stdin=GOOD.encode("utf-8"), env_extra=env)
        assert result.returncode == 0, result.stderr
        assert b"Level: Level AAA" in result.stdout and result.stdout.isascii()
        result = self.run("parse", "-", "-f", "oneline", stdin=GOOD.encode("utf-8"), env_extra=env)
        assert result.returncode == 0 and result.stdout.startswith(b"Caf\\xe9")

    def test_oversized_stdin_exits_2(self):
        result = self.run("parse", "-", stdin=b"x" * (10 * 1024 * 1024 + 1))
        assert result.returncode == 2
        assert result.stdout == b""
        assert b"Input exceeds maximum size of 10485760 bytes" in result.stderr

    def test_xml_like_input_produces_no_warnings(self):
        xml = b'<?xml version="1.0"?><html><body><button>x</button></body></html>'
        for stdin in (xml, b"https://example.com/not-html"):
            result = self.run("parse", "-", "-f", "oneline", stdin=stdin)
            assert result.returncode == 0 and result.stderr == b""

    def test_usage_error_exit_code(self):
        result = self.run()
        assert result.returncode == 2 and b"usage:" in result.stderr


class TestPackaging:
    ROOT = Path(__file__).resolve().parent.parent

    def test_version(self):
        assert semantic_dom_ssg.__version__ == "0.3.0"
        assert semantic_dom_ssg.STANDARD == "ISO/IEC-SDOM-SSG-DRAFT-2024"

    def test_installed_metadata_matches(self):
        from importlib.metadata import PackageNotFoundError, version

        try:
            installed = version("semantic-dom-ssg")
        except PackageNotFoundError:
            pytest.skip("package is not installed")
        assert installed == semantic_dom_ssg.__version__

    def test_py_typed_marker_exists(self):
        assert (Path(semantic_dom_ssg.__file__).parent / "py.typed").is_file()

    def test_public_api_is_importable(self):
        for name in semantic_dom_ssg.__all__:
            assert hasattr(semantic_dom_ssg, name), name

    def test_source_files_stay_under_500_lines(self):
        for path in [*self.ROOT.glob("semantic_dom_ssg/*.py"), *self.ROOT.glob("tests/*.py")]:
            assert len(path.read_text(encoding="utf-8").splitlines()) <= 500, path.name
