import { describe, expect, it } from 'vitest';
import { cleanText, cssEscape, isSafeKey, sanitizeTarget, sanitizeUrl } from './security.js';

describe('sanitizeUrl', () => {
  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['/relative/path', '/relative/path'],
    ['docs/page.html', 'docs/page.html'],
    ['file:///tmp/x.html', 'file:///tmp/x.html'],
    ['https://user:pw@example.com/', 'https://example.com/'],
  ])('accepts %s', (input, expected) => {
    expect(sanitizeUrl(input)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'vbscript:x',
    'blob:https://example.com/1',
    'mailto:a@b.c',
    'https://example.com/' + 'a'.repeat(3000),
  ])('rejects %s', (input) => {
    expect(sanitizeUrl(input)).toBe('');
  });

  it('rejects non-strings', () => {
    expect(sanitizeUrl(undefined)).toBe('');
    expect(sanitizeUrl({ toString: () => 'https://x.y' })).toBe('');
  });
});

describe('sanitizeTarget', () => {
  it('allows navigation schemes and blocks script schemes', () => {
    expect(sanitizeTarget('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(sanitizeTarget('tel:+123')).toBe('tel:+123');
    expect(sanitizeTarget('#top')).toBe('#top');
    expect(sanitizeTarget('javascript:void(0)')).toBe('');
    expect(sanitizeTarget('file:///etc/passwd')).toBe('');
  });
});

describe('cleanText', () => {
  it('produces a single line', () => {
    expect(cleanText('a\r\nCERT: full\t(100/100)', 100)).toBe('a CERT: full (100/100)');
  });

  it('removes control, zero-width and bidi characters', () => {
    expect(cleanText('ab\u0000c\u200Bd\u202Ee\u0007', 100)).toBe('abcde');
  });

  it('caps length without splitting surrogate pairs', () => {
    const out = cleanText('😀'.repeat(50), 10);
    expect(Array.from(out)).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('handles empty input', () => {
    expect(cleanText(null, 10)).toBe('');
    expect(cleanText('   ', 10)).toBe('');
  });
});

describe('cssEscape', () => {
  it.each([
    ['plain', 'plain'],
    ['1st', '\\31 st'],
    ['-1', '-\\31 '],
    ['-', '\\-'],
    ['a.b#c', 'a\\.b\\#c'],
    ['a"]b', 'a\\"\\]b'],
    ['ünï', 'ünï'],
  ])('escapes %s', (input, expected) => {
    expect(cssEscape(input)).toBe(expected);
  });
});

describe('isSafeKey', () => {
  it('rejects prototype keys', () => {
    expect(isSafeKey('__proto__')).toBe(false);
    expect(isSafeKey('constructor')).toBe(false);
    expect(isSafeKey('')).toBe(false);
    expect(isSafeKey('kind')).toBe(true);
  });
});
