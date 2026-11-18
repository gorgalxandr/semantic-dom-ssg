import { describe, expect, it } from 'vitest';
import { createSemanticDOM } from './semantic-dom.js';
import { levelForScore, meetsLevel } from './certification.js';
import { isDeterministic } from './state-graph.js';
import { byRole, parse, WELL_FORMED } from '../test/helpers.js';

const sdom = createSemanticDOM();

describe('query', () => {
  const doc = () => parse('<nav><a href="/a">Alpha</a><a href="/b">Beta</a></nav><button>Alpha go</button>');

  it('matches text, label, role lists and limit', () => {
    const d = doc();
    expect(sdom.query(d.root, { text: 'alpha' })).toHaveLength(2);
    expect(sdom.query(d.root, { label: /^Beta$/ })).toHaveLength(1);
    expect(sdom.query(d.root, { role: ['link', 'button'] })).toHaveLength(3);
    expect(sdom.query(d.root, { interactive: true, limit: 2 })).toHaveLength(2);
    expect(sdom.query(d.root, { role: 'link', deep: false })).toHaveLength(0);
  });

  it('is not confused by global regular expressions', () => {
    const d = doc();
    const pattern = /a/g;
    expect(sdom.query(d.root, { label: pattern })).toHaveLength(sdom.query(d.root, { label: pattern }).length);
    expect(sdom.query(d.root, { label: pattern }).length).toBeGreaterThanOrEqual(3);
  });

  it('handles very wide and deep trees', () => {
    const wide = parse('<ul>' + '<li>x</li>'.repeat(20000) + '</ul>', { validate: false, maxNodes: 100000 });
    expect(sdom.query(wide.root, { role: 'listitem' })).toHaveLength(20000);
  });
});

describe('navigate', () => {
  it('moves next/previous from a node that fails the filter', () => {
    const d = parse('<p>Intro</p><button>One</button><p>Mid</p><button>Two</button>');
    const intro = d.root.children[0];
    const next = sdom.navigate(d, intro.id, { direction: 'next', focusableOnly: true });
    expect(next?.label).toBe('One');
    const after = sdom.navigate(d, next!.id, { direction: 'next', focusableOnly: true });
    expect(after?.label).toBe('Two');
    expect(sdom.navigate(d, after!.id, { direction: 'next', focusableOnly: true })).toBeNull();
    expect(sdom.navigate(d, after!.id, { direction: 'next', focusableOnly: true, wrap: true })?.label).toBe('One');
    expect(sdom.navigate(d, after!.id, { direction: 'previous', focusableOnly: true })?.label).toBe('One');
  });

  it('supports parent, children, first, last and skipHidden', () => {
    const d = parse('<nav><a href="/a">A</a><a href="/b" hidden>B</a><a href="/c">C</a></nav>');
    const nav = byRole(d, 'navigation');
    expect(sdom.navigate(d, nav.id, { direction: 'firstChild' })?.label).toBe('A');
    expect(sdom.navigate(d, nav.id, { direction: 'lastChild' })?.label).toBe('C');
    const a = byRole(d, 'link', 0);
    expect(sdom.navigate(d, a.id, { direction: 'parent' })?.id).toBe(nav.id);
    expect(sdom.navigate(d, a.id, { direction: 'nextSibling', skipHidden: true })?.label).toBe('C');
    expect(sdom.navigate(d, a.id, { direction: 'first' })?.id).toBe(d.root.id);
    expect(sdom.navigate(d, a.id, { direction: 'last' })?.label).toBe('C');
    expect(sdom.navigate(d, d.root.id, { direction: 'parent' })).toBeNull();
    expect(sdom.navigate(d, 'sdom-missing', { direction: 'next' })).toBeNull();
  });
});

describe('certification', () => {
  it('gives a complete page full marks', () => {
    const d = parse(WELL_FORMED);
    expect(d.agentReady.failures).toEqual([]);
    expect(d.agentReady.score).toBe(100);
    expect(d.agentReady.level).toBe('full');
    expect(d.agentReady.meetsTarget).toBe(true);
  });

  it('reports unnamed controls and skipped headings with their nodes', () => {
    const d = parse('<h1>A</h1><h3>C</h3><button></button><a href="/x"></a>', { targetCertification: 'full' });
    const failures = Object.fromEntries(d.agentReady.failures.map((f) => [f.id, f]));
    expect(failures['a11y-names'].nodes).toHaveLength(2);
    expect(failures['a11y-headings'].nodes).toHaveLength(1);
    expect(failures['structure-main'].severity).toBe('warning');
    expect(d.agentReady.meetsTarget).toBe(false);
    expect(d.agentReady.score).toBeLessThan(70);
  });

  it('does not penalise static pages for having no tab stops', () => {
    const d = parse('<main><h1>Read me</h1><p>Text</p></main>');
    expect(d.agentReady.failures.map((f) => f.id)).not.toContain('navigation-keyboard');
  });

  it('skips checks when validation is off', () => {
    expect(parse('<p>x</p>', { validate: false }).agentReady).toEqual({
      level: 'none', checks: [], failures: [], score: 0,
    });
  });

  it('orders levels', () => {
    expect([49, 50, 70, 80, 90].map(levelForScore)).toEqual(['none', 'basic', 'standard', 'advanced', 'full']);
    expect(meetsLevel('advanced', 'standard')).toBe(true);
    expect(meetsLevel('basic', 'standard')).toBe(false);
  });
});

describe('state graph', () => {
  it('is deterministic for every interactive node', () => {
    const d = parse(WELL_FORMED + '<button aria-expanded="false">More</button><div role="tab">T</div><video controls></video>');
    expect(d.stateGraph.size).toBe(d.interactables.length);
    for (const node of d.stateGraph.values()) {
      expect(isDeterministic(node.transitions)).toBe(true);
    }
  });

  it('gives checkboxes a transition from their real starting state', () => {
    const d = parse('<input type="checkbox" aria-label="x" />');
    const ssg = d.stateGraph.get(byRole(d, 'checkbox').id)!;
    expect(ssg.currentState).toBe('unchecked');
    expect(ssg.transitions.some((t) => t.from === ssg.currentState && t.trigger === 'toggle')).toBe(true);
  });

  it('is empty when disabled', () => {
    expect(parse('<button>x</button>', { includeStateGraph: false }).stateGraph.size).toBe(0);
  });
});
