import { describe, expect, it, vi } from 'vitest';
import type {
  JavaScriptAnalysisInput,
  JavaScriptAnalysisResult,
} from '../../runtime/javascript/analyzer/contracts';
import type { ValidationRuleDefinition } from '../../../core/content/types';
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
        facts: input.source.includes('textContent')
          ? [
              {
                kind: 'query-selector-text-content-assignment',
                selector: '#message',
                value: MESSAGE,
                file: input.file,
                line: 1,
                column: 1,
              },
            ]
          : [],
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
    ...overrides,
  });
}

describe('JavaScriptValidator', () => {
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
