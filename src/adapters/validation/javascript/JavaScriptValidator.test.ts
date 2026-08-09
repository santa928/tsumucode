import { describe, expect, it, vi } from 'vitest';
import type {
  JavaScriptAnalysisInput,
  JavaScriptAnalysisResult,
} from '../../runtime/javascript/analyzer/contracts';
import type {
  JavaScriptInteractionScenario,
  ValidationRuleDefinition,
} from '../../../core/content/types';
import type { InteractionCheckpointResult } from '../../../core/runtime/contracts';
import type { ValidationContext } from '../../../core/validation/contracts';
import {
  previewNode,
  previewSnapshot,
  validationContext,
  validationRule,
} from '../../../../tests/fixtures/validation';
import { JavaScriptValidator } from './JavaScriptValidator';

const SOURCE_HASH = 'a'.repeat(64);
const MODULE_GRAPH_HASH = 'b'.repeat(64);
const MESSAGE = 'JavaScriptで変更しました';

interface AnalyzerDouble {
  readonly analyze: ReturnType<
    typeof vi.fn<(input: JavaScriptAnalysisInput) => Promise<JavaScriptAnalysisResult>>
  >;
  readonly dispose: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

/** Sourceの内容に応じたFactを返す隔離Analyzer doubleを作る。 */
function analyzerDouble(): AnalyzerDouble {
  return {
    analyze: vi.fn(async (input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult> => {
      if ('files' in input) throw new Error('classic Source解析だけを期待しています');
      return {
        status: 'success',
        requestId: 'validator-analysis',
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        file: input.file,
        instrumentedCode: input.source,
        sourceSha256: SOURCE_HASH,
        facts: [
          ...(input.source.includes('textContent')
            ? [
                {
                  kind: 'query-selector-text-content-assignment' as const,
                  selector: '#message',
                  value: MESSAGE,
                  file: input.file,
                  line: 1,
                  column: 1,
                },
              ]
            : []),
          ...(input.source.includes('const questionText')
            ? [
                {
                  kind: 'binding' as const,
                  name: 'questionText',
                  declarationKind: 'const' as const,
                  scopeDepth: 0,
                  file: input.file,
                  line: 1,
                  column: 7,
                },
              ]
            : []),
        ],
        diagnostics: [],
      };
    }),
    dispose: vi.fn(async () => undefined),
  };
}

/** Module Workspace全体から依存FileのFactを返す隔離Analyzer doubleを作る。 */
function moduleAnalyzerDouble(): AnalyzerDouble {
  return {
    analyze: vi.fn(async (input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult> => {
      if (!('files' in input)) throw new Error('Module Workspace解析を期待しています');
      return {
        status: 'success',
        requestId: 'validator-module-analysis',
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        file: input.entryFile,
        entryFile: input.entryFile,
        graphSha256: MODULE_GRAPH_HASH,
        modules: [
          {
            file: 'src/message.js',
            instrumentedCode: `export const update = () => { document.querySelector('#message').textContent = '${MESSAGE}'; };`,
            dependencies: [],
          },
          {
            file: 'src/main.js',
            instrumentedCode: "import { update } from './message.js'; update();",
            dependencies: [
              {
                specifier: './message.js',
                resolvedFile: 'src/message.js',
                start: 23,
                end: 35,
              },
            ],
          },
        ],
        facts: [
          {
            kind: 'query-selector-text-content-assignment',
            selector: '#message',
            value: MESSAGE,
            file: 'src/message.js',
            line: 1,
            column: 30,
          },
        ],
        diagnostics: [],
      };
    }),
    dispose: vi.fn(async () => undefined),
  };
}

/** Source FactとDOM表示を同じrequirementへ束ねるRuleを返す。 */
function javascriptRules(): readonly ValidationRuleDefinition[] {
  return [
    {
      ...validationRule(),
      id: 'message-source',
      groupId: 'message-updated',
      label: 'JavaScriptで文章を変更する',
      target: { kind: 'javascript-source', file: 'script.js' },
      assertion: {
        kind: 'query-selector-text-content-assignment',
        selector: '#message',
        expected: MESSAGE,
      },
    },
    validationRule({
      id: 'message-dom',
      groupId: 'message-updated',
      target: { kind: 'selector', selector: '#message' },
      assertion: { kind: 'text', operator: 'equals', expected: MESSAGE },
    }),
  ];
}

/** JavaScript Validatorの成功条件を満たす同一revisionの入力を返す。 */
function javascriptContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return validationContext({
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'core',
      primaryOutput: 'preview',
    },
    rules: javascriptRules(),
    files: {
      'index.html': '<p id="message">変更前</p>',
      'script.js': `document.querySelector('#message').textContent = '${MESSAGE}';`,
    },
    snapshots: {
      desktop: previewSnapshot({
        nodes: [
          previewNode({
            tagName: 'p',
            matchedSelectors: ['#message'],
            text: MESSAGE,
          }),
        ],
      }),
    },
    evidence: [
      { id: 'javascript.executed', value: true },
      { id: 'javascript.source-sha256', file: 'script.js', value: SOURCE_HASH },
      { id: 'javascript.budget-exhausted', value: false },
    ],
    console: [],
    ...overrides,
  });
}

const INTERACTION_SCENARIO: JavaScriptInteractionScenario = {
  id: 'answer-flow',
  label: '回答して次の問題へ進む',
  actions: [{ id: 'answer', kind: 'click', selector: '#answer' }],
  checkpoints: [
    {
      id: 'score-updated',
      afterActionId: 'answer',
      expectations: [
        { id: 'score-text', kind: 'selector-text', selector: '#score', equals: '1点' },
      ],
    },
  ],
};

/** Scenario Validator test用に同一実行のcheckpoint結果を生成する。 */
function interactionCheckpointResult(
  overrides: Partial<InteractionCheckpointResult> = {},
): InteractionCheckpointResult {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 4,
    frameGeneration: 2,
    viewportId: 'desktop',
    scenarioId: 'answer-flow',
    checkpointId: 'score-updated',
    afterActionId: 'answer',
    expectations: [{ expectationId: 'score-text', passed: true, actual: '1点' }],
    ...overrides,
  };
}

