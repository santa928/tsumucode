import { describe, expect, it } from 'vitest';
import type { HtmlCssRuleAssertion } from '../../../src/core/content/types';
import type { PreviewNode } from '../../../src/core/runtime/contracts';
import { ValidatorRuleEngine } from '../../../src/core/validation/validatorRuleEngine';
import {
  previewNode,
  previewSnapshot,
  validationContext,
  validationRule,
} from '../../fixtures/validation';

/** 単一Ruleを指定Snapshotで評価する。 */
async function evaluate(assertion: HtmlCssRuleAssertion, snapshot = previewSnapshot()) {
  return new ValidatorRuleEngine().validate(
    validationContext({ rules: [validationRule({ assertion })], snapshots: { desktop: snapshot } }),
  );
}

describe('ValidatorRuleEngine statusと説明', () => {
  it('source文字列に依存せずSnapshot条件だけでpassする', async () => {
    const result = await evaluate({
      kind: 'computed-style',
      property: 'display',
      operator: 'equals',
      expected: 'grid',
    });

    expect(result).toMatchObject({
      status: 'pass',
      executionRevision: 4,
      passedRequirementIds: ['main-exists'],
      evaluatedAt: '2026-07-10T00:00:00.000Z',
    });
    expect(result.checks[0]).toMatchObject({
      passed: true,
      requirementPassed: true,
      expected: 'main要素が存在する',
      nextAction: 'main要素を追加する',
    });
  });

  it('不足を対象・期待・現在・次の操作へ分けviewport付きで示す', async () => {
    const result = await evaluate(
      { kind: 'computed-style', property: 'display', operator: 'equals', expected: 'flex' },
      previewSnapshot({ nodes: [previewNode({ computedStyles: { display: 'block' } })] }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks[0]).toMatchObject({
      passed: false,
      requirementPassed: false,
      expected: 'main要素が存在する',
      nextAction: 'main要素を追加する',
    });
    expect(result.checks[0]?.actual).toContain('[desktop] block');
  });

  it('system要因をlearner errorより優先し、warningだけなら評価を続ける', async () => {
    const learnerError = {
      code: 'HTML_SYNTAX',
      kind: 'syntax' as const,
      severity: 'error' as const,
      message: 'parse failed',
      learnerMessage: 'HTMLを確認してください',
    };
    const systemError = {
      code: 'BRIDGE_FAILED',
      kind: 'system' as const,
      severity: 'error' as const,
      message: 'bridge failed',
      learnerMessage: 'プレビューを再実行してください',
    };
    const warning = { ...learnerError, severity: 'warning' as const };

    expect(
      (await new ValidatorRuleEngine().validate(validationContext({ diagnostics: [learnerError] })))
        .status,
    ).toBe('code-error');
    expect(
      (
        await new ValidatorRuleEngine().validate(
          validationContext({ snapshots: {}, diagnostics: [learnerError, systemError] }),
        )
      ).status,
    ).toBe('system-error');
    expect(
      (await new ValidatorRuleEngine().validate(validationContext({ diagnostics: [warning] })))
        .status,
    ).toBe('pass');
  });

  it('Snapshot欠落・Record key不一致・session/revision混在をsystem-errorにする', async () => {
    const twoViewportRules = [
      validationRule({ id: 'desktop', viewportIds: ['desktop'] }),
      validationRule({ id: 'mobile', viewportIds: ['mobile'] }),
    ];
    const desktop = previewSnapshot();
    const mobile = previewSnapshot({ viewport: { id: 'mobile', width: 390, height: 844 } });

    const missing = await new ValidatorRuleEngine().validate(
      validationContext({ rules: twoViewportRules, snapshots: { desktop } }),
    );
    const wrongKey = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [validationRule()], snapshots: { desktop: mobile } }),
    );
    const sessionMixed = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: twoViewportRules,
        snapshots: { desktop, mobile: { ...mobile, exerciseSessionId: 'session-2' } },
      }),
    );
    const revisionMixed = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: twoViewportRules,
        snapshots: { desktop, mobile: { ...mobile, executionRevision: 5 } },
      }),
    );

    for (const result of [missing, wrongKey, sessionMixed, revisionMixed]) {
      expect(result.status).toBe('system-error');
      expect(result.executionRevision).toBeNull();
      expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(true);
    }
  });

  it('評価対象外の古いSnapshotはidentity判定へ混ぜない', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        snapshots: {
          desktop: previewSnapshot(),
          stale: previewSnapshot({
            exerciseSessionId: 'old-session',
            executionRevision: 1,
            viewport: { id: 'stale', width: 320, height: 480 },
          }),
        },
      }),
    );

    expect(result.status).toBe('pass');
  });

  it('同じSnapshotのnode indexをRuleごとに再構築しない', async () => {
    const nodes = [previewNode()];
    let nodeReads = 0;
    const snapshot = {
      ...previewSnapshot(),
      get nodes() {
        nodeReads += 1;
        return nodes;
      },
    };
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [validationRule({ id: 'first' }), validationRule({ id: 'second' })],
        snapshots: { desktop: snapshot },
      }),
    );

    expect(result.status).toBe('pass');
    expect(nodeReads).toBe(1);
  });

  it('無効Ruleをthrowせず説明用system diagnosticへ変換する', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [{ ...validationRule(), viewportIds: [] }] }),
    );

    expect(result.status).toBe('system-error');
    expect(result.diagnostics.some(({ code }) => code === 'VALIDATION_RULE_INVALID')).toBe(true);
  });
});

