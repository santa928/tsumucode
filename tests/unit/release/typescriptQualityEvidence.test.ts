// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import {
  TypescriptAcceptanceSchema,
  TypescriptPerformanceEvidenceSchema,
  TYPESCRIPT_ACCEPTANCE_LESSONS,
  typescriptPerformanceExercise,
  type TypescriptAcceptance,
  type TypescriptPerformanceEvidence,
} from '../../../scripts/release/verifyTypescriptAcceptance';
import { createTypescriptInputManifest } from '../../../scripts/release/typescriptInputHashes';
import {
  validateTypescriptReleaseEvidence,
  hashTypescriptReleaseEvidence,
} from '../../../scripts/release/verifyTypescriptQualityEvidence';
import type { TypescriptReleaseEvidence } from '../../../scripts/release/verifyTypescriptQualityEvidence';
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

const digest = (source: string) => createHash('sha256').update(source).digest('hex');
async function evidence(): Promise<TypescriptReleaseEvidence> {
  const files = new Map(
    await Promise.all(
      [
        'content/typescript/course.yaml',
        'content/learning-paths/frontend.yaml',
        'package.json',
        'package-lock.json',
      ].map(async (file) => {
        // TS初公開時のPathを固定し、後続Courseの公開状態から独立させる。
        const source =
          file === 'content/learning-paths/frontend.yaml'
            ? 'tests/fixtures/release/typescript-initial-frontend.yaml'
            : file;
        return [file, new Uint8Array(await readFile(source))] as const;
      }),
    ),
  );
  // 公開済み環境でも独立したdraft→published fixtureを作り、現在の公開状態を変えない。
  const decoder = new TextDecoder(),
    encoder = new TextEncoder();
  files.set(
    'content/typescript/course.yaml',
    encoder.encode(
      decoder
        .decode(files.get('content/typescript/course.yaml'))
        .replace(/^publicationStatus: (draft|published)$/gmu, 'publicationStatus: draft'),
    ),
  );
  const draftInput = createTypescriptInputManifest('a'.repeat(40), files);
  const finalFiles = new Map(files);
  const text = new TextDecoder(),
    bytes = new TextEncoder();
  finalFiles.set(
    'content/typescript/course.yaml',
    bytes.encode(
      text
        .decode(files.get('content/typescript/course.yaml'))
        .replace('publicationStatus: draft', 'publicationStatus: published'),
    ),
  );
  finalFiles.set(
    'content/learning-paths/frontend.yaml',
    bytes.encode(
      text.decode(files.get('content/learning-paths/frontend.yaml')) +
        '  - courseId: typescript\n    role: required\n    prerequisiteCourseIds: [javascript]\n',
    ),
  );
  const finalInput = createTypescriptInputManifest('b'.repeat(40), finalFiles);
  const acceptance = record();
  const performanceEvidence = acceptance.performance.map(({ kind }) => ({
    kind,
    raw: JSON.stringify(measurement(kind)),
  }));
  acceptance.performance = performanceEvidence.map(({ kind, raw }) => ({
    kind,
    rawEvidence: { path: `${kind}.json`, sha256: digest(raw) },
  }));
  acceptance.personas = acceptance.personas.map((persona, index) => ({
    ...persona,
    evaluations: [
      { path: `evaluation-${persona.role}.json`, sha256: String(index + 1).repeat(64) },
    ],
  }));
  const value: TypescriptReleaseEvidence = {
    schemaVersion: 1,
    courseId: 'typescript',
    status: 'preflight-passed-final-ci-required',
    verifiedSourceCommit: finalInput.sourceCommit,
    canonicalDistSha256: hash,
    candidateTreeSha256: hash,
    draftCanonicalDistSha256: hash,
    normalizedLearningInputSha256: draftInput.normalizedInputSha256,
    draftInput,
    finalInput,
    acceptance,
    acceptanceSha256: digest(canonicalJson(acceptance)),
    lazyGzipBytes: 1_888_159,
    performanceEvidence,
    browserMatrix: ['chromium', 'firefox', 'webkit'].map((engine) => ({
      engine: engine as 'chromium' | 'firefox' | 'webkit',
      passedTests: 2,
      failedTests: 0,
      skippedTests: 0,
      reportSha256: hash,
      testSourceSha256: hash,
      normalizedLearningInputSha256: draftInput.normalizedInputSha256,
    })),
    independenceReview: {
      author: 'root',
      reviewer: 'independent-reviewer',
      decision: 'approved',
      privateOriginalsChecked: true,
      productTreeSha256: hash,
      evidenceSha256: hash,
      evaluationReceiptSha256s: acceptance.personas.flatMap((p) =>
        p.evaluations.map((r) => r.sha256),
      ),
    },
  };
  value.independenceReview.evidenceSha256 = hashTypescriptReleaseEvidence(value);
  return value;
}

describe('TS公開用照合記録', () => {
  it('固定入力・raw性能・45件・独立確認を照合し、模擬評価と限界を保持する', async () => {
    const value = validateTypescriptReleaseEvidence(await evidence(), learnerHashes);
    expect(value.acceptance.publicationApproval).toBe('pending');
    expect(value.acceptance.realHumanTrial).toBe('unverified');
  });
  it.each([
    'browser',
    'raw',
    'budget',
    'reviewer',
    'receipt',
    'input',
    'human',
    'declaration',
    'payload',
  ])('%sの証拠欠落や差し替えを拒否する', async (kind) => {
    const value = await evidence();
    if (kind === 'browser') value.browserMatrix[2] = value.browserMatrix[0]!;
    if (kind === 'raw')
      value.performanceEvidence[0]!.raw = value.performanceEvidence[0]!.raw.replace('80', '180');
    if (kind === 'budget') value.lazyGzipBytes = 2_500_001;
    if (kind === 'reviewer') value.independenceReview.reviewer = 'root';
    if (kind === 'receipt') value.independenceReview.evaluationReceiptSha256s.pop();
    if (kind === 'input') value.finalInput.normalizedInputSha256 = 'c'.repeat(64);
    if (kind === 'declaration') value.independenceReview.evidenceSha256 = 'c'.repeat(64);
    if (kind === 'payload') {
      value.acceptance.personas[0]!.results[0]!.source.sha256 = 'c'.repeat(64);
      value.acceptanceSha256 = digest(canonicalJson(value.acceptance));
    }
    if (kind === 'human') Reflect.set(value.acceptance, 'realHumanTrial', 'passed');
    expect(() => validateTypescriptReleaseEvidence(value, learnerHashes)).toThrow();
  });
});
