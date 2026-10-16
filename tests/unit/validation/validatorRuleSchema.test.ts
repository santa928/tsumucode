import { describe, expect, it } from 'vitest';
import { HtmlCssValidationRuleDefinitionSchema } from '../../../src/core/content/schema';
import {
  buildSnapshotPolicy,
  parseValidatorRules,
} from '../../../src/core/validation/validatorRuleSchema';
import { validationRule } from '../../fixtures/validation';

describe('parseValidatorRules', () => {
  it.each(['contains', 'contains-normalized', 'contains-css-declarations'])(
    '%sを配列などの非string演算子として受理しない',
    (operator) => {
      for (const value of [[operator], null, {}, 123]) {
        for (const target of [
          { kind: 'source', file: 'styles.css' },
          { kind: 'selector', selector: '.work-image' },
        ]) {
          const rule = {
            ...validationRule(),
            target,
            assertion: { kind: 'text', operator: value, expected: '.work-image { width:100%; }' },
          };
          expect(HtmlCssValidationRuleDefinitionSchema.safeParse(rule).success).toBe(false);
          expect(() => parseValidatorRules([rule])).toThrow();
        }
      }
    },
  );

  it('CSS宣言比較をauthoringとruntimeの両方でCSS Sourceだけに限定する', () => {
    const rule = validationRule({
      target: { kind: 'source', file: 'styles.css' },
      assertion: {
        kind: 'text',
        operator: 'contains-css-declarations',
        expected: '.work-image { width: 100%; }',
      },
    });
    expect(HtmlCssValidationRuleDefinitionSchema.safeParse(rule).success).toBe(true);
    expect(parseValidatorRules([rule])).toEqual([rule]);
    for (const target of [
      { kind: 'selector', selector: '.work-image' },
      { kind: 'source', file: 'index.html' },
    ]) {
      const invalid = { ...rule, target };
      expect(HtmlCssValidationRuleDefinitionSchema.safeParse(invalid).success).toBe(false);
      expect(() => parseValidatorRules([invalid])).toThrow(/source|CSS file/u);
    }
  });

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

  it('Source targetはtext比較だけを受理する', () => {
    const parsed = parseValidatorRules([
      validationRule({
        target: { kind: 'source', file: 'index.html' },
        assertion: { kind: 'text', operator: 'contains', expected: '\n  <p>本文</p>\n' },
      }),
    ]);
    expect(parsed[0]?.assertion).toMatchObject({ expected: '\n  <p>本文</p>\n' });
    expect(
      parseValidatorRules([
        validationRule({
          target: { kind: 'source', file: 'styles.css' },
          assertion: {
            kind: 'text',
            operator: 'contains-normalized',
            expected: '.card { color: #24323d; }',
          },
        }),
      ])[0]?.assertion,
    ).toMatchObject({ operator: 'contains-normalized' });
    expect(() =>
      parseValidatorRules([
        validationRule({
          target: { kind: 'source', file: 'index.html' },
          assertion: { kind: 'exists' },
        }),
      ]),
    ).toThrow(/source.*text|text.*source/i);
    expect(() =>
      parseValidatorRules([
        validationRule({
          assertion: {
            kind: 'text',
            operator: 'contains-normalized',
            expected: '本文',
          },
        }),
      ]),
    ).toThrow(/contains-normalized.*source|source.*contains-normalized/i);
  });

  it.each([
    ['countのexpected欠落', { kind: 'count', operator: 'equals' }],
    ['contrastの範囲外', { kind: 'contrast', minimum: 0.5 }],
    ['existsの未知field', { kind: 'exists', solutionFiles: {} }],
  ])('%sを拒否する', (_name, assertion) => {
    expect(() =>
      parseValidatorRules([
        {
          ...validationRule(),
          assertion,
        },
      ]),
    ).toThrow(/assertion|契約/i);
  });

  it('Target、Feedback、Rule rootの未知fieldを拒否する', () => {
    for (const rule of [
      {
        ...validationRule(),
        target: { kind: 'selector', selector: 'main', fixtures: [] },
      },
      {
        ...validationRule(),
        feedback: { ...validationRule().feedback, solutionFiles: {} },
      },
      {
        ...validationRule(),
        solutionFiles: {},
      },
    ]) {
      expect(() => parseValidatorRules([rule])).toThrow(/field|target|feedback|契約/i);
    }
  });
});

describe('buildSnapshotPolicy', () => {
  it('hover-styleは通常Styleと分けて有限な対象とPropertyだけを要求する', () => {
    const rules = parseValidatorRules([
      validationRule({
        target: { kind: 'selector', selector: '#action' },
        assertion: {
          kind: 'hover-style',
          property: 'background-color',
          operator: 'equals',
          expected: 'rgb(0, 0, 0)',
        },
      }),
    ]);
    expect(buildSnapshotPolicy(rules)).toMatchObject({
      selectors: ['#action'],
      computedStyles: [],
      hoverSelectors: ['#action'],
      hoverComputedStyles: ['background-color'],
    });
    expect(() =>
      parseValidatorRules([
        validationRule({
          target: { kind: 'node', tagName: 'button' },
          assertion: {
            kind: 'hover-style',
            property: 'color',
            operator: 'equals',
            expected: 'black',
          },
        }),
      ]),
    ).toThrow();
  });

  it('focus-visible-styleは対象Selectorと専用Computed Styleだけを検証用状態へ要求する', () => {
    const policy = buildSnapshotPolicy([
      validationRule({
        target: { kind: 'selector', selector: '.primary-link' },
        assertion: {
          kind: 'focus-visible-style',
          property: 'outline-width',
          operator: 'gte',
          expected: 3,
        } as never,
      }),
    ]);

    expect(policy).toMatchObject({
      focusVisibleSelectors: ['.primary-link'],
      focusVisibleComputedStyles: ['outline-width'],
    });
  });

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
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
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

  it('Source targetはPreview Bridgeの観測項目を増やさない', () => {
    expect(
      buildSnapshotPolicy([
        validationRule({
          target: { kind: 'source', file: 'index.html' },
          assertion: { kind: 'text', operator: 'contains', expected: '  <p>本文</p>' },
        }),
      ]),
    ).toEqual({
      selectors: [],
      attributes: [],
      computedStyles: [],
      focusVisibleSelectors: [],
      focusVisibleComputedStyles: [],
      includeAllElements: false,
    });
  });
});