describe('ValidatorRuleEngine assertions', () => {
  const passingCases: ReadonlyArray<readonly [string, HtmlCssRuleAssertion, Partial<PreviewNode>]> =
    [
      ['exists', { kind: 'exists' }, {}],
      ['count equals', { kind: 'count', operator: 'equals', expected: 1 }, {}],
      ['count gte', { kind: 'count', operator: 'gte', expected: 1 }, {}],
      ['count lte', { kind: 'count', operator: 'lte', expected: 1 }, {}],
      [
        'empty attribute present',
        { kind: 'attribute', name: 'disabled', operator: 'present' },
        { attributes: { disabled: '' } },
      ],
      [
        'attribute equals string',
        { kind: 'attribute', name: 'data-mode', operator: 'equals', expected: 'study' },
        { attributes: { 'data-mode': 'study' } },
      ],
      [
        'attribute equals number',
        { kind: 'attribute', name: 'tabindex', operator: 'equals', expected: 2 },
        { attributes: { tabindex: '2' } },
      ],
      [
        'attribute equals boolean',
        { kind: 'attribute', name: 'aria-hidden', operator: 'equals', expected: true },
        { attributes: { 'aria-hidden': 'true' } },
      ],
      [
        'attribute contains',
        { kind: 'attribute', name: 'class', operator: 'contains', expected: 'layout' },
        { attributes: { class: 'page layout' } },
      ],
      [
        'attribute gte',
        { kind: 'attribute', name: 'data-count', operator: 'gte', expected: 2 },
        { attributes: { 'data-count': '2.5' } },
      ],
      [
        'attribute lte',
        { kind: 'attribute', name: 'data-count', operator: 'lte', expected: 2 },
        { attributes: { 'data-count': '-1' } },
      ],
      ['text equals', { kind: 'text', operator: 'equals', expected: '本文' }, { text: '本文' }],
      [
        'text contains',
        { kind: 'text', operator: 'contains', expected: '本文' },
        { text: '学習用の本文です' },
      ],
      [
        'style string equals',
        { kind: 'computed-style', property: 'display', operator: 'equals', expected: 'grid' },
        {},
      ],
      [
        'style contains',
        { kind: 'computed-style', property: 'display', operator: 'contains', expected: 'rid' },
        {},
      ],
      [
        'style number equals',
        {
          kind: 'computed-style',
          property: 'gap',
          operator: 'equals',
          expected: 24,
          tolerance: 0.01,
        },
        {},
      ],
      [
        'style number gte',
        {
          kind: 'computed-style',
          property: 'gap',
          operator: 'gte',
          expected: 23.9,
          tolerance: 0.1,
        },
        {},
      ],
      [
        'style number lte',
        {
          kind: 'computed-style',
          property: 'gap',
          operator: 'lte',
          expected: 24.1,
          tolerance: 0.1,
        },
        {},
      ],
      [
        'rect equals',
        { kind: 'rect', metric: 'width', operator: 'equals', expected: 960, tolerance: 0.1 },
        {},
      ],
      [
        'rect gte',
        { kind: 'rect', metric: 'width', operator: 'gte', expected: 959.9, tolerance: 0.1 },
        {},
      ],
      [
        'rect lte',
        { kind: 'rect', metric: 'width', operator: 'lte', expected: 960.1, tolerance: 0.1 },
        {},
      ],
      ['overflow', { kind: 'overflow-x', operator: 'equals', expected: false }, {}],
      ['focusable', { kind: 'focusable', operator: 'equals', expected: true }, { focusable: true }],
      ['accessible name present', { kind: 'accessible-name', operator: 'present' }, {}],
      [
        'accessible name equals',
        { kind: 'accessible-name', operator: 'equals', expected: 'メインコンテンツ' },
        {},
      ],
      [
        'accessible name contains',
        { kind: 'accessible-name', operator: 'contains', expected: 'コンテンツ' },
        {},
      ],
      ['role present', { kind: 'role', operator: 'present' }, {}],
      ['role equals', { kind: 'role', operator: 'equals', expected: 'main' }, {}],
    ];

  it.each(passingCases)('%sを評価する', async (_label, assertion, nodeOverrides) => {
    const result = await evaluate(
      assertion,
      previewSnapshot({ nodes: [previewNode(nodeOverrides)] }),
    );
    expect(result.status).toBe('pass');
  });

  it('attributeとcomputed styleの数値へ空文字・非有限・複合式・末尾junkを許さない', async () => {
    const attributeRule = {
      kind: 'attribute',
      name: 'data-count',
      operator: 'gte',
      expected: 0,
    } as const;
    for (const value of ['', 'Infinity', '2px', '2x']) {
      expect(
        (
          await evaluate(
            attributeRule,
            previewSnapshot({ nodes: [previewNode({ attributes: { 'data-count': value } })] }),
          )
        ).status,
      ).toBe('incomplete');
    }

    const styleRule = {
      kind: 'computed-style',
      property: 'gap',
      operator: 'gte',
      expected: 0,
    } as const;
    for (const value of ['', 'NaN', 'calc(1px + 2px)', '2px junk', '2%%', '2%foo']) {
      expect(
        (
          await evaluate(
            styleRule,
            previewSnapshot({ nodes: [previewNode({ computedStyles: { gap: value } })] }),
          )
        ).status,
      ).toBe('incomplete');
    }
  });

  it('exists/count以外は0件をfailとし複数targetの全件をdocument orderで評価する', async () => {
    const noTarget = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [validationRule({ target: { kind: 'selector', selector: '.missing' } })],
      }),
    );
    const multipleTargets = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.item' },
            assertion: {
              kind: 'computed-style',
              property: 'display',
              operator: 'equals',
              expected: 'grid',
            },
          }),
        ],
        snapshots: {
          desktop: previewSnapshot({
            nodes: [
              previewNode({
                nodeId: 2,
                documentOrder: 2,
                matchedSelectors: ['.item'],
                computedStyles: { display: 'block' },
              }),
              previewNode({
                nodeId: 1,
                documentOrder: 1,
                matchedSelectors: ['.item'],
                computedStyles: { display: 'grid' },
              }),
            ],
          }),
        },
      }),
    );

    expect(noTarget.status).toBe('incomplete');
    expect(multipleTargets.status).toBe('incomplete');
    expect(multipleTargets.checks[0]?.actual).toContain('grid | block');
  });

  it('countはtarget集合全体の件数を評価する', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.item' },
            assertion: { kind: 'count', operator: 'equals', expected: 2 },
          }),
        ],
        snapshots: {
          desktop: previewSnapshot({
            nodes: [
              previewNode({ nodeId: 1, matchedSelectors: ['.item'] }),
              previewNode({ nodeId: 2, documentOrder: 1, matchedSelectors: ['.item'] }),
            ],
          }),
        },
      }),
    );

    expect(result.status).toBe('pass');
    expect(result.checks[0]?.actual).toContain('2件');
  });

  it.each([
    ['accessible-name', { accessibleName: '' }],
    ['role', { role: '' }],
  ] as const)('%s presentは空文字を未設定として扱う', async (kind, nodeOverrides) => {
    const assertion =
      kind === 'accessible-name'
        ? ({ kind, operator: 'present' } as const)
        : ({ kind, operator: 'present' } as const);
    const result = await evaluate(
      assertion,
      previewSnapshot({ nodes: [previewNode(nodeOverrides)] }),
    );

    expect(result.status).toBe('incomplete');
  });

  it('node targetのtagName・role・textIncludesをANDで絞り込む', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'node', tagName: 'MAIN', role: 'main', textIncludes: '文章' },
          }),
        ],
      }),
    );

    expect(result.status).toBe('pass');
  });
});

