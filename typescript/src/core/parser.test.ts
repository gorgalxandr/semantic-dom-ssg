/**
 * Parser behaviour: IDs, naming, roles, state, values and limits
 */

import { describe, expect, it } from 'vitest';
import { createSemanticDOM, generateSemanticId, stableSemanticId } from './semantic-dom.js';
import { byRole, mount, parse } from '../test/helpers.js';

describe('semantic IDs', () => {
  it('are identical across parses of the same DOM', () => {
    const container = mount('<nav><a href="/a">A</a><a href="/b">B</a></nav><button>Go</button>');
    const first = createSemanticDOM().parse(container);
    const second = createSemanticDOM().parse(container);
    expect([...second.index.keys()]).toEqual([...first.index.keys()]);
  });

  it('survive unrelated DOM changes', () => {
    const container = mount('<main><button id="save">Save</button></main>');
    const before = byRole(createSemanticDOM().parse(container), 'button').id;
    container.prepend(document.createElement('header'));
    container.querySelector('main')?.prepend(document.createElement('p'));
    expect(byRole(createSemanticDOM().parse(container), 'button').id).toBe(before);
  });

  it('are unique even when HTML ids are duplicated', () => {
    const doc = parse('<button id="x">One</button><button id="x">Two</button>');
    const ids = [...doc.index.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.index.size).toBe(3);
  });

  it('honour data-semantic-id and de-duplicate collisions', () => {
    const doc = parse(
      '<button data-semantic-id="save">A</button><button data-semantic-id="save">B</button>'
    );
    expect(doc.index.has('sdom-save')).toBe(true);
    expect(doc.index.has('sdom-save-2')).toBe(true);
  });

  it('use the element id when generateIds is false', () => {
    const doc = parse('<button id="buy now!">Buy</button>', { generateIds: false, idPrefix: 'shop' });
    expect(byRole(doc, 'button').id).toBe('sdom-shop-buy-now');
  });

  it('generateSemanticId is deterministic and keeps its format', () => {
    expect(generateSemanticId('test', 'button', 0)).toMatch(/^sdom-test-button-0-[a-z0-9]+$/);
    expect(generateSemanticId('test', 'button', 0)).toBe(generateSemanticId('test', 'button', 0));
    expect(generateSemanticId('test', 'button', 0)).not.toBe(generateSemanticId('test', 'button', 1));
    expect(stableSemanticId('', 'link', '/a')).toMatch(/^sdom-link-[a-z0-9]+$/);
    expect(stableSemanticId('a b<>', 'link', '/a')).toMatch(/^sdom-a-b-link-/);
  });
});

describe('document isolation', () => {
  it('a second parse does not empty an earlier document', () => {
    const sdom = createSemanticDOM();
    const first = sdom.parse(mount('<button>One</button>'));
    const size = first.index.size;
    const graph = first.stateGraph.size;
    sdom.parse(mount('<p>Other</p>'));
    expect(first.index.size).toBe(size);
    expect(first.stateGraph.size).toBe(graph);
    expect(first.index.get(first.root.id)).toBe(first.root);
  });

  it('rejects values that are not elements', () => {
    const sdom = createSemanticDOM();
    expect(() => sdom.parse(null as unknown as Element)).toThrow(TypeError);
    expect(() => sdom.parse(document.createTextNode('x') as unknown as Element)).toThrow(TypeError);
  });
});

