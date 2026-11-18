/**
 * SemanticDOM React Context
 * Provides global context for SemanticDOM configuration and state
 */

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import type { SemanticDOMConfig, SemanticDocument } from '../core/types.js';
import { createSemanticDOM, type SemanticDOM } from '../core/semantic-dom.js';

/**
 * Context value type
 */
interface SemanticDOMContextValue {
  sdom: SemanticDOM;
  config: SemanticDOMConfig;
  document: SemanticDocument | null;
  setDocument: (doc: SemanticDocument | null) => void;
}

const noop = (): void => {};

let warnedAboutMissingProvider = false;

/**
 * Default context value
 */
const defaultContextValue: SemanticDOMContextValue = {
  sdom: createSemanticDOM(),
  config: {},
  document: null,
  setDocument: noop,
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
}: SemanticDOMProviderProps): ReactElement {
  // Keyed on content: an inline `config={{...}}` prop is a new object on every render.
  const configKey = JSON.stringify(config);
  const stableConfig = useMemo(() => config, [configKey]);
  const sdom = useMemo(() => createSemanticDOM(stableConfig), [stableConfig]);

  const value = useMemo(
    () => ({
      sdom,
      config: stableConfig,
      document,
      setDocument: onDocumentChange ?? noop,
    }),
    [sdom, stableConfig, document, onDocumentChange]
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

  if (context === defaultContextValue && !warnedAboutMissingProvider) {
    warnedAboutMissingProvider = true;
    console.warn(
      'useSemanticDOMContext must be used within a SemanticDOMProvider. Using default context.'
    );
  }

  return context;
}
