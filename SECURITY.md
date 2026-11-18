# Security Policy

## Overview

semantic-dom-ssg processes untrusted HTML input and must be hardened against various attack vectors. This document describes the security measures implemented and guidelines for contributors.

## Threat Model

### Inputs
- **HTML files**: May contain malicious scripts, external resource references, or malformed content
- **URLs**: May use dangerous protocols (javascript:, data:, etc.)
- **Stdin**: May contain oversized input for DoS

### Attackers
- Malicious websites providing crafted HTML
- Untrusted user-submitted content
- CI/CD pipelines processing unknown files

## Implemented Security Measures

### 1. JSDOM Hardening

**Location**: `src/cli/index.ts`

```typescript
const dom = new JSDOM(html, {
  // SECURITY: Scripts are disabled by default (no runScripts option)
  // SECURITY: External resources are not loaded by default (no resources option)
  // SECURITY: Content type forces HTML parsing (no sniffing)
  contentType: 'text/html',
});
```

**Rationale**:
- `runScripts` is NOT set, defaulting to disabled (scripts in HTML are not executed)
- `resources` is NOT set, defaulting to not loading external resources
- `contentType` is explicitly set to prevent MIME sniffing attacks

**Testing**:
```bash
# Test: Scripts should not execute
echo '<script>process.exit(1)</script><div>test</div>' | npx semantic-dom parse -

# Test: External resources should not load
echo '<img src="https://evil.com/track.gif"/>' | npx semantic-dom parse -
```

### 2. Input Size Limits

**Location**: `src/cli/index.ts`

```typescript
const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB

async function readInput(file: string): Promise<string> {
  // SECURITY: Check file size before reading
  const stats = await fs.stat(file);
  if (stats.size > MAX_INPUT_SIZE) {
    throw new Error(`Input file exceeds maximum size`);
  }
  // ...
}
```

**Rationale**:
- Prevents memory exhaustion attacks
- 10MB is sufficient for any legitimate HTML document
- Both file size and content length are validated

**Testing**:
```bash
# Test: Large file should be rejected
dd if=/dev/zero bs=1M count=15 | npx semantic-dom parse -
# Expected: Error about maximum size
```

### 3. URL Validation

**Location**: `src/core/semantic-dom.ts`

```typescript
const ALLOWED_URL_PROTOCOLS = ['https:', 'http:', 'file:'];

function validateAndSanitizeUrl(url: string): string {
  // Only allow safe protocols
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    console.warn(`Blocked URL with disallowed protocol`);
    return '';
  }
  // ...
}
```

**Blocked Protocols**:
- `javascript:` - Script execution
- `data:` - Data embedding (can contain scripts)
- `vbscript:` - VBScript execution
- `blob:` - Blob URLs
- Custom protocols

**Rationale**:
- Prevents URL-based script injection
- Only allows protocols with well-understood security models

**Testing**:
```typescript
// These should be blocked
validateAndSanitizeUrl('javascript:alert(1)'); // Returns ''
validateAndSanitizeUrl('data:text/html,<script>alert(1)</script>'); // Returns ''

// These should be allowed
validateAndSanitizeUrl('https://example.com'); // Returns URL
validateAndSanitizeUrl('/path/to/file'); // Returns path
```

### 4. Selector Escaping

**Location**: `typescript/src/core/security.ts`, `typescript/src/core/selectors.ts`

Element ids are escaped with `cssEscape`, an implementation of the CSSOM
`CSS.escape` algorithm bundled with the package (the browser global does not
exist in Node.js). Selectors use ids and `:nth-of-type` positions only, never
class names, and tests assert that every generated selector resolves back to
its element.

### 5. JSON Parsing Safety

**Location**: `src/core/semantic-dom.ts`

```typescript
private extractMetadata(element: Element): Record<string, unknown> | undefined {
  // ...
  try {
    metadata[key] = JSON.parse(attr.value);
  } catch {
    metadata[key] = attr.value;
  }
  // ...
}
```

**Rationale**:
- `JSON.parse()` does not execute code
- Errors are caught and raw string is used as fallback
- No `eval()` or `Function()` anywhere in codebase

