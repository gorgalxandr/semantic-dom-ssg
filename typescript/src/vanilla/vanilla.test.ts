import { describe, expect, it, vi } from 'vitest';
import {
  click,
  createObserver,
  createSSGManager,
  findElement,
  focus,
  getById,
  getCertification,
  getInteractables,
  getLandmarks,
  init,
  isAgentReady,
  navigate,
  parse as parsePage,
  parseHTML,
  query,
  setValue,
  toJSON,
  toPlainObject,
} from './index.js';
import { byRole, mount, parse, WELL_FORMED } from '../test/helpers.js';

describe('convenience API', () => {
  it('parses elements and HTML strings', () => {
    const container = mount(WELL_FORMED);
    const doc = parsePage(container);
    expect(getLandmarks(doc).length).toBeGreaterThan(0);
    expect(getInteractables(doc)).toHaveLength(7);
    expect(isAgentReady(doc)).toBe(true);
    expect(getCertification(doc).level).toBe('full');
    expect(query(doc, { role: 'button' })).toHaveLength(1);
    const button = byRole(doc, 'button');
    expect(getById(doc, button.id)).toBe(button);
    expect(navigate(doc, button.id, { direction: 'parent' })?.role).toBe('form');

    const fromString = parseHTML('<title>T</title><main><button>Hi</button></main>');
    expect(fromString.title).toBe('T');
    expect(byRole(fromString, 'button').label).toBe('Hi');
    expect(isAgentReady(parseHTML('<div></div>'))).toBe(false);
    expect(init({ maxDepth: 3 })).toBeDefined();
    init();
  });
});

describe('serialization', () => {
  it('produces JSON without DOM references, even for circular elements', () => {
    const container = mount(WELL_FORMED);
    // Frameworks attach circular bookkeeping to elements.
    const button = container.querySelector('button') as HTMLButtonElement & { __fiber?: unknown };
    button.__fiber = { stateNode: button };

    const doc = parsePage(container);
    const json = toJSON(doc);
    const plain = toPlainObject(doc) as { root: { children: unknown[] }; stateGraph: Record<string, unknown>; interactables: Array<{ id: string }> };
    expect(json).not.toContain('"element"');
    expect(Object.keys(plain.stateGraph)).toHaveLength(doc.stateGraph.size);
    expect(plain.interactables.map((i) => i.id)).toEqual(doc.interactables.map((i) => i.id));
    expect(plain.root.children.length).toBeGreaterThan(0);
  });
});

describe('actions', () => {
  it('finds elements by reference or selector and acts on them', () => {
    const container = mount('<button id="go">Go</button><input aria-label="Name" /><select aria-label="S"><option>a</option><option>b</option></select><input aria-label="RO" readonly />');
    const doc = parsePage(container);
    const button = byRole(doc, 'button');

    const onClick = vi.fn();
    container.querySelector('button')?.addEventListener('click', onClick);
    expect(click(doc, button.id)).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    expect(focus(doc, button.id)).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('button'));

    // Without the element reference the selector is used.
    button.element = undefined;
    expect(findElement(doc, button.id)).toBe(container.querySelector('button'));
    expect(findElement(doc, 'sdom-none')).toBeNull();
    expect(click(doc, 'sdom-none')).toBe(false);

    const events: string[] = [];
    const input = container.querySelector('input') as HTMLInputElement;
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    expect(setValue(doc, byRole(doc, 'textbox', 0).id, 'Ada')).toBe(true);
    expect(input.value).toBe('Ada');
    expect(events).toEqual(['input', 'change']);

    expect(setValue(doc, byRole(doc, 'listbox').id, 'b')).toBe(true);
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('b');
    expect(setValue(doc, byRole(doc, 'textbox', 1).id, 'x')).toBe(false);
    expect(setValue(doc, button.id, 'x')).toBe(false);
  });
});

describe('SSGStateManager', () => {
  it('runs transitions, records history and notifies listeners', () => {
    const doc = parse('<input type="checkbox" aria-label="c" /><button>b</button>');
    const box = byRole(doc, 'checkbox').id;
    const manager = createSSGManager();
    expect(manager.transition(box, 'toggle')).toBe(false); // not initialised
    manager.init(doc);

    const seen: string[] = [];
    const all: string[] = [];
    const stop = manager.subscribe(box, (s) => seen.push(s));
    manager.subscribe(box, () => { throw new Error('bad listener'); });
    manager.subscribeAll((id, s) => all.push(`${id}:${s}`));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(manager.getState(box)).toBe('unchecked');
    expect(manager.canTransition(box, 'toggle')).toBe(true);
    expect(manager.canTransition(box, 'explode')).toBe(false);
    expect(manager.getAvailableTransitions(box).map((t) => t.to)).toEqual(['checked']);
    expect(manager.transition(box, 'toggle')).toBe(true);
    expect(manager.transition(box, 'explode')).toBe(false);
    expect(manager.getState(box)).toBe('checked');
    expect(seen).toEqual(['checked']);
    expect(all).toEqual([`${box}:checked`]);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();

    stop();
    manager.setState(box, 'unchecked');
    manager.setState(box, 'unchecked');
    expect(seen).toEqual(['checked']);
    expect(manager.getHistory(box).map((h) => h.to)).toEqual(['checked', 'unchecked']);
    manager.getHistory(box).push({ from: 'idle', to: 'idle', timestamp: 0 });
    expect(manager.getHistory(box)).toHaveLength(2);
    expect(manager.snapshot().get(box)).toBe('unchecked');

    manager.transition(box, 'toggle');
    manager.reset();
    expect(manager.getState(box)).toBe('unchecked');
    expect(manager.getHistory(box)).toEqual([]);

    manager.init(parse('<p>x</p>'));
    expect(manager.snapshot().size).toBe(0);
  });
});

describe('SemanticObserver', () => {
  it('re-parses on mutations with stable IDs, and stops when disconnected', async () => {
    const container = mount('<main><button id="b">One</button></main>');
    const docs: Array<ReturnType<typeof parsePage>> = [];
    const observer = createObserver((d) => docs.push(d), undefined, 5);
    observer.observe(container);
    expect(docs).toHaveLength(1);

    container.querySelector('button')!.setAttribute('aria-pressed', 'true');
    container.querySelector('main')!.appendChild(document.createElement('p'));
    await vi.waitFor(() => expect(docs).toHaveLength(2));
    expect(byRole(docs[1], 'button').state).toBe('checked');
    expect(byRole(docs[1], 'button').id).toBe(byRole(docs[0], 'button').id);
    // The first document is still intact after the re-parse.
    expect(docs[0].index.size).toBe(3);

    observer.refresh();
    expect(docs).toHaveLength(3);
    observer.disconnect();
    container.appendChild(document.createElement('nav'));
    await new Promise((r) => setTimeout(r, 30));
    observer.refresh();
    expect(docs).toHaveLength(3);
  });
});
