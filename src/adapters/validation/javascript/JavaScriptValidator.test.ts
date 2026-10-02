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
import { analyzeJavaScriptSource } from '../../runtime/javascript/analyzer/instrumentJavaScript';

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

/** Guided prefixと同じproject/module純解析入力を作る。 */
function projectModuleContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return javascriptContext({
    runtime: {
      kind: 'javascript',
      entryFile: 'src/main.js',
      sourceType: 'module',
      capabilityProfile: 'project',
      primaryOutput: 'preview',
    },
    rules: javascriptRules().map((rule) =>
      rule.target.kind === 'javascript-source'
        ? { ...rule, target: { ...rule.target, file: 'src/message.js' } }
        : rule,
    ),
    files: {
      'index.html': '<p id="message">変更前</p>',
      'styles.css': 'p{}',
      'src/main.js': "import { update } from './message.js'; update();",
      'src/message.js': `export const update = () => { document.querySelector('#message').textContent = '${MESSAGE}'; };`,
    },
    evidence: [
      { id: 'javascript.executed', value: true },
      { id: 'javascript.module-graph-sha256', value: MODULE_GRAPH_HASH },
      { id: 'javascript.budget-exhausted', value: false },
    ],
    ...overrides,
  });
}

describe('JavaScriptValidator', () => {
  it('明示したBrowser Consoleだけ偽DOMなしで採点し、環境・停止・hash・DOM混在を拒否する', async () => {
    const validator = new JavaScriptValidator({
      analyzerFactory: analyzerDouble,
      browserConsole: true,
    });
    const base = javascriptContext();
    const context: ValidationContext = {
      ...base,
      rules: [javascriptRules()[0]!],
      snapshots: {},
      runtime: {
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'console',
      },
      execution: {
        backend: 'browser',
        engine: 'browser-js',
        runId: 'console-1',
        exerciseSessionId: 'session-1',
        executionRevision: 4,
        status: 'succeeded',
        console: [],
        diagnostics: [],
        evidence: base.evidence,
      },
    };
    expect(await validator.validate(context)).toMatchObject({
      status: 'pass',
      executionRevision: 4,
    });
    expect(
      await new JavaScriptValidator({ analyzerFactory: analyzerDouble }).validate(context),
    ).toMatchObject({ status: 'system-error' });
    for (const status of ['stopped', 'unsupported', 'system-error'] as const) {
      expect(
        await validator.validate({ ...context, execution: { ...context.execution!, status } }),
      ).toMatchObject({ status: 'system-error' });
    }
    expect(
      await validator.validate({
        ...context,
        execution: { ...context.execution!, engine: 'browser-html-css' },
      }),
    ).toMatchObject({ status: 'system-error' });
    expect(await validator.validate({ ...context, rules: javascriptRules() })).toMatchObject({
      status: 'system-error',
    });
    expect(
      await validator.validate({
        ...context,
        evidence: base.evidence.map((item) =>
          item.id === 'javascript.source-sha256' ? { ...item, value: '0'.repeat(64) } : item,
        ),
      }),
    ).toMatchObject({ status: 'system-error' });
  });

  it('Local Nodeは偽DOMなしでsourceを採点し、停止・DOM混在・hash違いを判定不能にする', async () => {
    const validator = new JavaScriptValidator({ analyzerFactory: analyzerDouble });
    const base = javascriptContext();
    const context: ValidationContext = {
      ...base,
      rules: [javascriptRules()[0]!],
      snapshots: {},
      execution: {
        backend: 'local',
        engine: 'node',
        runId: 'node-1',
        exerciseSessionId: 'session-1',
        executionRevision: 4,
        status: 'succeeded',
        console: [],
        diagnostics: [],
        evidence: base.evidence,
      },
    };
    expect(await validator.validate(context)).toMatchObject({
      status: 'pass',
      executionRevision: 4,
    });
    expect(await validator.validate({ ...context, rules: javascriptRules() })).toMatchObject({
      status: 'system-error',
    });
    expect(
      await validator.validate({
        ...context,
        execution: { ...context.execution!, status: 'stopped' },
      }),
    ).toMatchObject({ status: 'system-error' });
    expect(
      await validator.validate({
        ...context,
        evidence: base.evidence.map((item) =>
          item.id === 'javascript.source-sha256' ? { ...item, value: '0'.repeat(64) } : item,
        ),
      }),
    ).toMatchObject({ status: 'system-error' });
  });
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

  it('Data Source Factを同一FileのAnalyzer結果へ照合する', async () => {
    const dataAnalyzer: AnalyzerDouble = {
      analyze: vi.fn(async (input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult> => {
        if ('files' in input) throw new Error('classic Source解析だけを期待しています');
        return {
          status: 'success',
          requestId: 'validator-data-analysis',
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: input.executionRevision,
          file: input.file,
          instrumentedCode: input.source,
          sourceSha256: SOURCE_HASH,
          facts: [
            {
              kind: 'collection-transform',
              method: 'map',
              callbackParameterCount: 1,
              file: input.file,
              line: 1,
              column: 16,
            },
          ] as never,
          diagnostics: [],
        };
      }),
      dispose: vi.fn(async () => undefined),
    };
    const rules = [
      {
        ...validationRule(),
        id: 'questions-map',
        label: 'mapで問題文を変換する',
        target: { kind: 'javascript-source', file: 'script.js' },
        assertion: {
          kind: 'javascript-source-fact',
          fact: {
            kind: 'collection-transform',
            method: 'map',
            callbackParameterCount: 1,
          },
        },
      },
    ] as never;
    const context = javascriptContext({
      rules,
      files: {
        'index.html': '<main>Data演習</main>',
        'script.js': "const labels = ['HTML'].map((question) => `問題: ${question}`);",
      },
    });
    const validator = new JavaScriptValidator({ analyzerFactory: () => dataAnalyzer });

    await expect(validator.validate(context)).resolves.toMatchObject({
      status: 'pass',
      passedRequirementIds: ['questions-map'],
    });
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

  it('project/moduleの同一Workspaceだけpure分析を再利用し、RulesとDOMは毎回評価する', async () => {
    const analyzer = moduleAnalyzerDouble();
    const validator = new JavaScriptValidator({
      analyzerFactory: () => analyzer,
      guardIdentifierFactory: () => '_validGuard',
    });
    await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
      status: 'pass',
    });
    const second = projectModuleContext({
      exerciseId: 'different-prefix',
      now: '2026-10-02T12:00:00Z',
      snapshots: {
        desktop: previewSnapshot({
          nodes: [
            previewNode({ tagName: 'p', matchedSelectors: ['#message'], text: '不正解の表示' }),
          ],
        }),
      },
    });
    await expect(validator.validate(second)).resolves.toMatchObject({
      status: 'incomplete',
      exerciseId: 'different-prefix',
      evaluatedAt: second.now,
    });
    expect(analyzer.analyze).toHaveBeenCalledOnce();
    expect(analyzer.dispose).toHaveBeenCalledOnce();
  });

  it.each([
    'html',
    'css',
    'js',
    'add',
    'delete',
    'entry',
    'session',
    'revision',
    'profile',
    'type',
  ] as const)(
    'projectのcacheは%s変更でhitせず、全Workspaceと解析条件を区別する',
    async (change) => {
      const analyzer = moduleAnalyzerDouble();
      const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
      const original = projectModuleContext({
        files: { ...projectModuleContext().files, 'unused.js': '// available' },
      });
      await validator.validate(original);
      const files = { ...original.files };
      const runtime = { ...original.runtime! };
      const snapshots = { ...original.snapshots };
      if (change === 'html') files['index.html'] = files['index.html']! + ' ';
      if (change === 'css') files['styles.css'] = files['styles.css']! + ' ';
      if (change === 'js') files['src/main.js'] = files['src/main.js']! + ' ';
      if (change === 'add') files['another.js'] = '// new';
      if (change === 'delete') delete files['unused.js'];
      if (change === 'entry') {
        runtime.entryFile = 'src/other.js';
        files['src/other.js'] = '// entry';
      }
      if (change === 'session')
        snapshots['desktop'] = { ...snapshots['desktop']!, exerciseSessionId: 'new-session' };
      if (change === 'revision')
        snapshots['desktop'] = { ...snapshots['desktop']!, executionRevision: 5 };
      if (change === 'profile') runtime.capabilityProfile = 'modules';
      if (change === 'type') runtime.sourceType = 'script';
      await validator.validate(projectModuleContext({ files, runtime, snapshots }));
      expect(analyzer.analyze).toHaveBeenCalledTimes(2);
      if (change === 'profile') {
        await validator.validate(projectModuleContext({ files, runtime, snapshots }));
        expect(analyzer.analyze).toHaveBeenCalledTimes(3);
      }
    },
  );

  it.each(['alias', 'guard', 'session', 'oversized-input'] as const)(
    'cache lookup前にstrictな元%sを拒否し、既存entryへ合流しない',
    async (invalid) => {
      const analyzer = moduleAnalyzerDouble();
      let guard = '_validGuard';
      const validator = new JavaScriptValidator({
        analyzerFactory: () => analyzer,
        guardIdentifierFactory: () => guard,
      });
      await validator.validate(projectModuleContext());
      const bad = projectModuleContext();
      const files = { ...bad.files };
      const snapshots = { ...bad.snapshots };
      if (invalid === 'alias') files['src/./main.js'] = files['src/main.js']!;
      if (invalid === 'guard') guard = 'not-valid-guard';
      if (invalid === 'session')
        snapshots['desktop'] = { ...snapshots['desktop']!, exerciseSessionId: '' };
      if (invalid === 'oversized-input') files['src/main.js'] = 'x'.repeat(100 * 1024 + 1);
      expect(
        (await validator.validate(projectModuleContext({ files, snapshots }))).status,
      ).not.toBe('pass');
      expect(analyzer.analyze).toHaveBeenCalledOnce();
      guard = '_validGuard';
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'pass',
      });
      expect(analyzer.analyze).toHaveBeenCalledTimes(2);
    },
  );

  it('hitでもruntime診断・snapshot identity・graph実行証拠・budgetを毎回拒否する', async () => {
    const analyzer = moduleAnalyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    for (const invalid of ['snapshot', 'evidence', 'budget', 'diagnostic'] as const) {
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'pass',
      });
      const context = projectModuleContext();
      const bad =
        invalid === 'snapshot'
          ? { ...context, snapshots: {} }
          : invalid === 'evidence'
            ? {
                ...context,
                evidence: context.evidence.map((item) =>
                  item.id === 'javascript.module-graph-sha256'
                    ? { ...item, value: 'c'.repeat(64) }
                    : item,
                ),
              }
            : invalid === 'budget'
              ? {
                  ...context,
                  evidence: context.evidence.map((item) =>
                    item.id === 'javascript.budget-exhausted' ? { ...item, value: true } : item,
                  ),
                }
              : {
                  ...context,
                  diagnostics: [
                    {
                      code: 'unsupported',
                      kind: 'unsupported' as const,
                      severity: 'error' as const,
                      message: 'unsupported',
                      learnerMessage: '未採点',
                    },
                  ],
                };
      await expect(validator.validate(bad)).resolves.toMatchObject({
        status: 'system-error',
        checks: [],
      });
    }
  });

  it('元Analyzer payloadの後続mutationを保持JSONへ混ぜない', async () => {
    const analyzer = moduleAnalyzerDouble();
    let original: JavaScriptAnalysisResult | undefined;
    const realAnalyze = analyzer.analyze.getMockImplementation()!;
    analyzer.analyze.mockImplementation(async (input) => {
      original = await realAnalyze(input);
      return original;
    });
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    await validator.validate(projectModuleContext());
    if (original?.status !== 'success') throw new Error('successが必要です');
    (original.facts as unknown[]).splice(0);
    await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
      status: 'pass',
    });
    expect(analyzer.analyze).toHaveBeenCalledOnce();
  });

  it('合法な大型成功payloadは保持1MiBを超えても拒否せず、次回だけ再解析する', async () => {
    const analyzer = moduleAnalyzerDouble();
    const realAnalyze = analyzer.analyze.getMockImplementation()!;
    analyzer.analyze.mockImplementation(async (input) => {
      const result = await realAnalyze(input);
      if (result.status !== 'success' || !('modules' in result))
        throw new Error('module successが必要です');
      return {
        ...result,
        modules: result.modules.map((module) => ({
          ...module,
          instrumentedCode: module.instrumentedCode + ' '.repeat(380 * 1024),
        })),
      };
    });
    const files = {
      ...projectModuleContext().files,
      ...Object.fromEntries(
        [0, 1, 2, 3].map((n) => [`extra${String(n)}.js`, '//' + 'x'.repeat(70 * 1024)]),
      ),
    };
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    await expect(validator.validate(projectModuleContext({ files }))).resolves.toMatchObject({
      status: 'pass',
    });
    await expect(validator.validate(projectModuleContext({ files }))).resolves.toMatchObject({
      status: 'pass',
    });
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
  });

  it.each(['success', 'failure'] as const)(
    '古い%s解析の遅着は後発entryを登録・消去しない',
    async (outcome) => {
      const analyzer = moduleAnalyzerDouble();
      const realAnalyze = analyzer.analyze.getMockImplementation()!;
      let complete!: () => void;
      const pending = new Promise<void>((resolve) => {
        complete = resolve;
      });
      let calls = 0;
      analyzer.analyze.mockImplementation(async (input) => {
        calls += 1;
        if (calls === 1) {
          await pending;
          if (outcome === 'failure') throw new Error('late failure');
        }
        return realAnalyze(input);
      });
      const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
      const old = validator.validate(
        projectModuleContext({
          files: { ...projectModuleContext().files, 'index.html': 'old workspace' },
        }),
      );
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'pass',
      });
      complete();
      await old;
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'pass',
      });
      expect(analyzer.analyze).toHaveBeenCalledTimes(2);
    },
  );

  it('早期invalidも世代を失効させ、遅い旧成功を次回hitへ登録しない', async () => {
    const analyzer = moduleAnalyzerDouble();
    const realAnalyze = analyzer.analyze.getMockImplementation()!;
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let calls = 0;
    analyzer.analyze.mockImplementation(async (input) => {
      calls += 1;
      if (calls === 1) await pending;
      return realAnalyze(input);
    });
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    const old = validator.validate(projectModuleContext());
    const missingRuntime = { ...projectModuleContext() };
    delete missingRuntime.runtime;
    await expect(validator.validate(missingRuntime)).resolves.toMatchObject({
      status: 'system-error',
    });
    complete();
    await old;
    await validator.validate(projectModuleContext());
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
  });

  it('hitでも現在のcheckpointを採点し、未観測checkpointを合格として再利用しない', async () => {
    const analyzer = moduleAnalyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    await validator.validate(projectModuleContext());
    const failed = projectModuleContext({
      interactionScenarios: [INTERACTION_SCENARIO],
      interactionCheckpoints: {
        desktop: [
          interactionCheckpointResult({
            expectations: [{ expectationId: 'score-text', passed: false, actual: '0点' }],
          }),
        ],
      },
    });
    await expect(validator.validate(failed)).resolves.toMatchObject({ status: 'incomplete' });
    expect(analyzer.analyze).toHaveBeenCalledOnce();
    await expect(
      validator.validate({ ...failed, interactionCheckpoints: {} }),
    ).resolves.toMatchObject({ status: 'system-error', checks: [] });
    expect(analyzer.analyze).toHaveBeenCalledOnce();
  });

  it('表示期待値の現在観測がfalseならincompleteと画面表示の説明を返す', async () => {
    const analyzer = moduleAnalyzerDouble();
    const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
    const scenarios: readonly JavaScriptInteractionScenario[] = [
      {
        ...INTERACTION_SCENARIO,
        checkpoints: [
          {
            ...INTERACTION_SCENARIO.checkpoints[0]!,
            expectations: [{ id: 'score-text', kind: 'selector-visible', selector: '#score' }],
          },
        ],
      },
    ];
    const result = await validator.validate(
      projectModuleContext({
        interactionScenarios: scenarios,
        interactionCheckpoints: {
          desktop: [
            interactionCheckpointResult({
              expectations: [{ expectationId: 'score-text', passed: false, actual: 'not visible' }],
            }),
          ],
        },
      }),
    );
    expect(result.status).toBe('incomplete');
    expect(
      result.checks.find(
        ({ ruleId }) => ruleId === 'interaction:answer-flow:score-updated:score-text',
      ),
    ).toMatchObject({
      passed: false,
      expected: '#score の内容が画面に表示される',
      actual: 'not visible',
    });
  });

  it.each(['identity', 'facts'] as const)(
    '不正Worker %s成功payloadはcacheへ保存せず非合格にする',
    async (invalid) => {
      const analyzer = moduleAnalyzerDouble();
      const realAnalyze = analyzer.analyze.getMockImplementation()!;
      analyzer.analyze.mockImplementationOnce(async (input) => {
        const result = await realAnalyze(input);
        if (result.status !== 'success') throw new Error('successが必要です');
        return invalid === 'identity'
          ? { ...result, executionRevision: 99 }
          : { ...result, facts: Array.from({ length: 257 }, () => result.facts[0]!) };
      });
      const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'system-error',
        checks: [],
      });
      await expect(validator.validate(projectModuleContext())).resolves.toMatchObject({
        status: 'pass',
      });
      expect(analyzer.analyze).toHaveBeenCalledTimes(2);
    },
  );

  it('実Analyzerのguard衝突拒否を保持し、元guardとartifactの正答pairだけ再利用する', async () => {
    const context = projectModuleContext();
    let request = 0;
    const analyzer: AnalyzerDouble = {
      analyze: vi.fn((input) =>
        analyzeJavaScriptSource({ ...input, requestId: `real-${String(++request)}` }),
      ),
      dispose: vi.fn(async () => undefined),
    };
    const analysis = await analyzeJavaScriptSource({
      exerciseSessionId: 'probe',
      executionRevision: 4,
      entryFile: 'src/main.js',
      files: Object.fromEntries(
        Object.entries(context.files).filter(([file]) => file.endsWith('.js')),
      ),
      sourceType: 'module',
      capabilityProfile: 'project',
      guardIdentifier: '_validGuard',
      requestId: 'probe',
    });
    if (analysis.status !== 'success' || !('graphSha256' in analysis))
      throw new Error('実正答分析が必要です');
    const evidence = context.evidence.map((item) =>
      item.id === 'javascript.module-graph-sha256'
        ? { ...item, value: analysis.graphSha256 }
        : item,
    );
    const validator = new JavaScriptValidator({
      analyzerFactory: () => analyzer,
      guardIdentifierFactory: () => '_validGuard',
    });
    const collision = {
      ...context.files,
      'src/main.js': context.files['src/main.js']! + '\nconst _validGuard = 1;',
    };
    await expect(
      validator.validate({ ...context, files: collision, evidence }),
    ).resolves.toMatchObject({ status: 'system-error' });
    await expect(validator.validate({ ...context, evidence })).resolves.toMatchObject({
      status: 'pass',
    });
    await expect(validator.validate({ ...context, evidence })).resolves.toMatchObject({
      status: 'pass',
    });
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
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

it('関係factとruntime GoalをANDし、未指定・別Goal・別演習の成功を補完しない', async () => {
  const analyzer = analyzerDouble();
  analyzer.analyze.mockImplementation(async (input) => {
    if ('files' in input) throw new Error('classic only');
    return {
      status: 'success',
      requestId: 'goal-validation',
      exerciseSessionId: input.exerciseSessionId,
      executionRevision: input.executionRevision,
      file: input.file,
      instrumentedCode: input.source,
      sourceSha256: SOURCE_HASH,
      diagnostics: [],
      facts: [
        {
          kind: 'teaching-relation',
          goal: 'question-binding',
          file: input.file,
          line: 1,
          column: 1,
        },
      ],
    };
  });
  const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
  const rules = [
    {
      ...validationRule(),
      id: 'question-relation',
      groupId: 'question-relation',
      target: { kind: 'javascript-source' as const, file: 'script.js' },
      assertion: {
        kind: 'javascript-source-fact' as const,
        fact: { kind: 'teaching-relation' as const, goal: 'question-binding' as const },
      },
    },
  ];
  const original = javascriptContext({ rules });
  const runtime = {
    ...original.runtime!,
    kind: 'javascript' as const,
    teachingGoal: 'question-binding' as const,
  };
  expect((await validator.validate({ ...original, runtime })).status).toBe('pass');
  expect(
    (
      await validator.validate({
        ...original,
        exerciseId: 'another',
        runtime: { ...runtime, teachingGoal: 'console-primitives' },
      })
    ).status,
  ).toBe('incomplete');
  expect((await validator.validate(original)).status).toBe('incomplete');
  expect(analyzer.analyze.mock.calls.map(([input]) => input.teachingGoal)).toEqual([
    'question-binding',
    'console-primitives',
    undefined,
  ]);
});

it('同じproject WorkspaceのcacheをGoal付き不適合入力へ貸さず、失敗後の合法入力は再解析する', async () => {
  const analyzer = moduleAnalyzerDouble();
  const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
  const context = projectModuleContext();
  expect((await validator.validate(context)).status).toBe('pass');
  const invalid = {
    ...context,
    runtime: { ...context.runtime!, teachingGoal: 'question-binding' as const },
  };
  expect((await validator.validate(invalid)).status).toBe('code-error');
  expect(analyzer.analyze).toHaveBeenCalledOnce();
  expect((await validator.validate(context)).status).toBe('pass');
  expect(analyzer.analyze).toHaveBeenCalledTimes(2);
});

it('Validatorでも未知Goalをsource fact成功へ補完せず、解析前に拒否する', async () => {
  const analyzer = analyzerDouble();
  const validator = new JavaScriptValidator({ analyzerFactory: () => analyzer });
  const base = javascriptContext();
  const runtime = { ...base.runtime!, teachingGoal: 'unknown' } as unknown as NonNullable<
    ValidationContext['runtime']
  >;
  expect((await validator.validate({ ...base, runtime })).status).toBe('code-error');
  expect(analyzer.analyze).not.toHaveBeenCalled();
});
