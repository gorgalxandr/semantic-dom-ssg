/**
 * SemanticDOM Core Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticDOM, createSemanticDOM, generateSemanticId } from './semantic-dom.js';
import type { SemanticNode, SemanticDocument } from './types.js';

describe('SemanticDOM', () => {
  let sdom: SemanticDOM;

  beforeEach(() => {
    sdom = createSemanticDOM();
  });

  describe('generateSemanticId', () => {
    it('should generate unique IDs with correct format', () => {
      const id1 = generateSemanticId('test', 'button', 0);
      const id2 = generateSemanticId('test', 'button', 1);

      expect(id1).toMatch(/^sdom-test-button-0-[a-z0-9]+$/);
      expect(id2).toMatch(/^sdom-test-button-1-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('parse', () => {
    it('should parse a simple element', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button>Click me</button>';

      const doc = sdom.parse(div);

      expect(doc.version).toBe('1.0.0');
      expect(doc.standard).toBe('ISO/IEC-SDOM-SSG-DRAFT-2024');
      expect(doc.root).toBeDefined();
      expect(doc.index.size).toBeGreaterThan(0);
    });

    it('should correctly identify button role', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button>Click me</button>';

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });

      expect(buttons).toHaveLength(1);
      expect(buttons[0].role).toBe('button');
      expect(buttons[0].label).toBe('Click me');
    });

    it('should correctly identify link role', () => {
      const div = document.createElement('div');
      div.innerHTML = '<a href="/test">Go to test</a>';

      const doc = sdom.parse(div);
      const links = sdom.query(doc.root, { role: 'link' });

      expect(links).toHaveLength(1);
      expect(links[0].role).toBe('link');
      expect(links[0].intent).toBe('navigate');
    });

    it('should respect ARIA roles', () => {
      const div = document.createElement('div');
      div.innerHTML = '<div role="navigation">Nav content</div>';

      const doc = sdom.parse(div);
      const navs = sdom.query(doc.root, { role: 'navigation' });

      expect(navs).toHaveLength(1);
    });

    it('should extract landmarks', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <header>Header</header>
        <nav>Navigation</nav>
        <main>Main content</main>
        <footer>Footer</footer>
      `;

      const doc = sdom.parse(div);

      expect(doc.landmarks.length).toBeGreaterThanOrEqual(4);
    });

    it('should extract interactables', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>Button 1</button>
        <a href="#">Link 1</a>
        <input type="text" />
        <select><option>Option</option></select>
      `;

      const doc = sdom.parse(div);

      expect(doc.interactables.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('O(1) lookup', () => {
    it('should provide instant lookup by ID', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>Button 1</button>
        <button>Button 2</button>
        <button>Button 3</button>
      `;

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });

      // Get an ID
      const targetId = buttons[1].id;

      // O(1) lookup
      const node = sdom.getById(doc, targetId);

      expect(node).toBeDefined();
      expect(node?.id).toBe(targetId);
      expect(node?.label).toBe('Button 2');
    });
  });

  describe('query', () => {
    it('should filter by role', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>Button</button>
        <a href="#">Link</a>
        <input type="text" />
      `;

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });
      const links = sdom.query(doc.root, { role: 'link' });

      expect(buttons).toHaveLength(1);
      expect(links).toHaveLength(1);
    });

    it('should filter by multiple roles', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>Button</button>
        <a href="#">Link</a>
        <input type="text" />
      `;

      const doc = sdom.parse(div);
      const result = sdom.query(doc.root, { role: ['button', 'link'] });

      expect(result).toHaveLength(2);
    });

    it('should filter interactive elements', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div>Not interactive</div>
        <button>Interactive</button>
        <p>Not interactive</p>
      `;

      const doc = sdom.parse(div);
      const interactives = sdom.query(doc.root, { interactive: true });

      expect(interactives.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect limit', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>1</button>
        <button>2</button>
        <button>3</button>
        <button>4</button>
        <button>5</button>
      `;

      const doc = sdom.parse(div);
      const limited = sdom.query(doc.root, { role: 'button', limit: 2 });

      expect(limited).toHaveLength(2);
    });
  });

  describe('navigation', () => {
    it('should navigate to next sibling', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      `;

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });
      const first = buttons[0];

      const next = sdom.navigate(doc, first.id, { direction: 'nextSibling' });

      expect(next).toBeDefined();
      expect(next?.label).toBe('Second');
    });

    it('should navigate to previous sibling', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      `;

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });
      const second = buttons[1];

      const prev = sdom.navigate(doc, second.id, { direction: 'previousSibling' });

      expect(prev).toBeDefined();
      expect(prev?.label).toBe('First');
    });

    it('should wrap navigation when specified', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>First</button>
        <button>Last</button>
      `;

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });
      const last = buttons[buttons.length - 1];

      const wrapped = sdom.navigate(doc, last.id, {
        direction: 'nextSibling',
        wrap: true,
      });

      expect(wrapped).toBeDefined();
      expect(wrapped?.label).toBe('First');
    });
  });

  describe('certification', () => {
    it('should certify a well-structured document', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <header role="banner">Header</header>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
        </nav>
        <main>
          <h1>Title</h1>
          <p>Content</p>
          <button aria-label="Submit form">Submit</button>
        </main>
        <footer>Footer</footer>
      `;

      const doc = sdom.parse(div);

      expect(doc.agentReady).toBeDefined();
      expect(doc.agentReady.score).toBeGreaterThan(0);
      expect(['none', 'basic', 'standard', 'advanced', 'full']).toContain(
        doc.agentReady.level
      );
    });

    it('should have validation checks', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button>Test</button>';

      const doc = sdom.parse(div);

      expect(doc.agentReady.checks).toBeDefined();
      expect(Array.isArray(doc.agentReady.checks)).toBe(true);
    });
  });

  describe('state graph', () => {
    it('should create SSG nodes for interactive elements', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <button>Click me</button>
        <input type="checkbox" />
      `;

      const doc = sdom.parse(div);

      expect(doc.stateGraph.size).toBeGreaterThan(0);
    });

    it('should have transitions for buttons', () => {
      const div = document.createElement('div');
      div.innerHTML = '<button>Test</button>';

      const doc = sdom.parse(div);
      const buttons = sdom.query(doc.root, { role: 'button' });
      const ssgNode = doc.stateGraph.get(buttons[0].id);

      expect(ssgNode).toBeDefined();
      expect(ssgNode?.transitions.length).toBeGreaterThan(0);
    });
  });
});
