// @vitest-environment node
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin, { configs, rules } from './index.js';

const linter = new Linter({ configType: 'flat' });

function lint(code: string, config = configs['flat/strict']) {
  return linter.verify(code, [{ files: ['**/*.jsx'], ...config }], { filename: 'test.jsx' });
}

function ruleIds(code: string, config = configs['flat/strict']): string[] {
  const messages = lint(code, config);
  expect(messages.filter((m) => m.fatal), JSON.stringify(messages)).toEqual([]);
  return messages.map((m) => m.ruleId ?? '').sort();
}

const only = (rule: string) => ({
  ...configs['flat/strict'],
  rules: { [`semantic-dom/${rule}`]: 'error' as const },
});

describe('plugin shape', () => {
  it('exposes rules, meta and both config styles', () => {
    expect(Object.keys(rules)).toHaveLength(6);
    expect(plugin.meta?.name).toBe('semantic-dom-ssg');
    expect(configs.recommended.plugins).toBeUndefined();
    expect(configs['flat/recommended'].plugins?.['semantic-dom']).toBe(plugin);
    for (const config of Object.values(configs)) {
      for (const name of Object.keys(config.rules ?? {})) {
        expect(rules[name.replace('semantic-dom/', '')], name).toBeDefined();
      }
    }
  });
});

describe('require-accessible-name', () => {
  const run = (code: string) => ruleIds(code, only('require-accessible-name'));

  it('accepts named controls', () => {
    expect(run(`
      const a = <button>Save</button>;
      const b = <button>{label}</button>;
      const c = <button><Icon /></button>;
      const d = <a href="/x" aria-label="Home" />;
      const e = <input id="email" />;
      const f = <input type="hidden" name="t" />;
      const g = <input {...props} />;
      const h = <Button />;
      const i = <a>anchor</a>;
      const j = <input type="submit" />;
      const k = <div role="button" title="Close" />;
    `)).toEqual([]);
  });

  it('reports unnamed controls', () => {
    expect(run(`
      const a = <button></button>;
      const b = <button aria-label="" />;
      const c = <a href="/x">   </a>;
      const d = <input />;
      const e = <div role="button" />;
      const f = <textarea />;
    `)).toHaveLength(6);
  });
});

describe('valid-role', () => {
  const run = (code: string) => ruleIds(code, only('valid-role'));

  it('checks static roles on host elements only', () => {
    expect(run(`
      const a = <div role="button" />;
      const b = <div role={'tab'} />;
      const c = <div role={dynamic} />;
      const d = <Menu role="whatever" />;
      const e = <div role="switch checkbox" />;
    `)).toEqual([]);
    expect(run(`
      const a = <div role="buton" />;
      const b = <div role="" />;
      const c = <div role={\`fancy\`} />;
    `)).toHaveLength(3);
  });
});

describe('semantic-intent', () => {
  it('reports with a working suggestion instead of crashing', () => {
    const messages = lint('const a = <button type="submit">Go</button>;', only('semantic-intent'));
    expect(messages).toHaveLength(1);
    const suggestion = messages[0].suggestions?.[0];
    expect(suggestion?.desc).toBe('Add data-semantic-intent="submit"');
    const code = 'const a = <button type="submit">Go</button>;';
    const [start, end] = suggestion!.fix.range;
    expect(code.slice(0, start) + suggestion!.fix.text + code.slice(end)).toBe(
      'const a = <button data-semantic-intent="submit" type="submit">Go</button>;'
    );
  });

  it('works on elements without attributes and skips annotated ones', () => {
    const messages = lint('const a = <a>x</a>;', only('semantic-intent'));
    expect(messages[0].suggestions?.[0].fix.text).toBe(' data-semantic-intent="navigate"');
    expect(ruleIds('const a = <a data-semantic-intent="navigate">x</a>; const b = <input type="hidden" />;', only('semantic-intent'))).toEqual([]);
  });
});

describe('no-redundant-role', () => {
  it('fixes redundant roles cleanly', () => {
    const config = only('no-redundant-role');
    const code = 'const a = <button role="button" type="button">x</button>; const b = <a role="link">y</a>; const c = <nav role="navigation" />;';
    const result = linter.verifyAndFix(code, [{ files: ['**/*.jsx'], ...config }], { filename: 'test.jsx' });
    expect(result.output).toBe('const a = <button type="button">x</button>; const b = <a role="link">y</a>; const c = <nav />;');
    expect(result.messages).toEqual([]);
  });
});

describe('require-heading-hierarchy', () => {
  const run = (code: string) => ruleIds(code, only('require-heading-hierarchy'));

  it('reports skipped levels within one component', () => {
    expect(run('const A = () => <div><h1>a</h1><h3>c</h3></div>;')).toHaveLength(1);
    expect(run('const A = () => <div><h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2></div>;')).toEqual([]);
  });

  it('tracks each component separately', () => {
    expect(run(`
      function A() { return <h1>a</h1>; }
      function B() { return <section><h3>starts lower</h3><h4>ok</h4></section>; }
      class C { render() { return <h2>c</h2>; } }
    `)).toEqual([]);
  });
});

describe('prefer-semantic-elements', () => {
  it('suggests native elements for div/span roles', () => {
    const run = (code: string) => lint(code, only('prefer-semantic-elements'));
    expect(run('const a = <div role="button" />;')[0].message).toBe('Prefer using <button> instead of <div> with role="button".');
    expect(run('const a = <span role="tooltip" />; const b = <section role="main" />; const c = <div role="constructor" />;')).toEqual([]);
  });
});

describe('recommended config', () => {
  it('lints a realistic component', () => {
    expect(ruleIds(`
      export function Card({ title, onClose }) {
        return (
          <article>
            <h2>{title}</h2>
            <div role="button" onClick={onClose} />
            <ul role="list"><li>x</li></ul>
          </article>
        );
      }
    `, configs['flat/recommended'])).toEqual([
      'semantic-dom/no-redundant-role',
      'semantic-dom/prefer-semantic-elements',
      'semantic-dom/require-accessible-name',
    ]);
  });
});
