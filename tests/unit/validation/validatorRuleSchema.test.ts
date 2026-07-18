import { describe, expect, it } from 'vitest';
import {
  buildSnapshotPolicy,
  parseValidatorRules,
} from '../../../src/core/validation/validatorRuleSchema';
import { validationRule } from '../../fixtures/validation';

describe('parseValidatorRules', () => {
  it('検証済みRuleを入力と参照共有せず返す', () => {
    const input = [validationRule()];
    const parsed = parseValidatorRules(input);

    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed[0]).not.toBe(input[0]);
  });

  it('空配列と重複Rule IDを拒否する', () => {
    expect(() => parseValidatorRules([])).toThrow();
    expect(() => parseValidatorRules([validationRule(), validationRule()])).toThrow(
      /重複|duplicate/i,
    );
  });

  it('同じRequirement内のgroupとrequired不一致を拒否する', () => {
    expect(() =>
      parseValidatorRules([
        validationRule({ id: 'a', groupId: 'layout', group: 'all' }),
        validationRule({ id: 'b', groupId: 'layout', group: 'any' }),
      ]),
    ).toThrow(/group/i);
    expect(() =>
      parseValidatorRules([
        validationRule({ id: 'a', groupId: 'layout', required: true }),
        validationRule({ id: 'b', groupId: 'layout', required: false }),
      ]),
    ).toThrow(/required/i);
  });
});

describe('buildSnapshotPolicy', () => {
  it('観測fieldを重複排除・辞書順で抽出しcontrastの背景画像とnode全件を要求する', () => {
    const policy = buildSnapshotPolicy([
      validationRule({
        id: 'z-style',
        target: { kind: 'selector', selector: '.z' },
        assertion: {
          kind: 'computed-style',
          property: 'display',
          operator: 'equals',
          expected: 'grid',
        },
      }),
      validationRule({
        id: 'a-attribute',
        target: { kind: 'selector', selector: '.a' },
        assertion: { kind: 'attribute', name: 'aria-label', operator: 'present' },
      }),
      validationRule({
        id: 'relation',
        target: { kind: 'selector', selector: '.z' },
        assertion: { kind: 'relation', relation: 'child', otherSelector: '.item' },
      }),
      validationRule({
        id: 'contrast',
        target: { kind: 'node', role: 'main' },
        assertion: { kind: 'contrast', minimum: 4.5 },
      }),
    ]);

    expect(policy).toEqual({
      selectors: ['.a', '.item', '.z'],
      attributes: ['aria-label'],
      computedStyles: ['background-color', 'background-image', 'color', 'display'],
      includeAllElements: true,
    });
  });

  it('Bridge上限を超えるselector・attribute・computed styleを事前拒否する', () => {
    expect(() =>
      buildSnapshotPolicy(
        Array.from({ length: 65 }, (_, index) =>
          validationRule({
            id: `rule-${String(index)}`,
            target: { kind: 'selector', selector: `.s-${String(index)}` },
          }),
        ),
      ),
    ).toThrow(/selector.*64/i);

    expect(() =>
      buildSnapshotPolicy(
        Array.from({ length: 65 }, (_, index) =>
          validationRule({
            id: `rule-${String(index)}`,
            assertion: { kind: 'attribute', name: `data-${String(index)}`, operator: 'present' },
          }),
        ),
      ),
    ).toThrow(/attribute.*64/i);

    expect(() =>
      buildSnapshotPolicy(
        Array.from({ length: 129 }, (_, index) =>
          validationRule({
            id: `rule-${String(index)}`,
            assertion: {
              kind: 'computed-style',
              property: `--property-${String(index)}`,
              operator: 'equals',
              expected: 'value',
            },
          }),
        ),
      ),
    ).toThrow(/computed.*128/i);
  });

  it('next-siblingは非対象の中間Elementも観測して直後関係を確定する', () => {
    const policy = buildSnapshotPolicy([
      validationRule({
        target: { kind: 'selector', selector: '.source' },
        assertion: { kind: 'relation', relation: 'next-sibling', otherSelector: '.candidate' },
      }),
    ]);

    expect(policy.includeAllElements).toBe(true);
  });
});
