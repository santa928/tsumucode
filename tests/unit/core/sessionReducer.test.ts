import { describe, expect, it } from 'vitest';
import {
  createLearningSessionState,
  learningSessionReducer,
} from '../../../src/core/learning/sessionReducer';
import type { ValidationResult } from '../../../src/core/validation/contracts';

describe('LearningSession reducer', () => {
  it('成功Consoleを現在値として保持し、失敗時は直前成功値を明示して残す', () => {
    const initial = createLearningSessionState({
      courseId: 'javascript',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'script.js': 'console.log(42);' },
      selectedFile: 'script.js',
    });
    const consoleRecords = [{ sequence: 0, level: 'log' as const, text: '42' }];
    const success = learningSessionReducer(initial, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [],
      console: consoleRecords,
    });
    const failed = learningSessionReducer(success, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [
        {
          code: 'javascript-runner-system',
          kind: 'system',
          severity: 'error',
          message: 'Runtime failure',
          learnerMessage: 'もう一度試してください。',
        },
      ],
      console: [],
    });

    expect(success.runtimeOutput).toEqual({
      revision: 0,
      updateSequence: 1,
      freshness: 'current',
      console: consoleRecords,
    });
    expect(failed.runtimeOutput).toEqual({
      revision: 0,
      updateSequence: 2,
      freshness: 'previous-success',
      console: consoleRecords,
    });
  });

  it('同じ実行revisionと件数でもRuntime更新順を単調増加させる', () => {
    const initial = createLearningSessionState({
      courseId: 'javascript',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'script.js': 'console.log(42);' },
      selectedFile: 'script.js',
    });
    const first = learningSessionReducer(initial, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [],
      console: [{ sequence: 0, level: 'log', text: '42' }],
    });
    const second = learningSessionReducer(first, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [],
      console: [{ sequence: 0, level: 'log', text: '42' }],
    });

    expect(first.runtimeOutput?.updateSequence).toBe(1);
    expect(second.runtimeOutput?.updateSequence).toBe(2);
  });

  it('編集ではConsoleを前回成功表示へ変え、Resetでは破棄する', () => {
    const initial = createLearningSessionState({
      courseId: 'javascript',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'script.js': 'console.log(42);' },
      selectedFile: 'script.js',
    });
    const success = learningSessionReducer(initial, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [],
      console: [{ sequence: 0, level: 'log', text: '42' }],
    });
    const edited = learningSessionReducer(success, {
      type: 'editor.changed',
      path: 'script.js',
      content: 'console.log(43);',
    });
    const reset = learningSessionReducer(edited, {
      type: 'editor.reset',
      files: { 'script.js': 'console.log(42);' },
      selectedFile: 'script.js',
    });

    expect(edited.runtimeOutput?.freshness).toBe('previous-success');
    expect(reset.runtimeOutput).toBeUndefined();
  });

  it('見直し前の exercise state を一切失わず復帰する', () => {
    const initial = createLearningSessionState({
      courseId: 'fixture',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'index.html': '<h1>積む</h1>', 'style.css': '' },
      selectedFile: 'index.html',
    });
    const exercising = learningSessionReducer(initial, { type: 'phase.exercise' });
    const selected = learningSessionReducer(exercising, {
      type: 'editor.selected',
      path: 'style.css',
    });
    const cursorMoved = learningSessionReducer(selected, {
      type: 'editor.cursor',
      path: 'style.css',
      cursor: { anchor: 2, head: 4 },
    });
    const hintRevealed = learningSessionReducer(cursorMoved, {
      type: 'hint.revealed',
      hintId: 'hint-1',
    });
    const saving = learningSessionReducer(hintRevealed, {
      type: 'save.changed',
      status: 'saving',
    });
    const reviewing = learningSessionReducer(saving, {
      type: 'review.open',
      slideId: 'slide-2',
      scrollOffset: 160,
    });
    const restored = learningSessionReducer(reviewing, { type: 'review.close' });

    expect(restored).toEqual({
      ...saving,
      phase: 'exercise',
      reviewReturn: { slideId: 'slide-2', scrollOffset: 160 },
    });
  });

  it('最新 revision だけを反映し、重複 hint と全状態遷移を安全に扱う', () => {
    const validationResult: ValidationResult = {
      exerciseId: 'ex-1',
      executionRevision: 1,
      status: 'pass',
      checks: [],
      passedRequirementIds: ['requirement-1'],
      diagnostics: [],
      evaluatedAt: '2026-07-10T00:00:00.000Z',
    };
    const initial = createLearningSessionState({
      courseId: 'fixture',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'index.html': '' },
      selectedFile: 'index.html',
    });
    const edited = learningSessionReducer(initial, {
      type: 'editor.changed',
      path: 'index.html',
      content: '<main/>',
    });
    const stalePreview = learningSessionReducer(edited, {
      type: 'preview.completed',
      revision: 0,
      diagnostics: [],
      console: [],
    });
    const staleValidation = learningSessionReducer(stalePreview, {
      type: 'validation.completed',
      revision: 0,
      result: validationResult,
    });
    const previewed = learningSessionReducer(staleValidation, {
      type: 'preview.completed',
      revision: 1,
      diagnostics: [],
      console: [],
    });
    const validated = learningSessionReducer(previewed, {
      type: 'validation.completed',
      revision: 1,
      result: validationResult,
    });
    const hinted = learningSessionReducer(validated, {
      type: 'hint.revealed',
      hintId: 'hint-1',
    });
    const duplicateHint = learningSessionReducer(hinted, {
      type: 'hint.revealed',
      hintId: 'hint-1',
    });
    const completed = learningSessionReducer(duplicateHint, { type: 'phase.completion' });
    const saved = learningSessionReducer(completed, {
      type: 'save.changed',
      status: 'saved',
    });

    expect(initial).toMatchObject({
      phase: 'slide',
      cursors: {},
      executionRevision: 0,
      previewRevision: null,
      diagnostics: [],
      validationHistory: [],
      revealedHintIds: [],
      saveStatus: 'idle',
    });
    expect(edited).toMatchObject({
      files: { 'index.html': '<main/>' },
      executionRevision: 1,
      saveStatus: 'saving',
    });
    expect(stalePreview).toBe(edited);
    expect(staleValidation).toBe(stalePreview);
    expect(previewed.previewRevision).toBe(1);
    expect(validated.validationHistory).toEqual([validationResult]);
    expect(duplicateHint).toBe(hinted);
    expect(saved).toMatchObject({ phase: 'completion', saveStatus: 'saved' });
  });

  it('Starter復元は全fileとExercise-local状態を同じrevisionで原子的に初期化する', () => {
    const starter = { 'index.html': '<h1>最初</h1>', 'styles.css': 'body {}' };
    const validationResult: ValidationResult = {
      exerciseId: 'ex-1',
      executionRevision: 1,
      status: 'pass',
      checks: [],
      passedRequirementIds: ['requirement-1'],
      diagnostics: [],
      evaluatedAt: '2026-07-10T00:00:00.000Z',
    };
    const initial = createLearningSessionState({
      courseId: 'fixture',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      files: { 'index.html': '<h1>編集前</h1>', 'styles.css': '' },
      selectedFile: 'index.html',
    });
    const edited = learningSessionReducer(initial, {
      type: 'editor.changed',
      path: 'index.html',
      content: '<h1>編集後</h1>',
    });
    const cursorMoved = learningSessionReducer(edited, {
      type: 'editor.cursor',
      path: 'index.html',
      cursor: { anchor: 2, head: 4 },
    });
    const previewed = learningSessionReducer(cursorMoved, {
      type: 'preview.completed',
      revision: cursorMoved.executionRevision,
      diagnostics: [
        {
          code: 'fixture-error',
          kind: 'syntax',
          severity: 'error',
          message: '構文エラー',
          learnerMessage: 'タグを閉じてください',
        },
      ],
      console: [],
    });
    const validated = learningSessionReducer(previewed, {
      type: 'validation.completed',
      revision: previewed.executionRevision,
      result: validationResult,
    });
    const hinted = learningSessionReducer(validated, {
      type: 'hint.revealed',
      hintId: 'hint-1',
    });
    const reviewing = learningSessionReducer(hinted, {
      type: 'review.open',
      slideId: 'slide-2',
      scrollOffset: 160,
    });

    const reset = learningSessionReducer(reviewing, {
      type: 'editor.reset',
      files: starter,
      selectedFile: 'index.html',
    });

    expect(reset).toMatchObject({
      phase: 'exercise',
      files: starter,
      selectedFile: 'index.html',
      cursors: {},
      executionRevision: reviewing.executionRevision + 1,
      previewRevision: null,
      diagnostics: [],
      validationHistory: [],
      revealedHintIds: [],
      saveStatus: 'saving',
    });
    expect(reset.reviewReturn).toBeUndefined();
  });
});