/** 公開Scenario定義と観測結果を同時に持つValidator入力を返す。 */
function javascriptInteractionContext(
  overrides: Partial<ValidationContext> = {},
  scenarios: readonly JavaScriptInteractionScenario[] = [INTERACTION_SCENARIO],
): ValidationContext {
  return javascriptContext({ ...overrides, interactionScenarios: scenarios });
}

describe('JavaScriptValidator', () => {
  it('型付きSource Factと同一実行のConsoleをANDでpassする', async () => {
    const rules: readonly ValidationRuleDefinition[] = [
      {
        ...validationRule(),
        id: 'question-source',
        groupId: 'question-ready',
        label: 'questionTextをconstで宣言する',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: {
            kind: 'binding',
            name: 'questionText',
            declarationKind: 'const',
            scopeDepth: 0,
          },
        },
      },
      {
        ...validationRule(),
        id: 'question-console',
        groupId: 'question-ready',
        label: '問題文をConsoleへ表示する',
        target: { kind: 'javascript-console' },
        assertion: {
          kind: 'javascript-console',
          operator: 'equals',
          expected: [{ level: 'log', text: '問題1' }],
        },
      },
    ];
    const context = javascriptContext({
      rules,
      runtime: {
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'console',
      },
      files: {
        'index.html': '<main>Console演習</main>',
        'script.js': "const questionText = '問題1'; console.log(questionText);",
      },
      console: [{ sequence: 0, level: 'log', text: '問題1' }],
    });
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });

    await expect(validator.validate(context)).resolves.toMatchObject({
      status: 'pass',
      passedRequirementIds: ['question-ready'],
    });
    await expect(
      validator.validate({
        ...context,
        console: [{ sequence: 0, level: 'log', text: '問題2' }],
      }),
    ).resolves.toMatchObject({ status: 'incomplete', passedRequirementIds: [] });
  });

  it('Source Fact・同一Source hash・実行証拠・全viewport DOMをANDでpassする', async () => {
    const analyzer = analyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });

    await expect(validator.validate(javascriptContext())).resolves.toMatchObject({
      status: 'pass',
      executionRevision: 4,
      passedRequirementIds: ['message-updated'],
    });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'script', capabilityProfile: 'core' }),
    );
    expect(analyzer.dispose).toHaveBeenCalledOnce();
  });

  it('ModuleはWorkspaceを一度だけ解析し、Graph hashと依存FileのFactをANDでpassする', async () => {
    const analyzer = moduleAnalyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    const rules = javascriptRules().map((rule) =>
      rule.target.kind === 'javascript-source'
        ? { ...rule, target: { ...rule.target, file: 'src/message.js' } }
        : rule,
    );

    await expect(
      validator.validate(
        javascriptContext({
          runtime: {
            kind: 'javascript',
            entryFile: 'src/main.js',
            sourceType: 'module',
            capabilityProfile: 'modules',
            primaryOutput: 'preview',
          },
          rules,
          files: {
            'index.html': '<p id="message">変更前</p>',
            'src/main.js': "import { update } from './message.js'; update();",
            'src/message.js': `export const update = () => { document.querySelector('#message').textContent = '${MESSAGE}'; };`,
          },
          evidence: [
            { id: 'javascript.executed', value: true },
            { id: 'javascript.module-graph-sha256', value: MODULE_GRAPH_HASH },
            { id: 'javascript.budget-exhausted', value: false },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      status: 'pass',
      executionRevision: 4,
      passedRequirementIds: ['message-updated'],
    });
    expect(analyzer.analyze).toHaveBeenCalledOnce();
    const analysisInput = analyzer.analyze.mock.calls[0]![0];
    expect(analysisInput).toMatchObject({
      entryFile: 'src/main.js',
      sourceType: 'module',
      capabilityProfile: 'modules',
    });
    if (!('files' in analysisInput)) throw new Error('Module Workspace解析ではありません');
    expect(analysisInput.files['src/main.js']).toBe(
      "import { update } from './message.js'; update();",
    );
    expect(analysisInput.files['src/message.js']).toContain("document.querySelector('#message')");
    expect(analyzer.dispose).toHaveBeenCalledOnce();
  });

  it('HTMLだけで表示を偽装してもSource Factがなければincompleteにする', async () => {
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });
    const result = await validator.validate(
      javascriptContext({
        files: {
          'index.html': `<p id="message">${MESSAGE}</p>`,
          'script.js': '// JavaScriptでは変更していません',
        },
      }),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks.find(({ ruleId }) => ruleId === 'message-source')).toMatchObject({
      passed: false,
      requirementPassed: false,
    });
  });

  it('Scenario期待値が未達なら実測値と次の行動を示してincompleteにする', async () => {
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });
    const result = await validator.validate(
      javascriptInteractionContext({
        interactionCheckpoints: {
          desktop: [
            interactionCheckpointResult({
              expectations: [{ expectationId: 'score-text', passed: false, actual: '0点' }],
            }),
          ],
        },
      }),
    );

    expect(result.status).toBe('incomplete');
    const failedCheck = result.checks.find(
      ({ ruleId }) => ruleId === 'interaction:answer-flow:score-updated:score-text',
    );
    expect(failedCheck).toMatchObject({
      passed: false,
      expected: '#score の文章が「1点」になる',
      actual: '0点',
    });
    expect(failedCheck?.nextAction).toContain('回答して次の問題へ進む');
  });

  it.each([
    ['checkpoint欠落', {}],
    ['identity不一致', { desktop: [interactionCheckpointResult({ executionRevision: 3 })] }],
    [
      '未知expectation',
      {
        desktop: [
          interactionCheckpointResult({
            expectations: [
              { expectationId: 'score-text', passed: true, actual: '1点' },
              { expectationId: 'unknown-result', passed: true, actual: 'unknown' },
            ],
          }),
        ],
      },
    ],
    ['checkpoint重複', { desktop: [interactionCheckpointResult(), interactionCheckpointResult()] }],
  ] as const)('%sを学習者の不正解ではなくsystem-errorにする', async (_label, checkpoints) => {
    const analyzer = analyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    const result = await validator.validate(
      javascriptInteractionContext({ interactionCheckpoints: checkpoints }),
    );

    expect(result).toMatchObject({
      status: 'system-error',
      executionRevision: null,
      checks: [],
      passedRequirementIds: [],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'JAVASCRIPT_INTERACTION_RESULT_INVALID',
        kind: 'system',
      }),
    );
    expect(analyzer.analyze).not.toHaveBeenCalled();
  });

  it('5種類のScenario期待値を実測と比較できる文章へ変換する', async () => {
    const scenario: JavaScriptInteractionScenario = {
      id: 'all-expectations',
      label: '結果と操作状態を確認する',
      actions: [{ id: 'confirm', kind: 'click', selector: '#confirm' }],
      checkpoints: [
        {
          id: 'all-ready',
          afterActionId: 'confirm',
          expectations: [
            { id: 'result', kind: 'selector-exists', selector: '#result' },
            { id: 'score', kind: 'selector-text', selector: '#score', equals: '2点' },
            {
              id: 'score-data',
              kind: 'attribute',
              selector: '.card',
              name: 'data-score',
              equals: '2',
            },
            { id: 'next-focus', kind: 'focused', selector: '#next' },
            { id: 'score-log', kind: 'console-includes', includes: 'score=2' },
          ],
        },
      ],
    };
    const result = await new JavaScriptValidator({ analyzerFactory: analyzerDouble }).validate(
      javascriptInteractionContext(
        {
          interactionCheckpoints: {
            desktop: [
              interactionCheckpointResult({
                scenarioId: 'all-expectations',
                checkpointId: 'all-ready',
                afterActionId: 'confirm',
                expectations: scenario.checkpoints[0]!.expectations.map(({ id }) => ({
                  expectationId: id,
                  passed: false,
                  actual: '未達',
                })),
              }),
            ],
          },
        },
        [scenario],
      ),
    );

    expect(result.status).toBe('incomplete');
    expect(result.checks.slice(-5).map(({ expected }) => expected)).toEqual([
      '#result が表示される',
      '#score の文章が「2点」になる',
      '.card の data-score 属性が「2」になる',
      '#next にフォーカスが移る',
      'Consoleに「score=2」が含まれる',
    ]);
  });

  it('現在Sourceと一致しないhash evidenceをsystem-errorにする', async () => {
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });
    const result = await validator.validate(
      javascriptContext({
        evidence: [
          { id: 'javascript.executed', value: true },
          { id: 'javascript.source-sha256', file: 'script.js', value: 'b'.repeat(64) },
          { id: 'javascript.budget-exhausted', value: false },
        ],
      }),
    );

    expect(result).toMatchObject({ status: 'system-error', executionRevision: null });
    expect(result.diagnostics.some(({ code }) => code === 'JAVASCRIPT_SOURCE_HASH_MISMATCH')).toBe(
      true,
    );
  });

  it('syntax/reference/security errorをcode-error、system errorをsystem-errorにする', async () => {
    const learnerError = {
      code: 'JAVASCRIPT_SYNTAX',
      kind: 'syntax' as const,
      severity: 'error' as const,
      message: 'syntax failed',
      learnerMessage: 'コードを確認してください',
    };
    const systemError = {
      ...learnerError,
      code: 'JAVASCRIPT_BRIDGE',
      kind: 'system' as const,
      message: 'bridge failed',
    };
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });

    await expect(
      validator.validate(javascriptContext({ diagnostics: [learnerError] })),
    ).resolves.toMatchObject({ status: 'code-error', executionRevision: 4 });
    await expect(
      validator.validate(javascriptContext({ snapshots: {}, diagnostics: [learnerError] })),
    ).resolves.toMatchObject({ status: 'code-error', executionRevision: null });
    await expect(
      validator.validate(javascriptContext({ diagnostics: [learnerError, systemError] })),
    ).resolves.toMatchObject({ status: 'system-error' });
  });

  it('実行未完了・budget超過・Snapshot identity不一致をsystem-errorにする', async () => {
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });
    const invalidContexts = [
      javascriptContext({
        evidence: [
          { id: 'javascript.executed', value: false },
          { id: 'javascript.source-sha256', file: 'script.js', value: SOURCE_HASH },
          { id: 'javascript.budget-exhausted', value: false },
        ],
      }),
      javascriptContext({
        evidence: [
          { id: 'javascript.executed', value: true },
          { id: 'javascript.source-sha256', file: 'script.js', value: SOURCE_HASH },
          { id: 'javascript.budget-exhausted', value: true },
        ],
      }),
      javascriptContext({
        rules: javascriptRules().map((rule) => ({
          ...rule,
          viewportIds: ['desktop', 'mobile'],
        })),
        snapshots: {
          desktop: previewSnapshot(),
          mobile: previewSnapshot({
            executionRevision: 3,
            viewport: { id: 'mobile', width: 390, height: 844 },
          }),
        },
      }),
    ];

    for (const context of invalidContexts) {
      await expect(validator.validate(context)).resolves.toMatchObject({
        status: 'system-error',
        executionRevision: null,
      });
    }
  });
});
