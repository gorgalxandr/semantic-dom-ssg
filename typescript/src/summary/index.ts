/**
 * Agent Summary Format
 * Ultra token-efficient plain text format for LLM consumption
 *
 * Target: ~100 tokens vs ~800 tokens for JSON
 * Use case: Quick site understanding for AI agents
 *
 * @packageDocumentation
 */

import type { SemanticDocument, SemanticNode } from '../core/types.js';

/**
 * Options for agent summary generation
 */
export interface AgentSummaryOptions {
  /** Include interactables list (default: true) */
  includeInteractables?: boolean;
  /** Include landmarks list (default: true) */
  includeLandmarks?: boolean;
  /** Include certification info (default: true) */
  includeCertification?: boolean;
  /** Maximum interactables to list (default: 20) */
  maxInteractables?: number;
  /** Maximum landmarks to list (default: 10) */
  maxLandmarks?: number;
  /** Include resource URLs if available (default: true) */
  includeResourceUrls?: boolean;
}

const DEFAULT_OPTIONS: Required<AgentSummaryOptions> = {
  includeInteractables: true,
  includeLandmarks: true,
  includeCertification: true,
  maxInteractables: 20,
  maxLandmarks: 10,
  includeResourceUrls: true,
};

/**
 * Generate an ultra-compact agent summary
 *
 * Format designed for ~100 tokens vs ~800 for JSON manifest
 *
 * @example Output:
 * ```
 * SITE: example.com
 * TITLE: My Website
 * LANG: en
 * CERT: standard (75/100)
 *
 * LANDMARKS:
 * navigation: Main Nav | #nav
 * main: Content | #main
 *
 * ACTIONS:
 * button: Submit Form | #submit | submit
 * link: Home | #home | navigate
 * audio: Track 1 | #audio-1 | play
 * ```
 *
 * @param document - SemanticDocument to summarize
 * @param options - Summary options
 * @returns Plain text summary
 */
