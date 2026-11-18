/**
 * Shared test helpers
 */

import { afterEach } from 'vitest';
import { createSemanticDOM } from '../core/semantic-dom.js';
import type { SemanticDocument, SemanticDOMConfig, SemanticNode } from '../core/types.js';

const mounted: Element[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.remove();
});

/** Attach markup to the page and return its container; removed after each test */
export function mount(markup: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = markup;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** Mount markup and parse it */
export function parse(markup: string, config?: SemanticDOMConfig, url = ''): SemanticDocument {
  return createSemanticDOM(config).parse(mount(markup), url);
}

/** First node with the given role, failing the test when there is none */
export function byRole(doc: SemanticDocument, role: SemanticNode['role'], nth = 0): SemanticNode {
  const matches = [...doc.index.values()].filter((n) => n.role === role);
  if (!matches[nth]) throw new Error(`No node #${nth} with role ${role}`);
  return matches[nth];
}

/** A page that satisfies every certification check */
export const WELL_FORMED = `
  <header><a href="/">Acme</a></header>
  <nav aria-label="Primary"><a href="/docs">Docs</a><a href="/pricing">Pricing</a></nav>
  <main>
    <h1>Welcome</h1>
    <h2>Sign up</h2>
    <form>
      <label for="email">Email</label>
      <input id="email" type="email" required />
      <label><input type="checkbox" name="tos" /> Accept terms</label>
      <button type="submit">Create account</button>
    </form>
  </main>
  <footer><a href="/legal">Legal</a></footer>
`;
