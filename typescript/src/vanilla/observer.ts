/**
 * MutationObserver wrapper that re-parses when semantics change
 */

import type { SemanticDocument, SemanticDOMConfig } from '../core/types.js';
import { createSemanticDOM, type SemanticDOM } from '../core/semantic-dom.js';

/**
 * Attributes whose change alters the semantic tree. MutationObserver matches
 * attribute names exactly (no wildcards), so each one is listed.
 */
export const OBSERVED_ATTRIBUTES = [
  'role', 'id', 'hidden', 'disabled', 'inert', 'open', 'checked', 'href', 'tabindex',
  'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden', 'aria-disabled',
  'aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed', 'aria-busy',
  'aria-invalid', 'aria-current', 'aria-required', 'aria-readonly', 'aria-level',
  'data-semantic-id', 'data-semantic-intent',
] as const;

/**
 * MutationObserver wrapper for automatic re-parsing
 */
export class SemanticObserver {
  private observer: MutationObserver | null = null;
  private sdom: SemanticDOM;
  private callback: (document: SemanticDocument) => void;
  private element: Element | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(
    callback: (document: SemanticDocument) => void,
    config?: SemanticDOMConfig,
    debounceMs = 100
  ) {
    this.sdom = createSemanticDOM(config);
    this.callback = callback;
    this.debounceMs = debounceMs;
  }

  /**
   * Start observing an element
   */
  observe(element: Element): void {
    if (typeof MutationObserver === 'undefined') {
      console.warn('MutationObserver not available');
      return;
    }

    this.disconnect();
    this.element = element;
    this.parseAndNotify();

    this.observer = new MutationObserver(() => {
      this.debouncedParse();
    });

    this.observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...OBSERVED_ATTRIBUTES],
    });
  }

  /**
   * Stop observing
   */
  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.element = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Force re-parse
   */
  refresh(): void {
    this.parseAndNotify();
  }

  private debouncedParse(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.parseAndNotify();
    }, this.debounceMs);
  }

  private parseAndNotify(): void {
    if (!this.element) return;

    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = typeof document !== 'undefined' ? document.title : '';

    const doc = this.sdom.parse(this.element, url, title);
    this.callback(doc);
  }
}

/**
 * Create a semantic observer
 */
export function createObserver(
  callback: (document: SemanticDocument) => void,
  config?: SemanticDOMConfig,
  debounceMs?: number
): SemanticObserver {
  return new SemanticObserver(callback, config, debounceMs);
}