export function toAgentSummary(
  document: SemanticDocument,
  options?: AgentSummaryOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Header (minimal metadata)
  const domain = extractDomain(document.url);
  lines.push(`SITE: ${domain || 'local'}`);
  if (document.title) {
    lines.push(`TITLE: ${truncate(document.title, 50)}`);
  }
  lines.push(`LANG: ${document.language || 'en'}`);

  // Certification (one line)
  if (opts.includeCertification) {
    const cert = document.agentReady;
    lines.push(`CERT: ${cert.level} (${cert.score}/100)`);
  }

  lines.push(''); // Blank line separator

  // Landmarks (compact)
  if (opts.includeLandmarks && document.landmarks.length > 0) {
    lines.push('LANDMARKS:');
    const landmarks = document.landmarks.slice(0, opts.maxLandmarks);
    for (const lm of landmarks) {
      const selector = truncate(lm.selector || '', 30);
      lines.push(`${lm.role}: ${truncate(lm.label, 25)} | ${selector}`);
    }
    if (document.landmarks.length > opts.maxLandmarks) {
      lines.push(`... +${document.landmarks.length - opts.maxLandmarks} more`);
    }
    lines.push('');
  }

  // Interactables (compact, with intent)
  if (opts.includeInteractables && document.interactables.length > 0) {
    lines.push('ACTIONS:');
    const items = document.interactables.slice(0, opts.maxInteractables);
    for (const item of items) {
      const selector = truncate(item.selector || '', 25);
      const intent = item.intent || '-';
      const url = opts.includeResourceUrls ? extractResourceUrl(item) : '';
      const urlSuffix = url ? ` | ${url}` : '';
      lines.push(`${item.role}: ${truncate(item.label, 20)} | ${selector} | ${intent}${urlSuffix}`);
    }
    if (document.interactables.length > opts.maxInteractables) {
      lines.push(`... +${document.interactables.length - opts.maxInteractables} more`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a minimal one-line summary
 * For ultra-compressed contexts (~20 tokens)
 *
 * @example
 * "example.com | standard (75) | 5 landmarks | 12 actions"
 */
export function toOneLiner(document: SemanticDocument): string {
  const domain = extractDomain(document.url) || 'local';
  const cert = document.agentReady;
  return `${domain} | ${cert.level} (${cert.score}) | ${document.landmarks.length} landmarks | ${document.interactables.length} actions`;
}

/**
 * Generate a navigation-focused summary
 * Lists all navigable sections with anchors
 */
export function toNavSummary(document: SemanticDocument): string {
  const lines: string[] = [];
  const domain = extractDomain(document.url) || '';

  lines.push(`NAV: ${domain}`);

  // Extract navigation links
  const navItems = document.interactables.filter(
    (i) => i.intent === 'navigate' && i.role === 'link'
  );

  for (const item of navItems.slice(0, 15)) {
    const href = extractHref(item);
    lines.push(`${truncate(item.label, 20)}: ${href || item.selector || '-'}`);
  }

  return lines.join('\n');
}

/**
 * Generate an audio-focused summary
 * Lists all playable audio elements
 */
export function toAudioSummary(document: SemanticDocument): string {
  const lines: string[] = [];

  // Filter by play intent (audio elements have intent='play')
  const audioItems = document.interactables.filter(
    (i) => i.intent === 'play'
  );

  if (audioItems.length === 0) {
    return 'AUDIO: none';
  }

  lines.push(`AUDIO: ${audioItems.length} tracks`);

  for (const item of audioItems) {
    const url = extractResourceUrl(item);
    lines.push(`- ${truncate(item.label, 30)}${url ? ': ' + url : ''}`);
  }

  return lines.join('\n');
}

/**
 * Estimate token count for the summary
 * Based on ~4 chars per token heuristic
 */
export function estimateSummaryTokens(summary: string): number {
  return Math.ceil(summary.length / 4);
}

/**
 * Compare token usage between formats
 */
export function compareTokenUsage(document: SemanticDocument): {
  summary: number;
  json: number;
  savings: number;
  savingsPercent: number;
} {
  const summary = toAgentSummary(document);
  const json = JSON.stringify(
    {
      url: document.url,
      title: document.title,
      landmarks: document.landmarks.map((l) => ({ role: l.role, label: l.label })),
      interactables: document.interactables.map((i) => ({
        role: i.role,
        label: i.label,
        intent: i.intent,
      })),
      certification: document.agentReady,
    },
    null,
    2
  );

  const summaryTokens = estimateSummaryTokens(summary);
  const jsonTokens = Math.ceil(json.length / 4);
  const savings = jsonTokens - summaryTokens;
  const savingsPercent = Math.round((savings / jsonTokens) * 100);

  return {
    summary: summaryTokens,
    json: jsonTokens,
    savings,
    savingsPercent,
  };
}

// --- Helpers ---

function truncate(str: string, maxLen: number): string {
  if (!str) return '-';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + '..';
}

function extractDomain(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.split('/')[0] || '';
  }
}

function extractHref(node: SemanticNode): string {
  // Check metadata for href
  if (node.metadata && typeof node.metadata === 'object') {
    const href = (node.metadata as Record<string, unknown>).href;
    if (typeof href === 'string') return href;
  }

  // Try to extract from selector (e.g., a[href="#about"])
  const selectorMatch = node.selector?.match(/\[href=["']([^"']+)["']\]/);
  if (selectorMatch) return selectorMatch[1];

  return '';
}

function extractResourceUrl(node: SemanticNode): string {
  // Check metadata for src/href
  if (node.metadata && typeof node.metadata === 'object') {
    const meta = node.metadata as Record<string, unknown>;
    if (typeof meta.src === 'string') return meta.src;
    if (typeof meta.href === 'string') return meta.href;
    if (typeof meta.url === 'string') return meta.url;
  }

  return '';
}
