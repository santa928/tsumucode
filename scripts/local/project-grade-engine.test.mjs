import console from 'node:console';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { afterEach, test, vi } from 'vitest';

const engine = vi.hoisted(() => ({ docker: vi.fn(), removeContainer: vi.fn() }));
vi.mock('./docker-engine.mjs', () => ({
  ...engine,
  containerConfig: () => ({ HostConfig: {} }),
}));
vi.mock('node:timers', async (importOriginal) => {
  const original = await importOriginal();
  const timers = {
    ...original,
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
  };
  return { ...timers, default: timers };
});
import { projectMetadata } from './project-engine.mjs';
import { gradeProject } from './project-grade-engine.mjs';

function frame(channel, text) {
  const data = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = channel;
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

test('全体10秒で固定graderを回収し、基盤503として期限超過を返す', async () => {
  vi.useFakeTimers();
  engine.removeContainer.mockResolvedValue(undefined);
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  engine.docker.mockImplementation(async (method, path) => {
    if (path.startsWith('/images/')) return { Id: 'fixed-image' };
    if (path.startsWith('/containers/create')) return { Id: 'grader' };
    if (path.endsWith('/wait')) return new Promise(() => {});
    if (path.includes('/logs?'))
      return frame(
        2,
        'private-source\nTSUMUCODE_GRADE_STEP:browser-launch:20\nTSUMUCODE_GRADE_STEP:observations:7900\n' +
          'TSUMUCODE_FORM_RESPONSE:1:request-start:8000\n' +
          'TSUMUCODE_FORM_RESPONSE:1:upstream-end:8050\n' +
          'TSUMUCODE_FORM_RESPONSE:1:downstream-finished:8060\n' +
          'TSUMUCODE_FORM_RESPONSE:2:request-start:8200\n' +
          'TSUMUCODE_FORM_RESPONSE:2:browser-response:8210\n' +
          'TSUMUCODE_FORM_RESPONSE:2:browser-aborted:8220\n' +
          'TSUMUCODE_GRADE_STEP:form-reset-before:8230\n' +
          'TSUMUCODE_GRADE_STEP:form-reset-after:8240\n' +
          'TSUMUCODE_GRADE_STEP:form-document-changed:8250\n' +
          'TSUMUCODE_FORM_RECEIPT:1:1:200:4:4:finished:plain\n' +
          'TSUMUCODE_FORM_RECEIPT:2:unknown:unknown:unknown:2:aborted:unknown\n' +
          'TSUMUCODE_FORM_RECEIPT:3:3:200:524289:1:finished:plain\n' +
          'TSUMUCODE_FORM_RECEIPT:3:3:200:1:524290:finished:plain\n' +
          'TSUMUCODE_FORM_RECEIPT:9:1:200:1:1:finished:plain\n' +
          'TSUMUCODE_FORM_RECEIPT:3:3:200:1:1:private-token:plain\n' +
          'TSUMUCODE_FORM_RECEIPT:3:3:200:1:1:finished:private-source\n' +
          'TSUMUCODE_FORM_RESPONSE:9:request-start:8300\n' +
          'TSUMUCODE_FORM_RESPONSE:2:private-token:8300\n' +
          'TSUMUCODE_FORM_RESPONSE:2:upstream-end:private-source\nprivate-token',
      );
  });
  const grading = gradeProject({
    owner: 'tsumucode-learning-test',
    image: 'tsumucode-learning-test-grader:local',
    source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
    runId: '00000000-0000-4000-8000-000000000001',
    socket: { dev: 1, ino: 2 },
  });
  const rejected = assert.rejects(grading, {
    status: 503,
    message: '採点の全体期限10秒を超えました。実行を開始し直して判定してください。',
  });
  await vi.advanceTimersByTimeAsync(9999);
  assert.equal(engine.removeContainer.mock.calls.length, 0);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
  assert.deepEqual(diagnostic.mock.calls, [
    [
      'Next grade deadline',
      JSON.stringify({
        enginePhase: 'container-wait',
        phase: 'form-document-changed',
        elapsedMs: 8250,
        responses: [
          { request: 1, event: 'request-start', elapsedMs: 8000 },
          { request: 1, event: 'upstream-end', elapsedMs: 8050 },
          { request: 1, event: 'downstream-finished', elapsedMs: 8060 },
          { request: 2, event: 'request-start', elapsedMs: 8200 },
          { request: 2, event: 'browser-response', elapsedMs: 8210 },
          { request: 2, event: 'browser-aborted', elapsedMs: 8220 },
        ],
        receipts: [
          {
            request: 1,
            bridgeRequest: 1,
            status: 200,
            expectedBytes: 4,
            receivedBytes: 4,
            state: 'finished',
            encoding: 'plain',
          },
          {
            request: 2,
            bridgeRequest: 'unknown',
            status: 'unknown',
            expectedBytes: 'unknown',
            receivedBytes: 2,
            state: 'aborted',
            encoding: 'unknown',
          },
        ],
      }),
    ],
  ]);
  diagnostic.mockRestore();
});

for (const [reported, expected] of [
  ['http-deadline', 'http-deadline'],
  ['private-learner-text', '未確認'],
]) {
  test(`異常終了の固定分類 ${reported} を照合し、例外本文を返さない`, async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.removeContainer.mockResolvedValue(undefined);
    engine.docker.mockImplementation(async (method, path) => {
      if (path.startsWith('/images/')) return { Id: 'fixed-image' };
      if (path.startsWith('/containers/create')) return { Id: 'grader' };
      if (path.endsWith('/wait')) return { StatusCode: 1 };
      if (path.endsWith('/json'))
        return { State: { ExitCode: 1, OOMKilled: false, Error: 'private-docker-error' } };
      if (path.includes('/logs?'))
        return frame(
          2,
          `TSUMUCODE_GRADE_PHASE:observations\nTSUMUCODE_GRADE_FAILURE:${reported}\nprivate-learner-text`,
        );
    });
    await assert.rejects(
      gradeProject({
        owner: 'tsumucode-learning-test',
        image: 'tsumucode-learning-test-grader:local',
        source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
        runId: '00000000-0000-4000-8000-000000000001',
        socket: { dev: 1, ino: 2 },
      }),
      {
        status: 503,
        message: `採点用Browserが終了しました（段階: observations / 分類: ${expected}）。`,
      },
    );
    assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
    assert.deepEqual(diagnostic.mock.calls, [
      [
        'Next grade failure',
        JSON.stringify({
          enginePhase: 'container-wait',
          phase: 'observations',
          reason: expected === '未確認' ? 'unknown' : expected,
          waitExitCode: 1,
          graderExitCode: 1,
          graderOOMKilled: false,
          graderRunning: 'unknown',
          graderErrorPresent: true,
        }),
      ],
    ]);
    assert.equal(JSON.stringify(diagnostic.mock.calls).includes('private'), false);
    diagnostic.mockRestore();
  });
}

