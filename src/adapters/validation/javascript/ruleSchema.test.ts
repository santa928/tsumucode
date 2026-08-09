import { describe, expect, it } from 'vitest';
import { validationRule } from '../../../../tests/fixtures/validation';
import {
  buildJavaScriptSnapshotPolicy,
  parseJavaScriptRule,
  parseJavaScriptRules,
} from './ruleSchema';

/** JavaScriptのSource構造を判定する最小Ruleを返す。 */
function sourceRule(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ...validationRule(),
    id: 'message-assignment',
    label: 'JavaScriptで文章を変更する',
    target: { kind: 'javascript-source', file: 'script.js' },
    assertion: {
      kind: 'query-selector-text-content-assignment',
      selector: '#message',
      expected: 'JavaScriptで変更しました',
    },
    ...overrides,
  };
}

/** JavaScriptの型付きFactを判定する最小Ruleを返す。 */
function factRule(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ...validationRule(),
    id: 'question-binding',
    label: 'questionTextをconstで宣言する',
    target: { kind: 'javascript-source', file: 'script.js' },
    assertion: {
      kind: 'javascript-source-fact',
      fact: { kind: 'binding', name: 'questionText', declarationKind: 'const', scopeDepth: 0 },
    },
    ...overrides,
  };
}

/** JavaScriptのbounded Consoleを判定する最小Ruleを返す。 */
function consoleRule(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    ...validationRule(),
    id: 'question-console',
    label: '問題文をConsoleへ表示する',
    target: { kind: 'javascript-console' },
    assertion: {
      kind: 'javascript-console',
      operator: 'equals',
      expected: [{ level: 'log', text: '問題1' }],
    },
    ...overrides,
  };
}

describe('JavaScript rule schema', () => {
  it('strictなSource Ruleを参照共有せず受理する', () => {
    const input = sourceRule();
    const parsed = parseJavaScriptRule(input);

    expect(parsed.target.kind).toBe('javascript-source');
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
  });

  it('strictなSource Fact RuleとConsole Ruleを受理する', () => {
    expect(parseJavaScriptRule(factRule())).toEqual(factRule());
    expect(parseJavaScriptRule(consoleRule())).toEqual(consoleRule());
    expect(parseJavaScriptRules([factRule(), consoleRule()])).toHaveLength(2);
  });

  it.each([
    [
      'Factの未知operator',
      factRule({
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'binary-expression', operator: '**' },
        },
      }),
    ],
    [
      'FactのminimumCount下限違反',
      factRule({
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'branch', branchKind: 'if' },
          minimumCount: 0,
        },
      }),
    ],
    [
      'FactのminimumCount上限違反',
      factRule({
        assertion: {
          kind: 'javascript-source-fact',
          fact: { kind: 'branch', branchKind: 'if' },
          minimumCount: 17,
        },
      }),
    ],
    [
      'Consoleの未知field',
      consoleRule({
        assertion: {
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '問題1', html: '<b>問題1</b>' }],
        },
      }),
    ],
    [
      'Consoleの件数上限違反',
      consoleRule({
        assertion: {
          kind: 'javascript-console',
          operator: 'equals',
          expected: Array.from({ length: 33 }, (_, index) => ({
            level: 'log',
            text: `問題${String(index + 1)}`,
          })),
        },
      }),
    ],
    [
      'Console 1件のUTF-8上限違反',
      consoleRule({
        assertion: {
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '積'.repeat(342) }],
        },
      }),
    ],
  ])('%sをstrict契約で拒否する', (_label, input) => {
    expect(() => parseJavaScriptRule(input)).toThrow();
  });

  it.each([
    ['Rule rootの未知field', sourceRule({ unknown: true })],
    [
      'targetのauthoring-only field',
      sourceRule({
        target: { kind: 'javascript-source', file: 'script.js', solutionFiles: [] },
      }),
    ],
    [
      'assertionの未知field',
      sourceRule({
        assertion: {
          kind: 'query-selector-text-content-assignment',
          selector: '#message',
          expected: 'JavaScriptで変更しました',
          fixtures: [],
        },
      }),
    ],
  ])('%sを拒否する', (_label, input) => {
    expect(() => parseJavaScriptRule(input)).toThrow();
  });

  it('HTML/CSS DOM Ruleを内包し、Source RuleをSnapshot policyへ混ぜない', () => {
    const rules = parseJavaScriptRules([
      sourceRule(),
      consoleRule(),
      validationRule({
        id: 'message-text',
        target: { kind: 'selector', selector: '#message' },
        assertion: { kind: 'text', operator: 'equals', expected: 'JavaScriptで変更しました' },
      }),
    ]);

    expect(buildJavaScriptSnapshotPolicy(rules)).toMatchObject({
      selectors: ['#message'],
      includeAllElements: false,
    });
  });

  it('Console RuleだけではSource Rule必須条件を満たさない', () => {
    expect(() => parseJavaScriptRules([consoleRule()])).toThrow(/Source Rule/u);
  });

  it('空配列・重複ID・同一groupの契約不一致を拒否する', () => {
    expect(() => parseJavaScriptRules([])).toThrow();
    expect(() => parseJavaScriptRules([sourceRule(), sourceRule()])).toThrow(/重複|duplicate/i);
    expect(() =>
      parseJavaScriptRules([
        sourceRule({ groupId: 'message-ready', group: 'all' }),
        validationRule({
          id: 'message-text',
          groupId: 'message-ready',
          group: 'any',
          target: { kind: 'selector', selector: '#message' },
          assertion: { kind: 'text', operator: 'equals', expected: 'JavaScriptで変更しました' },
        }),
      ]),
    ).toThrow(/group/i);
  });
});
