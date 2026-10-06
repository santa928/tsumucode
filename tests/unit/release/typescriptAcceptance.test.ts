// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EvaluationReceiptSchema } from '../../../scripts/release/typescriptAcceptanceSchema';
import { describe, expect, it, vi } from 'vitest';
import {
  TYPESCRIPT_ACCEPTANCE_LESSONS,
  TypescriptAcceptanceSchema,
  TypescriptPerformanceEvidenceSchema,
  typescriptPerformanceExercise,
  type TypescriptPerformanceEvidence,
  checkTypescriptPerformance,
  checkTypescriptEvaluationReceipt,
  verifyTypescriptSourceCommit,
  checkTypescriptPersonaCoverage,
  type TypescriptAcceptance,
} from '../../../scripts/release/verifyTypescriptAcceptance';
import { ReleaseCourseIdSchema } from '../../../scripts/release/releaseCourseContracts';

const hash = 'a'.repeat(64);
const reference = { path: 'private-evidence.json', sha256: hash };
const learnerHashes = new Map(TYPESCRIPT_ACCEPTANCE_LESSONS.map((id) => [id, hash]));

function record(): TypescriptAcceptance {
  return TypescriptAcceptanceSchema.parse({
    schemaVersion: 1,
    courseId: 'typescript',
    methodsApprovalReference: '本人のTS専用承認記録',
    publicationApproval: 'pending',
    realHumanTrial: 'unverified',
    lowEndPhysicalDevice: 'unverified',
    sourceCommit: 'a'.repeat(40),
    manifestSha256: hash,
    artifactSha256: hash,
    independenceReview: reference,
    environment: {
      browserMajor: 149,
      os: 'linux',
      arch: 'arm64',
      logicalCpu: 10,
      cpuModel: 'unknown',
      localStaticSubpath: true,
      networkThrottle: false,
      cpuThrottle: false,
    },
    personas: ['A', 'B', 'C'].map((role) => ({
      role,
      actors: [`actor-${role}`],
      sessions: [`session-${role}`],
      browserContexts: [`context-${role}`],
      publicInputOnly: true,
      explainsFinalProject: true,
      evaluations: [reference],
      results: TYPESCRIPT_ACCEPTANCE_LESSONS.map((lessonId, uiRow) => ({
        lessonId,
        learnerContentSha256: hash,
        actor: `actor-${role}`,
        session: `session-${role}`,
        source: reference,
        uiEvidence: reference,
        uiRow,
      })),
    })),
    performance: ['cold', 'warm', 'simple', 'dom', 'async', 'busy', 'stop'].map((kind) => ({
      kind,
      rawEvidence: reference,
    })),
  });
}

function measurement(kind: TypescriptPerformanceEvidence['kind']): TypescriptPerformanceEvidence {
  const interactive = kind === 'busy' || kind === 'stop';
  return TypescriptPerformanceEvidenceSchema.parse({
    schemaVersion: 1,
    courseId: 'typescript',
    kind,
    sourceCommit: 'a'.repeat(40),
    manifestSha256: hash,
    environment: record().environment,
    exerciseId: typescriptPerformanceExercise(kind),
    applicationSourceSha256: hash,
    dependencyLockSha256: hash,
    workloadSourceSha256: hash,
    harness: reference,
    samplesMs: Array.from({ length: interactive ? 2 : 20 }, () => 80),
    warmup: kind === 'cold' || interactive ? 0 : 3,
    reportedValueMs: 80,
    timingScope: interactive
      ? 'trusted-click-next-frame'
      : kind === 'cold' || kind === 'warm'
        ? 'controller-preview'
        : 'controller-validation',
    includesQueueAndFrame: interactive,
    lateResultsRejected: kind === 'stop',
  });
}

describe('TS専用の模擬受入契約', () => {
  it('15教材×3役の照合を正式公開の本人許可へ読み替えない', () => {
    expect(() => {
      checkTypescriptPersonaCoverage(record(), learnerHashes);
    }).not.toThrow();
    expect(ReleaseCourseIdSchema.safeParse('typescript').success).toBe(true);
    expect(record().publicationApproval).toBe('pending');
  });

  it('他Course、未承認環境、公開済み/人の実績への読み替え、回答閲覧を拒否する', () => {
    for (const change of [
      { courseId: 'javascript' },
      { publicationApproval: 'approved' },
      { realHumanTrial: 'passed' },
      { environment: { ...record().environment, cpuThrottle: true } },
      { personas: record().personas.map((persona) => ({ ...persona, publicInputOnly: false })) },
    ])
      expect(TypescriptAcceptanceSchema.safeParse({ ...record(), ...change }).success).toBe(false);
  });

  it('Lesson欠落/重複、入力変更、採用集合の変更、同じ役への偏りを拒否する', () => {
    for (const change of ['duplicate', 'stale', 'role', 'target'] as const) {
      const candidate = record();
      const first = candidate.personas[0]!;
      const hashes = new Map(learnerHashes);
      if (change === 'duplicate') first.results[1] = first.results[0]!;
      if (change === 'stale') first.results[0]!.learnerContentSha256 = 'b'.repeat(64);
      if (change === 'role') candidate.personas[1]!.role = 'A';
      if (change === 'target') hashes.delete('typescript-ch06-l03');
      expect(() => {
        checkTypescriptPersonaCoverage(candidate, hashes);
      }).toThrow();
    }
  });

  it.each(['actors', 'sessions', 'browserContexts'] as const)('%sの役間共有を拒否する', (field) => {
    const candidate = record();
    candidate.personas[1]![field] = candidate.personas[0]![field];
    expect(() => {
      checkTypescriptPersonaCoverage(candidate, learnerHashes);
    }).toThrow(/独立/u);
  });

  it('性能指標の重複で未測定指標を隠さない', () => {
    const candidate = record();
    candidate.performance[1]!.kind = 'cold';
    expect(() => {
      checkTypescriptPersonaCoverage(candidate, learnerHashes);
    }).toThrow(/性能指標/u);
  });
});

