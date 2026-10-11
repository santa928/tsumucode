import { expect, it } from 'vitest';
import { validateRun, PYTHON_PROFILE_ID } from './protocol.mjs';
import { containerConfig } from './docker-engine.mjs';
import {
  pythonSourceSnapshot,
  validPythonFiles,
} from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { parsePythonAnalysis } from './python-profile.mjs';

const profile = 'module-import-v1';
const files = {
  'main.py': 'from lesson_tools import add\nprint(add(3, 5))\n',
  'lesson_tools.py': 'def add(a, b):\n    return a + b\n',
};
const input = {
  apiVersion: 1,
  exerciseId: 'python-basics-ch01-l08-e01',
  contentRevision: 'r1',
  runtimeProfileId: PYTHON_PROFILE_ID,
  runId: 'module-run',
  exerciseSessionId: 'module-session',
  executionRevision: 0,
  files,
};

it('固定2fileだけへ合計UTF-8上限を適用し、旧教材を広げない', () => {
  expect(validateRun(input, 'js', 'r1')).toBe(input);
  for (const rejected of [
    { 'main.py': '' },
    { ...files, '../lesson_tools.py': '' },
    { 'main.py': '', '/lesson_tools.py': '' },
    { 'main.py': 'あ'.repeat(20000), 'lesson_tools.py': 'あ'.repeat(20000) },
  ])
    expect(() => validateRun({ ...input, files: rejected }, 'js', 'r1')).toThrow();
  expect(() =>
    validateRun({ ...input, exerciseId: 'python-basics-ch01-l01-e01' }, 'js', 'r1'),
  ).toThrow();
  expect(validPythonFiles({ 'main.py': 'x'.repeat(102400), 'lesson_tools.py': '' }, profile)).toBe(
    true,
  );
  expect(validPythonFiles({ 'main.py': 'x'.repeat(102400), 'lesson_tools.py': 'x' }, profile)).toBe(
    false,
  );
});

it('helper変更・file取り違えでSource照合が変わり、keyの挿入順には依存しない', () => {
  const snapshot = pythonSourceSnapshot(files, profile);
  expect(
    pythonSourceSnapshot(
      { 'lesson_tools.py': files['lesson_tools.py'], 'main.py': files['main.py'] },
      profile,
    ),
  ).toBe(snapshot);
  expect(
    pythonSourceSnapshot({ ...files, 'lesson_tools.py': files['lesson_tools.py'] + '\n' }, profile),
  ).not.toBe(snapshot);
  expect(
    pythonSourceSnapshot(
      { 'main.py': files['lesson_tools.py'], 'lesson_tools.py': files['main.py'] },
      profile,
    ),
  ).not.toBe(snapshot);
});

it('新profileの分析・学習containerとも既存のOS・通信・資源制限を維持する', () => {
  for (const analyze of [true, false]) {
    const value = containerConfig(files, 'module-test', true, analyze, { profile });
    expect(value.User).toBe('1000:1000');
    expect(value.HostConfig.ReadonlyRootfs).toBe(true);
    expect(value.HostConfig.NetworkMode).toBe('none');
    expect(value.HostConfig.MemorySwap).toBe(value.HostConfig.Memory);
    expect(value.HostConfig.Memory).toBe(268435456);
    expect(value.HostConfig.NanoCpus).toBe(1000000000);
    expect(value.HostConfig.PidsLimit).toBe(64);
    expect(value.HostConfig.Binds).toBeUndefined();
    expect(value.Cmd.slice(0, 4)).toEqual(['-I', '-S', '-B', '-u']);
  }
});

it('新解析packetの状態・版・型・余剰情報を厳密に検査する', () => {
  const packet = {
    version: '3.14.2',
    analysisVersion: 1,
    state: 'supported',
    supported: true,
    numericVariablePrinted: false,
    sameVariableAdditionPrinted: false,
    moduleImported: true,
    exceptionHandled: false,
    projectSummed: false,
    expectedOutput: '8\n10\n',
    syntaxFile: null,
    syntaxMessage: null,
  };
  expect(parsePythonAnalysis(JSON.stringify(packet), '', 0, profile)).toEqual(packet);
  for (const change of [
    { analysisVersion: 2 },
    { state: 'unsupported' },
    { moduleImported: 'true' },
    { expectedOutput: 8 },
    { syntaxFile: '../main.py' },
    { extra: true },
  ])
    expect(() =>
      parsePythonAnalysis(JSON.stringify({ ...packet, ...change }), '', 0, profile),
    ).toThrow();
});