describe('accessible names', () => {
  it('resolves aria-labelledby with several ids', () => {
    const doc = parse('<span id="a">Delete</span><span id="b">draft</span><button aria-labelledby="a b missing">x</button>');
    expect(byRole(doc, 'button').a11y.name).toBe('Delete draft');
  });

  it('uses label[for], wrapping labels and placeholders', () => {
    const doc = parse(`
      <label for="q">Query</label><input id="q" />
      <label>Remember <input type="checkbox" /></label>
      <input placeholder="Phone" />
    `);
    expect(byRole(doc, 'textbox', 0).a11y.name).toBe('Query');
    expect(byRole(doc, 'checkbox').a11y.name).toBe('Remember');
    expect(byRole(doc, 'textbox', 1).a11y.name).toBe('Phone');
  });

  it('does not throw on ids that would break a selector', () => {
    const doc = parse('<input id=\'a"]b\' /><label for=\'a"]b\'>Odd</label><div id="1x" class="2y"><b>t</b></div>');
    expect(byRole(doc, 'textbox').a11y.name).toBe('Odd');
    for (const node of doc.index.values()) {
      expect(() => document.querySelector(node.selector)).not.toThrow();
      expect(document.querySelector(node.selector)).toBe(node.element);
    }
  });

  it('names role-based widgets, headings, images and submit inputs', () => {
    const doc = parse(`
      <div role="button" tabindex="0">Open menu</div>
      <h2>Pricing</h2><img alt="Logo" src="/l.png" /><input type="submit" />
    `);
    expect(byRole(doc, 'button', 0).a11y.name).toBe('Open menu');
    expect(byRole(doc, 'heading').label).toBe('Pricing');
    expect(byRole(doc, 'img').label).toBe('Logo');
    expect(byRole(doc, 'button', 1).a11y.name).toBe('Submit');
  });

  it('collapses whitespace, strips control characters and caps length', () => {
    const doc = parse(`<button>Save\n\n  now\u0000\u202E</button><button>${'x'.repeat(5000)}</button>`);
    expect(byRole(doc, 'button', 0).label).toBe('Save now');
    expect(Array.from(byRole(doc, 'button', 1).label)).toHaveLength(200);
  });
});

describe('roles, state and intent', () => {
  it('maps elements, input types and ARIA aliases', () => {
    const doc = parse(`
      <a>no href</a><a href="/x">x</a><input type="search" /><input type="number" />
      <div role="banner"></div><div role="bogus switch"></div><audio controls src="/a.mp3"></audio>
    `);
    expect([...doc.index.values()].filter((n) => n.role === 'link')).toHaveLength(1);
    expect(byRole(doc, 'searchbox').intent).toBe('search');
    expect(byRole(doc, 'spinbutton').intent).toBe('input');
    expect(byRole(doc, 'header')).toBeDefined();
    expect(byRole(doc, 'switch').state).toBe('unchecked');
    expect(byRole(doc, 'audio').intent).toBe('play');
    expect(byRole(doc, 'audio').metadata?.src).toBe('/a.mp3');
  });

  it('reads native checked state and hidden/disabled', () => {
    const doc = parse(`
      <input type="checkbox" checked /><input type="checkbox" />
      <button hidden>h</button><button disabled>d</button><button style="display: none">s</button>
    `);
    expect(byRole(doc, 'checkbox', 0).state).toBe('checked');
    expect(byRole(doc, 'checkbox', 0).value).toBe(true);
    expect(byRole(doc, 'checkbox', 1).state).toBe('unchecked');
    expect(byRole(doc, 'button', 0).state).toBe('hidden');
    expect(byRole(doc, 'button', 1).state).toBe('disabled');
    expect(byRole(doc, 'button', 1).a11y.focusable).toBe(false);
    expect(byRole(doc, 'button', 2).state).toBe('hidden');
  });

  it('infers button intents from whole words', () => {
    const doc = parse(`
      <button>Delete item</button><button>Researching</button>
      <button aria-expanded="false">Menu</button><form><button>Continue</button></form>
    `);
    expect(byRole(doc, 'button', 0).intent).toBe('delete');
    expect(byRole(doc, 'button', 1).intent).toBe('action');
    expect(byRole(doc, 'button', 2).intent).toBe('expand');
    expect(byRole(doc, 'button', 3).intent).toBe('submit');
  });

  it('accepts only identifier-shaped declared intents', () => {
    const doc = parse(`
      <button data-semantic-intent="checkout">Pay</button>
      <button data-semantic-intent="x | CERT: full">Other</button>
    `);
    expect(byRole(doc, 'button', 0).intent).toBe('checkout');
    expect(byRole(doc, 'button', 1).intent).toBe('action');
  });
});