describe('TS承認済み性能上限', () => {
  it.each(['cold', 'warm', 'simple', 'dom', 'async', 'busy', 'stop'] as const)(
    '%sはraw sampleから値を再計算して固定上限を使う',
    (kind) => {
      const metric = measurement(kind);
      const samples = metric.samplesMs;
      expect(checkTypescriptPerformance(metric, samples)).toBe(80);
      expect(() =>
        checkTypescriptPerformance({ ...metric, reportedValueMs: 79 }, samples),
      ).toThrow();
      const exceeded =
        kind === 'busy' ? 101 : kind === 'stop' ? 301 : kind === 'warm' ? 2001 : 5001;
      expect(() =>
        checkTypescriptPerformance(
          { ...metric, reportedValueMs: exceeded },
          samples.map(() => exceeded),
        ),
      ).toThrow(/予算/u);
    },
  );

  it('queue/frame除外、標本不足、warmup不足、不正数値を合格にしない', () => {
    const busy = measurement('busy');
    expect(() =>
      checkTypescriptPerformance({ ...busy, includesQueueAndFrame: false }, [80, 80]),
    ).toThrow();
    expect(() => checkTypescriptPerformance(busy, [80])).toThrow();
    expect(() => checkTypescriptPerformance(busy, [80, NaN])).toThrow();
    const warm = measurement('warm');
    expect(() =>
      checkTypescriptPerformance(
        { ...warm, warmup: 0 },
        Array.from({ length: 20 }, () => 80),
      ),
    ).toThrow();
    expect(() =>
      checkTypescriptPerformance(
        warm,
        Array.from({ length: 19 }, () => 80),
      ),
    ).toThrow();
    expect(() =>
      checkTypescriptPerformance(
        warm,
        Array.from({ length: 20 }, (_, i) => (i === 0 ? Infinity : 80)),
      ),
    ).toThrow();
  });
});

it('raw schemaも未承認環境を拒否し、違う課題や停止未確認を読み替えない', () => {
  const busy = measurement('busy');
  expect(
    TypescriptPerformanceEvidenceSchema.safeParse({
      ...busy,
      environment: { ...busy.environment, os: 'darwin' },
    }).success,
  ).toBe(false);
  expect(() =>
    checkTypescriptPerformance({ ...busy, exerciseId: 'typescript-ch01-l02-e01' }, busy.samplesMs),
  ).toThrow(/課題/u);
  const stop = measurement('stop');
  expect(() =>
    checkTypescriptPerformance({ ...stop, lateResultsRejected: false }, stop.samplesMs),
  ).toThrow(/無効化/u);
});

it('同actorの別Session/別Lessonの説明を最終作品の説明に流用しない', () => {
  const result = record().personas[0]!.results.at(-1)!;
  const receipt = EvaluationReceiptSchema.parse({
    schemaVersion: 1,
    role: 'A',
    actor: result.actor,
    session: result.session,
    publicInputOnly: true,
    explainsFinalProject: false,
    report: reference,
    lessons: [{ lessonId: result.lessonId, learnerContentSha256: hash, sourceSha256: hash }],
  });
  const unrelated = { ...receipt, session: 'other-session', explainsFinalProject: true };
  expect(() => {
    checkTypescriptEvaluationReceipt([receipt, unrelated], result);
  }).toThrow(/自力説明/u);
  expect(() => {
    checkTypescriptEvaluationReceipt([{ ...receipt, explainsFinalProject: true }], result);
  }).not.toThrow();
});

it('CLI宣言と実HEADの不一致、未commit変更、未追跡Product sourceを拒否する', async () => {
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE'])
    vi.stubEnv(key, undefined);
  const directory = await mkdtemp(path.join(tmpdir(), 'ts-acceptance-head-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  try {
    git('init', '--quiet');
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'src/main.ts'), 'export const value = 1;\n');
    git('add', 'src/main.ts');
    git(
      '-c',
      'user.name=受入検査テスト',
      '-c',
      'user.email=evidence@example.invalid',
      'commit',
      '--quiet',
      '-m',
      '初期状態',
    );
    const head = git('rev-parse', 'HEAD');
    await expect(verifyTypescriptSourceCommit(directory, head)).resolves.toBeUndefined();
    await expect(verifyTypescriptSourceCommit(directory, 'f'.repeat(40))).rejects.toThrow(
      /実Git HEAD/u,
    );
    await writeFile(path.join(directory, 'src/main.ts'), 'export const value = 2;\n');
    await expect(verifyTypescriptSourceCommit(directory, head)).rejects.toThrow();
    git('checkout', '--', 'src/main.ts');
    await writeFile(path.join(directory, 'src/other.ts'), 'export const other = 2;\n');
    await expect(verifyTypescriptSourceCommit(directory, head)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
