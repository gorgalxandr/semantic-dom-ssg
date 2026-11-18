/**
 * SemanticDOM React Hooks
 * Provides React integration for SemanticDOM and Semantic State Graph
 *
 * @packageDocumentation
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type {
  SemanticDocument,
  SemanticNode,
  SemanticId,
  SemanticQuery,
  SemanticDOMConfig,
  SSGNode,
  StateType,
  NavigationOptions,
} from '../core/types.js';
import { meetsLevel } from '../core/certification.js';
import { createSemanticDOM, type SemanticDOM } from '../core/semantic-dom.js';
import { OBSERVED_ATTRIBUTES } from '../vanilla/observer.js';
import { globalSSGStore, type StateChange } from './ssg-store.js';

export { SSGStore, globalSSGStore } from './ssg-store.js';
export type { StateChange } from './ssg-store.js';

/**
 * Describe a value by content so that an object literal passed on every
 * render (`useSemanticDOM({ maxDepth: 10 })`) does not look new each time.
 */
function contentKey(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) => {
    if (v instanceof RegExp) return v.toString();
    if (typeof v === 'function') return `[function ${v.name}]`;
    return v;
  });
}

/** Keep returning the first object seen for as long as its content is equal */
function useStableValue<T>(value: T): T {
  const key = contentKey(value);
  return useMemo(() => value, [key]);
}

/**
 * Hook to create and use a SemanticDOM instance
 */
export function useSemanticDOM(
  config?: SemanticDOMConfig
): {
  sdom: SemanticDOM;
  parse: (element: Element, url?: string, title?: string) => SemanticDocument;
  query: (root: SemanticNode, query: SemanticQuery) => SemanticNode[];
  getById: (document: SemanticDocument, id: SemanticId) => SemanticNode | undefined;
  navigate: (
    document: SemanticDocument,
    currentId: SemanticId,
    options: NavigationOptions
  ) => SemanticNode | null;
} {
  const stableConfig = useStableValue(config);
  const sdom = useMemo(() => createSemanticDOM(stableConfig), [stableConfig]);

  const parse = useCallback(
    (element: Element, url?: string, title?: string) => sdom.parse(element, url, title),
    [sdom]
  );

  const query = useCallback(
    (root: SemanticNode, q: SemanticQuery) => sdom.query(root, q),
    [sdom]
  );

  const getById = useCallback(
    (document: SemanticDocument, id: SemanticId) => sdom.getById(document, id),
    [sdom]
  );

  const navigate = useCallback(
    (document: SemanticDocument, currentId: SemanticId, options: NavigationOptions) =>
      sdom.navigate(document, currentId, options),
    [sdom]
  );

  return { sdom, parse, query, getById, navigate };
}

/**
 * Hook to parse a DOM element ref into a SemanticDocument
 */
export function useSemanticDocument(
  ref: RefObject<Element | null>,
  config?: SemanticDOMConfig,
  deps: unknown[] = []
): SemanticDocument | null {
  const { parse } = useSemanticDOM(config);
  const [document, setDocument] = useState<SemanticDocument | null>(null);

  useEffect(() => {
    if (ref.current) {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      const title = typeof window !== 'undefined' ? window.document.title : '';
      setDocument(parse(ref.current, url, title));
    }
    // `deps` is spread: passing the array itself would be a new value on every
    // render and re-run this effect (and its setState) in an endless loop.
  }, [ref, parse, ...deps]);

  return document;
}

/**
 * Hook to query semantic nodes reactively
 */
export function useSemanticQuery(
  document: SemanticDocument | null,
  query: SemanticQuery,
  deps: unknown[] = []
): SemanticNode[] {
  const { query: queryFn } = useSemanticDOM();
  const stableQuery = useStableValue(query);

  return useMemo(() => {
    if (!document) return [];
    return queryFn(document.root, stableQuery);
  }, [document, queryFn, stableQuery, ...deps]);
}

/**
 * Hook to get a specific node by ID with O(1) lookup
 */
export function useSemanticNode(
  document: SemanticDocument | null,
  id: SemanticId | undefined
): SemanticNode | null {
  const { getById } = useSemanticDOM();

  return useMemo(() => {
    if (!document || !id) return null;
    return getById(document, id) ?? null;
  }, [document, id, getById]);
}

/**
 * Hook for deterministic keyboard navigation
 */
