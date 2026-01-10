/**
 * semantic-dom-ssg
 * NPM package implementing ISO/IEC draft standard for SemanticDOM and Semantic State Graph
 *
 * @packageDocumentation
 */

// Core exports
export * from './core/index.js';

// Re-export convenience functions
export {
  SemanticDOM,
  createSemanticDOM,
  parseElement,
  generateSemanticId,
} from './core/semantic-dom.js';

// Version
export const VERSION = '0.1.0';

// Standard reference
export const STANDARD = 'ISO/IEC-SDOM-SSG-DRAFT-2024';
