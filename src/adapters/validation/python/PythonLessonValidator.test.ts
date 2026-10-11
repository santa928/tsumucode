import { expect, it } from 'vitest';
import type { ValidationContext } from '../../../core/validation/contracts';
import { PythonLessonValidator } from './PythonLessonValidator';

it.each(['browser-python', 'cpython'] as const)(
  '%sの例外に含まれる入力を永続用の採点結果へコピーしない',
  async (engine) => {
    const input = '入力非保存を確認する実値';
    const diagnostic = {
      code: 'python-runtime',
      kind: 'reference',
      severity: 'error',
      file: 'lesson_tools.py',
      line: 2,
      message: `ValueError: invalid literal for int(): '${input}'`,
      learnerMessage: `ValueError: '${input}'`,
    } as const;
    const context: ValidationContext = {
      exerciseId: 'python-basics-ch01-l09-e01',
      files: { 'main.py': '', 'lesson_tools.py': '' },
      rules: [],
      snapshots: {},
      diagnostics: [diagnostic],
      evidence: [],
      console: [{ sequence: 0, level: 'error', text: diagnostic.message }],
      interactionScenarios: [],
      interactionCheckpoints: {},
      now: '2026-10-11T00:00:00Z',
      execution: {
        runId: 'input-error-run',
        exerciseSessionId: 'input-error-session',
        executionRevision: 1,
        backend: engine === 'cpython' ? 'local' : 'browser',
        engine,
        status: 'code-error',
        diagnostics: [diagnostic],
        console: [{ sequence: 0, level: 'error', text: diagnostic.message }],
        evidence: [],
      },
    };
    const result = await new PythonLessonValidator(engine).validate(context);
    expect(result.status).toBe('code-error');
    expect(result.diagnostics[0]).toMatchObject({
      code: diagnostic.code,
      kind: diagnostic.kind,
      file: diagnostic.file,
      line: diagnostic.line,
    });
    expect(JSON.stringify(result)).not.toContain(input);
    expect(context.execution?.diagnostics[0]).toBe(diagnostic);
    expect(context.console[0]?.text).toContain(input);
  },
);
