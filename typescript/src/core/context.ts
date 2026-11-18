/**
 * Per-parse context: resolved configuration plus document-wide lookups that
 * are built once and reused for every element.
 */

import type { SemanticDOMConfig } from './types.js';
import { DEFAULT_CONFIG, LIMITS } from './constants.js';
import { cleanText } from './security.js';

export type ResolvedConfig = Required<SemanticDOMConfig>;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** Merge user configuration over the defaults and clamp numeric limits */
export function resolveConfig(config: SemanticDOMConfig = {}): ResolvedConfig {
  const merged = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && key in merged) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }

  return {
    ...merged,
    maxDepth: clampInt(merged.maxDepth, DEFAULT_CONFIG.maxDepth, 1, LIMITS.maxDepth),
    maxNodes: clampInt(merged.maxNodes, DEFAULT_CONFIG.maxNodes, 1, LIMITS.maxNodes),
    maxLabelLength: clampInt(
      merged.maxLabelLength,
      DEFAULT_CONFIG.maxLabelLength,
      8,
      LIMITS.maxLabelLength
    ),
    exclude: Array.isArray(merged.exclude) ? merged.exclude : DEFAULT_CONFIG.exclude,
    include: Array.isArray(merged.include) ? merged.include : [],
  };
}

/** Match an element against tag names or CSS selectors; invalid selectors never match */
export function matchesAny(element: Element, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const tagName = element.tagName.toLowerCase();

  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern) continue;
    if (pattern.toLowerCase() === tagName) return true;
    if (/^[a-z][a-z0-9-]*$/i.test(pattern)) continue; // plain tag name, already compared
    try {
      if (element.matches(pattern)) return true;
    } catch {
      // Invalid selector supplied in configuration: ignore it.
    }
  }

  return false;
}

/** Document-wide lookups shared by every element in one parse */
export class ParseContext {
  readonly config: ResolvedConfig;
  readonly doc: Document | null;
  private labelTexts: Map<string, string> | null = null;
  private idCounts: Map<string, number> | null = null;

  constructor(config: ResolvedConfig, root: Element) {
    this.config = config;
    this.doc = root.ownerDocument ?? null;
  }

  /** Clean a piece of untrusted text using the configured label length */
  text(value: string | null | undefined): string {
    return cleanText(value, this.config.maxLabelLength);
  }

  /** Text of the `<label for>` that points at the given element id */
  labelFor(id: string): string {
    if (!this.labelTexts) {
      this.labelTexts = new Map();
      const labels = this.doc?.querySelectorAll('label[for]') ?? [];
      for (const label of Array.from(labels)) {
        const target = label.getAttribute('for');
        if (target && !this.labelTexts.has(target)) {
          this.labelTexts.set(target, this.text(label.textContent));
        }
      }
    }
    return this.labelTexts.get(id) ?? '';
  }

  /** Text content of the element with the given id, or '' */
  textOfId(id: string): string {
    if (!id) return '';
    return this.text(this.doc?.getElementById(id)?.textContent);
  }

  /** True when exactly one element in the document carries this id */
  isUniqueId(id: string): boolean {
    if (!id) return false;
    if (!this.idCounts) {
      this.idCounts = new Map();
      const withIds = this.doc?.querySelectorAll('[id]') ?? [];
      for (const el of Array.from(withIds)) {
        this.idCounts.set(el.id, (this.idCounts.get(el.id) ?? 0) + 1);
      }
    }
    return this.idCounts.get(id) === 1;
  }
}