### 6. Output Encoding

All output formats properly encode data:
- **JSON**: Uses `JSON.stringify()` with proper escaping
- **TOON**: Uses `@toon-format/toon` encoder
- **Summary**: Plain text, no HTML/script injection risk

### 7. Secret Redaction (0.3.0)

Values of `type="password"` and `type="hidden"` inputs, and of fields whose
`autocomplete` marks them as passwords, one-time codes or payment data, are
never written to a document. The TypeScript option `redactSensitiveValues:
false` turns this off for output that never leaves the page.

### 8. Untrusted Text in Summaries (0.3.0)

Labels, names and titles are reduced to one line, stripped of control,
zero-width and bidirectional characters, and length-capped at parse time and
again when a summary is rendered. Page text therefore cannot add a line (for
example a forged `CERT:` header) or a column to an agent summary.

This does not make page text trustworthy. A label can still *say* anything, so
consumers must present summaries to a model as data, not instructions. The MCP
prompts do this by fencing the summary and saying so.

### 9. Link Targets and Credentials (0.3.0)

`javascript:`, `data:`, `vbscript:` and `blob:` targets are dropped. User names
and passwords are removed from every URL that is emitted. URLs longer than 2048
characters are rejected.

### 10. Resource Limits (0.3.0)

| Limit | Default | Ceiling |
|-------|---------|---------|
| Input size | 10MB, enforced while reading | - |
| Tree depth (`maxDepth`) | 50 | 512 |
| Nodes (`maxNodes`, TypeScript) | 50,000 | 1,000,000 |
| HTML nesting (Rust) | 512, then an error | - |
| MCP message | 1MB | - |

A document cut short by a limit is flagged `truncated`.

### 11. MCP Server (0.3.0)

Tool arguments are type- and length-checked, unknown resources are refused,
internal error details are not returned to the client, and nothing but protocol
messages is written to stdout. The server reads one local file; it does not
fetch URLs.

## Security Checklist for Contributors

### Code Review

- [ ] No `eval()`, `Function()`, or `new Function()`
- [ ] No `innerHTML` or `outerHTML` assignment
- [ ] No `document.write()`
- [ ] All user input validated before use
- [ ] URLs validated against allow-list
- [ ] File sizes checked before reading
- [ ] External dependencies audited

### JSDOM Usage

- [ ] Never set `runScripts: 'dangerously'`
- [ ] Never set `resources: 'usable'` for untrusted input
- [ ] Always set explicit `contentType`

### Dependencies

Run security audit before release:
```bash
npm audit
npm audit fix
```

## Reporting Vulnerabilities

Please report security vulnerabilities privately via:
- Email: security@consltr.com
- GitHub Security Advisories (preferred)

Do NOT open public issues for security vulnerabilities.

## Security Testing

### Automated Tests

```bash
# Run security-focused tests
npm test -- --grep "security"

# Check for known vulnerabilities in dependencies
npm audit

# Static analysis
npx eslint src --rule 'no-eval: error'
```

### Manual Testing

1. **Script Injection**
```bash
echo '<script>require("child_process").exec("whoami")</script>' | npx semantic-dom parse -
# Script should NOT execute
```

2. **XXE Prevention** (JSDOM handles this)
```bash
cat << 'EOF' | npx semantic-dom parse -
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<div>&xxe;</div>
EOF
# External entity should NOT be loaded
```

3. **Prototype Pollution**
```typescript
// Ensure metadata parsing doesn't allow __proto__ pollution
const malicious = { '__proto__': { admin: true } };
// Should not pollute Object.prototype
```

## Version History

| Version | Security Changes |
|---------|------------------|
| 0.3.0 | Secret redaction, summary line-injection fix, link target and credential filtering, bounded reads, node/depth limits, MCP argument validation, committed lockfile and CI audits |
| 0.2.0 | Added JSDOM hardening, input size limits, URL validation |
| 0.1.0 | Initial release |

## References

- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [JSDOM Security](https://github.com/jsdom/jsdom#executing-scripts)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
