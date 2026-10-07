// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type {
  JavaScriptAnalysisInput,
  JavaScriptWorkspaceAnalysisSuccess,
} from '../../../src/adapters/runtime/javascript/analyzer/contracts';

vi.mock('virtual:tsumucode-react-preview-source', () => ({ default: 'export function jsx() {}' }));
vi.mock('../../../src/adapters/runtime/javascript/analyzer/JavaScriptAnalyzerClient', () => ({
  JavaScriptAnalyzerClient: class {
    async analyze(input: JavaScriptAnalysisInput): Promise<JavaScriptWorkspaceAnalysisSuccess> {
      if (!('files' in input)) throw new Error('Module入力が必要です');
      return {
        status: 'success',
        requestId: 'identity',
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        file: input.entryFile,
        entryFile: input.entryFile,
        graphSha256: 'a'.repeat(64),
        facts: [],
        diagnostics: [],
        modules: Object.entries(input.files).map(([file, source]) => ({
          file,
          instrumentedCode: source,
          dependencies: [],
        })),
      };
    }
    async dispose(): Promise<void> {}
  },
}));
import {
  ReactModuleAnalyzer,
  prepareReactModules,
  REACT_MODULE_FILE,
} from '../../../src/adapters/runtime/react/ReactModuleAnalyzer';

it('新profileだけuseStateを許可し、任意React exportは開放しない', () => {
  const files = { 'main.js': "import {useState} from 'react';" };
  expect(() => prepareReactModules(files)).toThrow();
  expect(prepareReactModules(files, 'interactive-state-v1')['main.js']).toContain(
    REACT_MODULE_FILE,
  );
  expect(() =>
    prepareReactModules({ 'main.js': "import {useEffect} from 'react';" }, 'interactive-state-v1'),
  ).toThrow();
});

it('毎回変わるguard名を実moduleへ結び、同じSourceの認証hashを変えない', async () => {
  const analyzer = new ReactModuleAnalyzer();
  const input = {
    exerciseSessionId: 'identity',
    executionRevision: 1,
    entryFile: 'main.js',
    sourceType: 'module' as const,
    capabilityProfile: 'dom' as const,
    files: prepareReactModules({ 'main.js': 'export const value = 1;' }),
  };
  const first = await analyzer.analyze({ ...input, guardIdentifier: 'guardFirst' });
  const second = await analyzer.analyze({ ...input, guardIdentifier: 'guardSecond' });
  if (
    first.status !== 'success' ||
    !('modules' in first) ||
    second.status !== 'success' ||
    !('modules' in second)
  )
    throw new Error('Module解析が必要です');
  expect(first.graphSha256).toBe(second.graphSha256);
  expect(
    first.modules.find((module) => module.file === REACT_MODULE_FILE)?.instrumentedCode,
  ).toContain('guardFirst.reportError(error)');
  expect(
    second.modules.find((module) => module.file === REACT_MODULE_FILE)?.instrumentedCode,
  ).toContain('guardSecond.reportError(error)');
});

it('新APIをprofileとFileに限定し、旧profileへ開放しない', () => {
  for (const [profile, file, api] of [
    ['reducer-form-v1', 'components.js', 'useReducer'],
    ['context-sharing-v1', 'nameContext.js', 'createContext'],
    ['context-sharing-v1', 'components.js', 'useContext'],
    ['context-sharing-v1', 'main.js', 'useState'],
  ] as const) {
    const files = { [file]: `import {${api}} from 'react';` };
    expect(prepareReactModules(files, profile)[file]).toContain(REACT_MODULE_FILE);
    expect(() => prepareReactModules({ 'extra.js': files[file]! }, profile)).toThrow();
    expect(() => prepareReactModules(files, 'props-card-v1')).toThrow();
  }
  for (const profile of ['interactive-state-v1', 'controlled-form-v1'] as const) {
    for (const api of ['useReducer', 'createContext', 'useContext']) {
      expect(() =>
        prepareReactModules({ 'main.js': `import {${api}} from 'react';` }, profile),
      ).toThrow();
    }
  }
});

it('Ref/Effectは新しい課題の編集責務だけへ開放する', () => {
  for (const [profile, file, api] of [
    ['ref-focus-v1', 'components.js', 'useRef'],
    ['effect-sync-v1', 'components.js', 'useEffect'],
    ['custom-source-hook-v1', 'sourceHook.js', 'useEffect'],
  ] as const) {
    const code = `import {${api}} from 'react';`;
    expect(prepareReactModules({ [file]: code }, profile)[file]).toContain(REACT_MODULE_FILE);
    expect(() => prepareReactModules({ 'extra.js': code }, profile)).toThrow();
    for (const old of [
      'props-card-v1',
      'static-components-v1',
      'interactive-state-v1',
      'controlled-form-v1',
      'reducer-form-v1',
      'context-sharing-v1',
    ] as const) {
      expect(() => prepareReactModules({ [file]: code }, old)).toThrow();
    }
  }
});

it('クイズは固定親のuseStateと小さい予約stubへ閉じ、他Fileや未使用APIを開放しない', () => {
  const old = prepareReactModules({ 'main.js': 'export const value = 1;' });
  for (const profile of ['quiz-workshop-v1', 'quiz-capstone-v1'] as const) {
    const files = prepareReactModules({ 'main.js': "import { useState } from 'react';" }, profile);
    expect(files[REACT_MODULE_FILE]).toContain('export function useState()');
    expect(files[REACT_MODULE_FILE]).not.toContain('useEffect');
    expect(files[REACT_MODULE_FILE]).not.toContain('useReducer');
    expect(files[REACT_MODULE_FILE]).not.toEqual(old[REACT_MODULE_FILE]);
    for (const file of ['QuestionCard.js', 'quizState.js', 'extra.js']) {
      expect(() =>
        prepareReactModules({ [file]: "import { useState } from 'react';" }, profile),
      ).toThrow();
    }
    for (const api of ['useEffect', 'useReducer', 'useRef', 'createContext', 'useContext']) {
      expect(() =>
        prepareReactModules({ 'main.js': `import { ${api} } from 'react';` }, profile),
      ).toThrow();
    }
    expect(() =>
      prepareReactModules(
        { 'main.js': "import { useState } from './tsumucode-react-runtime.js';" },
        profile,
      ),
    ).toThrow();
  }
  expect(old[REACT_MODULE_FILE]).toContain('useEffect');
});