export function useSemanticNavigation(
  document: SemanticDocument | null,
  options?: Partial<NavigationOptions>
): {
  currentId: SemanticId | null;
  setCurrentId: (id: SemanticId | null) => void;
  currentNode: SemanticNode | null;
  goNext: () => void;
  goPrevious: () => void;
  goFirst: () => void;
  goLast: () => void;
  goParent: () => void;
  goFirstChild: () => void;
  goNextSibling: () => void;
  goPreviousSibling: () => void;
} {
  const { navigate, getById } = useSemanticDOM();
  const [currentId, setCurrentId] = useState<SemanticId | null>(null);

  const currentNode = useMemo(() => {
    if (!document || !currentId) return null;
    return getById(document, currentId) ?? null;
  }, [document, currentId, getById]);

  const createNavigator = useCallback(
    (direction: NavigationOptions['direction']) => () => {
      if (!document || !currentId) return;
      const next = navigate(document, currentId, {
        direction,
        ...options,
      });
      if (next) {
        setCurrentId(next.id);
      }
    },
    [document, currentId, navigate, options]
  );

  return {
    currentId,
    setCurrentId,
    currentNode,
    goNext: createNavigator('next'),
    goPrevious: createNavigator('previous'),
    goFirst: createNavigator('first'),
    goLast: createNavigator('last'),
    goParent: createNavigator('parent'),
    goFirstChild: createNavigator('firstChild'),
    goNextSibling: createNavigator('nextSibling'),
    goPreviousSibling: createNavigator('previousSibling'),
  };
}

/**
 * Hook for SSG state management
 */
export function useSSG(
  id: SemanticId,
  ssgNode?: SSGNode
): {
  state: StateType;
  setState: (state: StateType) => void;
  transition: (trigger: string) => boolean;
  history: StateChange[];
  canTransition: (trigger: string) => boolean;
} {
  const initialState: StateType = ssgNode?.currentState ?? 'idle';

  // Seed the store from the SSG node; this is not a transition, so it leaves
  // no history entry.
  useEffect(() => {
    globalSSGStore.initialize(id, initialState);
  }, [id, initialState]);

  const subscribe = useCallback((callback: () => void) => globalSSGStore.subscribe(callback), []);

  const state = useSyncExternalStore<StateType>(
    subscribe,
    () => globalSSGStore.getState(id) ?? initialState,
    () => initialState
  );

  const history = useSyncExternalStore<StateChange[]>(
    subscribe,
    () => globalSSGStore.getHistory(id),
    () => globalSSGStore.getHistory(id)
  );

  const setState = useCallback(
    (newState: StateType) => {
      globalSSGStore.setState(id, newState);
    },
    [id]
  );

  const transition = useCallback(
    (trigger: string) => {
      if (!ssgNode) return false;
      globalSSGStore.initialize(id, ssgNode.currentState);
      return globalSSGStore.transition(id, trigger, ssgNode.transitions);
    },
    [id, ssgNode]
  );

  const canTransition = useCallback(
    (trigger: string) => {
      if (!ssgNode) return false;
      const currentState = globalSSGStore.getState(id) ?? ssgNode.currentState;
      return ssgNode.transitions.some(
        (t) => t.from === currentState && t.trigger === trigger
      );
    },
    [id, ssgNode]
  );

  return { state, setState, transition, history, canTransition };
}

/**
 * Hook to observe document state and re-parse on changes
 */
export function useSemanticObserver(
  ref: RefObject<Element | null>,
  config?: SemanticDOMConfig,
  debounceMs = 100
): SemanticDocument | null {
  const { parse } = useSemanticDOM(config);
  const [document, setDocument] = useState<SemanticDocument | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (typeof window === 'undefined' || !element) return;

    const parseDocument = () => {
      setDocument(parse(element, window.location.href, window.document.title));
    };

    parseDocument();
    if (typeof MutationObserver === 'undefined') return;

    // Bursts of mutations (a framework commit touches many nodes) collapse
    // into one re-parse.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(parseDocument, debounceMs);
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...OBSERVED_ATTRIBUTES],
    });

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref, parse, debounceMs]);

  return document;
}

/**
 * Hook to get landmarks from a semantic document
 */
export function useLandmarks(document: SemanticDocument | null): SemanticNode[] {
  return useMemo(() => {
    if (!document) return [];
    return document.landmarks;
  }, [document]);
}

/**
 * Hook to get interactable elements from a semantic document
 */
export function useInteractables(document: SemanticDocument | null): SemanticNode[] {
  return useMemo(() => {
    if (!document) return [];
    return document.interactables;
  }, [document]);
}

/**
 * Hook to check agent certification level
 */
export function useCertification(document: SemanticDocument | null): {
  level: string;
  score: number;
  passed: number;
  failed: number;
  isAgentReady: boolean;
} {
  return useMemo(() => {
    if (!document) {
      return { level: 'none', score: 0, passed: 0, failed: 0, isAgentReady: false };
    }

    const { agentReady } = document;
    return {
      level: agentReady.level,
      score: agentReady.score,
      passed: agentReady.checks.length,
      failed: agentReady.failures.length,
      isAgentReady: meetsLevel(agentReady.level, 'standard'),
    };
  }, [document]);
}

/**
 * Context provider for SemanticDOM
 */
export { SemanticDOMProvider, useSemanticDOMContext } from './context.js';
