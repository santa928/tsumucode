import { describe, expect, it, vi } from 'vitest';
import { CourseManifestSchema } from '../../../src/core/content/schema';
import { ResilientProgressService } from '../../../src/core/persistence/ResilientProgressService';
import { ContentProgressMigrationService } from '../../../src/core/persistence/contentProgressMigration';
import { PassFreshnessRegistry } from '../../../src/core/persistence/PassFreshnessRegistry';
import { TabLeaseCoordinator } from '../../../src/core/persistence/TabLeaseCoordinator';
import { TransferService } from '../../../src/core/persistence/transferService';
import type {
  ProgressRepository,
  RepositorySnapshot,
} from '../../../src/core/persistence/contracts';
import { LearningSessionController } from '../../../src/features/learning/session';
import { createCodeMirrorEditor } from '../../../src/features/learning/editor';
import { EditorLanguageRegistry } from '../../../src/features/learning/editor/EditorLanguageRegistry';
import {
  findWorkspaceValidationTargets,
  recordSlideView,
  recordWorkspaceValidation,
} from '../../../src/core/persistence/progressUpdates';
import { ReadOnlyPreviewRegistry } from '../../../src/core/runtime/ReadOnlyPreviewRegistry';
import { RunnerRegistry } from '../../../src/core/runtime/RunnerRegistry';
import { ValidatorRegistry } from '../../../src/core/validation/ValidatorRegistry';
import { createLearningRuntimeServices } from '../../../src/features/learning/runtimeServices';
import { RuntimeNoticeStore } from '../../../src/features/learning/runtimeNotices';
import {
  FixtureRunnerAdapter,
  FixtureValidatorAdapter,
  fixtureEditorLanguage,
} from '../../fixtures/fixtureAdapters';
import { runtimeFixtureCourse } from '../../fixtures/runtimeCourse';

const EMPTY: RepositorySnapshot = {
  schemaVersion: 2,
  courses: {},
  drafts: {},
  quarantined: [],
};

/** Runtime拡張testに必要な最小durable Repository spyを返す。 */
function createRepository(options: { readonly rejectOpen?: boolean } = {}): ProgressRepository {
  return {
    open: vi.fn(async () => {
      if (options.rejectOpen) throw new Error('open failed');
    }),
    snapshot: vi.fn(async () => structuredClone(EMPTY)),
    getDraft: vi.fn(async () => undefined),
    putDraft: vi.fn(async () => undefined),
    close: vi.fn(),
  } as unknown as ProgressRepository;
}

