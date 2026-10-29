// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixtureSourceDigest } from '../../../../scripts/release/v2/fixtureSource';
const target = {
  key: 'topic/lesson/exercise/authored/solution/local',
  kind: 'fixture',
  courseId: 'topic',
  lessonId: 'lesson',
  exerciseId: 'exercise',
  fixtureId: 'solution',
  caseKind: 'authored',
  runtimeKind: 'next',
  mode: 'local',
  inputDigest: 'a'.repeat(64),
  sourceDigest: fixtureSourceDigest({ 'app/page.tsx': 'source' }),
  expectedStatus: 'pass',
};
const row = {
  fixture: 'solution',
  workspaceId: 'exercise',
  sourceDigest: target.sourceDigest,
  status: 'pass',
  limitMiB: 512,
  measured: {
    zombies: 0,
    zombieProcesses: [],
    zombieProcessesTruncated: false,
    lifecycle: {
      observedAtMs: 1793272780607,
      bootstrapPid: 7,
      currentChildPid: 43,
      phase: 'ready',
    },
    memoryPeak: 1000000,
    memoryCurrent: 900000,
    pids: 4,
    workspaceBytes: 1000,
    temporaryBytes: 1000,
    memoryEvents: { max: 0, oom: 0, oomKill: 0 },
  },
};
describe('native fixture evidence', () => {
  it('joins actual workspace, Source, status and bounded measurements to manifest targets', async () => {
    const { readNextFixtureCoverage } =
      await import('../../../../scripts/release/v2/nativeCoverage');
    expect(readNextFixtureCoverage([row], [target])).toEqual([target.key]);
  });
  it.each([
    'missing',
    'duplicate',
    'unknown',
    'workspace',
    'source',
    'status',
    'oom',
    'zombie',
    'memory',
    'pids',
    'nonfinite',
    'zero-memory',
    'diagnostic-zombie',
    'diagnostic-truncated',
    'missing-lifecycle',
    'unknown-lifecycle',
    'invalid-pid',
    'unknown-measurement',
  ])('rejects %s native evidence', async (failure) => {
    const { readNextFixtureCoverage } =
      await import('../../../../scripts/release/v2/nativeCoverage');
    const changed = structuredClone(row);
    if (failure === 'unknown') changed.fixture = 'unknown';
    if (failure === 'workspace') changed.workspaceId = 'wrong-workspace';
    if (failure === 'source') changed.sourceDigest = 'b'.repeat(64);
    if (failure === 'status') changed.status = 'incomplete';
    if (failure === 'oom') changed.measured.memoryEvents.oomKill = 1;
    if (failure === 'zombie') changed.measured.zombies = 1;
    if (failure === 'memory') changed.measured.memoryPeak = 513 * 1024 ** 2;
    if (failure === 'pids') changed.measured.pids = 65;
    if (failure === 'nonfinite') changed.measured.memoryPeak = Number.POSITIVE_INFINITY;
    if (failure === 'zero-memory') changed.measured.memoryPeak = 0;
    if (failure === 'diagnostic-zombie')
      Object.assign(changed.measured, { zombieProcesses: [{ pid: 43, ppid: 7, state: 'Z' }] });
    if (failure === 'diagnostic-truncated') changed.measured.zombieProcessesTruncated = true;
    if (failure === 'missing-lifecycle') Reflect.deleteProperty(changed.measured, 'lifecycle');
    if (failure === 'unknown-lifecycle') changed.measured.lifecycle.phase = 'unrecognized';
    if (failure === 'invalid-pid') changed.measured.lifecycle.bootstrapPid = 0;
    if (failure === 'unknown-measurement') Object.assign(changed.measured, { unexpected: true });

    expect(() =>
      readNextFixtureCoverage(
        failure === 'missing' ? [] : failure === 'duplicate' ? [changed, changed] : [changed],
        [target],
      ),
    ).toThrow();
  });
  it('shares the exact canonical Source digest with the bare-Node controller', async () => {
    const { nativeFixtureSourceDigest } =
      await import('../../../../scripts/local/native-fixture-digest.mjs');
    const files = { 'app/音.tsx': '🙂漢字', 'app/page.tsx': 'source', 'app/𐀀.tsx': 'body' };
    expect(nativeFixtureSourceDigest(files)).toBe(fixtureSourceDigest(files));
  });
});
