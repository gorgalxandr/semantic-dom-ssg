# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
