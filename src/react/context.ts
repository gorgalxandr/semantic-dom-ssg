/**
 * SemanticDOM React Context
 * Provides global context for SemanticDOM configuration and state
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SemanticDOMConfig, SemanticDocument } from '../core/types.js';
import { SemanticDOM, createSemanticDOM } from '../core/semantic-dom.js';

/**
 * Context value type
 */
interface SemanticDOMContextValue {
  sdom: SemanticDOM;
  config: SemanticDOMConfig;
  document: SemanticDocument | null;
  setDocument: (doc: SemanticDocument | null) => void;
}

/**
 * Default context value
 */
const defaultContextValue: SemanticDOMContextValue = {
  sdom: createSemanticDOM(),
  config: {},
  document: null,
  setDocument: () => {},
};

/**
 * SemanticDOM Context
 */
const SemanticDOMContext = createContext<SemanticDOMContextValue>(defaultContextValue);

/**
 * Provider props
 */
interface SemanticDOMProviderProps {
  children: ReactNode;
  config?: SemanticDOMConfig;
  document?: SemanticDocument | null;
  onDocumentChange?: (doc: SemanticDocument | null) => void;
}

/**
 * SemanticDOM Provider component
 */
export function SemanticDOMProvider({
  children,
  config = {},
  document = null,
  onDocumentChange,
}: SemanticDOMProviderProps): JSX.Element {
  const sdom = useMemo(() => createSemanticDOM(config), [config]);

  const value = useMemo(
    () => ({
      sdom,
      config,
      document,
      setDocument: onDocumentChange || (() => {}),
    }),
    [sdom, config, document, onDocumentChange]
  );

  return (
    <SemanticDOMContext.Provider value={value}>
      {children}
    </SemanticDOMContext.Provider>
  );
}

/**
 * Hook to access SemanticDOM context
 */
export function useSemanticDOMContext(): SemanticDOMContextValue {
  const context = useContext(SemanticDOMContext);

  if (context === defaultContextValue) {
    console.warn(
      'useSemanticDOMContext must be used within a SemanticDOMProvider. Using default context.'
    );
  }

  return context;
}
