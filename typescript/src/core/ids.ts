/**
 * Deterministic semantic ID generation
 */

import type { SemanticId, SemanticRole } from './types.js';

/**
 * cyrb53: a fast 53-bit non-cryptographic string hash.
 * Used only to derive stable identifiers, never for security decisions.
 */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Reduce arbitrary text to characters that are safe inside an ID */
export function slugify(value: string, maxLength = 48): string {
  return value
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}

function withPrefix(prefix: string, rest: string): SemanticId {
  const safePrefix = slugify(prefix, 24);
  return safePrefix ? `sdom-${safePrefix}-${rest}` : `sdom-${rest}`;
}

/**
 * Build an ID from a role and a stable structural key (for example an XPath).
 * The same key always produces the same ID, so IDs survive re-parsing.
 */
export function stableSemanticId(prefix: string, role: SemanticRole, key: string): SemanticId {
  return withPrefix(prefix, `${role}-${hashString(key)}`);
}

/** Build an ID from an author-supplied name (`data-semantic-id` or `id`) */
export function namedSemanticId(prefix: string, name: string): SemanticId | undefined {
  const slug = slugify(name);
  return slug ? withPrefix(prefix, slug) : undefined;
}

/**
 * Generate a semantic ID from a role and position.
 *
 * Deterministic: identical arguments return an identical ID. Earlier releases
 * appended a random suffix, which made IDs change on every parse.
 *
 * @deprecated The parser now uses {@link stableSemanticId}; this remains for
 * callers that build IDs by hand.
 */
export function generateSemanticId(
  prefix: string,
  role: SemanticRole,
  index: number,
  seed = ''
): SemanticId {
  const hash = hashString(`${prefix}|${role}|${index}|${seed}`).slice(0, 6);
  return withPrefix(prefix, `${role}-${index}-${hash}`);
}
