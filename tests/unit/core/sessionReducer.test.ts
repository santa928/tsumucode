import { describe, expect, it } from 'vitest';
import {
  createLearningSessionState,
  learningSessionReducer,
} from '../../../src/core/learning/sessionReducer';
import type { ValidationResult } from '../../../src/core/validation/contracts';

describe('LearningSession reducer', () => {
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
});