describe('ValidatorRuleEngine viewportとRequirement集約', () => {
  it('viewportMode all/anyをRule内で集約する', async () => {
    const desktop = previewSnapshot();
    const mobile = previewSnapshot({
      viewport: { id: 'mobile', width: 390, height: 844 },
      nodes: [previewNode({ computedStyles: { display: 'block' } })],
    });
    const base = validationRule({
      viewportIds: ['desktop', 'mobile'],
      assertion: {
        kind: 'computed-style',
        property: 'display',
        operator: 'equals',
        expected: 'grid',
      },
    });
    const engine = new ValidatorRuleEngine();

    const all = await engine.validate(
      validationContext({
        rules: [{ ...base, viewportMode: 'all' }],
        snapshots: { desktop, mobile },
      }),
    );
    const any = await engine.validate(
      validationContext({
        rules: [{ ...base, viewportMode: 'any' }],
        snapshots: { desktop, mobile },
      }),
    );

    expect(all.status).toBe('incomplete');
    expect(any.status).toBe('pass');
    expect(all.checks[0]?.actual).toContain('[desktop]');
    expect(all.checks[0]?.actual).toContain('[mobile]');
  });

  it('Requirement all/anyを初出順で集約し全memberへ結果を反映する', async () => {
    const flex = validationRule({
      id: 'layout-flex',
      groupId: 'layout-method',
      group: 'any',
      assertion: {
        kind: 'computed-style',
        property: 'display',
        operator: 'equals',
        expected: 'flex',
      },
    });
    const grid = validationRule({
      id: 'layout-grid',
      groupId: 'layout-method',
      group: 'any',
      assertion: {
        kind: 'computed-style',
        property: 'display',
        operator: 'equals',
        expected: 'grid',
      },
    });
    const semantic = validationRule({ id: 'semantic-main', groupId: 'semantic', group: 'all' });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [flex, grid, semantic] }),
    );

    expect(result.status).toBe('pass');
    expect(result.passedRequirementIds).toEqual(['layout-method', 'semantic']);
    expect(result.checks.slice(0, 2).map(({ requirementPassed }) => requirementPassed)).toEqual([
      true,
      true,
    ]);
  });

  it('required Requirementだけを全体statusへ反映する', async () => {
    const optional = validationRule({
      id: 'optional-flex',
      groupId: 'optional-layout',
      required: false,
      assertion: {
        kind: 'computed-style',
        property: 'display',
        operator: 'equals',
        expected: 'flex',
      },
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [optional] }),
    );

    expect(result.status).toBe('pass');
    expect(result.passedRequirementIds).toEqual([]);
    expect(result.checks[0]?.requirementPassed).toBe(false);
  });

  it('Requirement group allは全member合格を要求する', async () => {
    const exists = validationRule({ id: 'main', groupId: 'structure', group: 'all' });
    const flex = validationRule({
      id: 'flex',
      groupId: 'structure',
      group: 'all',
      assertion: {
        kind: 'computed-style',
        property: 'display',
        operator: 'equals',
        expected: 'flex',
      },
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [exists, flex] }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.passedRequirementIds).toEqual([]);
    expect(result.checks.map(({ requirementPassed }) => requirementPassed)).toEqual([false, false]);
  });
});

