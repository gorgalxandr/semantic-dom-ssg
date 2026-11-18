/**
 * ESLint Plugin for SemanticDOM
 * Provides linting rules for semantic accessibility and agent-readiness
 *
 * @example Flat config (ESLint 9+)
 * ```js
 * import semanticDom from 'semantic-dom-ssg/eslint-plugin';
 * export default [semanticDom.configs['flat/recommended']];
 * ```
 *
 * @packageDocumentation
 */

import type { ESLint, Linter, Rule } from 'eslint';
import { VERSION } from '../core/constants.js';
import { noRedundantRole } from './rules/no-redundant-role.js';
import { preferSemanticElements } from './rules/prefer-semantic-elements.js';
import { requireAccessibleName } from './rules/require-accessible-name.js';
import { requireHeadingHierarchy } from './rules/require-heading-hierarchy.js';
import { semanticIntent } from './rules/semantic-intent.js';
import { validRole } from './rules/valid-role.js';

/**
 * All rules
 */
export const rules: Record<string, Rule.RuleModule> = {
  'require-accessible-name': requireAccessibleName,
  'valid-role': validRole,
  'semantic-intent': semanticIntent,
  'no-redundant-role': noRedundantRole,
  'require-heading-hierarchy': requireHeadingHierarchy,
  'prefer-semantic-elements': preferSemanticElements,
};

type Severity = 'off' | 'warn' | 'error';

function ruleSet(levels: Record<string, Severity>): Linter.RulesRecord {
  return Object.fromEntries(
    Object.entries(levels).map(([name, level]) => [`semantic-dom/${name}`, level])
  );
}

const RULE_SETS = {
  recommended: ruleSet({
    'require-accessible-name': 'error',
    'valid-role': 'error',
    'no-redundant-role': 'warn',
    'require-heading-hierarchy': 'warn',
    'prefer-semantic-elements': 'warn',
  }),
  strict: ruleSet({
    'require-accessible-name': 'error',
    'valid-role': 'error',
    'semantic-intent': 'error',
    'no-redundant-role': 'error',
    'require-heading-hierarchy': 'error',
    'prefer-semantic-elements': 'error',
  }),
  'agent-ready': ruleSet({
    'require-accessible-name': 'error',
    'valid-role': 'error',
    'semantic-intent': 'warn',
    'no-redundant-role': 'warn',
    'require-heading-hierarchy': 'error',
    'prefer-semantic-elements': 'warn',
  }),
} as const;

const plugin: ESLint.Plugin & { configs: Record<string, Linter.Config> } = {
  meta: { name: 'semantic-dom-ssg', version: VERSION },
  rules,
  configs: {},
};

function flatConfig(name: keyof typeof RULE_SETS): Linter.Config {
  return {
    name: `semantic-dom/${name}`,
    plugins: { 'semantic-dom': plugin },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: RULE_SETS[name],
  };
}

/**
 * Configurations.
 * `flat/*` entries are complete flat configs that register the plugin; the
 * unprefixed entries contain rules only, for spreading into your own config.
 */
export const configs: Record<string, Linter.Config> = {
  recommended: { rules: RULE_SETS.recommended },
  strict: { rules: RULE_SETS.strict },
  'agent-ready': { rules: RULE_SETS['agent-ready'] },
  'flat/recommended': flatConfig('recommended'),
  'flat/strict': flatConfig('strict'),
  'flat/agent-ready': flatConfig('agent-ready'),
};

plugin.configs = configs;

/**
 * Plugin export
 */
export default plugin;