for (const available of [false, true]) {
  test(`Browser起動前の終了とgrader状態未取得=${!available}も拒否し、回収する`, async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.removeContainer.mockResolvedValue(undefined);
    engine.docker.mockImplementation(async (_method, path) => {
      if (path.startsWith('/images/')) return { Id: 'fixed-image' };
      if (path.startsWith('/containers/create')) return { Id: 'grader' };
      if (path.endsWith('/wait')) return { StatusCode: 137 };
      if (path.includes('/logs?')) {
        if (!available) throw new Error('private-log-error');
        return frame(2, 'TSUMUCODE_GRADE_STEP:project-filter:200\nprivate-source');
      }
      if (path.endsWith('/json')) {
        if (!available) throw new Error('private-docker-error');
        return { State: { ExitCode: 137, OOMKilled: true, Error: '' } };
      }
    });
    await assert.rejects(
      gradeProject({
        owner: 'tsumucode-learning-test',
        image: 'tsumucode-learning-test-grader:local',
        source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
        runId: '00000000-0000-4000-8000-000000000001',
        socket: { dev: 1, ino: 2 },
      }),
      { status: 503 },
    );
    const result = JSON.parse(diagnostic.mock.calls[0][1]);
    assert.equal(result.waitExitCode, 137);
    assert.equal(result.graderExitCode, available ? 137 : 'unknown');
    assert.equal(result.graderOOMKilled, available ? true : 'unknown');
    assert.equal(result.phase, available ? 'project-filter' : 'unknown');
    assert.equal(JSON.stringify(diagnostic.mock.calls).includes('private'), false);
    assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
    diagnostic.mockRestore();
  });
}

for (const unavailable of [false, true]) {
  test(`期限後のexit0を受理せず、診断取得失敗=${unavailable}でも所有graderを回収する`, async () => {
    vi.useFakeTimers();
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    let complete;
    engine.removeContainer.mockResolvedValue(undefined);
    engine.docker.mockImplementation(async (_method, path) => {
      if (path.startsWith('/images/')) return { Id: 'fixed-image' };
      if (path.startsWith('/containers/create')) return { Id: 'grader' };
      if (path.endsWith('/wait'))
        return new Promise((resolve) => {
          complete = resolve;
        });
      if (path.includes('/logs?stdout=0')) {
        if (unavailable) throw new Error('private diagnostic failure');
        return frame(2, 'TSUMUCODE_GRADE_STEP:marker-after:9999\n');
      }
      if (path.includes('/logs?stdout=1')) throw new Error('期限後のresult-readは禁止');
    });
    const grading = gradeProject({
      owner: 'tsumucode-learning-test',
      image: 'tsumucode-learning-test-grader:local',
      source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
      runId: '00000000-0000-4000-8000-000000000001',
      socket: { dev: 1, ino: 2 },
    });
    const rejected = assert.rejects(grading, { status: 503 });
    await vi.advanceTimersByTimeAsync(10000);
    complete({ StatusCode: 0 });
    await rejected;
    assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
    assert.equal(
      engine.docker.mock.calls.some(([, path]) => path.includes('/logs?stdout=1')),
      false,
    );
    assert.equal(diagnostic.mock.calls.length, 1);
    assert.equal(JSON.stringify(diagnostic.mock.calls).includes('private'), false);
    diagnostic.mockRestore();
  });
}

