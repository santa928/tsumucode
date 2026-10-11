import { expect, it } from 'vitest';
import { validateRun, PYTHON_PROFILE_ID, PYTHON_EXERCISE_ID, PYTHON_IMAGE } from './protocol.mjs';
import { containerConfig } from './docker-engine.mjs';
import { parsePythonAnalysis } from './python-profile.mjs';
import { validPythonInputLines } from '../../src/core/runtime/pythonLessonProfiles.mjs';

const input = {
  apiVersion: 1,
  exerciseId: PYTHON_EXERCISE_ID,
  runtimeProfileId: PYTHON_PROFILE_ID,
  contentRevision: 'python-r1',
  runId: 'python-run',
  exerciseSessionId: 'python-session',
  executionRevision: 1,
  files: { 'main.py': 'count = 3\nprint(count)\nprint(count + 2)\n' },
};

/** image・command・別教材・別revision・余分なfileで固定profileを拡張できない。 */
it('Python要求は同じLessonとmain.pyだけを許可する', () => {
  expect(validateRun(input, 'javascript-r1', 'python-r1')).toBe(input);
  for (const change of [
    { image: 'python:latest' },
    { command: 'sh' },
    { contentRevision: 'javascript-r1' },
    { exerciseId: 'javascript-ch03-l05-e01' },
    { runtimeProfileId: 'node-closure-v1' },
    { files: { 'main.py': 'print(3)', '../secret': '' } },
    { files: { 'main.py': 'x'.repeat(102401) } },
  ])
    expect(() => validateRun({ ...input, ...change }, 'javascript-r1', 'python-r1')).toThrow();
});

/** 空入力をEOFと区別し、文字数でなくUTF-8 bytesと制御文字を入口で制限する。 */
it('事前入力は空1行とEOFを区別し、境界を超えるdataを拒否する', () => {
  for (const lines of [[], [''], ['つむ'], ['x'.repeat(1024)], Array(16).fill(''), ['\t"\\']])
    expect(validPythonInputLines(lines)).toBe(true);
  for (const lines of [
    ['x'.repeat(1025)],
    ['あ'.repeat(342)],
    Array(17).fill(''),
    ['\n'],
    ['\r'],
    ['\0'],
    ['\u0001'],
    [1],
  ])
    expect(validPythonInputLines(lines)).toBe(false);
  expect(
    validateRun({ ...input, inputLines: [''] }, 'javascript-r1', 'python-r1').inputLines,
  ).toEqual(['']);
  expect(() =>
    validateRun({ ...input, inputLines: ['x'.repeat(1025)] }, 'javascript-r1', 'python-r1'),
  ).toThrow();
});

/** learnerとAST解析は両方とも管理socketもhost fileも取得できない。 */
it('固定CPythonの2用途は同じ隔離を維持する', () => {
  for (const analyze of [false, true]) {
    const value = containerConfig(input.files, 'python-test', true, analyze);
    expect(value.Image).toBe(PYTHON_IMAGE);
    expect(value.User).toBe('1000:1000');
    expect(value.Entrypoint).toEqual(['python']);
    expect(value.HostConfig.Binds).toBeUndefined();
    expect(value.HostConfig.ReadonlyRootfs).toBe(true);
    expect(value.HostConfig.NetworkMode).toBe('none');
    expect(value.HostConfig.Memory).toBe(268435456);
    expect(value.HostConfig.PidsLimit).toBe(64);
    expect(value.HostConfig.CapDrop).toEqual(['ALL']);
    expect(value.HostConfig.SecurityOpt).toContain('seccomp=builtin');
  }
});

/** stdoutを正解packetへ昇格させず、解析専用実行の版と型と終了値を照合する。 */
it('解析の偽装・余剰情報・異常終了を採点factsとして受け入れない', () => {
  const packet = {
    version: '3.14.2',
    supported: true,
    numericVariablePrinted: true,
    sameVariableAdditionPrinted: true,
  };
  expect(parsePythonAnalysis(JSON.stringify(packet), '', 0)).toEqual(packet);
  for (const change of [{ version: '3.12' }, { supported: 'true' }, { grade: 'pass' }])
    expect(() => parsePythonAnalysis(JSON.stringify({ ...packet, ...change }), '', 0)).toThrow();
  expect(() => parsePythonAnalysis(JSON.stringify(packet), '', 1)).toThrow();
  expect(() => parsePythonAnalysis(JSON.stringify(packet), 'warning', 0)).toThrow();
});
