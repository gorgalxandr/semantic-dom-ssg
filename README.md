# semantic-dom-ssg

NPM package implementing ISO/IEC draft standard for **SemanticDOM** and **Semantic State Graph (SSG)** - enabling O(1) lookup, deterministic navigation, and agent-ready web interoperability.

[![npm version](https://badge.fury.io/js/semantic-dom-ssg.svg)](https://www.npmjs.com/package/semantic-dom-ssg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **O(1) Lookup**: Hash-indexed semantic nodes for instant access
- **Deterministic Navigation**: Predictable traversal patterns for AI agents
- **Semantic State Graph (SSG)**: State machine for UI component states
- **Agent Certification**: Validate web content for AI agent readiness
- **React Hooks**: First-class React integration with `useSemanticDOM`, `useSSG`
- **Vanilla JS**: Framework-agnostic API for any environment
- **CLI Tool**: Validate and analyze HTML files
- **ESLint Plugin**: Enforce semantic accessibility in your codebase

## Installation

```bash
npm install semantic-dom-ssg
# or
yarn add semantic-dom-ssg
# or
pnpm add semantic-dom-ssg
```

## Quick Start

### React

```tsx
import { useSemanticDocument, useSemanticQuery, useCertification } from 'semantic-dom-ssg/react';
import { useRef } from 'react';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const document = useSemanticDocument(containerRef);
  const buttons = useSemanticQuery(document, { role: 'button' });
  const { level, score, isAgentReady } = useCertification(document);

  return (
    <div ref={containerRef}>
      <h1>My App</h1>
      <button data-semantic-intent="submit">Submit</button>
      <button data-semantic-intent="cancel">Cancel</button>

      {isAgentReady && (
        <p>Agent Ready: {level} ({score}/100)</p>
      )}
      <p>Found {buttons.length} buttons</p>
    </div>
  );
}
```

### Vanilla JavaScript

```javascript
import { parse, query, getLandmarks, isAgentReady } from 'semantic-dom-ssg/vanilla';

// Parse the current page
const document = parse(document.body);

// Query semantic nodes
const buttons = query(document, { role: 'button', interactive: true });
const links = query(document, { role: 'link', intent: 'navigate' });

// Get landmarks for quick navigation
const landmarks = getLandmarks(document);

// Check agent readiness
if (isAgentReady(document)) {
  console.log('Document is agent-ready!');
}

// O(1) lookup by ID
import { getById } from 'semantic-dom-ssg/vanilla';
const node = getById(document, 'sdom-button-0-abc123');
```

### CLI

```bash
# Validate HTML file
npx semantic-dom validate index.html

# Parse and output structure
npx semantic-dom parse index.html --format tree

# Show statistics
npx semantic-dom stats index.html

# Validate with strict mode
npx semantic-dom validate index.html --strict --level advanced
```

### ESLint Plugin

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['semantic-dom'],
  extends: ['plugin:semantic-dom/recommended'],
  rules: {
    'semantic-dom/require-accessible-name': 'error',
    'semantic-dom/valid-role': 'error',
    'semantic-dom/semantic-intent': 'warn',
  },
};
```

## Core Concepts

### SemanticDOM

SemanticDOM transforms HTML/DOM into a semantically-rich, navigable structure optimized for AI agents:

```typescript
interface SemanticNode {
  id: SemanticId;           // Unique identifier for O(1) lookup
  role: SemanticRole;       // ARIA role (button, link, navigation, etc.)
  label: string;            // Human-readable label
  intent?: SemanticIntent;  // What action this element performs
  state: StateType;         // Current state (idle, loading, disabled, etc.)
  selector: string;         // CSS selector for element
  xpath: string;            // XPath for precise location
  a11y: SemanticA11y;       // Accessibility properties
  children: SemanticNode[]; // Child nodes
}
```

### Semantic State Graph (SSG)

SSG models UI state transitions for predictable agent interactions:

```typescript
interface SSGNode {
  semanticId: SemanticId;
  currentState: StateType;
  transitions: StateTransition[];
  history: StateHistoryEntry[];
}

interface StateTransition {
  from: StateType;
  to: StateType;
  trigger: SemanticIntent | string;
}
```

### Agent Certification

Documents are certified for agent-readiness based on:

- **Structure**: Proper landmark usage, heading hierarchy
- **Accessibility**: Accessible names, keyboard navigation
- **Navigation**: Unique IDs, valid selectors
- **State**: Defined state transitions
- **Interoperability**: Semantic intents defined

Levels: `none` | `basic` | `standard` | `advanced` | `full`

## API Reference

### Core

```typescript
import {
  SemanticDOM,
  createSemanticDOM,
  parseElement,
  // Types
  SemanticNode,
  SemanticDocument,
  SemanticQuery,
  SemanticDOMConfig,
} from 'semantic-dom-ssg';
```

### React Hooks

```typescript
import {
  useSemanticDOM,        // Create SemanticDOM instance
  useSemanticDocument,   // Parse element ref to document
  useSemanticQuery,      // Query nodes reactively
  useSemanticNode,       // Get node by ID
  useSemanticNavigation, // Keyboard navigation
  useSSG,                // State management
  useLandmarks,          // Get landmarks
  useInteractables,      // Get interactive elements
  useCertification,      // Get certification info
  useSemanticObserver,   // Auto-reparse on DOM changes
  SemanticDOMProvider,   // Context provider
} from 'semantic-dom-ssg/react';
```

### Vanilla JS

```typescript
import {
  init,              // Initialize with config
  parse,             // Parse element/document
  parseHTML,         // Parse HTML string
  query,             // Query nodes
  getById,           // O(1) lookup
  navigate,          // Navigate between nodes
  getLandmarks,      // Get landmarks
  getInteractables,  // Get interactive elements
  isAgentReady,      // Check certification
  // State management
  SSGStateManager,
  createSSGManager,
  // Observer
  SemanticObserver,
  createObserver,
  // Serialization
  toJSON,
  toPlainObject,
  // DOM interaction
  click,
  focus,
  setValue,
} from 'semantic-dom-ssg/vanilla';
```

### CLI Commands

```bash
semantic-dom validate <file>  # Validate HTML
semantic-dom parse <file>     # Parse to SemanticDOM
semantic-dom stats <file>     # Show statistics
semantic-dom init             # Generate config
```

### ESLint Rules

| Rule | Description | Recommended |
|------|-------------|-------------|
| `require-accessible-name` | Require accessible names on interactive elements | error |
| `valid-role` | Ensure ARIA roles are valid | error |
| `semantic-intent` | Encourage semantic intent annotations | warn |
| `no-redundant-role` | Warn about redundant implicit roles | warn |
| `require-heading-hierarchy` | Ensure heading levels don't skip | warn |
| `prefer-semantic-elements` | Prefer semantic HTML over div+role | warn |

## Configuration

```typescript
interface SemanticDOMConfig {
  computeBounds?: boolean;      // Include bounding boxes (default: true)
  includeStateGraph?: boolean;  // Generate SSG (default: true)
  maxDepth?: number;            // Max tree depth (default: 50)
  exclude?: string[];           // Elements to exclude
  include?: string[];           // Elements to include
  roleMapping?: Record<string, SemanticRole>;    // Custom role mappings
  intentMapping?: Record<string, SemanticIntent>; // Custom intent mappings
  generateIds?: boolean;        // Generate unique IDs (default: true)
  idPrefix?: string;            // ID prefix (default: 'sdom')
  validate?: boolean;           // Validate during parse (default: true)
  targetCertification?: 'none' | 'basic' | 'standard' | 'advanced' | 'full';
}
```

## Standards Compliance

This package implements the ISO/IEC draft standard for SemanticDOM and Semantic State Graph (`ISO/IEC-SDOM-SSG-DRAFT-2024`), providing:

- **Interoperability**: Standard format for AI agent ↔ web communication
- **Determinism**: Predictable navigation and state transitions
- **Accessibility**: Built on WAI-ARIA and WCAG principles
- **Performance**: O(1) lookups, minimal parsing overhead

## Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Node.js 18+

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

MIT - see [LICENSE](LICENSE) for details.

## Related

- [WAI-ARIA Specification](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