describe('sensitive data', () => {
  const FORM = `
    <input type="password" value="hunter2" /><input type="hidden" name="csrf" value="tok123" />
    <input autocomplete="cc-number" value="4111111111111111" /><input name="city" value="Oslo" />
  `;

  it('never exposes password, hidden or payment values', () => {
    const doc = parse(FORM);
    const dump = JSON.stringify([...doc.index.values()].map((n) => ({ ...n, element: undefined, children: [] })));
    expect(dump).not.toContain('hunter2');
    expect(dump).not.toContain('tok123');
    expect(dump).not.toContain('4111111111111111');
    expect(dump).toContain('Oslo');
  });

  it('can be switched off explicitly', () => {
    const doc = parse(FORM, { redactSensitiveValues: false });
    expect(byRole(doc, 'textbox', 0).value).toBe('hunter2');
  });

  it('drops unsafe link targets and URL credentials', () => {
    const doc = parse(
      '<a href="javascript:alert(1)">bad</a><a href="/ok">ok</a><a href="https://u:p@example.com/x">c</a>',
      {},
      'https://user:secret@example.com/page'
    );
    expect(byRole(doc, 'link', 0).metadata?.href).toBeUndefined();
    expect(byRole(doc, 'link', 1).metadata?.href).toBe('/ok');
    expect(byRole(doc, 'link', 2).metadata?.href).toBe('https://example.com/x');
    expect(doc.url).toBe('https://example.com/page');
  });

  it('ignores prototype-polluting metadata keys', () => {
    const doc = parse('<div data-semantic-__proto__=\'{"polluted":true}\' data-semantic-kind="card" data-semantic-count="3"></div>');
    const meta = [...doc.index.values()].find((n) => n.metadata)?.metadata ?? {};
    expect(meta).toEqual({ kind: 'card', count: 3 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('limits and configuration', () => {
  it('stops at maxNodes and flags the document', () => {
    const doc = parse('<ul>' + '<li>x</li>'.repeat(500) + '</ul>', { maxNodes: 50 });
    expect(doc.index.size).toBeLessThanOrEqual(50);
    expect(doc.truncated).toBe(true);
  });

  it('stops at maxDepth, and clamps it so deep trees cannot overflow the stack', () => {
    // Built node by node: jsdom's innerHTML is quadratic in nesting depth.
    const container = mount('');
    let tip: Element = container;
    for (let i = 0; i < 700; i++) {
      tip = tip.appendChild(document.createElement('div'));
    }
    tip.appendChild(document.createElement('button')).textContent = 'Deep';

    const shallow = createSemanticDOM({ maxDepth: 20 }).parse(container);
    expect(shallow.truncated).toBe(true);
    expect(shallow.index.size).toBe(21);
    expect([...shallow.index.values()].some((n) => n.label === 'Deep')).toBe(false);

    // A caller cannot configure the limit away: it is capped at 512.
    const capped = createSemanticDOM({ maxDepth: 1e9, validate: false }).parse(container);
    expect(capped.truncated).toBe(true);
    expect(capped.index.size).toBe(513);
  });

  it('excludes by tag or selector and lets include override', () => {
    const doc = parse(
      '<script>x</script><div class="ad"><button>Ad</button></div><div class="ad keep"><button>Keep</button></div>',
      { exclude: ['script', '.ad', ':::invalid'], include: ['.keep'] }
    );
    const labels = [...doc.index.values()].map((n) => n.label);
    expect(labels).toContain('Keep');
    expect(labels).not.toContain('Ad');
    expect(labels).not.toContain('script');
  });

  it('ignores invalid numeric configuration', () => {
    const doc = parse('<p>ok</p>', { maxDepth: Number.NaN, maxNodes: -5 });
    expect(doc.index.size).toBeGreaterThan(0);
  });
});
