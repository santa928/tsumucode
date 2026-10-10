import { afterEach, expect, it, vi } from 'vitest';
import {
  LocalWorkspaceApiError,
  type LocalWorkspace,
  type WorkspaceGrade,
  type WorkspaceRun,
} from '../../../adapters/runtime/local/LocalWorkspaceClient';
import type { ExerciseDraft } from '../../../core/persistence/contracts';
import { migrateRepositorySnapshot } from '../../../adapters/persistence/indexeddb/migrateProgress';
import { LOCAL_PROJECT } from '../../../core/persistence/localProjectDescriptor';
import { LocalProjectSession } from './LocalProjectSession';
import {
  projectCourseProgress,
  projectDraft,
  projectIsComplete,
  projectValidation,
  type ProjectIdentity,
} from './localProjectProgress';

const files = {
  'index.html': '<h1 id="message"></h1>',
  'main.js': '',
  'message.js': "export const message = 'こんにちは、実サーバー！';",
  'styles.css': '',
};
const run: WorkspaceRun = {
  workspaceId: LOCAL_PROJECT.workspaceId,
  profile: 'vite-project-v1',
  runId: '91a12736-87c5-4f15-b467-8d840bace547',
  sourceRevision: 1,
  sourceHash: 'a'.repeat(64),
  state: 'ready',
  cleanupPending: false,
};
const saved: LocalWorkspace = {
  schema: 1,
  profile: 'vite-project-v1',
  workspaceId: LOCAL_PROJECT.workspaceId,
  sourceRevision: 1,
  sourceHash: run.sourceHash,
  files,
  lastRun: run,
};
const pass: WorkspaceGrade = {
  ...run,
  status: 'pass',
  actual: 'こんにちは、実サーバー！',
  diagnostics: [],
  engineVersion: '149.0.7827.0',
  evaluatedAt: '2026-10-08T00:00:00.000Z',
};
const sessions: LocalProjectSession[] = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(identity: ProjectIdentity = LOCAL_PROJECT) {
  const persist = vi.fn(async (draft: ExerciseDraft) => {
    expect(draft.workspaceId).toBe(LOCAL_PROJECT.workspaceId);
  });
  const writable = vi.fn(() => true);
  const client = {
    connect: vi.fn(async () => ({
      apiVersion: 1 as const,
      profile: 'vite-project-v1' as const,
      available: true,
      gradingAvailable: true as const,
      starterFiles: files,
    })),
    status: vi.fn(async () => saved),
    save: vi.fn(async () => saved),
    start: vi.fn(async () => run),
    apply: vi.fn(async () => saved),
    grade: vi.fn(async () => pass),
    stop: vi.fn(async (): Promise<LocalWorkspace> => ({
      ...saved,
      lastRun: { ...run, state: 'stopped' as const },
    })),
    activity: vi.fn(async () => {}),
  };
  const session = new LocalProjectSession(
    client,
    persist,
    writable,
    projectDraft(files, identity),
    identity,
  );
  sessions.push(session);
  await session.connect();
  return { session, persist, client, writable };
}

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  vi.useRealTimers();
});

it.each(['courseId', 'workspaceId', 'exerciseId', 'contentRevision'] as const)(
  '保存Draftの%sが別課題なら開かない',
  async (field) => {
    const { client, persist, writable } = await fixture();
    expect(
      () =>
        new LocalProjectSession(client, persist, writable, {
          ...projectDraft(files),
          [field]: 'other',
        }),
    ).toThrow(/一致/);
  },
);

it('実採点と現在の編集が一致した時だけ、Draftと既存進捗に合格を残す', async () => {
  const { session, persist } = await fixture();
  expect(session.canGrade()).toBe(true);
  await session.grade();
  const draft = session.getSnapshot().draft!;
  expect(projectIsComplete(draft)).toBe(true);
  expect(projectCourseProgress(draft).currentComplete).toBe(true);
  expect(persist).toHaveBeenLastCalledWith(draft);
  session.edit('message.js', 'new');
  expect(session.canGrade()).toBe(false);
  expect(projectIsComplete(session.getSnapshot().draft!)).toBe(false);
  expect(projectCourseProgress(session.getSnapshot().draft!).currentComplete).toBe(false);
});

