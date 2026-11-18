/**
 * JSON export of semantic documents
 */

import type { SemanticDocument } from '../core/types.js';
import { toSerializable } from '../core/serialize.js';

/**
 * Serialize semantic document to JSON.
 *
 * DOM element references are left out, so this is safe to call on documents
 * parsed from a live page (framework-managed elements are often circular).
 * Every node appears once, under `root`; `landmarks` and `interactables` are
 * lists of references by ID.
 */
export function toJSON(document: SemanticDocument, space: number | string = 2): string {
  return JSON.stringify(toSerializable(document), null, space);
}

/**
 * Export semantic document as a plain object
 */
export function toPlainObject(document: SemanticDocument): Record<string, unknown> {
  return JSON.parse(toJSON(document, 0)) as Record<string, unknown>;
}
