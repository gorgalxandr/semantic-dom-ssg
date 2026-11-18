import { act, render, renderHook, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { SemanticDocument } from '../core/types.js';
import { createSemanticDOM, SemanticDOM } from '../core/semantic-dom.js';
import {
  globalSSGStore,
  SemanticDOMProvider,
  useCertification,
  useInteractables,
  useLandmarks,
  useSemanticDocument,
  useSemanticDOM,
  useSemanticDOMContext,
  useSemanticNavigation,
  useSemanticNode,
  useSemanticObserver,
  useSemanticQuery,
  useSSG,
} from './index.js';
import { WELL_FORMED } from '../test/helpers.js';

afterEach(() => {
  cleanup();
  act(() => globalSSGStore.clear());
});

function parsed(markup: string): SemanticDocument {
  const el = document.createElement('div');
  el.innerHTML = markup;
  document.body.appendChild(el);
  return createSemanticDOM().parse(el);
}

describe('useSemanticDocument', () => {
  it('parses once and does not loop when given inline config and default deps', () => {
    // Guard the parser itself: if the effect ever re-fires on every render
    // again, this throws from inside the effect and stops the cycle, so the
    // test fails instead of hanging the run.
    const original = SemanticDOM.prototype.parse;
    const parseSpy = vi.spyOn(SemanticDOM.prototype, 'parse').mockImplementation(function (
      this: SemanticDOM,
      ...args: Parameters<SemanticDOM['parse']>
    ) {
      if (parseSpy.mock.calls.length > 10) throw new Error('parse loop detected');
      return original.apply(this, args);
    });

    let doc: SemanticDocument | null = null;
    function Page() {
      const ref = useRef<HTMLDivElement>(null);
      doc = useSemanticDocument(ref, { maxDepth: 30 });
      return (
        <div ref={ref}>
          <main><button>Save</button></main>
        </div>
      );
    }

    render(<Page />);
    expect(doc!.interactables.map((n) => n.label)).toEqual(['Save']);
    // One parse per effect run; strict/dev double-invocation allows two.
    expect(parseSpy.mock.calls.length).toBeLessThanOrEqual(2);
    parseSpy.mockRestore();
  });

  it('re-parses when a dependency changes', () => {
    function Page() {
      const ref = useRef<HTMLDivElement>(null);
      const [count, setCount] = useState(1);
      const doc = useSemanticDocument(ref, undefined, [count]);
      return (
        <div ref={ref}>
          {Array.from({ length: count }, (_, i) => <button key={i}>B{i}</button>)}
          <output data-testid="n">{doc?.interactables.length ?? 0}</output>
          <span onClick={() => setCount((c) => c + 1)} data-testid="more" />
        </div>
      );
    }

    render(<Page />);
    expect(screen.getByTestId('n').textContent).toBe('1');
    act(() => screen.getByTestId('more').click());
    expect(screen.getByTestId('n').textContent).toBe('2');
  });
});

describe('useSemanticDOM', () => {
  it('keeps one instance while the config content is unchanged', () => {
    const { result, rerender } = renderHook(({ depth }) => useSemanticDOM({ maxDepth: depth }), {
      initialProps: { depth: 10 },
    });
    const first = result.current.sdom;
    rerender({ depth: 10 });
    expect(result.current.sdom).toBe(first);
    rerender({ depth: 11 });
    expect(result.current.sdom).not.toBe(first);
  });
});

describe('document hooks', () => {
  it('query, node, landmarks, interactables and certification', () => {
    const doc = parsed(WELL_FORMED);
    const button = doc.interactables.find((n) => n.role === 'button')!;

    const query = renderHook(() => useSemanticQuery(doc, { role: 'link', label: /Docs/ }));
    expect(query.result.current.map((n) => n.label)).toEqual(['Docs']);
    const firstResult = query.result.current;
    query.rerender();
    expect(query.result.current).toBe(firstResult);

    expect(renderHook(() => useSemanticQuery(null, {})).result.current).toEqual([]);
    expect(renderHook(() => useSemanticNode(doc, button.id)).result.current).toBe(button);
    expect(renderHook(() => useSemanticNode(doc, undefined)).result.current).toBeNull();
    expect(renderHook(() => useLandmarks(doc)).result.current).toBe(doc.landmarks);
    expect(renderHook(() => useInteractables(null)).result.current).toEqual([]);
    expect(renderHook(() => useCertification(doc)).result.current).toMatchObject({
      level: 'full', score: 100, failed: 0, isAgentReady: true,
    });
    expect(renderHook(() => useCertification(null)).result.current.isAgentReady).toBe(false);
  });

  it('navigates deterministically', () => {
    const doc = parsed('<nav><a href="/a">A</a><a href="/b">B</a></nav>');
    const { result } = renderHook(() => useSemanticNavigation(doc, { focusableOnly: true }));
    act(() => result.current.setCurrentId(doc.root.id));
    act(() => result.current.goNext());
    expect(result.current.currentNode?.label).toBe('A');
    act(() => result.current.goNextSibling());
    expect(result.current.currentNode?.label).toBe('B');
    act(() => result.current.goPrevious());
    expect(result.current.currentNode?.label).toBe('A');
    act(() => result.current.goLast());
    expect(result.current.currentNode?.label).toBe('B');
    act(() => result.current.goFirst());
    expect(result.current.currentNode?.label).toBe('A');
  });
});

describe('useSSG', () => {
  it('starts in the node state, transitions and records history without a phantom entry', () => {
    const doc = parsed('<input type="checkbox" aria-label="c" />');
    const [id, ssgNode] = [...doc.stateGraph.entries()][0];
    const { result } = renderHook(() => useSSG(id, ssgNode));

    expect(result.current.state).toBe('unchecked');
    expect(result.current.history).toEqual([]);
    expect(result.current.canTransition('toggle')).toBe(true);

    let ok = false;
    act(() => { ok = result.current.transition('toggle'); });
    expect(ok).toBe(true);
    expect(result.current.state).toBe('checked');
    expect(result.current.history.map((h) => `${h.from}>${h.to}`)).toEqual(['unchecked>checked']);

    act(() => { ok = result.current.transition('nope'); });
    expect(ok).toBe(false);
    act(() => result.current.setState('disabled'));
    expect(result.current.history).toHaveLength(2);
  });

  it('is inert without an SSG node', () => {
    const { result } = renderHook(() => useSSG('sdom-x'));
    expect(result.current.state).toBe('idle');
    expect(result.current.transition('toggle')).toBe(false);
    expect(result.current.canTransition('toggle')).toBe(false);
  });
});

describe('useSemanticObserver', () => {
  it('re-parses after DOM and ARIA changes', async () => {
    let doc: SemanticDocument | null = null;
    function Page() {
      const ref = useRef<HTMLDivElement>(null);
      doc = useSemanticObserver(ref, undefined, 5);
      return <div ref={ref}><button id="b">One</button></div>;
    }
    const { container, unmount } = render(<Page />);
    expect(doc!.interactables).toHaveLength(1);

    await act(async () => {
      container.querySelector('button')!.setAttribute('aria-expanded', 'true');
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(doc!.interactables[0].state).toBe('expanded');
    unmount();
  });
});

describe('SemanticDOMProvider', () => {
  it('provides a stable instance and warns once without a provider', () => {
    const seen = new Set<unknown>();
    function Child() {
      seen.add(useSemanticDOMContext().sdom);
      return null;
    }
    const { rerender } = render(<SemanticDOMProvider config={{ maxDepth: 5 }}><Child /></SemanticDOMProvider>);
    rerender(<SemanticDOMProvider config={{ maxDepth: 5 }}><Child /></SemanticDOMProvider>);
    expect(seen.size).toBe(1);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHook(() => useSemanticDOMContext());
    renderHook(() => useSemanticDOMContext());
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