it.each(['failed', 'idle'] as const)(
  '実行中のpollで%sを反映し、Draft/合格記録を保持する',
  async (state) => {
    vi.useFakeTimers();
    const { session, client } = await fixture();
    await session.grade();
    const draft = session.getSnapshot().draft;
    client.status.mockResolvedValue({ ...saved, lastRun: { ...run, state } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.getSnapshot().run?.state).toBe(state);
    expect(session.getSnapshot().message).toContain('下書きは保持しています');
    expect(session.getSnapshot().draft).toEqual(draft);
    expect(session.canGrade()).toBe(false);
  },
);

it('連続編集で採点開始時の編集版が変わると、後着の合格を採用しない', async () => {
  const { session, client } = await fixture();
  const delayed = deferred<WorkspaceGrade>();
  client.grade.mockReturnValue(delayed.promise);
  const grading = session.grade();
  session.edit('message.js', 'edit while grading');
  session.edit('styles.css', 'h1 { color: blue; }');
  delayed.resolve(pass);
  await grading;
  expect(projectIsComplete(session.getSnapshot().draft!)).toBe(false);
  expect(session.getSnapshot().draft!.validationHistory).toHaveLength(0);
  expect(session.getSnapshot().message).toContain('採用しません');
});

it('停止/移動後の採点応答を採用せず、編集権を失っても対象runの停止と保存を行う', async () => {
  const { session, client, writable, persist } = await fixture();
  const delayed = deferred<WorkspaceGrade>();
  client.grade.mockReturnValue(delayed.promise);
  const grading = session.grade();
  writable.mockReturnValue(false);
  await session.dispose();
  delayed.resolve(pass);
  await grading;
  expect(client.stop).toHaveBeenCalledExactlyOnceWith(run);
  expect(persist).toHaveBeenCalled();
  expect(session.getSnapshot().draft!.validationHistory).toHaveLength(0);
});

it('起動の応答待ちで停止しても、古いstopped runではなく新runを回収する', async () => {
  const { session, client } = await fixture();
  client.status.mockResolvedValue({ ...saved, lastRun: { ...run, state: 'stopped' } });
  await session.connect();
  const started = deferred<WorkspaceRun>();
  client.start.mockReturnValue(started.promise);
  const starting = session.start();
  await vi.waitFor(() => {
    expect(client.start).toHaveBeenCalledOnce();
  });
  const stopping = session.stop();
  const next = {
    ...run,
    runId: '07dd1374-7d58-4009-bc18-537d204e4616',
    state: 'starting' as const,
  };
  started.resolve(next);
  await Promise.all([starting, stopping]);
  expect(client.stop).toHaveBeenCalledExactlyOnceWith(next);
});

it('保存版CASの競合と再接続で下書きを置き換えない', async () => {
  const { session, client } = await fixture();
  session.edit('message.js', 'local edit');
  client.save.mockRejectedValueOnce(new LocalWorkspaceApiError(409, 'Source conflict'));
  await session.save();
  expect(session.getSnapshot().conflict).toBe(true);
  expect(session.getSnapshot().draft!.files['message.js']).toBe('local edit');
  client.status.mockResolvedValue({
    ...saved,
    sourceRevision: 2,
    files: { ...files, 'message.js': 'other edit' },
  });
  await session.connect();
  expect(session.getSnapshot().draft!.files['message.js']).toBe('local edit');
  expect(session.getSnapshot().saved!.sourceRevision).toBe(2);
  expect(session.canGrade()).toBe(false);
});

it('通信失敗を404初期状態に置き換えず、明示接続後だけ再開する', async () => {
  const { session, client } = await fixture();
  client.status.mockRejectedValueOnce(new LocalWorkspaceApiError(503, 'controller unavailable'));
  await session.connect();
  expect(session.getSnapshot().connected).toBe(false);
  expect(session.canGrade()).toBe(false);
  expect(session.getSnapshot().draft!.files).toEqual(files);
  await session.connect();
  expect(session.canGrade()).toBe(true);
});

it('端末保存に失敗してもメモリの下書きを保ち、再試行で最新内容を保存する', async () => {
  const { session, persist } = await fixture();
  session.edit('message.js', 'kept edit');
  persist.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(session.flushDraft()).rejects.toThrow('storage');
  expect(session.getSnapshot().draftSaved).toBe(false);
  expect(session.getSnapshot().draft!.files['message.js']).toBe('kept edit');
  await session.flushDraft();
  expect(session.getSnapshot().draftSaved).toBe(true);
});

it('起動拒否後の再接続では、残った実runを停止できる', async () => {
  const { session, client } = await fixture();
  client.status.mockResolvedValue({ ...saved, lastRun: { ...run, state: 'stopped' } });
  await session.connect();
  client.start.mockRejectedValueOnce(new Error('start response lost'));
  await session.start();
  client.status.mockResolvedValue(saved);
  await session.connect();
  await session.stop();
  expect(client.stop).toHaveBeenCalledExactlyOnceWith(run);
});

it('保存失敗でも離脱は停止完了を待ち、停止後に保存エラーを返す', async () => {
  const { session, client, persist } = await fixture();
  const stopped = deferred<LocalWorkspace>();
  client.stop.mockReturnValue(stopped.promise);
  persist.mockRejectedValueOnce(new Error('storage unavailable'));
  let disposed = false;
  const leaving = session.dispose().finally(() => {
    disposed = true;
  });
  const rejected = expect(leaving).rejects.toThrow('storage unavailable');
  await vi.waitFor(() => {
    expect(persist).toHaveBeenCalled();
  });
  expect(disposed).toBe(false);
  stopped.resolve({ ...saved, lastRun: { ...run, state: 'stopped' } });
  await rejected;
  expect(disposed).toBe(true);
  // finallyで同じdispose Promiseを返すため、後続cleanupもエラーを扱う。
  sessions.splice(sessions.indexOf(session), 1);
});

const projectIdentity: ProjectIdentity = {
  ...LOCAL_PROJECT,
  requirements: ['project-structure', 'project-filter', 'project-presentation'].map(
    (goal, index) => ({
      goal,
      ruleId: `project-rule-${String(index + 1)}`,
      requirementId: `project-rule-${String(index + 1)}`,
      label: goal,
      expected: 'Briefの実動作',
      nextAction: 'Briefと現在の実動作を比べます。',
    }),
  ),
};

it('制作の採点履歴と合格SnapshotをJSON契約で読み直しても保持する', () => {
  const result = projectValidation(
    {
      ...pass,
      projectChecks: (['project-structure', 'project-filter', 'project-presentation'] as const).map(
        (goal) => ({
          goal,
          passed: true,
          actual: '実動作を確認しました。',
        }),
      ),
    },
    1,
    projectIdentity,
  );
  const draft = {
    ...projectDraft(files, projectIdentity),
    validationHistory: [result],
    lastPassingSnapshots: {
      [projectIdentity.exerciseId]: {
        files,
        editRevision: 1,
        contentRevision: projectIdentity.revision,
        evaluatedAt: pass.evaluatedAt,
      },
    },
  };
  const key = `${draft.courseId}:${draft.workspaceId}`;
  const restored = migrateRepositorySnapshot(
    JSON.parse(
      JSON.stringify({ schemaVersion: 2, courses: {}, drafts: { [key]: draft }, quarantined: [] }),
    ),
    pass.evaluatedAt,
  );
  expect(restored.quarantined).toEqual([]);
  expect(restored.drafts[key]).toEqual(draft);
  expect(projectIsComplete(restored.drafts[key]!, projectIdentity)).toBe(true);
});

it('制作の途中結果を工程IDへ対応させ、後工程で壊した前工程の合格を戻さない', () => {
  const grade: WorkspaceGrade = {
    ...pass,
    status: 'incomplete',
    projectChecks: [
      { goal: 'project-presentation', passed: false, actual: '画像がありません。' },
      { goal: 'project-filter', passed: true, actual: '絞り込みを確認しました。' },
      { goal: 'project-structure', passed: true, actual: '一覧と詳細を確認しました。' },
    ],
  };
  const partial = projectValidation(grade, 3, projectIdentity);
  expect(partial.status).toBe('incomplete');
  expect(partial.passedRequirementIds).toEqual(['project-rule-1', 'project-rule-2']);
  expect(partial.checks[0]?.actual).toBe('一覧と詳細を確認しました。');
  const broken = projectValidation(
    {
      ...grade,
      projectChecks: grade.projectChecks!.map((check) => ({
        ...check,
        passed: check.goal !== 'project-structure',
      })),
    },
    4,
    projectIdentity,
  );
  expect(broken.passedRequirementIds).toEqual(['project-rule-2', 'project-rule-3']);
  expect(broken.checks[0]?.requirementPassed).toBe(false);
});

it('制作工程が欠落した古いgraderのpassを合格Snapshotへ保存しない', async () => {
  const { session } = await fixture(projectIdentity);
  await session.grade();
  expect(session.getSnapshot().result?.status).toBe('incomplete');
  expect(session.getSnapshot().draft?.lastPassingSnapshots).toEqual({});
  expect(projectIsComplete(session.getSnapshot().draft!, projectIdentity)).toBe(false);
});

it('コードエラーの制作結果は工程の自己申告がtrueでも採用しない', () => {
  const grade: WorkspaceGrade = {
    ...pass,
    status: 'code-error',
    diagnostics: ['HTTP resource failed'],
    projectChecks: [
      { goal: 'project-structure', passed: true, actual: '一覧' },
      { goal: 'project-filter', passed: true, actual: '絞り込み' },
      { goal: 'project-presentation', passed: true, actual: '表示' },
    ],
  };
  expect(projectValidation(grade, 2, projectIdentity).passedRequirementIds).toEqual([]);
});
