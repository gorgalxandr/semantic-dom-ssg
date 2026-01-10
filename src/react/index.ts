/**
 * SemanticDOM React Hooks
 * Provides React integration for SemanticDOM and Semantic State Graph
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  SemanticDocument,
  SemanticNode,
  SemanticId,
  SemanticQuery,
  SemanticDOMConfig,
  SSGNode,
  StateType,
  StateTransition,
  NavigationOptions,
} from '../core/types.js';
import { SemanticDOM, createSemanticDOM } from '../core/semantic-dom.js';

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
  const sdom = useMemo(() => createSemanticDOM(config), [config]);

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
  ref: React.RefObject<Element>,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return useMemo(() => {
    if (!document) return [];
    return queryFn(document.root, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, queryFn, JSON.stringify(query), ...deps]);
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
 * Store for SSG state management
 */
class SSGStore {
  private state: Map<SemanticId, StateType> = new Map();
  private history: Map<SemanticId, Array<{ from: StateType; to: StateType; timestamp: number }>> =
    new Map();
  private listeners: Set<() => void> = new Set();

  getState(id: SemanticId): StateType | undefined {
    return this.state.get(id);
  }

  getHistory(id: SemanticId): Array<{ from: StateType; to: StateType; timestamp: number }> {
    return this.history.get(id) || [];
  }

  setState(id: SemanticId, newState: StateType): void {
    const currentState = this.state.get(id) || 'idle';
    if (currentState === newState) return;

    this.state.set(id, newState);

    // Update history
    const hist = this.history.get(id) || [];
    hist.push({ from: currentState, to: newState, timestamp: Date.now() });
    if (hist.length > 100) hist.shift();
    this.history.set(id, hist);

    this.emit();
  }

  transition(id: SemanticId, trigger: string, transitions: StateTransition[]): boolean {
    const currentState = this.state.get(id) || 'idle';
    const transition = transitions.find(
      (t) => t.from === currentState && t.trigger === trigger
    );

    if (transition) {
      this.setState(id, transition.to);
      return true;
    }
    return false;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  getSnapshot(): Map<SemanticId, StateType> {
    return new Map(this.state);
  }
}

// Global store instance
const globalSSGStore = new SSGStore();

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
  history: Array<{ from: StateType; to: StateType; timestamp: number }>;
  canTransition: (trigger: string) => boolean;
} {
  // Initialize state from SSG node if provided
  useEffect(() => {
    if (ssgNode && !globalSSGStore.getState(id)) {
      globalSSGStore.setState(id, ssgNode.currentState);
    }
  }, [id, ssgNode]);

  const state = useSyncExternalStore<StateType>(
    (callback) => globalSSGStore.subscribe(callback),
    () => globalSSGStore.getState(id) || ('idle' as StateType),
    () => 'idle' as StateType
  );

  const history = useMemo(() => globalSSGStore.getHistory(id), [id, state]);

  const setState = useCallback(
    (newState: StateType) => {
      globalSSGStore.setState(id, newState);
    },
    [id]
  );

  const transition = useCallback(
    (trigger: string) => {
      if (!ssgNode) return false;
      return globalSSGStore.transition(id, trigger, ssgNode.transitions);
    },
    [id, ssgNode]
  );

  const canTransition = useCallback(
    (trigger: string) => {
      if (!ssgNode) return false;
      const currentState = globalSSGStore.getState(id) || 'idle';
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
  ref: React.RefObject<Element>,
  config?: SemanticDOMConfig
): SemanticDocument | null {
  const { parse } = useSemanticDOM(config);
  const [document, setDocument] = useState<SemanticDocument | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !ref.current) return;

    const parseDocument = () => {
      if (ref.current) {
        const url = window.location.href;
        const title = window.document.title;
        setDocument(parse(ref.current, url, title));
      }
    };

    // Initial parse
    parseDocument();

    // Observe for changes
    observerRef.current = new MutationObserver(() => {
      parseDocument();
    });

    observerRef.current.observe(ref.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-*', 'role', 'disabled', 'hidden'],
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [ref, parse]);

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
      isAgentReady: agentReady.level !== 'none' && agentReady.level !== 'basic',
    };
  }, [document]);
}

/**
 * Context provider for SemanticDOM
 */
export { SemanticDOMProvider, useSemanticDOMContext } from './context.js';
