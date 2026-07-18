import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../../src/core/content/types';
import type { ExerciseDraft, ProgressRepository } from '../../../src/core/persistence/contracts';
import { LearningSessionController } from '../../../src/features/learning/session';
import { FixtureRunnerAdapter, FixtureValidatorAdapter } from '../../fixtures/fixtureAdapters';

describe('guided project workspace continuity', () => {
  it('別Exerciseでも保存Sourceを優先しstarterだけの新規Fileを追加する', async () => {
    const stored = {
      courseId: 'html-css',
      lessonId: 'step-1',
      exerciseId: 'ex-1',
      workspaceId: 'profile-project',
      contentRevision: 'rev',
      editRevision: 3,
      files: { 'index.html': '<main>工程1</main>' },
      selectedFile: 'index.html',
      cursors: { 'index.html': { anchor: 5, head: 5 } },
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {},
      updatedAt: '2026-07-10T00:00:00.000Z',
    } satisfies ExerciseDraft;
    const getDraft = vi.fn(async () => stored);
    const repository = { getDraft, putDraft: vi.fn() } as unknown as ProgressRepository;
    const exercise = {
      id: 'ex-2',
      workspaceId: 'profile-project',
      files: [
        {
          path: 'index.html',
          language: 'fixture-lang',
          content: '<main>starterで上書きしない</main>',
          editable: true,
        },
        {
          path: 'styles.css',
          language: 'fixture-lang',
          content: 'main {}',
          editable: true,
        },
      ],
      previewViewports: [{ id: 'desktop', width: 1280, height: 720 }],
      validationRules: [],
      hints: [],
      assets: [],
    } as unknown as Exercise;
    const controller = new LearningSessionController({
      courseId: 'html-css',
      lessonId: 'step-2',
      exercise,
      contentRevision: 'rev',
      resolvedAssets: [],
      repository,
      runner: new FixtureRunnerAdapter(),
      validator: new FixtureValidatorAdapter(),
      now: () => '2026-07-10T00:00:00.000Z',
    });

    await controller.initialize();

    expect(controller.getSnapshot().files).toEqual({
      'index.html': '<main>工程1</main>',
      'styles.css': 'main {}',
    });
    expect(getDraft).toHaveBeenCalledWith('html-css', 'profile-project');
    expect(stored.files).toEqual({ 'index.html': '<main>工程1</main>' });
    await controller.dispose();
  });
});