describe('ValidatorRuleEngine relation', () => {
  const relationSnapshot = previewSnapshot({
    nodes: [
      previewNode({
        nodeId: 10,
        parentId: null,
        documentOrder: 0,
        tagName: 'body',
        matchedSelectors: ['body'],
      }),
      previewNode({
        nodeId: 1,
        parentId: 10,
        documentOrder: 1,
        matchedSelectors: ['main', '.source'],
      }),
      previewNode({
        nodeId: 2,
        parentId: 1,
        documentOrder: 2,
        tagName: 'section',
        matchedSelectors: ['.child', '.other'],
      }),
      previewNode({
        nodeId: 3,
        parentId: 2,
        documentOrder: 3,
        tagName: 'span',
        matchedSelectors: ['.deep'],
      }),
      previewNode({
        nodeId: 4,
        parentId: 10,
        documentOrder: 4,
        tagName: 'aside',
        matchedSelectors: ['.next', '.other'],
      }),
    ],
  });

  it.each([
    ['child', '.child'],
    ['descendant', '.deep'],
    ['next-sibling', '.next'],
    ['before', '.other'],
  ] as const)('%sをsourceから正しく評価する', async (relation, otherSelector) => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.source' },
            assertion: { kind: 'relation', relation, otherSelector },
          }),
        ],
        snapshots: { desktop: relationSnapshot },
      }),
    );

    expect(result.status).toBe('pass');
  });

  it('next-siblingはsource子孫ではなく同じparentの直後Elementを見る', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.source' },
            assertion: { kind: 'relation', relation: 'next-sibling', otherSelector: '.child' },
          }),
        ],
        snapshots: { desktop: relationSnapshot },
      }),
    );

    expect(result.status).toBe('incomplete');
  });

  it('循環parent参照をboundedに終了してfailにする', async () => {
    const cyclic = previewSnapshot({
      nodes: [
        previewNode({ nodeId: 1, parentId: null, matchedSelectors: ['.source'] }),
        previewNode({ nodeId: 2, parentId: 3, documentOrder: 1, matchedSelectors: ['.other'] }),
        previewNode({ nodeId: 3, parentId: 2, documentOrder: 2, matchedSelectors: [] }),
      ],
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.source' },
            assertion: { kind: 'relation', relation: 'descendant', otherSelector: '.other' },
          }),
        ],
        snapshots: { desktop: cyclic },
      }),
    );

    expect(result.status).toBe('incomplete');
  });

  it('複数sourceのrelation結果をnodeId順に説明する', async () => {
    const snapshot = previewSnapshot({
      nodes: [
        previewNode({ nodeId: 1, parentId: null, matchedSelectors: ['.source'] }),
        previewNode({
          nodeId: 2,
          parentId: 1,
          documentOrder: 1,
          matchedSelectors: ['.other'],
        }),
        previewNode({
          nodeId: 3,
          parentId: null,
          documentOrder: 2,
          matchedSelectors: ['.source'],
        }),
      ],
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [
          validationRule({
            target: { kind: 'selector', selector: '.source' },
            assertion: { kind: 'relation', relation: 'child', otherSelector: '.other' },
          }),
        ],
        snapshots: { desktop: snapshot },
      }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks[0]?.actual).toBe('[desktop] #1:成立 | #3:不成立 (child .other)');
  });
});

