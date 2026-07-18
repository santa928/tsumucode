/** schema v1からcursor・pass証跡・初回完了日時を移行する共有fixture。 */
export const schemaV1Progress = {
  schemaVersion: 1,
  courses: {
    fixture: {
      courseId: 'fixture',
      contentRevision: 'rev-1',
      lessons: {
        'lesson-1': {
          lessonId: 'lesson-1',
          viewedSlideIds: ['slide-1'],
          currentSlideId: 'slide-1',
          passedExerciseIds: ['ex-1'],
          passedChecklistItemIds: [],
          passedRuleIds: ['rule-1'],
          passedViewportIds: ['desktop'],
          currentComplete: true,
          firstCompletedAt: '2026-07-01T00:00:00.000Z',
        },
      },
      currentLessonId: 'lesson-1',
      currentChapterId: 'chapter-1',
      currentComplete: true,
      firstCompletedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  },
  drafts: {
    'fixture:workspace-1': {
      courseId: 'fixture',
      lessonId: 'lesson-1',
      exerciseId: 'ex-1',
      workspaceId: 'workspace-1',
      contentRevision: 'rev-1',
      files: { 'index.html': '<main />' },
      selectedFile: 'index.html',
      cursorOffset: 4,
      validationHistory: [
        {
          exerciseId: 'ex-1',
          executionRevision: 0,
          status: 'pass',
          checks: [],
          passedRequirementIds: ['requirement-1'],
          diagnostics: [],
          evaluatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      revealedHintIds: ['hint-1'],
      reviewSlideId: 'slide-1',
      reviewScrollOffset: 120,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  },
} as const;
