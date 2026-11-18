# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-18

A correctness and security release across all three implementations. IDs,
scores and some defaults change; read **Changed** before upgrading.

### Fixed

- **TypeScript CLI crashed on almost any real page** (`CSS is not defined`): the
  selector builder relied on a browser-only global. Selectors are now built with
  a bundled escaper and are verified to resolve.
- **IDs were random on every parse** (TypeScript), so stored IDs and state never
  survived a re-parse. IDs are now derived from element structure and stay
  stable across parses and unrelated DOM changes.
- **A second `parse()` emptied earlier documents** (TypeScript): documents shared
  one index with the parser instance. Each document now owns its index.
- **`useSemanticDocument` re-rendered forever** with default arguments; hooks no
  longer rebuild the parser for inline config objects; `useSemanticObserver`
  now actually observes ARIA attributes and debounces.
- **ESLint plugin**: `semantic-intent` threw on every report (missing
  `hasSuggestions`); `require-accessible-name` flagged every
  `<button>Text</button>`; rules treated `<Button>` components as DOM elements.
- **Rust panicked on non-ASCII text** (byte-sliced UTF-8) and on unreadable input.
- **Duplicate HTML ids silently dropped elements** (Rust, Python); elements
  matching two selectors were indexed twice; `exclude_tags`, `max_depth`,
  `parent`/`children` were never applied.
- MCP `createResource` threw for documents without an absolute URL; `toJSON`
  could fail on live pages (circular DOM references); navigation `next`/`previous`
  returned null when the current node did not match the filter; `VERSION`
  constants reported 0.1.0; `validate --level` was ignored; state graphs were
  non-deterministic for text inputs and unusable for checkboxes.
- Certification no longer awards a "standard" grade to an empty page, and checks
  that could never fail (hard-coded passes, fallback labels counted as names) now work.

### Security

- Values of password, hidden, payment and one-time-code fields are never emitted.
- Page text can no longer forge lines in agent summaries: labels are reduced to
  a single line, control/bidi/zero-width characters are stripped, lengths capped.
- `javascript:`, `data:`, `vbscript:` and `blob:` link targets are dropped;
  credentials are stripped from URLs; URL length is enforced.
- Input limits are enforced while reading (stdin is no longer buffered unbounded)
  and measured in bytes; node, depth and nesting limits bound hostile documents.
- MCP tool arguments are validated; prompts fence page content as untrusted data.
- `data-semantic-*` metadata can no longer set prototype keys.
- Lockfile is now committed; CI runs tests, lint and dependency audits.

### Added

- `semantic-dom mcp <file>`: a working MCP server over stdio, plus
  `createMCPServer`, `getPrompt`, and `semantic_find` / `semantic_summary` tools.
- `semantic-dom tokens`, `--url`, `--max-nodes`; `data-semantic-id`;
  `maxNodes`, `maxLabelLength`, `redactSensitiveValues` options; `truncated`
  flag; `target` / `meetsTarget` on certifications.
- ESLint flat configs (`flat/recommended`, `flat/strict`, `flat/agent-ready`).
- Roles for search, switch, combobox, searchbox, spinbutton, audio and video;
  link/media targets in `metadata.href` / `metadata.src`.
- Rust: `from_reader`, `from_file`, `from_bytes`. Python: `py.typed`,
  `python -m semantic_dom_ssg`, bytes input.

### Changed

- **Node.js 22.13+** is required (18 and 20 are end-of-life); React 18+; ESLint 9+.
- **ID format changed** in every implementation; IDs stored from 0.2 will not match.
- **Certification scores can differ** from 0.2.
- Buttons with no recognisable purpose get intent `action` (was `toggle`).
- TypeScript CLI: importing `semantic-dom-ssg/cli` no longer runs the CLI;
  the CommonJS `./cli` export (which never existed on disk) is removed.
- Rust MSRV is 1.88; CLI input errors exit 3. Python CLI usage/input errors exit 2.
- `chalk` removed; `@toon-format/toon` 4.x; all dev tooling updated.

## [0.2.0] - 2026-01-16

### Added

- **Agent Summary Format**: Ultra token-efficient plain text format (~100 tokens vs ~800 for JSON)
  - `toAgentSummary()` - Full summary with landmarks and actions
  - `toOneLiner()` - Single line summary (~20 tokens)
  - `toNavSummary()` - Navigation-focused summary
  - `toAudioSummary()` - Audio/media-focused summary
  - `compareTokenUsage()` - Compare token usage between formats
- **CLI Summary Formats**: New `--format summary` and `--format oneline` options
- **Completeness-Based Scoring**: Badge scoring now based on actual content quality
  - Weighted categories: Structure (30%), A11y (30%), Navigation (25%), Interop (15%)
  - Content completeness bonuses for labels, selectors, intents, and a11y names

### Changed

- **Improved Certification Scoring**: More meaningful scores based on completeness rather than just check counts

### Security

- **JSDOM Hardening**: Disabled script execution and external resource loading
- **Input Size Limits**: 10MB maximum input size to prevent DoS attacks
- **URL Validation**: Only `https:`, `http:`, `file:` protocols allowed
- **Content-Type Enforcement**: HTML parsing mode explicitly set

### Fixed

- JSDOM now runs with secure defaults (no script execution)
- File size validation prevents memory exhaustion attacks

## [0.1.0] - 2026-01-15

### Added

- Initial release
- Core SemanticDOM parsing with O(1) lookup
- Semantic State Graph (SSG) for UI state management
- TOON format serialization (40-50% token savings)
- React hooks: `useSemanticDocument`, `useSemanticQuery`, `useSSG`, etc.
- Vanilla JS API for framework-agnostic usage
- CLI tool for validation and parsing
- ESLint plugin with 6 rules
- MCP (Model Context Protocol) server integration
- Agent certification system with 5 levels

### Standards

- Implements ISO/IEC-SDOM-SSG-DRAFT-2024
- Built on WAI-ARIA 1.2 and WCAG 2.1