describe('ValidatorRuleEngine contrast', () => {
  const contrastRule = validationRule({ assertion: { kind: 'contrast', minimum: 4.5 } });

  it('透明前景と祖先背景をsRGBで合成して判定する', async () => {
    const snapshot = previewSnapshot({
      nodes: [
        previewNode({
          nodeId: 1,
          parentId: null,
          documentOrder: 0,
          tagName: 'section',
          matchedSelectors: ['section'],
          computedStyles: {
            color: 'rgb(0, 0, 0)',
            'background-color': 'rgb(255, 255, 255)',
            'background-image': 'none',
          },
        }),
        previewNode({
          nodeId: 2,
          parentId: 1,
          documentOrder: 1,
          matchedSelectors: ['main'],
          computedStyles: {
            color: 'rgba(0, 0, 0, 0.6)',
            'background-color': 'rgba(0, 0, 0, 0)',
            'background-image': 'none',
          },
        }),
      ],
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [contrastRule], snapshots: { desktop: snapshot } }),
    );

    expect(result.status).toBe('pass');
    expect(result.checks[0]?.actual).toMatch(/5\.[0-9]+:1/);
  });

  it('表示用に4.50へ丸めた4.5未満のratioを誤合格にしない', async () => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [contrastRule],
        snapshots: {
          desktop: previewSnapshot({
            nodes: [
              previewNode({
                computedStyles: {
                  color: 'rgba(0, 0, 0, 0.53438)',
                  'background-color': 'rgb(255, 255, 255)',
                  'background-image': 'none',
                },
              }),
            ],
          }),
        },
      }),
    );

    expect(result.checks[0]?.actual).toBe('[desktop] 4.50:1');
    expect(result.status).toBe('incomplete');
  });

  it('documentElement背景まで合成しcanvasを白へ固定しない', async () => {
    const snapshot = previewSnapshot({
      nodes: [
        previewNode({
          nodeId: 1,
          parentId: null,
          tagName: 'html',
          matchedSelectors: ['html'],
          computedStyles: {
            color: 'rgb(0, 0, 0)',
            'background-color': 'rgb(0, 0, 0)',
            'background-image': 'none',
          },
        }),
        previewNode({
          nodeId: 2,
          parentId: 1,
          documentOrder: 1,
          tagName: 'body',
          matchedSelectors: ['body'],
          computedStyles: {
            color: 'rgb(0, 0, 0)',
            'background-color': 'rgba(0, 0, 0, 0)',
            'background-image': 'none',
          },
        }),
        previewNode({
          nodeId: 3,
          parentId: 2,
          documentOrder: 2,
          matchedSelectors: ['main'],
          computedStyles: {
            color: 'rgb(0, 0, 0)',
            'background-color': 'rgba(0, 0, 0, 0)',
            'background-image': 'none',
          },
        }),
      ],
    });
    const result = await new ValidatorRuleEngine().validate(
      validationContext({ rules: [contrastRule], snapshots: { desktop: snapshot } }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks[0]?.actual).toBe('[desktop] 1.00:1');
  });

  it.each([
    [
      'invalid color',
      { color: 'not-a-color', 'background-color': 'white', 'background-image': 'none' },
    ],
    [
      'background image',
      {
        color: 'rgb(0, 0, 0)',
        'background-color': 'white',
        'background-image': 'linear-gradient(red, blue)',
      },
    ],
    [
      'invalid channel',
      { color: 'rgb(300, 0, 0)', 'background-color': 'white', 'background-image': 'none' },
    ],
  ])('%sを黒や白へ黙ってfallbackせずfailにする', async (_label, computedStyles) => {
    const result = await new ValidatorRuleEngine().validate(
      validationContext({
        rules: [contrastRule],
        snapshots: { desktop: previewSnapshot({ nodes: [previewNode({ computedStyles })] }) },
      }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks[0]?.actual).toMatch(/測定できません|measurement/i);
  });
});

describe('ValidatorRuleEngine purity', () => {
  it('rules・snapshots・diagnosticsを変更しない', async () => {
    const context = validationContext();
    const before = structuredClone(context);

    await new ValidatorRuleEngine().validate(context);

    expect(context).toEqual(before);
  });
});
