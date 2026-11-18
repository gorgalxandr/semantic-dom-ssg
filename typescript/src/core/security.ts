/**
 * Security helpers: every string that leaves the parser passes through here.
 *
 * Page content is untrusted. Labels end up in line-oriented summaries and LLM
 * prompts, URLs end up in resource identifiers, and attribute names end up as
 * object keys, so each of those is normalised before it is stored.
 */

import { LIMITS } from './constants.js';

/** Protocols allowed for a document URL */
const DOCUMENT_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'http:', 'file:']);

/** Protocols allowed for link and media targets */
const TARGET_PROTOCOLS: ReadonlySet<string> = new Set(['https:', 'http:', 'mailto:', 'tel:']);

// C0/C1 controls and DEL, minus the whitespace handled by collapsing.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Zero-width and bidirectional formatting characters used for text spoofing.
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Normalise untrusted text to a single line: control and invisible characters
 * are removed, whitespace runs collapse to one space and the result is capped
 * at `maxLength` characters without splitting a surrogate pair.
 */
export function cleanText(value: string | null | undefined, maxLength: number): string {
  if (!value) return '';

  const limit = Math.max(1, Math.min(maxLength, LIMITS.maxLabelLength));
  // Bound the work done on enormous text nodes before running the regexes.
  const head = value.length > limit * 8 ? value.slice(0, limit * 8) : value;
  const text = head
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();

  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return chars.slice(0, limit - 1).join('').trimEnd() + '…';
}

function looksRelative(url: string): boolean {
  return (
    (url.startsWith('/') && !url.startsWith('//')) ||
    url.startsWith('./') ||
    url.startsWith('../') ||
    url.startsWith('#') ||
    url.startsWith('?')
  );
}

function sanitizeWithProtocols(url: unknown, allowed: ReadonlySet<string>): string {
  if (typeof url !== 'string') return '';

  const trimmed = url.replace(CONTROL_CHARS, '').trim();
  if (!trimmed || trimmed.length > LIMITS.maxUrlLength) return '';
  if (looksRelative(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Not absolute: accept only plain path-like strings such as "docs/page.html".
    return /^[\w\-./]+$/.test(trimmed) ? trimmed : '';
  }

  if (!allowed.has(parsed.protocol)) return '';

  // Never carry credentials into output that is handed to an agent.
  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
  }

  return parsed.href;
}

/**
 * Validate a document URL. Returns the normalised URL with credentials
 * removed, or an empty string when the protocol is not http(s)/file.
 */
export function sanitizeUrl(url: unknown): string {
  return sanitizeWithProtocols(url, DOCUMENT_PROTOCOLS);
}

/**
 * Validate a link or media target. `javascript:`, `data:`, `vbscript:` and
 * `blob:` targets are dropped; relative, http(s), mailto and tel are kept.
 */
export function sanitizeTarget(url: unknown): string {
  return sanitizeWithProtocols(url, TARGET_PROTOCOLS);
}

/** True when a string can safely be used as a key on a plain object */
export function isSafeKey(key: string): boolean {
  return key.length > 0 && key.length <= 64 && !UNSAFE_KEYS.has(key);
}

/**
 * Escape a string for use as a CSS identifier.
 * Follows the CSSOM `CSS.escape` algorithm, which is not available in Node.
 */
export function cssEscape(value: string): string {
  const str = String(value);
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const char = str.charAt(i);

    if (code === 0) {
      result += '\uFFFD';
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && str.charCodeAt(0) === 0x2d)
    ) {
      result += `\\${code.toString(16)} `;
    } else if (i === 0 && str.length === 1 && code === 0x2d) {
      result += `\\${char}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      result += char;
    } else {
      result += `\\${char}`;
    }
  }

  return result;
}