test('stdoutの実判定と分割stderrを分離し、遅延診断には固定段階だけを採用する', async () => {
  vi.useFakeTimers();
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  engine.removeContainer.mockResolvedValue(undefined);
  const source = { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' };
  const runId = '00000000-0000-4000-8000-000000000001';
  engine.docker.mockImplementation(async (_method, path) => {
    if (path.startsWith('/images/')) return { Id: 'fixed-image' };
    if (path.startsWith('/containers/create')) return { Id: 'grader' };
    if (path.endsWith('/wait')) {
      await vi.advanceTimersByTimeAsync(8000);
      return { StatusCode: 0 };
    }
    if (path.includes('/logs?stdout=1'))
      return Buffer.concat([
        frame(2, 'private-token\nTSUMUCODE_GRADE_STEP:marker-'),
        frame(
          1,
          JSON.stringify({
            ...projectMetadata(source, runId),
            status: 'pass',
            actual: 'ok',
            diagnostics: [],
          }),
        ),
        frame(2, 'after:7900\nTSUMUCODE_GRADE_STEP:private-source:7999\n'),
      ]);
  });
  const result = await gradeProject({
    owner: 'tsumucode-learning-test',
    image: 'tsumucode-learning-test-grader:local',
    source,
    runId,
    socket: { dev: 1, ino: 2 },
  });
  assert.equal(result.status, 'pass');
  assert.deepEqual(diagnostic.mock.calls, [
    [
      'Next grade slow',
      JSON.stringify({
        engineElapsedMs: 8000,
        progress: [{ phase: 'marker-after', elapsedMs: 7900 }],
      }),
    ],
  ]);
  assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
  diagnostic.mockRestore();
});

for (const invalid of ['channel', 'truncated', 'limit']) {
  test(`成功exitでも不正Docker出力 ${invalid} を採用せず回収する`, async () => {
    engine.removeContainer.mockResolvedValue(undefined);
    engine.docker.mockImplementation(async (_method, path) => {
      if (path.startsWith('/images/')) return { Id: 'fixed-image' };
      if (path.startsWith('/containers/create')) return { Id: 'grader' };
      if (path.endsWith('/wait')) return { StatusCode: 0 };
      if (path.includes('/logs?stdout=1')) {
        if (invalid === 'channel') return frame(3, 'private');
        if (invalid === 'truncated') return frame(1, '{}').subarray(0, 9);
        return frame(2, 'x'.repeat(64 * 1024));
      }
    });
    await assert.rejects(
      gradeProject({
        owner: 'tsumucode-learning-test',
        image: 'tsumucode-learning-test-grader:local',
        source: { workspaceId: 'one', sourceRevision: 1, sourceHash: 'fixed-source' },
        runId: '00000000-0000-4000-8000-000000000001',
        socket: { dev: 1, ino: 2 },
      }),
      /grade output/iu,
    );
    assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
  });
}

for (const [name, status, checks, accepted] of [
  ['部分達成', 'incomplete', [true, false, false], true],
  ['全体達成', 'pass', [true, true, true], true],
  ['工程欠落', 'pass', undefined, false],
  ['工程重複', 'pass', [true, true, true], false],
  ['偽の全体合格', 'pass', [true, false, true], false],
  ['コードエラーの旧工程', 'code-error', [true, false, false], false],
]) {
  test(`制作の実工程結果 ${name} の受理を管理側で照合する`, async () => {
    engine.removeContainer.mockResolvedValue(undefined);
    const source = {
      profile: 'next-project-v1',
      workspaceId: 'next-ch05-l01-e01',
      sourceRevision: 1,
      sourceHash: 'fixed-source',
    };
    const runId = '00000000-0000-4000-8000-000000000001';
    const goals = ['project-structure', 'project-filter', 'project-presentation'];
    engine.docker.mockImplementation(async (_method, path) => {
      if (path.startsWith('/images/')) return { Id: 'fixed-image' };
      if (path.startsWith('/containers/create')) return { Id: 'grader' };
      if (path.endsWith('/wait')) return { StatusCode: 0 };
      if (path.includes('/logs?stdout=1'))
        return frame(
          1,
          JSON.stringify({
            ...projectMetadata(source, runId),
            status,
            actual: '実工程',
            diagnostics: [],
            ...(checks
              ? {
                  projectChecks: checks.map((passed, index) => ({
                    goal: name === '工程重複' ? goals[0] : goals[index],
                    passed,
                    actual: '実観測',
                  })),
                }
              : {}),
          }),
        );
    });
    const grading = gradeProject({
      owner: 'tsumucode-learning-test',
      image: 'tsumucode-learning-test-grader:local',
      source,
      runId,
      socket: { dev: 1, ino: 2 },
    });
    if (accepted) assert.equal((await grading).status, status);
    else await assert.rejects(grading, /Invalid project grade checks/u);
    assert.ok(engine.removeContainer.mock.calls.some(([id]) => id === 'grader'));
  });
}