describe('runtime adapter extensibility', () => {
  it('Course固有分岐なしで第2Courseと3 AdapterをRegistry登録だけで完走する', async () => {
    expect(CourseManifestSchema.parse(runtimeFixtureCourse)).toMatchObject({
      id: 'runtime-fixture',
      runnerId: 'fixture-runner',
      validatorId: 'fixture-validator',
    });
    const durableRepository = createRepository();
    const editorFactory = vi.fn(fixtureEditorLanguage);
    const services = createLearningRuntimeServices({
      repository: durableRepository,
      runnerRegistrations: [['fixture-runner', () => new FixtureRunnerAdapter()]],
      validatorRegistrations: [['fixture-validator', () => new FixtureValidatorAdapter()]],
      editorRegistrations: [['fixture-lang', editorFactory]],
    });

    await services.ready;

    expect(services.repository).toBeInstanceOf(ResilientProgressService);
    expect(services.repository).not.toBe(durableRepository);
    expect(services.editorLanguageRegistry.has('fixture-lang')).toBe(true);
    const editor = createCodeMirrorEditor(services.editorLanguageRegistry).mount({
      parent: document.createElement('div'),
      path: 'fixture.txt',
      language: 'fixture-lang',
      content: 'fixture',
      contentRevision: 0,
      diagnostics: [],
      onChange: vi.fn(),
      onCursorChange: vi.fn(),
    });
    expect(editorFactory).toHaveBeenCalledOnce();
    editor.destroy();
    const lesson = runtimeFixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    const exercise = lesson.exercises[0]!;
    const controller = new LearningSessionController({
      courseId: runtimeFixtureCourse.id,
      lessonId: lesson.id,
      exercise,
      contentRevision: runtimeFixtureCourse.revision,
      resolvedAssets: [],
      repository: services.repository,
      runner: services.runnerRegistry.create(runtimeFixtureCourse.runnerId),
      validator: services.validatorRegistry.create(runtimeFixtureCourse.validatorId),
      now: () => '2026-07-10T00:00:00.000Z',
    });
    await controller.initialize();
    await controller.prepare(document.createElement('iframe'));
    controller.edit('index.html', 'fixture source edited through the shared controller');
    await controller.previewNow();
    await expect(controller.validateNow()).resolves.toMatchObject({ status: 'pass' });
    const validationTargets = findWorkspaceValidationTargets(runtimeFixtureCourse, exercise.id);
    const results = new Map(
      controller
        .getLastValidationBatch()
        .map(({ exercise: target, result }) => [target.id, result]),
    );
    const viewed = recordSlideView(
      undefined,
      runtimeFixtureCourse,
      lesson,
      lesson.slides.at(-1)!.id,
      '2026-07-10T00:00:00.000Z',
    );
    const completed = recordWorkspaceValidation(
      viewed,
      runtimeFixtureCourse,
      validationTargets.map((target) => ({ ...target, result: results.get(target.exercise.id)! })),
    );
    expect(completed.lessons[lesson.id]).toMatchObject({ currentComplete: true });
    expect(completed.currentComplete).toBe(true);
    await controller.dispose();
  });

  it('明示注入した救済層と全Runtime serviceを同じinstanceのまま返す', async () => {
    const durableRepository = createRepository();
    const progressService = new ResilientProgressService(durableRepository);
    const passFreshness = new PassFreshnessRegistry();
    const contentMigrations = new ContentProgressMigrationService(progressService);
    const transferService = new TransferService(progressService, contentMigrations, {
      appVersion: 'test',
      now: () => '2026-07-10T00:00:00.000Z',
    });
    const leaseCoordinator = new TabLeaseCoordinator({
      channelFactory: () => {
        throw new Error('fixtureではcoordination channelを開きません');
      },
      storage: undefined,
    });
    const notices = new RuntimeNoticeStore();
    const runnerRegistry = new RunnerRegistry();
    const readOnlyPreviewRegistry = new ReadOnlyPreviewRegistry();
    const validatorRegistry = new ValidatorRegistry();
    const editorLanguageRegistry = new EditorLanguageRegistry();

    const services = createLearningRuntimeServices({
      progressService,
      passFreshness,
      contentMigrations,
      transferService,
      leaseCoordinator,
      notices,
      runnerRegistry,
      readOnlyPreviewRegistry,
      validatorRegistry,
      editorLanguageRegistry,
    });
    await services.ready;

    expect(services.repository).toBe(progressService);
    expect(services.progressService).toBe(progressService);
    expect(services.passFreshness).toBe(passFreshness);
    expect(services.contentMigrations).toBe(contentMigrations);
    expect(services.transferService).toBe(transferService);
    expect(services.leaseCoordinator).toBe(leaseCoordinator);
    expect(services.notices).toBe(notices);
    expect(services.runnerRegistry).toBe(runnerRegistry);
    expect(services.readOnlyPreviewRegistry).toBe(readOnlyPreviewRegistry);
    expect(services.validatorRegistry).toBe(validatorRegistry);
    expect(services.editorLanguageRegistry).toBe(editorLanguageRegistry);
    leaseCoordinator.dispose();
  });

  it('raw Repositoryのopen失敗も救済層でmemory-onlyへ変換する', async () => {
    const services = createLearningRuntimeServices({
      repository: createRepository({ rejectOpen: true }),
    });

    await expect(services.ready).resolves.toBeUndefined();

    expect(services.repository.getHealthSnapshot()).toMatchObject({
      kind: 'memory-only',
      cause: 'open',
    });
  });
});
