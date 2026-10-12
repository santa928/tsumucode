import { expect, it } from 'vitest';
import type { ValidationContext } from '../../../core/validation/contracts';
import { PythonLessonValidator } from './PythonLessonValidator';
import {
  PYTHON_LESSONS,
  pythonSourceSnapshot,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import { pythonFixedFixtures } from '../../../core/runtime/pythonFixedFixtures.mjs';

/** 実行identity・AST事実・固定suiteを持つ採点入力を組み立てる。 */
async function fixedContext(exerciseId = 'python-basics-ch01-l02-e01'): Promise<ValidationContext> {
  const lesson = PYTHON_LESSONS[exerciseId]!;
  const files =
    lesson.profile === 'module-import-v1'
      ? {
          'main.py': 'from lesson_tools import add_pair\n',
          'lesson_tools.py': 'def add_pair(a, b):\n    return a + b\n',
        }
      : { 'main.py': 'name = input()\nprint(name)\n' };
  const suite = pythonFixedFixtures(lesson.profile);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pythonSourceSnapshot(files, lesson.profile)),
  );
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const evidence = [
    { id: 'python.source-sha256', file: 'main.py', value: hash },
    { id: 'python.executed', value: true },
    { id: 'python.version', value: '3.14.2' },
    { id: 'python.stdout', value: suite[0]!.expectedOutput },
    { id: 'python.input-lines', value: JSON.stringify(suite[0]!.inputLines) },
    { id: 'python.expected-output', value: suite[0]!.expectedOutput },
    ...lesson.facts.map((fact) => ({ id: `python.${fact}`, value: true })),
    {
      id: 'python.fixed-fixtures',
      value: JSON.stringify({
        version: 1,
        purpose: 'grade',
        profile: lesson.profile,
        sourceHash: hash,
        cases: suite.map(({ id }) => ({ id, status: 'succeeded', outputMatched: true })),
      }),
    },
  ];
  return {
    exerciseId,
    files,
    snapshots: {},
    diagnostics: [],
    evidence: [],
    console: [],
    interactionScenarios: [],
    interactionCheckpoints: {},
    now: '2026-10-12T00:00:00Z',
    rules: lesson.facts.map((fact, index) => ({
      id: `${exerciseId}-r0${String(index + 1)}`,
      label: fact,
      required: true,
      group: 'all',
      viewportMode: 'all',
      viewportIds: ['desktop'],
      target: { kind: 'python-source', file: 'main.py' },
      assertion: { kind: 'python-source-fact', fact },
      feedback: { target: 'Source', expected: '教材の条件', nextAction: 'コードを確認する' },
      hintId: 'hint',
      relatedSlideId: 'slide',
    })),
    execution: {
      runId: 'fixed-run',
      exerciseSessionId: 'fixed-session',
      executionRevision: 1,
      backend: 'local',
      engine: 'cpython',
      status: 'succeeded',
      diagnostics: [],
      console: [],
      evidence,
    },
  };
}

it('固定suiteを全件満たす場合だけLocal採点を合格にする', async () => {
  const context = await fixedContext();
  expect((await new PythonLessonValidator('cpython').validate(context)).status).toBe('pass');
  const marker = context.execution!.evidence.find((item) => item.id === 'python.fixed-fixtures')!;
  const packet = JSON.parse(marker.value as string) as { cases: { outputMatched: boolean }[] };
  packet.cases[2]!.outputMatched = false;
  const changed = {
    ...context,
    execution: {
      ...context.execution!,
      evidence: context.execution!.evidence.map((item) =>
        item === marker ? { ...item, value: JSON.stringify(packet) } : item,
      ),
    },
  };
  expect((await new PythonLessonValidator('cpython').validate(changed)).status).toBe('incomplete');
});

it.each(['missing', 'practice', 'partial', 'identity', 'case-id'])(
  '練習や不完全な固定採点証拠を受け付けない: %s',
  async (mode) => {
    const context = await fixedContext();
    const marker = context.execution!.evidence.find((item) => item.id === 'python.fixed-fixtures')!;
    const packet = JSON.parse(marker.value as string) as {
      purpose: string;
      sourceHash: string;
      cases: { id: string }[];
    };
    if (mode !== 'missing') {
      if (mode === 'practice') packet.purpose = 'practice';
      if (mode === 'partial') packet.cases.pop();
      if (mode === 'identity') packet.sourceHash = '0'.repeat(64);
      if (mode === 'case-id') packet.cases[0]!.id = 'another-case';
    }
    const changed = {
      ...context,
      execution: {
        ...context.execution!,
        evidence: context.execution!.evidence.map((item) =>
          item === marker
            ? { ...item, value: mode === 'missing' ? '' : JSON.stringify(packet) }
            : item,
        ),
      },
    };
    expect((await new PythonLessonValidator('cpython').validate(changed)).status).toBe(
      'system-error',
    );
  },
);

it('helperだけの編集でも古い固定採点のhashを失効させる', async () => {
  const context = await fixedContext('python-basics-ch01-l08-e01');
  expect((await new PythonLessonValidator('cpython').validate(context)).status).toBe('pass');
  const changed = {
    ...context,
    files: {
      ...context.files,
      'lesson_tools.py': context.files['lesson_tools.py']! + '\n# 編集\n',
    },
  };
  expect((await new PythonLessonValidator('cpython').validate(changed)).status).toBe(
    'system-error',
  );
});

it('Browser Pythonは既存の実行前入力の採点契約を維持する', async () => {
  const context = await fixedContext();
  const changed: ValidationContext = {
    ...context,
    execution: {
      ...context.execution!,
      backend: 'browser',
      engine: 'browser-python',
      evidence: context.execution!.evidence.filter((item) => item.id !== 'python.fixed-fixtures'),
    },
  };
  expect((await new PythonLessonValidator('browser-python').validate(changed)).status).toBe('pass');
});

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
