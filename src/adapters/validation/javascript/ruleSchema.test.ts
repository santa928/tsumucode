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

describe('JavaScript rule schema', () => {
  it('strictなSource Ruleを参照共有せず受理する', () => {
    const input = sourceRule();
    const parsed = parseJavaScriptRule(input);

    expect(parsed.target.kind).toBe('javascript-source');
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
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
